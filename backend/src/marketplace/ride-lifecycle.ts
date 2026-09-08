import { RideStatus } from '@prisma/client';

/**
 * Ride vs offer lifecycle policy.
 *
 * Canonical pickup timestamp: Ride.pickupAt
 * Offer expiry (Offer.expiresAt) must NEVER imply Ride.status = EXPIRED.
 *
 * Env (minutes, unless noted):
 * - RIDE_UNFULFILLED_GRACE_MINUTES (default 60)
 * - RIDE_PAYMENT_TTL_MINUTES (default 15)
 * - RIDE_IMMEDIATE_THRESHOLD_MINUTES (default 120) — pickup within this of create ⇒ "ride now"
 */

export type LifecycleActorType =
  | 'passenger'
  | 'driver'
  | 'admin'
  | 'system'
  | 'worker';

export type RideLifecycleConfig = {
  unfulfilledGraceMs: number;
  paymentTtlMs: number;
  immediateThresholdMs: number;
};

const MINUTE = 60_000;

export function loadRideLifecycleConfig(
  env: NodeJS.ProcessEnv = process.env,
): RideLifecycleConfig {
  const graceMin = parsePositiveInt(env.RIDE_UNFULFILLED_GRACE_MINUTES, 60);
  const payMin = parsePositiveInt(env.RIDE_PAYMENT_TTL_MINUTES, 15);
  const immediateMin = parsePositiveInt(env.RIDE_IMMEDIATE_THRESHOLD_MINUTES, 120);
  return {
    unfulfilledGraceMs: graceMin * MINUTE,
    paymentTtlMs: payMin * MINUTE,
    immediateThresholdMs: immediateMin * MINUTE,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Marketplace statuses that may still receive offers / expire as unfulfilled. */
export const OPEN_MARKETPLACE_STATUSES: RideStatus[] = [
  RideStatus.WAITING_FOR_OFFERS,
  RideStatus.OFFER_SELECTION,
];

export const TERMINAL_RIDE_STATUSES: RideStatus[] = [
  RideStatus.COMPLETED,
  RideStatus.PASSENGER_CANCELLED,
  RideStatus.DRIVER_CANCELLED,
  RideStatus.ADMIN_CANCELLED,
  RideStatus.EXPIRED,
  RideStatus.NO_SHOW,
  RideStatus.PAYMENT_FAILED,
];

/** True passenger/admin/driver cancellations — not EXPIRED / NO_SHOW. */
export const CANCELLED_ONLY: RideStatus[] = [
  RideStatus.PASSENGER_CANCELLED,
  RideStatus.DRIVER_CANCELLED,
  RideStatus.ADMIN_CANCELLED,
];

/** Unfulfilled / missed marketplace outcomes (not cancellations). */
export const UNFULFILLED: RideStatus[] = [RideStatus.EXPIRED, RideStatus.NO_SHOW];

/** Payment failures (distinct from ride expiry). */
export const FAILED_PAYMENT: RideStatus[] = [RideStatus.PAYMENT_FAILED];

/** Progressing / assigned trip — must never be expired by request TTL. */
export const PROGRESSING_TRIP_STATUSES: RideStatus[] = [
  RideStatus.PAYMENT_PENDING,
  RideStatus.BOOKED,
  RideStatus.DRIVER_EN_ROUTE,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.TRIP_STARTED,
  RideStatus.IN_PROGRESS,
];

/**
 * Legal marketplace / trip transitions (subset enforced for expire/cancel/create).
 * TripService retains its own driver/passenger transition map for post-book flow.
 */
const ALLOWED: Partial<Record<RideStatus, RideStatus[]>> = {
  [RideStatus.WAITING_FOR_OFFERS]: [
    RideStatus.OFFER_SELECTION,
    RideStatus.PAYMENT_PENDING,
    RideStatus.PASSENGER_CANCELLED,
    RideStatus.ADMIN_CANCELLED,
    RideStatus.EXPIRED,
  ],
  [RideStatus.OFFER_SELECTION]: [
    RideStatus.WAITING_FOR_OFFERS,
    RideStatus.PAYMENT_PENDING,
    RideStatus.PASSENGER_CANCELLED,
    RideStatus.ADMIN_CANCELLED,
    RideStatus.EXPIRED,
  ],
  [RideStatus.PAYMENT_PENDING]: [
    RideStatus.BOOKED,
    RideStatus.OFFER_SELECTION,
    RideStatus.WAITING_FOR_OFFERS,
    RideStatus.PAYMENT_FAILED,
    RideStatus.PASSENGER_CANCELLED,
    RideStatus.ADMIN_CANCELLED,
    RideStatus.EXPIRED,
  ],
  [RideStatus.BOOKED]: [
    RideStatus.DRIVER_EN_ROUTE,
    RideStatus.PASSENGER_CANCELLED,
    RideStatus.DRIVER_CANCELLED,
    RideStatus.ADMIN_CANCELLED,
  ],
  [RideStatus.DRIVER_EN_ROUTE]: [
    RideStatus.DRIVER_ARRIVED,
    RideStatus.PASSENGER_CANCELLED,
    RideStatus.DRIVER_CANCELLED,
    RideStatus.ADMIN_CANCELLED,
  ],
  [RideStatus.DRIVER_ARRIVED]: [
    RideStatus.TRIP_STARTED,
    RideStatus.PASSENGER_CANCELLED,
    RideStatus.DRIVER_CANCELLED,
    RideStatus.ADMIN_CANCELLED,
    RideStatus.NO_SHOW,
  ],
  [RideStatus.TRIP_STARTED]: [RideStatus.IN_PROGRESS, RideStatus.COMPLETED],
  [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED],
  // Repair-only: incorrectly expired future rides may be restored
  [RideStatus.EXPIRED]: [
    RideStatus.WAITING_FOR_OFFERS,
    RideStatus.OFFER_SELECTION,
  ],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED[from];
  return !!allowed?.includes(to);
}

export function assertTransition(from: RideStatus, to: RideStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal ride transition ${from} → ${to}`);
  }
}

export function isImmediateRide(
  pickupAt: Date,
  createdAt: Date,
  config: RideLifecycleConfig = loadRideLifecycleConfig(),
): boolean {
  return pickupAt.getTime() - createdAt.getTime() <= config.immediateThresholdMs;
}

/**
 * Request window ends at pickup + unfulfilled grace — never at createdAt + fixed TTL.
 * Future scheduled rides stay open until their pickup lifecycle permits expiry.
 */
export function computeRequestExpiresAt(
  pickupAt: Date,
  config: RideLifecycleConfig = loadRideLifecycleConfig(),
): Date {
  return new Date(pickupAt.getTime() + config.unfulfilledGraceMs);
}

export function unfulfilledCutoffAt(
  pickupAt: Date,
  config: RideLifecycleConfig = loadRideLifecycleConfig(),
): Date {
  return new Date(pickupAt.getTime() + config.unfulfilledGraceMs);
}

export type ExpireEligibilityInput = {
  status: RideStatus;
  pickupAt: Date;
  requestExpiresAt?: Date | null;
};

/**
 * A ride may become EXPIRED (unfulfilled) only when:
 * - still in open marketplace status (no driver progression)
 * - pickup + grace has passed
 * - requestExpiresAt (if set) has also passed
 *
 * NEVER expire because createdAt is old, an offer expired, or matching "timed out".
 */
export function isEligibleForUnfulfilledExpiry(
  ride: ExpireEligibilityInput,
  now: Date = new Date(),
  config: RideLifecycleConfig = loadRideLifecycleConfig(),
): boolean {
  if (TERMINAL_RIDE_STATUSES.includes(ride.status)) return false;
  if (PROGRESSING_TRIP_STATUSES.includes(ride.status)) return false;
  if (!OPEN_MARKETPLACE_STATUSES.includes(ride.status)) return false;

  const cutoff = unfulfilledCutoffAt(ride.pickupAt, config);
  if (cutoff.getTime() > now.getTime()) return false;

  if (ride.requestExpiresAt && ride.requestExpiresAt.getTime() > now.getTime()) {
    return false;
  }

  return true;
}

/**
 * Payment window timed out. If pickup lifecycle still allows marketplace activity,
 * reopen for offers instead of marking the passenger ride EXPIRED.
 */
export function paymentTimeoutOutcome(
  ride: { status: RideStatus; pickupAt: Date },
  now: Date = new Date(),
  config: RideLifecycleConfig = loadRideLifecycleConfig(),
): 'expire' | 'reopen_offers' | 'noop' {
  if (ride.status !== RideStatus.PAYMENT_PENDING) return 'noop';
  if (isEligibleForUnfulfilledExpiry(
    { ...ride, status: RideStatus.WAITING_FOR_OFFERS },
    now,
    config,
  )) {
    return 'expire';
  }
  // Still before / within pickup window → do not kill the ride
  if (unfulfilledCutoffAt(ride.pickupAt, config).getTime() > now.getTime()) {
    return 'reopen_offers';
  }
  return 'expire';
}

export type RepairCandidate = {
  id: string;
  status: RideStatus;
  pickupAt: Date;
  requestExpiresAt: Date | null;
  hasActiveOrSelectedOffers: boolean;
};

export type RepairProposal = {
  rideId: string;
  from: RideStatus;
  to: RideStatus;
  reason: string;
  newRequestExpiresAt: Date;
};

/**
 * Safe repair: only restore EXPIRED rides whose scheduled pickup (+ grace) is still
 * in the future and that were never legitimately terminal for other reasons.
 */
export function proposeRepairForIncorrectExpiry(
  ride: RepairCandidate,
  now: Date = new Date(),
  config: RideLifecycleConfig = loadRideLifecycleConfig(),
): RepairProposal | null {
  if (ride.status !== RideStatus.EXPIRED) return null;

  const cutoff = unfulfilledCutoffAt(ride.pickupAt, config);
  if (cutoff.getTime() <= now.getTime()) {
    // Legitimately past pickup+grace — leave EXPIRED
    return null;
  }

  // Still within valid scheduled window → restore marketplace state
  const to = ride.hasActiveOrSelectedOffers
    ? RideStatus.OFFER_SELECTION
    : RideStatus.WAITING_FOR_OFFERS;

  return {
    rideId: ride.id,
    from: RideStatus.EXPIRED,
    to,
    reason:
      'Future scheduled ride was incorrectly expired by legacy createdAt-based request TTL',
    newRequestExpiresAt: computeRequestExpiresAt(ride.pickupAt, config),
  };
}

export function serializeLifecycleFlags(ride: {
  status: RideStatus;
  pickupAt: Date;
  requestExpiresAt?: Date | null;
  paymentExpiresAt?: Date | null;
}) {
  const open = OPEN_MARKETPLACE_STATUSES.includes(ride.status);
  const terminal = TERMINAL_RIDE_STATUSES.includes(ride.status);
  return {
    canCancel: (
      [
        RideStatus.WAITING_FOR_OFFERS,
        RideStatus.OFFER_SELECTION,
        RideStatus.PAYMENT_PENDING,
        RideStatus.BOOKED,
        RideStatus.DRIVER_EN_ROUTE,
        RideStatus.DRIVER_ARRIVED,
      ] as RideStatus[]
    ).includes(ride.status),
    canReceiveOffers: open,
    canEdit: open,
    isTerminal: terminal,
    scheduledPickupAt: ride.pickupAt,
  };
}
