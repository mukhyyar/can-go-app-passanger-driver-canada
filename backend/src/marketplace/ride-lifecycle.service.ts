import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OfferStatus, Prisma, RideStatus } from '@prisma/client';
import { EmailEventsService } from '../email/email-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { SMS_PROVIDER, type SmsProvider } from '../providers/sms/sms-provider.interface';
import {
  assertTransition,
  canTransition,
  computeRequestExpiresAt,
  isEligibleForUnfulfilledExpiry,
  loadRideLifecycleConfig,
  paymentTimeoutOutcome,
  proposeRepairForIncorrectExpiry,
  type LifecycleActorType,
  type RepairProposal,
  type RideLifecycleConfig,
} from './ride-lifecycle';

type RideScalarPatch = {
  selectedOfferId?: string | null;
  assignedDriverId?: string | null;
  paymentExpiresAt?: Date | null;
  requestExpiresAt?: Date | null;
};

/**
 * Centralized ride status transitions with optimistic concurrency + RideEvent audit.
 * Prefer this over ad-hoc prisma.ride.update({ status }) for business-critical paths.
 */
@Injectable()
export class RideLifecycleService {
  private readonly logger = new Logger(RideLifecycleService.name);
  private readonly config: RideLifecycleConfig;
  /** In-memory cache of ride alert timestamps to prevent tight scheduler polling spam (24h cooldown) */
  private readonly overdueAlertedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tracking?: TrackingGateway,
    @Optional() private readonly emailEvents?: EmailEventsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() @Inject(SMS_PROVIDER) private readonly sms?: SmsProvider,
  ) {
    this.config = loadRideLifecycleConfig();
  }

  private isAlertCooldownActive(
    key: string,
    now: Date,
    cooldownMs = 24 * 60 * 60 * 1000,
  ): boolean {
    const last = this.overdueAlertedAt.get(key);
    return !!last && now.getTime() - last < cooldownMs;
  }

  getConfig(): RideLifecycleConfig {
    return this.config;
  }

  computeRequestExpiresAt(pickupAt: Date): Date {
    return computeRequestExpiresAt(pickupAt, this.config);
  }

  async transition(params: {
    rideId: string;
    from: RideStatus;
    to: RideStatus;
    actorType: LifecycleActorType;
    actorId?: string;
    payload?: Record<string, unknown>;
    extraRideData?: RideScalarPatch;
  }): Promise<{ ok: true } | { ok: false; reason: string; current?: RideStatus }> {
    const { rideId, from, to, actorType, actorId, payload, extraRideData } =
      params;

    if (!canTransition(from, to)) {
      return { ok: false, reason: `illegal_transition:${from}->${to}` };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ride.updateMany({
        where: { id: rideId, status: from },
        data: {
          status: to,
          ...(extraRideData ?? {}),
        },
      });
      if (updated.count === 0) {
        const current = await tx.ride.findUnique({
          where: { id: rideId },
          select: { status: true },
        });
        return {
          ok: false as const,
          reason: 'status_race',
          current: current?.status,
        };
      }
      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: from,
          toStatus: to,
          actorType,
          actorId,
          payload: (payload ?? {}) as Prisma.InputJsonValue,
        },
      });
      return { ok: true as const };
    });

    if (result.ok) {
      this.tracking?.emitRideEvent(rideId, {
        type: 'ride.status.changed',
        from,
        to,
        actorType,
        ...(payload ?? {}),
      });
      if (
        to === RideStatus.PASSENGER_CANCELLED ||
        to === RideStatus.DRIVER_CANCELLED ||
        to === RideStatus.ADMIN_CANCELLED
      ) {
        this.tracking?.emitRideEvent(rideId, {
          type: 'ride.cancelled',
          status: to,
          actorType,
        });

        const preBookingStatuses: RideStatus[] = [
          RideStatus.WAITING_FOR_OFFERS,
          RideStatus.OFFER_SELECTION,
          RideStatus.PAYMENT_PENDING
        ];
        if (!(actorType === 'passenger' && preBookingStatuses.includes(from))) {
          const r = await this.prisma.ride.findUnique({
            where: { id: rideId },
            include: { passenger: { include: { user: true } } }
          });
          if (r?.passenger?.user?.email) {
            let by = 'the driver';
            if (actorType === 'passenger') by = 'you';
            if (actorType === 'admin') by = 'Can-Ride Support';
            void this.emailEvents?.sendRideCancelled(
              r.passenger.userId,
              r.passenger.user.email,
              r.id.slice(0, 8).toUpperCase(),
              by,
              'CAD 0.00',
              5
            );
          }
        }
      }
    }

    return result;
  }

  async requireTransition(params: {
    rideId: string;
    from: RideStatus;
    to: RideStatus;
    actorType: LifecycleActorType;
    actorId?: string;
    payload?: Record<string, unknown>;
    extraRideData?: RideScalarPatch;
  }) {
    assertTransition(params.from, params.to);
    const result = await this.transition(params);
    if (!result.ok) {
      throw new BadRequestException(
        result.reason === 'status_race'
          ? `Ride status changed concurrently (now ${result.current ?? 'unknown'})`
          : result.reason,
      );
    }
    return result;
  }

  /**
   * Idempotent TTL sweep: expire only rides that still qualify after re-read.
   */
  async expireUnfulfilledRequests(now = new Date()) {
    const candidates = await this.prisma.ride.findMany({
      where: {
        status: {
          in: [RideStatus.WAITING_FOR_OFFERS, RideStatus.OFFER_SELECTION],
        },
        OR: [
          { requestExpiresAt: { lt: now } },
          {
            requestExpiresAt: null,
            pickupAt: {
              lt: new Date(now.getTime() - this.config.unfulfilledGraceMs),
            },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        pickupAt: true,
        requestExpiresAt: true,
        passenger: { select: { userId: true } },
        offers: {
          where: { status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] } },
          select: { id: true, driver: { select: { userId: true } } },
        },
      },
      take: 200,
    });

    let expired = 0;
    for (const r of candidates) {
      if (!isEligibleForUnfulfilledExpiry(r, now, this.config)) continue;

      const result = await this.transition({
        rideId: r.id,
        from: r.status,
        to: RideStatus.EXPIRED,
        actorType: 'worker',
        payload: {
          reason: 'unfulfilled_after_pickup_grace',
          pickupAt: r.pickupAt.toISOString(),
          requestExpiresAt: r.requestExpiresAt?.toISOString() ?? null,
          graceMs: this.config.unfulfilledGraceMs,
        },
      });
      if (!result.ok) continue;

      await this.prisma.offer.updateMany({
        where: { rideId: r.id, status: OfferStatus.ACTIVE },
        data: { status: OfferStatus.EXPIRED, expiredAt: now },
      });

      if (this.notifications && r.passenger?.userId) {
        void this.notifications.notifyRideStatus({
          userIds: [r.passenger.userId],
          rideId: r.id,
          status: 'EXPIRED',
          title: 'Ride request expired',
          body: 'Your ride request has expired. You can create a new request or reschedule if available.',
          targetRole: ['PASSENGER', 'PASSENGER_WEB'],
          eventId: `ride.expired.${r.id}`,
          data: {
            type: 'RIDE_REQUEST_EXPIRED',
            deepLink: `/rides/${r.id}`,
          },
        });
      }

      if (this.notifications && r.offers?.length) {
        const driverUserIds = [
          ...new Set(
            r.offers
              .map((o) => o.driver?.userId)
              .filter((id): id is string => !!id),
          ),
        ];
        if (driverUserIds.length > 0) {
          void this.notifications.notifyRideStatus({
            userIds: driverUserIds,
            rideId: r.id,
            status: 'EXPIRED',
            title: 'Ride request expired',
            body: 'The ride request has expired and is no longer available.',
            targetRole: 'DRIVER',
            eventId: `ride.expired.driver.${r.id}`,
            data: {
              type: 'RIDE_REQUEST_EXPIRED',
              deepLink: `/request/${r.id}`,
            },
          });
        }
      }

      expired += 1;
    }
    return expired;
  }

  /**
   * Identifies confirmed bookings and active rides that have stalled or passed scheduled
   * pickup time without progression, and alerts passenger and assigned driver via
   * Push, SMS, and Email with options to reschedule or cancel for a full refund.
   */
  async detectAndNotifyOverdueBookings(now = new Date()) {
    const overdueCutoff = new Date(now.getTime() - this.config.overdueGraceMs);
    const stalledCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours past pickup

    const overdueRides = await this.prisma.ride.findMany({
      where: {
        OR: [
          {
            status: {
              in: [
                RideStatus.BOOKED,
                RideStatus.DRIVER_EN_ROUTE,
                RideStatus.DRIVER_ARRIVED,
              ],
            },
            pickupAt: { lt: overdueCutoff },
          },
          {
            status: {
              in: [RideStatus.TRIP_STARTED, RideStatus.IN_PROGRESS],
            },
            pickupAt: { lt: stalledCutoff },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        pickupAt: true,
        fromLabel: true,
        toLabel: true,
        passenger: {
          select: {
            userId: true,
            fullName: true,
            user: {
              select: {
                id: true,
                email: true,
                phoneE164: true,
              },
            },
          },
        },
        selectedOffer: {
          select: {
            driver: {
              select: {
                userId: true,
                fullName: true,
                user: {
                  select: {
                    id: true,
                    email: true,
                    phoneE164: true,
                  },
                },
              },
            },
          },
        },
      },
      take: 100,
    });

    let notified = 0;
    for (const r of overdueRides) {
      const passengerUser = r.passenger?.user;
      const driverUser = r.selectedOffer?.driver?.user;
      const passengerUserId = passengerUser?.id ?? r.passenger?.userId;
      const driverUserId = driverUser?.id ?? r.selectedOffer?.driver?.userId;
      const passengerPhone = passengerUser?.phoneE164;
      const driverPhone = driverUser?.phoneE164;
      const passengerName = r.passenger?.fullName || 'Passenger';
      const driverName = r.selectedOffer?.driver?.fullName || 'Driver';
      const rideCode = r.id.slice(0, 8).toUpperCase();
      const pickupStr = r.pickupAt
        ? new Date(r.pickupAt).toLocaleString('en-CA', {
            timeZone: 'America/Toronto',
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'Scheduled pickup';

      const eventId = `ride.overdue.${r.id}`;

      // 1. Push notifications
      const paxPushKey = `push:${r.id}:passenger`;
      if (this.notifications && passengerUserId && !this.isAlertCooldownActive(paxPushKey, now)) {
        this.overdueAlertedAt.set(paxPushKey, now.getTime());
        void this.notifications.notifyRideStatus({
          userIds: [passengerUserId],
          rideId: r.id,
          status: 'OVERDUE',
          title: 'Action Required: Ride Delayed / Stalled',
          body: 'Why are you not moving or having trouble? Please check your ride to reschedule or cancel for a full refund.',
          targetRole: ['PASSENGER', 'PASSENGER_WEB'],
          eventId: `${eventId}.passenger`,
          data: {
            type: 'RIDE_OVERDUE',
            deepLink: `/ride/${r.id}`,
            isOverdue: 'true',
          },
        });
      }

      const drvPushKey = `push:${r.id}:driver`;
      if (this.notifications && driverUserId && !this.isAlertCooldownActive(drvPushKey, now)) {
        this.overdueAlertedAt.set(drvPushKey, now.getTime());
        void this.notifications.notifyRideStatus({
          userIds: [driverUserId],
          rideId: r.id,
          status: 'OVERDUE',
          title: 'Trip Stalled / Delayed',
          body: 'Why are you not moving? If you are facing an issue, please update status or cancel the trip so passenger can be refunded.',
          targetRole: 'DRIVER',
          eventId: `${eventId}.driver`,
          data: {
            type: 'RIDE_OVERDUE',
            deepLink: `/trip/${r.id}`,
            isOverdue: 'true',
          },
        });
      }

      // 2. Multi-channel SMS notifications
      if (this.sms && passengerPhone) {
        const smsPaxEventId = `ride_overdue_sms_pax_${r.id}`;
        const smsPaxCacheKey = `sms:${r.id}:passenger`;
        if (!this.isAlertCooldownActive(smsPaxCacheKey, now)) {
          void this.prisma.notificationDelivery
            .findFirst({
              where: {
                channel: 'sms',
                templateKey: 'ride_overdue_sms',
                dataJson: { path: ['eventId'], equals: smsPaxEventId },
                status: 'sent',
              },
            })
            .then(async (alreadySent) => {
              if (alreadySent) {
                this.overdueAlertedAt.set(smsPaxCacheKey, now.getTime());
                return;
              }
              this.overdueAlertedAt.set(smsPaxCacheKey, now.getTime());
              if (passengerPhone && this.sms) {
                try {
                  await this.sms.sendSms(
                    passengerPhone,
                    `CAN-RIDE Alert: Your ride (${rideCode}) appears delayed or stopped. Why are you not moving or having an issue? Reschedule or cancel anytime in the app for a full refund: https://can-rides.ca/ride/${r.id}`,
                  );
                  await this.prisma.notificationDelivery.create({
                    data: {
                      userId: passengerUserId,
                      channel: 'sms',
                      templateKey: 'ride_overdue_sms',
                      body: `Ride ${rideCode} delayed alert`,
                      status: 'sent',
                      dataJson: { eventId: smsPaxEventId, rideId: r.id },
                    },
                  });
                } catch (e) {
                  this.logger.warn(`Failed to send overdue SMS to passenger: ${e}`);
                }
              }
            });
        }
      }

      if (this.sms && driverPhone) {
        const smsDrvEventId = `ride_overdue_sms_drv_${r.id}`;
        const smsDrvCacheKey = `sms:${r.id}:driver`;
        if (!this.isAlertCooldownActive(smsDrvCacheKey, now)) {
          void this.prisma.notificationDelivery
            .findFirst({
              where: {
                channel: 'sms',
                templateKey: 'ride_overdue_sms',
                dataJson: { path: ['eventId'], equals: smsDrvEventId },
                status: 'sent',
              },
            })
            .then(async (alreadySent) => {
              if (alreadySent) {
                this.overdueAlertedAt.set(smsDrvCacheKey, now.getTime());
                return;
              }
              this.overdueAlertedAt.set(smsDrvCacheKey, now.getTime());
              if (driverPhone && this.sms) {
                try {
                  await this.sms.sendSms(
                    driverPhone,
                    `CAN-RIDE Alert: Trip ${rideCode} has not progressed. Why are you not moving? If unable to complete the trip, please cancel in the driver app so passenger can be fully refunded.`,
                  );
                  await this.prisma.notificationDelivery.create({
                    data: {
                      userId: driverUserId,
                      channel: 'sms',
                      templateKey: 'ride_overdue_sms',
                      body: `Trip ${rideCode} delayed alert`,
                      status: 'sent',
                      dataJson: { eventId: smsDrvEventId, rideId: r.id },
                    },
                  });
                } catch (e) {
                  this.logger.warn(`Failed to send overdue SMS to driver: ${e}`);
                }
              }
            });
        }
      }

      // 3. Multi-channel Email notifications
      if (this.emailEvents && passengerUser?.email && passengerUserId) {
        const paxEmailEventId = `ride_delayed_alert_email_${r.id}_passenger`;
        const paxCacheKey = `email:${r.id}:passenger`;

        if (!this.isAlertCooldownActive(paxCacheKey, now)) {
          void this.prisma.notificationDelivery
            .findFirst({
              where: {
                channel: 'email',
                templateKey: 'ride_delayed_alert',
                OR: [
                  { providerMsgId: paxEmailEventId },
                  { dataJson: { path: ['eventId'], equals: paxEmailEventId } },
                ],
                status: 'sent',
              },
            })
            .then(async (alreadySent) => {
              if (alreadySent) {
                this.overdueAlertedAt.set(paxCacheKey, now.getTime());
                return;
              }
              this.overdueAlertedAt.set(paxCacheKey, now.getTime());
              if (this.emailEvents && passengerUser?.email && passengerUserId) {
                try {
                  await this.emailEvents.sendRideDelayedAlert(
                    passengerUserId,
                    passengerUser.email,
                    {
                      recipientRole: 'passenger',
                      rideId: r.id,
                      rideCode,
                      recipientName: passengerName,
                      otherPartyName: driverName,
                      pickupAt: pickupStr,
                      fromLabel: r.fromLabel,
                      toLabel: r.toLabel || 'Destination',
                      actionUrl: `https://can-rides.ca/ride/${r.id}`,
                    },
                  );
                } catch (e) {
                  this.logger.warn(`Failed to send overdue email to passenger: ${e}`);
                }
              }
            })
            .catch((e) => {
              this.logger.warn(`Failed checking passenger overdue email status: ${e}`);
            });
        }
      }

      if (this.emailEvents && driverUser?.email && driverUserId) {
        const drvEmailEventId = `ride_delayed_alert_email_${r.id}_driver`;
        const drvCacheKey = `email:${r.id}:driver`;

        if (!this.isAlertCooldownActive(drvCacheKey, now)) {
          void this.prisma.notificationDelivery
            .findFirst({
              where: {
                channel: 'email',
                templateKey: 'ride_delayed_alert',
                OR: [
                  { providerMsgId: drvEmailEventId },
                  { dataJson: { path: ['eventId'], equals: drvEmailEventId } },
                ],
                status: 'sent',
              },
            })
            .then(async (alreadySent) => {
              if (alreadySent) {
                this.overdueAlertedAt.set(drvCacheKey, now.getTime());
                return;
              }
              this.overdueAlertedAt.set(drvCacheKey, now.getTime());
              if (this.emailEvents && driverUser?.email && driverUserId) {
                try {
                  await this.emailEvents.sendRideDelayedAlert(
                    driverUserId,
                    driverUser.email,
                    {
                      recipientRole: 'driver',
                      rideId: r.id,
                      rideCode,
                      recipientName: driverName,
                      otherPartyName: passengerName,
                      pickupAt: pickupStr,
                      fromLabel: r.fromLabel,
                      toLabel: r.toLabel || 'Destination',
                      actionUrl: `https://can-rides.ca/trip/${r.id}`,
                    },
                  );
                } catch (e) {
                  this.logger.warn(`Failed to send overdue email to driver: ${e}`);
                }
              }
            })
            .catch((e) => {
              this.logger.warn(`Failed checking driver overdue email status: ${e}`);
            });
        }
      }

      // 4. WebSocket live tracking event
      this.tracking?.emitRideEvent(r.id, {
        type: 'ride.overdue',
        rideId: r.id,
        status: r.status,
        isOverdue: true,
      });

      notified += 1;
    }

    return notified;
  }

  async handlePaymentWindowTimeouts(now = new Date()) {
    const stalePay = await this.prisma.ride.findMany({
      where: {
        status: RideStatus.PAYMENT_PENDING,
        paymentExpiresAt: { lt: now },
      },
      select: {
        id: true,
        status: true,
        pickupAt: true,
        selectedOfferId: true,
      },
      take: 200,
    });

    let expired = 0;
    let reopened = 0;

    for (const r of stalePay) {
      const outcome = paymentTimeoutOutcome(r, now, this.config);

      if (outcome === 'reopen_offers') {
        const result = await this.transition({
          rideId: r.id,
          from: RideStatus.PAYMENT_PENDING,
          to: RideStatus.OFFER_SELECTION,
          actorType: 'worker',
          payload: { reason: 'payment_ttl_reopen' },
          extraRideData: {
            selectedOfferId: null,
            assignedDriverId: null,
            paymentExpiresAt: null,
          },
        });
        if (!result.ok) continue;
        // Return reserved offer to ACTIVE so passenger can book again.
        if (r.selectedOfferId) {
          await this.prisma.offer.updateMany({
            where: { id: r.selectedOfferId, status: OfferStatus.SELECTED },
            data: { status: OfferStatus.ACTIVE, acceptedAt: null },
          });
        }
        reopened += 1;
        continue;
      }

      if (outcome === 'expire') {
        const result = await this.transition({
          rideId: r.id,
          from: RideStatus.PAYMENT_PENDING,
          to: RideStatus.EXPIRED,
          actorType: 'worker',
          payload: { reason: 'payment_ttl' },
          extraRideData: {
            selectedOfferId: null,
            assignedDriverId: null,
          },
        });
        if (!result.ok) continue;
        if (r.selectedOfferId) {
          await this.prisma.offer.updateMany({
            where: { id: r.selectedOfferId, status: OfferStatus.SELECTED },
            data: { status: OfferStatus.EXPIRED, expiredAt: now },
          });
        }
        expired += 1;
      }
    }

    return { expiredPayments: expired, reopenedPayments: reopened };
  }

  /**
   * Dry-run or apply repair for rides incorrectly marked EXPIRED while pickup
   * is still in the future.
   */
  async repairIncorrectExpiries(opts: {
    dryRun?: boolean;
    limit?: number;
    now?: Date;
  }): Promise<{
    dryRun: boolean;
    scanned: number;
    proposals: RepairProposal[];
    applied: number;
  }> {
    const now = opts.now ?? new Date();
    const dryRun = opts.dryRun !== false;
    const limit = opts.limit ?? 500;

    const rows = await this.prisma.ride.findMany({
      where: { status: RideStatus.EXPIRED },
      select: {
        id: true,
        status: true,
        pickupAt: true,
        requestExpiresAt: true,
        offers: {
          where: { status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] } },
          select: { id: true },
          take: 1,
        },
      },
      take: limit,
      orderBy: { pickupAt: 'desc' },
    });

    const proposals: RepairProposal[] = [];
    let applied = 0;

    for (const row of rows) {
      const proposal = proposeRepairForIncorrectExpiry(
        {
          id: row.id,
          status: row.status,
          pickupAt: row.pickupAt,
          requestExpiresAt: row.requestExpiresAt,
          hasActiveOrSelectedOffers: row.offers.length > 0,
        },
        now,
        this.config,
      );
      if (!proposal) continue;
      proposals.push(proposal);

      if (dryRun) continue;

      const result = await this.transition({
        rideId: proposal.rideId,
        from: proposal.from,
        to: proposal.to,
        actorType: 'system',
        payload: {
          action: 'RIDE_STATUS_REPAIRED',
          reason: proposal.reason,
          actor: 'SYSTEM_MIGRATION',
        },
        extraRideData: {
          requestExpiresAt: proposal.newRequestExpiresAt,
        },
      });
      if (result.ok) {
        applied += 1;
        await this.prisma.auditLog.create({
          data: {
            action: 'RIDE_STATUS_REPAIRED',
            resource: 'Ride',
            resourceId: proposal.rideId,
            reason: proposal.reason,
            meta: {
              from: proposal.from,
              to: proposal.to,
              reason: proposal.reason,
              actor: 'SYSTEM_MIGRATION',
            } as Prisma.InputJsonValue,
          },
        });
      }
    }

    return { dryRun, scanned: rows.length, proposals, applied };
  }
}
