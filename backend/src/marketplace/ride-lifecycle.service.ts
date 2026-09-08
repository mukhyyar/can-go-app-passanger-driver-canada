import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { OfferStatus, Prisma, RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
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
  private readonly config: RideLifecycleConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tracking?: TrackingGateway,
  ) {
    this.config = loadRideLifecycleConfig();
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
      expired += 1;
    }
    return expired;
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
        if (r.selectedOfferId) {
          await this.prisma.offer.update({
            where: { id: r.selectedOfferId },
            data: { status: OfferStatus.EXPIRED, expiredAt: now },
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
          await this.prisma.offer.update({
            where: { id: r.selectedOfferId },
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
