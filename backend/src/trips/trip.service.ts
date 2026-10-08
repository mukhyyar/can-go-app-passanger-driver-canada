import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { EmailEventsService } from '../email/email-events.service';
import { DriverPayoutStatus, RideStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { DriverWalletService } from '../wallet/driver-wallet.service';
import { StripeConnectService } from '../providers/stripe/stripe-connect.service';

@Injectable()
export class TripService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly tracking: TrackingGateway,
    private readonly wallet: DriverWalletService,
    @Optional() private readonly stripeConnect?: StripeConnectService,
    @Optional() private readonly emailEvents?: EmailEventsService,
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
      await this.notifications.notifyRideStatus({
        userIds: [ride.passenger.userId],
        rideId,
        status: notifyStatus,
        title: this.titleFor(notifyStatus),
        body: this.bodyFor(notifyStatus, ride.fromLabel),
        targetRole: ['PASSENGER', 'PASSENGER_WEB'],
      });

      if (notifyStatus === RideStatus.COMPLETED) {
        const user = await this.prisma.user.findUnique({ where: { id: ride.passenger.userId } });
        if (user?.email) {
          const financial = await this.prisma.rideFinancial.findUnique({ where: { rideId } });
          if (financial) {
            const fareStr = `${financial.rideFare} ${financial.currency}`;
            const feeStr = `${financial.marketplaceFee} ${financial.currency}`;
            const tipStr = `${financial.tipAmount || 0} ${financial.currency}`;
            const totalStr = `${financial.passengerTotalCharged} ${financial.currency}`;
            void this.emailEvents?.sendRideReceipt(
              ride.passenger.userId,
              user.email,
              ride.id.slice(0, 8).toUpperCase(),
              ride.selectedOffer?.driver?.fullName || 'Driver',
              fareStr,
              feeStr,
              tipStr,
              totalStr
            );
          }
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
      [RideStatus.TRIP_STARTED]: [RideStatus.COMPLETED],
      [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED],
    };

    const passengerNext: Partial<Record<RideStatus, RideStatus[]>> = {
      [RideStatus.BOOKED]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.DRIVER_EN_ROUTE]: [RideStatus.PASSENGER_CANCELLED],
      [RideStatus.DRIVER_ARRIVED]: [RideStatus.PASSENGER_CANCELLED],
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
