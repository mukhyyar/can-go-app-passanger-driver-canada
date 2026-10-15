import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { EmailEventsService } from '../email/email-events.service';
import { DriverPayoutStatus, Prisma, RideStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { DriverWalletService } from '../wallet/driver-wallet.service';
import { StripeConnectService } from '../providers/stripe/stripe-connect.service';
import { PostRideNotificationService } from './post-ride-notifications.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../providers/payment/payment-provider.interface';

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly tracking: TrackingGateway,
    private readonly wallet: DriverWalletService,
    @Optional() private readonly stripeConnect?: StripeConnectService,
    @Optional() private readonly emailEvents?: EmailEventsService,
    @Optional() private readonly postRideNotifications?: PostRideNotificationService,
    @Optional() @Inject(PAYMENT_PROVIDER) private readonly payments?: PaymentProvider,
  ) {}


  async transition(
    userId: string,
    rideId: string,
    toStatus: RideStatus,
    ip?: string,
    pin?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true, passengerProfile: true },
    });
    if (!user) throw new ForbiddenException();

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const isAssignedDriver =
      !!user.driverProfile &&
      ride.assignedDriverId === user.driverProfile.id;
    const isPassenger = ride.passenger.userId === userId;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (isAssignedDriver && toStatus === RideStatus.DRIVER_EN_ROUTE) {
      if (!user.driverProfile?.drivingEnabled) {
        throw new BadRequestException('You must be online to start a ride');
      }
    }

    this.assertTransitionAllowed(
      ride.status,
      toStatus,
      { isAssignedDriver, isPassenger, isAdmin },
    );

    let verifiedPin: string | undefined;
    if (toStatus === RideStatus.TRIP_STARTED && isAssignedDriver) {
      const snap = ride.priceSnapshot as Record<string, unknown> | null | undefined;
      const expectedPin =
        (ride.startPin as string | null | undefined) ??
        (snap?.startPin as string | undefined) ??
        String(
          1000 +
            Math.abs(
              ride.id.split('').reduce(
                (acc, char) => ((acc << 5) - acc) + char.charCodeAt(0),
                0,
              ) % 9000,
            ),
        );
      const cleanPin = (pin ?? '').trim();
      if (!cleanPin || cleanPin !== expectedPin) {
        throw new BadRequestException(
          'Invalid ride PIN. Please ask the passenger for their 4-digit ride PIN.',
        );
      }
      verifiedPin = expectedPin;
    }

    const actorType = isAdmin
      ? 'admin'
      : isAssignedDriver
        ? 'driver'
        : 'passenger';

    await this.prisma.$transaction(async (tx) => {
      await tx.ride.update({
        where: { id: rideId },
        data: {
          status: toStatus,
          ...(verifiedPin ? { startPin: verifiedPin } : {}),
        },
      });
      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: ride.status,
          toStatus,
          actorType,
          actorId: userId,
          payload: { action: 'trip.transition' },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: `ride.transition.${toStatus}`,
          resource: 'Ride',
          resourceId: rideId,
          ip,
        },
      });

      if (toStatus === RideStatus.COMPLETED) {
        await this.wallet.creditEarningForCompletedRide(rideId, {
          tx,
          actorId: userId,
        });

        const financial = await tx.rideFinancial.findUnique({
          where: { rideId },
        });
        const driver = ride.selectedOffer?.driver;

        if (
          financial &&
          driver?.stripeAccountId &&
          driver?.stripePayoutsEnabled &&
          this.stripeConnect?.isConfigured()
        ) {
          try {
            const transfer = await this.stripeConnect.transferToDriver({
              amount: Number(financial.driverNetEarning),
              currency: financial.currency,
              destinationAccountId: driver.stripeAccountId,
              transferGroup: financial.stripeTransferGroup || `group_${rideId}`,
              rideId,
              driverId: driver.id,
            });

            await tx.rideFinancial.update({
              where: { rideId },
              data: {
                driverPayoutStatus: DriverPayoutStatus.SUCCEEDED,
                stripeTransferId: transfer.transferId,
                payoutReleasedAt: new Date(),
              },
            });
          } catch {
            await tx.rideFinancial.update({
              where: { rideId },
              data: {
                driverPayoutStatus: DriverPayoutStatus.HELD,
              },
            });
          }
        }
      }
    });

    // Auto-advance TRIP_STARTED → IN_PROGRESS for simpler clients
    if (toStatus === RideStatus.TRIP_STARTED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.ride.update({
          where: { id: rideId },
          data: { status: RideStatus.IN_PROGRESS },
        });
        await tx.rideEvent.create({
          data: {
            rideId,
            fromStatus: RideStatus.TRIP_STARTED,
            toStatus: RideStatus.IN_PROGRESS,
            actorType: 'system',
            payload: { action: 'auto_in_progress' },
          },
        });
      });
    }

    let refundInfo: { refunded: boolean; amount?: number } = { refunded: false };
    if (
      toStatus === RideStatus.PASSENGER_CANCELLED ||
      toStatus === RideStatus.DRIVER_CANCELLED ||
      toStatus === RideStatus.ADMIN_CANCELLED
    ) {
      refundInfo = await this.handleCancellationRefund(rideId, toStatus, userId);
    }

    const final = await this.prisma.ride.findUnique({ where: { id: rideId } });
    const notifyStatus = final!.status;

    this.tracking.emitRideEvent(rideId, {
      type: 'ride.status',
      rideId,
      status: notifyStatus,
      fromStatus: ride.status,
    });

    const driverUserId = ride.selectedOffer?.driver?.userId;

    if (ride.passenger?.userId) {
      const isCancelled =
        notifyStatus === RideStatus.PASSENGER_CANCELLED ||
        notifyStatus === RideStatus.DRIVER_CANCELLED ||
        notifyStatus === RideStatus.ADMIN_CANCELLED;
      const passengerBody =
        isCancelled && refundInfo.refunded && refundInfo.amount
          ? `Your ride was cancelled. A full refund of CAD $${refundInfo.amount.toFixed(2)} has been processed to your payment method.`
          : this.bodyFor(notifyStatus, ride.fromLabel);

      await this.notifications.notifyRideStatus({
        userIds: [ride.passenger.userId],
        rideId,
        status: notifyStatus,
        title: this.titleFor(notifyStatus),
        body: passengerBody,
        targetRole: ['PASSENGER', 'PASSENGER_WEB'],
      });

      if (notifyStatus === RideStatus.COMPLETED) {
        if (this.postRideNotifications) {
          void this.postRideNotifications.handleRideCompleted(rideId);
        }
      }
    }


    if (driverUserId) {
      await this.notifications.notifyRideStatus({
        userIds: [driverUserId],
        rideId,
        status: notifyStatus,
        title: this.titleFor(notifyStatus),
        body: this.bodyFor(notifyStatus, ride.fromLabel),
        targetRole: 'DRIVER',
      });
    }

    return {
      id: rideId,
      status: notifyStatus,
      fromStatus: ride.status,
    };
  }

  async handleCancellationRefund(
    rideId: string,
    cancelledByStatus: RideStatus,
    actorId: string,
  ): Promise<{ refunded: boolean; amount?: number; refundId?: string }> {
    try {
      const payment = await this.prisma.payment.findFirst({
        where: {
          rideId,
          status: { in: ['succeeded', 'captured', 'paid', 'SUCCEEDED', 'CAPTURED'] },
        },
        include: { refunds: true },
      });
      if (!payment) {
        return { refunded: false };
      }

      const alreadyRefunded = payment.refunds
        .filter((r) => r.status === 'succeeded' || r.status === 'pending')
        .reduce((sum, r) => sum + Number(r.amount), 0);

      const paymentAmount = Number(payment.amount);
      const remaining = paymentAmount - alreadyRefunded;

      if (remaining <= 0.01) {
        return { refunded: false };
      }

      let gatewayRefundId: string | undefined;
      let gatewayStatus = 'succeeded';
      let gatewayResponse: Record<string, unknown> = {};

      if (this.payments) {
        try {
          const res = await this.payments.refund(payment.providerRef ?? payment.id, remaining);
          gatewayRefundId = res.refundId;
          gatewayStatus =
            res.status === 'succeeded' || res.status === 'pending'
              ? res.status
              : 'succeeded';
          gatewayResponse = res as unknown as Record<string, unknown>;
        } catch (gatewayErr) {
          this.logger.error(
            `Gateway refund error for ride ${rideId}: ${gatewayErr}`,
          );
          gatewayStatus = 'failed';
          gatewayResponse = {
            error:
              gatewayErr instanceof Error
                ? gatewayErr.message
                : String(gatewayErr),
          };
        }
      }

      // Ensure requestedById references a valid User ID in DB
      const validUser = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true },
      });
      let refundRequesterId = validUser?.id;
      if (!refundRequesterId) {
        const anyUser = await this.prisma.user.findFirst({ select: { id: true } });
        refundRequesterId = anyUser?.id ?? actorId;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            amount: remaining,
            currency: payment.currency,
            type: 'FULL',
            reason: `Full refund on cancellation (${cancelledByStatus})`,
            internalNote: `Automated cancellation refund for ride ${rideId}`,
            status: gatewayStatus,
            gatewayRefundId,
            gatewayResponse: gatewayResponse as Prisma.InputJsonValue,
            requestedById: refundRequesterId,
          },
        });

        if (gatewayStatus === 'succeeded' || gatewayStatus === 'pending') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'refunded' },
          });

          await tx.rideFinancial.updateMany({
            where: { rideId },
            data: {
              refundAmount: remaining,
              refundReason: `Full refund on cancellation (${cancelledByStatus})`,
              refundedAt: new Date(),
            },
          });
        }
      });

      return {
        refunded: gatewayStatus !== 'failed',
        amount: remaining,
        refundId: gatewayRefundId,
      };
    } catch (err) {
      this.logger.error(
        `Failed to process cancellation refund for ride ${rideId}: ${err}`,
      );
      return { refunded: false };
    }
  }

  private assertTransitionAllowed(
    from: RideStatus,
    to: RideStatus,
    actors: {
      isAssignedDriver: boolean;
      isPassenger: boolean;
      isAdmin: boolean;
    },
  ) {
    const { isAssignedDriver, isPassenger, isAdmin } = actors;

    const driverNext: Partial<Record<RideStatus, RideStatus[]>> = {
      [RideStatus.BOOKED]: [RideStatus.DRIVER_EN_ROUTE, RideStatus.DRIVER_CANCELLED],
      [RideStatus.DRIVER_EN_ROUTE]: [
        RideStatus.DRIVER_ARRIVED,
        RideStatus.DRIVER_CANCELLED,
      ],
      [RideStatus.DRIVER_ARRIVED]: [
        RideStatus.TRIP_STARTED,
        RideStatus.NO_SHOW,
        RideStatus.DRIVER_CANCELLED,
      ],
      [RideStatus.TRIP_STARTED]: [RideStatus.COMPLETED, RideStatus.DRIVER_CANCELLED],
      [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED, RideStatus.DRIVER_CANCELLED],
    };

    const passengerNext: Partial<Record<RideStatus, RideStatus[]>> = {
      [RideStatus.BOOKED]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.DRIVER_EN_ROUTE]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.DRIVER_ARRIVED]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.TRIP_STARTED]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.IN_PROGRESS]: [RideStatus.PASSENGER_CANCELLED],
    };

    if (isAdmin && to === RideStatus.ADMIN_CANCELLED) return;

    if (isAssignedDriver && driverNext[from]?.includes(to)) return;
    if (isPassenger && passengerNext[from]?.includes(to)) return;

    throw new BadRequestException(
      `Illegal transition ${from} → ${to} for this actor`,
    );
  }

  private titleFor(status: RideStatus) {
    switch (status) {
      case RideStatus.DRIVER_EN_ROUTE:
        return 'Driver en route';
      case RideStatus.DRIVER_ARRIVED:
        return 'Driver arrived';
      case RideStatus.TRIP_STARTED:
      case RideStatus.IN_PROGRESS:
        return 'Trip started';
      case RideStatus.COMPLETED:
        return 'Trip completed';
      case RideStatus.NO_SHOW:
        return 'No-show recorded';
      case RideStatus.PASSENGER_CANCELLED:
      case RideStatus.DRIVER_CANCELLED:
      case RideStatus.ADMIN_CANCELLED:
        return 'Ride cancelled';
      default:
        return 'Ride update';
    }
  }

  private bodyFor(status: RideStatus, fromLabel: string) {
    return `${status.replace(/_/g, ' ')} · ${fromLabel}`;
  }
}
