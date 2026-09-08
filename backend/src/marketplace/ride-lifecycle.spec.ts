import { RideStatus } from '@prisma/client';
import {
  canTransition,
  computeRequestExpiresAt,
  isEligibleForUnfulfilledExpiry,
  isImmediateRide,
  loadRideLifecycleConfig,
  paymentTimeoutOutcome,
  proposeRepairForIncorrectExpiry,
  CANCELLED_ONLY,
  UNFULFILLED,
} from './ride-lifecycle';

const CFG = loadRideLifecycleConfig({
  RIDE_UNFULFILLED_GRACE_MINUTES: '60',
  RIDE_PAYMENT_TTL_MINUTES: '15',
  RIDE_IMMEDIATE_THRESHOLD_MINUTES: '120',
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('ride lifecycle policy', () => {
  const created = new Date('2026-09-08T10:00:00.000Z');

  it('TEST 1: ride created today for tomorrow is NOT eligible for expiry', () => {
    const pickupAt = new Date('2026-09-09T17:00:00.000Z');
    const requestExpiresAt = computeRequestExpiresAt(pickupAt, CFG);
    const now = new Date('2026-09-08T10:30:00.000Z'); // 30m after create (legacy bug window)

    expect(
      isEligibleForUnfulfilledExpiry(
        {
          status: RideStatus.WAITING_FOR_OFFERS,
          pickupAt,
          requestExpiresAt,
        },
        now,
        CFG,
      ),
    ).toBe(false);
  });

  it('TEST 2: ride for next month remains active (not eligible)', () => {
    const pickupAt = new Date('2026-10-08T17:00:00.000Z');
    const requestExpiresAt = computeRequestExpiresAt(pickupAt, CFG);
    const now = new Date('2026-09-15T12:00:00.000Z');

    expect(requestExpiresAt.getTime()).toBeGreaterThan(now.getTime());
    expect(
      isEligibleForUnfulfilledExpiry(
        {
          status: RideStatus.OFFER_SELECTION,
          pickupAt,
          requestExpiresAt,
        },
        now,
        CFG,
      ),
    ).toBe(false);
  });

  it('TEST 3: passenger cancel uses PASSENGER_CANCELLED transition, not EXPIRED', () => {
    expect(
      canTransition(RideStatus.WAITING_FOR_OFFERS, RideStatus.PASSENGER_CANCELLED),
    ).toBe(true);
    expect(CANCELLED_ONLY).toContain(RideStatus.PASSENGER_CANCELLED);
    expect(CANCELLED_ONLY).not.toContain(RideStatus.EXPIRED);
    expect(UNFULFILLED).toContain(RideStatus.EXPIRED);
  });

  it('TEST 4: offer expiry is independent — ride stays non-expired while pickup future', () => {
    // Simulates: offer.status=EXPIRED while ride still open
    const pickupAt = new Date(created.getTime() + DAY);
    const requestExpiresAt = computeRequestExpiresAt(pickupAt, CFG);
    const now = new Date(created.getTime() + 20 * 60 * 1000); // offer 15m TTL would be done

    expect(
      isEligibleForUnfulfilledExpiry(
        {
          status: RideStatus.WAITING_FOR_OFFERS,
          pickupAt,
          requestExpiresAt,
        },
        now,
        CFG,
      ),
    ).toBe(false);
  });

  it('TEST 5: several offers expiring does not expire a valid scheduled ride', () => {
    const pickupAt = new Date(created.getTime() + 3 * DAY);
    const requestExpiresAt = computeRequestExpiresAt(pickupAt, CFG);
    for (const offset of [15, 30, 45, 90].map((m) => m * 60 * 1000)) {
      const now = new Date(created.getTime() + offset);
      expect(
        isEligibleForUnfulfilledExpiry(
          {
            status: RideStatus.OFFER_SELECTION,
            pickupAt,
            requestExpiresAt,
          },
          now,
          CFG,
        ),
      ).toBe(false);
    }
  });

  it('TEST 6: pickup passed but ride is BOOKED / progressing → never expire', () => {
    const pickupAt = new Date('2026-09-08T17:00:00.000Z');
    const now = new Date('2026-09-08T17:30:00.000Z');
    for (const status of [
      RideStatus.BOOKED,
      RideStatus.DRIVER_EN_ROUTE,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.TRIP_STARTED,
      RideStatus.IN_PROGRESS,
      RideStatus.PAYMENT_PENDING,
    ]) {
      expect(
        isEligibleForUnfulfilledExpiry(
          { status, pickupAt, requestExpiresAt: new Date(0) },
          now,
          CFG,
        ),
      ).toBe(false);
    }
  });

  it('TEST 7: pickup + grace passed and still open → eligible for EXPIRED/unfulfilled', () => {
    const pickupAt = new Date('2026-09-08T17:00:00.000Z');
    const requestExpiresAt = computeRequestExpiresAt(pickupAt, CFG);
    const now = new Date(requestExpiresAt.getTime() + 1000);

    expect(
      isEligibleForUnfulfilledExpiry(
        {
          status: RideStatus.WAITING_FOR_OFFERS,
          pickupAt,
          requestExpiresAt,
        },
        now,
        CFG,
      ),
    ).toBe(true);
  });

  it('TEST 8: COMPLETED is never eligible for expiry', () => {
    expect(
      isEligibleForUnfulfilledExpiry(
        {
          status: RideStatus.COMPLETED,
          pickupAt: new Date(0),
          requestExpiresAt: new Date(0),
        },
        new Date(),
        CFG,
      ),
    ).toBe(false);
    expect(canTransition(RideStatus.COMPLETED, RideStatus.EXPIRED)).toBe(false);
  });

  it('TEST 9: CANCELLED is never eligible for expiry', () => {
    for (const status of CANCELLED_ONLY) {
      expect(
        isEligibleForUnfulfilledExpiry(
          {
            status,
            pickupAt: new Date(0),
            requestExpiresAt: new Date(0),
          },
          new Date(),
          CFG,
        ),
      ).toBe(false);
      expect(canTransition(status, RideStatus.EXPIRED)).toBe(false);
    }
  });

  it('TEST 10: cancel vs assign race — illegal CANCELLED→DRIVER_ASSIGNED / BOOKED blocked', () => {
    expect(canTransition(RideStatus.PASSENGER_CANCELLED, RideStatus.BOOKED)).toBe(
      false,
    );
    expect(
      canTransition(RideStatus.PASSENGER_CANCELLED, RideStatus.PAYMENT_PENDING),
    ).toBe(false);
    expect(canTransition(RideStatus.COMPLETED, RideStatus.EXPIRED)).toBe(false);
    expect(canTransition(RideStatus.IN_PROGRESS, RideStatus.EXPIRED)).toBe(false);
  });

  it('TEST 11: dry-run repair identifies incorrectly expired future ride', () => {
    const pickupAt = new Date(created.getTime() + 7 * DAY);
    const proposal = proposeRepairForIncorrectExpiry(
      {
        id: 'ride_future',
        status: RideStatus.EXPIRED,
        pickupAt,
        requestExpiresAt: new Date(created.getTime() + 30 * 60 * 1000), // legacy 30m
        hasActiveOrSelectedOffers: false,
      },
      created,
      CFG,
    );
    expect(proposal).not.toBeNull();
    expect(proposal!.to).toBe(RideStatus.WAITING_FOR_OFFERS);
    expect(proposal!.reason).toMatch(/incorrectly expired/i);
  });

  it('TEST 12: repair does NOT reactivate legitimately expired historic ride', () => {
    const pickupAt = new Date('2026-08-01T17:00:00.000Z');
    const now = new Date('2026-09-08T12:00:00.000Z');
    const proposal = proposeRepairForIncorrectExpiry(
      {
        id: 'ride_old',
        status: RideStatus.EXPIRED,
        pickupAt,
        requestExpiresAt: computeRequestExpiresAt(pickupAt, CFG),
        hasActiveOrSelectedOffers: false,
      },
      now,
      CFG,
    );
    expect(proposal).toBeNull();
  });

  it('timezone / midnight boundary: pickup just after local midnight UTC stays future', () => {
    const pickupAt = new Date('2026-09-09T00:30:00.000Z');
    const now = new Date('2026-09-08T23:45:00.000Z');
    const requestExpiresAt = computeRequestExpiresAt(pickupAt, CFG);
    expect(
      isEligibleForUnfulfilledExpiry(
        {
          status: RideStatus.WAITING_FOR_OFFERS,
          pickupAt,
          requestExpiresAt,
        },
        now,
        CFG,
      ),
    ).toBe(false);
  });

  it('requestExpiresAt is tied to pickupAt, not createdAt', () => {
    const pickupAt = new Date(created.getTime() + 5 * DAY);
    const expires = computeRequestExpiresAt(pickupAt, CFG);
    expect(expires.getTime()).toBe(pickupAt.getTime() + CFG.unfulfilledGraceMs);
    expect(expires.getTime()).not.toBe(created.getTime() + 30 * 60 * 1000);
  });

  it('immediate vs scheduled detection uses threshold', () => {
    expect(
      isImmediateRide(new Date(created.getTime() + 30 * 60 * 1000), created, CFG),
    ).toBe(true);
    expect(
      isImmediateRide(new Date(created.getTime() + 3 * DAY), created, CFG),
    ).toBe(false);
  });

  it('payment timeout reopens marketplace when pickup still in window', () => {
    const pickupAt = new Date(created.getTime() + DAY);
    expect(
      paymentTimeoutOutcome(
        { status: RideStatus.PAYMENT_PENDING, pickupAt },
        created,
        CFG,
      ),
    ).toBe('reopen_offers');
  });

  it('payment timeout expires only after pickup+grace for unfulfilled pending pay', () => {
    const pickupAt = new Date(created.getTime() - 2 * HOUR);
    const now = new Date(created.getTime());
    expect(
      paymentTimeoutOutcome(
        { status: RideStatus.PAYMENT_PENDING, pickupAt },
        now,
        CFG,
      ),
    ).toBe('expire');
  });

  it('repair restores OFFER_SELECTION when offers exist', () => {
    const pickupAt = new Date(created.getTime() + DAY);
    const proposal = proposeRepairForIncorrectExpiry(
      {
        id: 'ride_offers',
        status: RideStatus.EXPIRED,
        pickupAt,
        requestExpiresAt: null,
        hasActiveOrSelectedOffers: true,
      },
      created,
      CFG,
    );
    expect(proposal?.to).toBe(RideStatus.OFFER_SELECTION);
  });
});
