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
import { DriverPayoutStatus, Prisma, RideStatus, UserRole, WalletDirection, WalletEntryStatus, WalletEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { DriverWalletService } from '../wallet/driver-wallet.service';
import { StripeConnectService } from '../providers/stripe/stripe-connect.service';
import { PostRideNotificationService } from './post-ride-notifications.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../providers/payment/payment-provider.interface';
import {
  CancellationPolicyService,
  resolveIncludedWaitingMinutes,
} from '../marketplace/cancellation-policy.service';
import { LocationStoreService } from '../tracking/location-store.service';

export const GEOFENCE_LIMITS = {
  DRIVER_ARRIVED_METERS: 300,
  TRIP_STARTED_METERS: 500,
  TRIP_COMPLETED_METERS: 500,
  NO_SHOW_METERS: 500,
};

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
    @Optional() private readonly cancellationPolicy?: CancellationPolicyService,
    @Optional() private readonly locationStore?: LocationStoreService,
  ) {}

  private async resolveDriverCoordinates(
    rideId: string,
    metaLat?: number,
    metaLng?: number,
  ): Promise<{ lat: number; lng: number } | null> {
    if (metaLat != null && metaLng != null) {
      return { lat: metaLat, lng: metaLng };
    }
    if (this.locationStore && rideId) {
      const cached = await this.locationStore.getRideDriver(rideId);
      if (cached && cached.lat != null && cached.lng != null) {
        return { lat: cached.lat, lng: cached.lng };
      }
    }
    return null;
  }


  async transition(
    userId: string,
    rideId: string,
    toStatus: RideStatus,
    ip?: string,
    pin?: string,
    cancellationMeta?: {
      reasonCode?: string;
      reasonDetails?: string;
      lat?: number;
      lng?: number;
      contactMethod?: string;
      forceEarlyDropoff?: boolean;
    },
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

    // Idempotent: If the trip is already started or in progress and driver calls start
    if (
      isAssignedDriver &&
      toStatus === RideStatus.TRIP_STARTED &&
      (ride.status === RideStatus.TRIP_STARTED ||
        ride.status === RideStatus.IN_PROGRESS)
    ) {
      return {
        id: ride.id,
        status: ride.status,
        fromStatus: ride.status,
      };
    }

    if (ride.status === toStatus) {
      return {
        id: ride.id,
        status: ride.status,
        fromStatus: ride.status,
      };
    }

    this.assertTransitionAllowed(
      ride.status,
      toStatus,
      { isAssignedDriver, isPassenger, isAdmin },
    );

    let arrivedEvidence: Record<string, unknown> | undefined;
    if (toStatus === RideStatus.DRIVER_ARRIVED && isAssignedDriver) {
      if (!isAdmin && ride.fromLat != null && ride.fromLng != null) {
        const coords = await this.resolveDriverCoordinates(
          ride.id,
          cancellationMeta?.lat,
          cancellationMeta?.lng,
        );
        if (!coords) {
          throw new BadRequestException(
            'Current GPS coordinates are required to mark arrival at the pickup location.',
          );
        }
        const distKm = haversineKm(
          coords.lat,
          coords.lng,
          ride.fromLat,
          ride.fromLng,
        );
        const distanceMeters = Math.round(distKm * 1000);
        if (distanceMeters > GEOFENCE_LIMITS.DRIVER_ARRIVED_METERS) {
          throw new BadRequestException(
            `Driver must be within ${GEOFENCE_LIMITS.DRIVER_ARRIVED_METERS}m of the pickup location to mark arrival (current distance: ${distanceMeters}m).`,
          );
        }
        arrivedEvidence = {
          action: 'driver_arrived',
          driverLat: coords.lat,
          driverLng: coords.lng,
          pickupLat: ride.fromLat,
          pickupLng: ride.fromLng,
          distanceMeters,
        };
      }
    }

    let verifiedPin: string | undefined;
    let tripStartEvidence: Record<string, unknown> | undefined;
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

      if (!isAdmin && ride.fromLat != null && ride.fromLng != null) {
        const coords = await this.resolveDriverCoordinates(
          ride.id,
          cancellationMeta?.lat,
          cancellationMeta?.lng,
        );
        if (!coords) {
          throw new BadRequestException(
            'Current GPS coordinates are required to start the ride.',
          );
        }
        const distKm = haversineKm(
          coords.lat,
          coords.lng,
          ride.fromLat,
          ride.fromLng,
        );
        const distanceMeters = Math.round(distKm * 1000);
        if (distanceMeters > GEOFENCE_LIMITS.TRIP_STARTED_METERS) {
          throw new BadRequestException(
            `Driver must be within ${GEOFENCE_LIMITS.TRIP_STARTED_METERS}m of the pickup location to start the ride (current distance: ${distanceMeters}m).`,
          );
        }
        tripStartEvidence = {
          action: 'trip_started',
          driverLat: coords.lat,
          driverLng: coords.lng,
          pickupLat: ride.fromLat,
          pickupLng: ride.fromLng,
          distanceMeters,
        };
      }
    }

    let completionEvidence: Record<string, unknown> | undefined;
    if (toStatus === RideStatus.COMPLETED && isAssignedDriver) {
      if (!isAdmin && ride.toLat != null && ride.toLng != null) {
        const coords = await this.resolveDriverCoordinates(
          ride.id,
          cancellationMeta?.lat,
          cancellationMeta?.lng,
        );
        if (!coords) {
          throw new BadRequestException(
            'Current GPS coordinates are required to complete the ride.',
          );
        }
        const distKm = haversineKm(
          coords.lat,
          coords.lng,
          ride.toLat,
          ride.toLng,
        );
        const distanceMeters = Math.round(distKm * 1000);
        if (
          distanceMeters > GEOFENCE_LIMITS.TRIP_COMPLETED_METERS &&
          !cancellationMeta?.forceEarlyDropoff
        ) {
          throw new BadRequestException(
            `Vehicle is ${distanceMeters}m away from the drop-off destination. If passenger requested an early drop-off, confirm early drop-off.`,
          );
        }
        completionEvidence = {
          action: 'trip_completed',
          driverLat: coords.lat,
          driverLng: coords.lng,
          dropoffLat: ride.toLat,
          dropoffLng: ride.toLng,
          distanceMeters,
          forceEarlyDropoff: !!cancellationMeta?.forceEarlyDropoff,
          earlyDropoffReason: cancellationMeta?.reasonDetails ?? null,
        };
      }
    }

    let noShowEvidence: Record<string, unknown> | undefined;

    if (toStatus === RideStatus.NO_SHOW) {
      if (ride.status !== RideStatus.DRIVER_ARRIVED && !isAdmin) {
        throw new BadRequestException(
          'A passenger can only be marked No-Show after the driver has arrived at the pickup location.',
        );
      }

      const events = await this.prisma.rideEvent.findMany({
        where: { rideId },
        orderBy: { createdAt: 'desc' },
      });
      const arrivedEvent = events.find(
        (e) => e.toStatus === RideStatus.DRIVER_ARRIVED,
      );
      if (!arrivedEvent && !isAdmin) {
        throw new BadRequestException(
          'Driver arrival event could not be verified for this ride.',
        );
      }

      let distanceMeters: number | null = null;
      let noShowCoords: { lat: number; lng: number } | null = null;
      if (!isAdmin) {
        noShowCoords = await this.resolveDriverCoordinates(
          ride.id,
          cancellationMeta?.lat,
          cancellationMeta?.lng,
        );
        if (!noShowCoords) {
          throw new BadRequestException(
            'Current GPS coordinates are required to verify driver presence at pickup location.',
          );
        }

        if (ride.fromLat != null && ride.fromLng != null) {
          const distKm = haversineKm(
            noShowCoords.lat,
            noShowCoords.lng,
            ride.fromLat,
            ride.fromLng,
          );
          distanceMeters = Math.round(distKm * 1000);
          if (distanceMeters > GEOFENCE_LIMITS.NO_SHOW_METERS) {
            throw new BadRequestException(
              `Driver must be at the pickup location to declare No-Show (current distance: ${distanceMeters}m, limit: ${GEOFENCE_LIMITS.NO_SHOW_METERS}m).`,
            );
          }
        }
      }

      const waitingAllowedMin =
        ride.pickupWaitMin ??
        resolveIncludedWaitingMinutes({
          fromLabel: ride.fromLabel,
          flight: ride.flight,
          pickupAt: ride.pickupAt,
          createdAt: ride.createdAt,
        });

      const effectiveWaitStart = arrivedEvent
        ? Math.max(arrivedEvent.createdAt.getTime(), ride.pickupAt.getTime())
        : ride.pickupAt.getTime();
      const nowMs = Date.now();
      const elapsedMin = (nowMs - effectiveWaitStart) / (1000 * 60);

      if (elapsedMin < waitingAllowedMin && !isAdmin) {
        const remainingMin = Math.max(
          1,
          Math.ceil(waitingAllowedMin - elapsedMin),
        );
        throw new BadRequestException(
          `Required waiting period of ${waitingAllowedMin} min has not elapsed yet (${remainingMin} min remaining).`,
        );
      }

      let contactMethod = cancellationMeta?.contactMethod;
      let contactVerified = false;

      const chatThread = await this.prisma.chatThread.findUnique({
        where: { rideId },
        select: { id: true },
      });
      if (chatThread) {
        const chatCount = await this.prisma.chatMessage.count({
          where: { threadId: chatThread.id, senderId: userId },
        });
        if (chatCount > 0) {
          contactVerified = true;
          contactMethod = contactMethod ?? 'CHAT';
        }
      }

      const contactEvent = events.find(
        (e) =>
          typeof e.payload === 'object' &&
          e.payload !== null &&
          (e.payload as Record<string, unknown>).action === 'contact_attempt',
      );
      if (contactEvent) {
        contactVerified = true;
        contactMethod =
          contactMethod ??
          ((contactEvent.payload as Record<string, unknown>).method as string) ??
          'CALL';
      }

      if (cancellationMeta?.contactMethod) {
        contactVerified = true;
      }

      if (!contactVerified && !isAdmin) {
        throw new BadRequestException(
          'A reasonable attempt to contact the passenger (via in-app chat or phone call) is required before declaring No-Show.',
        );
      }

      noShowEvidence = {
        action: 'passenger_no_show',
        driverLat: noShowCoords?.lat ?? cancellationMeta?.lat ?? null,
        driverLng: noShowCoords?.lng ?? cancellationMeta?.lng ?? null,
        pickupLat: ride.fromLat,
        pickupLng: ride.fromLng,
        distanceMeters,
        arrivedAt: arrivedEvent?.createdAt.toISOString() ?? null,
        scheduledPickupAt: ride.pickupAt.toISOString(),
        waitingRequiredMin: waitingAllowedMin,
        waitingElapsedMin: Number(Math.max(0, elapsedMin).toFixed(1)),
        contactVerified: true,
        contactMethod: contactMethod ?? 'CHAT',
        declaredAt: new Date().toISOString(),
      };
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
      const eventEvidence =
        noShowEvidence ??
        tripStartEvidence ??
        arrivedEvidence ??
        completionEvidence;

      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: ride.status,
          toStatus,
          actorType,
          actorId: userId,
          payload: (eventEvidence
            ? { action: 'trip.transition', evidence: eventEvidence }
            : { action: 'trip.transition' }) as Prisma.InputJsonValue,
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

      if (toStatus === RideStatus.DRIVER_CANCELLED && user.driverProfile) {
        const existingRecord = await tx.driverCancellationRecord.findUnique({
          where: { rideId },
        });
        if (!existingRecord) {
          const reasonCode = cancellationMeta?.reasonCode ?? 'OTHER';
          const reason = await tx.providerCancellationReason.findUnique({
            where: { code: reasonCode },
          });
          await tx.driverCancellationRecord.create({
            data: {
              rideId,
              driverId: user.driverProfile.id,
              reasonCode: reason?.code ?? 'OTHER',
              reasonLabel: reason?.label ?? 'Other',
              reasonDetails: cancellationMeta?.reasonDetails ?? null,
              isJustified: reason?.isJustified ?? false,
              rideStatusAtCancel: ride.status,
              driverLat: cancellationMeta?.lat ?? null,
              driverLng: cancellationMeta?.lng ?? null,
            },
          });
        }
      }

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
      toStatus === RideStatus.ADMIN_CANCELLED ||
      toStatus === RideStatus.NO_SHOW
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
        notifyStatus === RideStatus.NO_SHOW
          ? 'Your ride was recorded as No-Show after the driver waited at the pickup location. No refund is eligible under policy.'
          : isCancelled && refundInfo.refunded && refundInfo.amount
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
      const driverBody =
        notifyStatus === RideStatus.NO_SHOW
          ? 'Passenger No-Show recorded. Provider compensation has been credited to your wallet.'
          : this.bodyFor(notifyStatus, ride.fromLabel);

      await this.notifications.notifyRideStatus({
        userIds: [driverUserId],
        rideId,
        status: notifyStatus,
        title: this.titleFor(notifyStatus),
        body: driverBody,
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

      let refundAmount = remaining;
      let evaluationLabel = `Full refund on cancellation (${cancelledByStatus})`;
      let providerCompAmount = 0;

      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        select: { id: true, assignedDriverId: true },
      });

      if (
        (cancelledByStatus === RideStatus.PASSENGER_CANCELLED ||
          cancelledByStatus === RideStatus.NO_SHOW) &&
        this.cancellationPolicy
      ) {
        try {
          const evalResult =
            await this.cancellationPolicy.evaluateCancellation(rideId);
          refundAmount = Math.min(
            remaining,
            Math.max(0, evalResult.passengerRefundAmount),
          );
          evaluationLabel =
            cancelledByStatus === RideStatus.NO_SHOW
              ? `Passenger No-Show (${evalResult.passengerDisplayLabel})`
              : `Cancellation refund (${evalResult.passengerDisplayLabel})`;
          providerCompAmount = evalResult.providerCompAmount;
        } catch (e) {
          this.logger.error(`Failed to evaluate cancellation policy for ride ${rideId}: ${e}`);
        }
      }

      let gatewayRefundId: string | undefined;
      let gatewayStatus = 'succeeded';
      let gatewayResponse: Record<string, unknown> = {};

      if (this.payments && refundAmount > 0.01) {
        try {
          const res = await this.payments.refund(
            payment.providerRef ?? payment.id,
            refundAmount,
          );
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
        const isFull = Math.abs(refundAmount - remaining) < 0.01;
        if (refundAmount > 0.01) {
          await tx.refund.create({
            data: {
              paymentId: payment.id,
              amount: refundAmount,
              currency: payment.currency,
              type: isFull ? 'FULL' : 'PARTIAL',
              reason: evaluationLabel,
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
              data: { status: isFull ? 'refunded' : 'partially_refunded' },
            });

            await tx.rideFinancial.updateMany({
              where: { rideId },
              data: {
                refundAmount: refundAmount,
                refundReason: evaluationLabel,
                refundedAt: new Date(),
                ...(cancelledByStatus === RideStatus.DRIVER_CANCELLED
                  ? { driverNetEarning: 0 }
                  : providerCompAmount > 0
                    ? { driverNetEarning: providerCompAmount }
                    : {}),
              },
            });
          }
        }

        if (cancelledByStatus === RideStatus.DRIVER_CANCELLED) {
          await tx.rideFinancial.updateMany({
            where: { rideId },
            data: { driverNetEarning: 0 },
          });
        }

        if (cancelledByStatus === RideStatus.NO_SHOW && providerCompAmount > 0) {
          await tx.rideFinancial.updateMany({
            where: { rideId },
            data: {
              refundAmount: 0,
              refundReason: evaluationLabel,
              refundedAt: new Date(),
              driverNetEarning: providerCompAmount,
            },
          });
        }

        // Credit driver compensation if applicable
        if (providerCompAmount > 0.01 && ride?.assignedDriverId) {
          await tx.driverWalletEntry.create({
            data: {
              driverId: ride.assignedDriverId,
              type: WalletEntryType.ADJUSTMENT,
              direction: WalletDirection.CREDIT,
              amount: providerCompAmount,
              currency: payment.currency,
              status: WalletEntryStatus.POSTED,
              rideId: ride.id,
              description: `${cancelledByStatus === RideStatus.NO_SHOW ? 'No-show' : 'Cancellation'} compensation (${evaluationLabel}) · Ride ${ride.id.slice(0, 8)}`,
              metaJson: {
                rideId: ride.id,
                tier: evaluationLabel,
                compensatedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
        }
      });

      return {
        refunded: gatewayStatus !== 'failed',
        amount: refundAmount,
        refundId: gatewayRefundId,
      };
    } catch (err) {
      this.logger.error(
        `Failed to process cancellation refund for ride ${rideId}: ${err}`,
      );
      return { refunded: false };
    }
  }

  async recordContactAttempt(
    userId: string,
    rideId: string,
    method: 'CALL' | 'CHAT',
    note?: string,
  ) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    const event = await this.prisma.rideEvent.create({
      data: {
        rideId,
        fromStatus: ride.status,
        toStatus: ride.status,
        actorType: 'driver',
        actorId: userId,
        payload: {
          action: 'contact_attempt',
          method,
          note: note?.trim(),
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      eventId: event.id,
      method,
      recordedAt: event.createdAt,
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

    if (isAdmin) {
      if (to === RideStatus.ADMIN_CANCELLED) return;
      const adminAllowedNext: Partial<Record<RideStatus, RideStatus[]>> = {
        [RideStatus.BOOKED]: [
          RideStatus.DRIVER_EN_ROUTE,
          RideStatus.DRIVER_ARRIVED,
          RideStatus.ADMIN_CANCELLED,
        ],
        [RideStatus.DRIVER_EN_ROUTE]: [
          RideStatus.DRIVER_ARRIVED,
          RideStatus.TRIP_STARTED,
          RideStatus.ADMIN_CANCELLED,
        ],
        [RideStatus.DRIVER_ARRIVED]: [
          RideStatus.TRIP_STARTED,
          RideStatus.NO_SHOW,
          RideStatus.ADMIN_CANCELLED,
        ],
        [RideStatus.TRIP_STARTED]: [
          RideStatus.COMPLETED,
          RideStatus.ADMIN_CANCELLED,
        ],
        [RideStatus.IN_PROGRESS]: [
          RideStatus.COMPLETED,
          RideStatus.ADMIN_CANCELLED,
        ],
      };
      if (adminAllowedNext[from]?.includes(to)) return;
    }

    if (isAssignedDriver && driverNext[from]?.includes(to)) return;
    if (isPassenger && passengerNext[from]?.includes(to)) return;

    if (from === RideStatus.TRIP_STARTED || from === RideStatus.IN_PROGRESS) {
      throw new BadRequestException('This trip is already in progress.');
    }
    if (from === RideStatus.COMPLETED) {
      throw new BadRequestException('This trip has already been completed.');
    }
    if (from === RideStatus.NO_SHOW) {
      throw new BadRequestException('This trip was recorded as a no-show.');
    }
    if (
      from === RideStatus.PASSENGER_CANCELLED ||
      from === RideStatus.DRIVER_CANCELLED ||
      from === RideStatus.ADMIN_CANCELLED
    ) {
      throw new BadRequestException('This trip has been cancelled.');
    }

    throw new BadRequestException(
      `Cannot update trip status from ${this.formatStatusLabel(from)} to ${this.formatStatusLabel(to)}.`,
    );
  }

  private formatStatusLabel(status: RideStatus): string {
    switch (status) {
      case RideStatus.WAITING_FOR_OFFERS:
        return 'Waiting for Offers';
      case RideStatus.OFFER_SELECTION:
        return 'Offer Selection';
      case RideStatus.PAYMENT_PENDING:
        return 'Payment Pending';
      case RideStatus.BOOKED:
        return 'Booked';
      case RideStatus.DRIVER_EN_ROUTE:
        return 'Driver En Route';
      case RideStatus.DRIVER_ARRIVED:
        return 'Driver Arrived';
      case RideStatus.TRIP_STARTED:
      case RideStatus.IN_PROGRESS:
        return 'In Progress';
      case RideStatus.COMPLETED:
        return 'Completed';
      case RideStatus.NO_SHOW:
        return 'No-Show';
      case RideStatus.PASSENGER_CANCELLED:
      case RideStatus.DRIVER_CANCELLED:
      case RideStatus.ADMIN_CANCELLED:
        return 'Cancelled';
      case RideStatus.EXPIRED:
        return 'Expired';
      case RideStatus.PAYMENT_FAILED:
        return 'Payment Failed';
      default:
        return String(status).replaceAll('_', ' ');
    }
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
