jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    sign = jest.fn();
    verify = jest.fn();
  },
}));

import { RideStatus } from '@prisma/client';
import {
  canTransition,
  computeEnquiryDiscountState,
  computeRequestExpiresAt,
  isEligibleForUnfulfilledExpiry,
  isImmediateRide,
  isOverdueBooking,
  loadRideLifecycleConfig,
  paymentTimeoutOutcome,
  proposeRepairForIncorrectExpiry,
  serializeLifecycleFlags,
  CANCELLED_ONLY,
  UNFULFILLED,
} from './ride-lifecycle';
import { RideLifecycleService } from './ride-lifecycle.service';

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
      canTransition(
        RideStatus.WAITING_FOR_OFFERS,
        RideStatus.PASSENGER_CANCELLED,
      ),
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
    expect(
      canTransition(RideStatus.PASSENGER_CANCELLED, RideStatus.BOOKED),
    ).toBe(false);
    expect(
      canTransition(RideStatus.PASSENGER_CANCELLED, RideStatus.PAYMENT_PENDING),
    ).toBe(false);
    expect(canTransition(RideStatus.COMPLETED, RideStatus.EXPIRED)).toBe(false);
    expect(canTransition(RideStatus.IN_PROGRESS, RideStatus.EXPIRED)).toBe(
      false,
    );
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
      isImmediateRide(
        new Date(created.getTime() + 30 * 60 * 1000),
        created,
        CFG,
      ),
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

  it('identifies overdue booking only when BOOKED and past pickup + overdueGraceMs', () => {
    const pickupAt = new Date('2026-10-07T12:00:00.000Z');
    // 15m after pickup (within 30m grace) -> not overdue
    expect(
      isOverdueBooking(
        { status: RideStatus.BOOKED, pickupAt },
        new Date('2026-10-07T12:15:00.000Z'),
        CFG,
      ),
    ).toBe(false);

    // 45m after pickup -> overdue
    expect(
      isOverdueBooking(
        { status: RideStatus.BOOKED, pickupAt },
        new Date('2026-10-07T12:45:00.000Z'),
        CFG,
      ),
    ).toBe(true);

    // 2 hours after pickup (< 3 hours stalled cutoff) -> not yet overdue
    expect(
      isOverdueBooking(
        { status: RideStatus.IN_PROGRESS, pickupAt },
        new Date('2026-10-07T14:00:00.000Z'),
        CFG,
      ),
    ).toBe(false);

    // 4 hours after pickup (stalled trip, e.g. Oct 7 stuck ride) -> overdue
    expect(
      isOverdueBooking(
        { status: RideStatus.IN_PROGRESS, pickupAt },
        new Date('2026-10-07T16:00:00.000Z'),
        CFG,
      ),
    ).toBe(true);

    expect(
      isOverdueBooking(
        { status: RideStatus.TRIP_STARTED, pickupAt },
        new Date('2026-10-07T16:00:00.000Z'),
        CFG,
      ),
    ).toBe(true);
  });

  it('allows cancellation transitions from TRIP_STARTED and IN_PROGRESS for stalled/overdue rides', () => {
    expect(
      canTransition(RideStatus.TRIP_STARTED, RideStatus.PASSENGER_CANCELLED),
    ).toBe(true);
    expect(
      canTransition(RideStatus.TRIP_STARTED, RideStatus.DRIVER_CANCELLED),
    ).toBe(true);
    expect(
      canTransition(RideStatus.TRIP_STARTED, RideStatus.ADMIN_CANCELLED),
    ).toBe(true);
    expect(
      canTransition(RideStatus.IN_PROGRESS, RideStatus.PASSENGER_CANCELLED),
    ).toBe(true);
    expect(
      canTransition(RideStatus.IN_PROGRESS, RideStatus.DRIVER_CANCELLED),
    ).toBe(true);
    expect(
      canTransition(RideStatus.IN_PROGRESS, RideStatus.ADMIN_CANCELLED),
    ).toBe(true);
  });

  it('serializeLifecycleFlags exposes isOverdue and canCancel correctly for stalled rides', () => {
    const pickupAt = new Date('2026-10-07T12:00:00.000Z');
    const flags = serializeLifecycleFlags(
      { status: RideStatus.BOOKED, pickupAt },
      new Date('2026-10-07T13:00:00.000Z'),
      CFG,
    );
    expect(flags.isOverdue).toBe(true);
    expect(flags.canCancel).toBe(true);

    // Stalled active ride:
    const stalledFlags = serializeLifecycleFlags(
      { status: RideStatus.IN_PROGRESS, pickupAt },
      new Date('2026-10-07T16:00:00.000Z'),
      CFG,
    );
    expect(stalledFlags.isOverdue).toBe(true);
    expect(stalledFlags.canCancel).toBe(true);
  });

  describe('Automatic 5% Discount for Unconfirmed Ride Enquiries (12h before expiry)', () => {
    // Example from spec: Ride enquiry expires at 8:00 PM on November 20 -> 5% discount available at 8:00 AM on November 20
    const expiresAt = new Date('2026-11-20T20:00:00.000Z');
    const pickupAt = new Date('2026-11-20T19:00:00.000Z'); // expiresAt = pickupAt + 60m grace

    it('becomes eligible at exactly 8:00 AM Nov 20 (12 hours before 8:00 PM expiry), not before, and expires at 8:00 PM', () => {
      // 7:59 AM Nov 20 (> 12h remaining) -> not eligible yet
      const before12h = computeEnquiryDiscountState(
        {
          status: RideStatus.OFFER_SELECTION,
          pickupAt,
          requestExpiresAt: expiresAt,
        },
        new Date('2026-11-20T07:59:00.000Z'),
        CFG,
      );
      expect(before12h.eligible).toBe(false);
      expect(before12h.discountPct).toBe(0);
      expect(before12h.availableAt.toISOString()).toBe(
        '2026-11-20T08:00:00.000Z',
      );

      // 8:00 AM Nov 20 (exactly 12h remaining) -> eligible for 5% discount
      const at12h = computeEnquiryDiscountState(
        {
          status: RideStatus.OFFER_SELECTION,
          pickupAt,
          requestExpiresAt: expiresAt,
        },
        new Date('2026-11-20T08:00:00.000Z'),
        CFG,
      );
      expect(at12h.eligible).toBe(true);
      expect(at12h.discountPct).toBe(5);

      // 2:00 PM Nov 20 (6h remaining) -> eligible for 5% discount
      const within12h = computeEnquiryDiscountState(
        {
          status: RideStatus.WAITING_FOR_OFFERS,
          pickupAt,
          requestExpiresAt: expiresAt,
        },
        new Date('2026-11-20T14:00:00.000Z'),
        CFG,
      );
      expect(within12h.eligible).toBe(true);
      expect(within12h.discountPct).toBe(5);

      // If passenger already finalized booking (BOOKED) -> NOT eligible
      const alreadyBooked = computeEnquiryDiscountState(
        {
          status: RideStatus.BOOKED,
          pickupAt,
          requestExpiresAt: expiresAt,
        },
        new Date('2026-11-20T14:00:00.000Z'),
        CFG,
      );
      expect(alreadyBooked.eligible).toBe(false);
      expect(alreadyBooked.discountPct).toBe(0);

      // 8:00 PM Nov 20 (enquiry expired) -> discount expired
      const atExpiry = computeEnquiryDiscountState(
        {
          status: RideStatus.OFFER_SELECTION,
          pickupAt,
          requestExpiresAt: expiresAt,
        },
        new Date('2026-11-20T20:00:00.000Z'),
        CFG,
      );
      expect(atExpiry.eligible).toBe(false);
      expect(atExpiry.discountPct).toBe(0);
      expect(atExpiry.isExpired).toBe(true);
    });

    it('processExpiringEnquiryDiscounts activates 5% discount on offers and dispatches Push + Email notifications', async () => {
      const mockPrisma: any = {
        ride: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'ride-nov20',
              status: RideStatus.OFFER_SELECTION,
              pickupAt,
              requestExpiresAt: expiresAt,
              fromLabel: 'Toronto Pearson Airport',
              toLabel: 'Union Station',
              priceSnapshot: { guidanceAmount: 100 },
              passenger: {
                userId: 'pax-user-1',
                fullName: 'Alex Rider',
                user: { id: 'pax-user-1', email: 'alex@example.com' },
              },
              offers: [
                {
                  id: 'offer-1',
                  bidAmount: 100,
                  returnPrice: null,
                  priceSnapshot: {
                    bidAmount: 100,
                    subtotal: 100,
                    platformFee: 20,
                    driverEarning: 80,
                    passengerTotal: 120,
                    taxAmount: 0,
                  },
                },
              ],
            },
          ]),
          update: jest.fn().mockResolvedValue({}),
        },
        offer: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      const mockNotifications: any = {
        notifyRideStatus: jest.fn().mockResolvedValue({}),
      };
      const mockEmailEvents: any = {
        sendRideEnquiryDiscount: jest.fn().mockResolvedValue({}),
      };
      const mockTracking: any = {
        emitRideEvent: jest.fn(),
        emitToPassengers: jest.fn(),
      };

      const lifecycleSvc = new RideLifecycleService(
        mockPrisma,
        mockTracking,
        mockEmailEvents,
        mockNotifications,
      );

      const count = await lifecycleSvc.processExpiringEnquiryDiscounts(
        new Date('2026-11-20T08:05:00.000Z'),
      );

      expect(count).toBe(1);
      expect(mockPrisma.ride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ride-nov20' },
          data: {
            priceSnapshot: expect.objectContaining({
              enquiryDiscountPct: 5,
              enquiryDiscountActivatedAt: '2026-11-20T08:05:00.000Z',
              enquiryDiscountExpiresAt: '2026-11-20T20:00:00.000Z',
            }),
          },
        }),
      );
      expect(mockPrisma.offer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'offer-1' },
          data: {
            priceSnapshot: expect.objectContaining({
              originalPassengerTotal: 120,
              enquiryDiscountPct: 5,
              enquiryDiscountAmount: 5,
              passengerTotal: 115,
              canRideGrossRevenue: 35,
            }),
          },
        }),
      );
      expect(mockNotifications.notifyRideStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['pax-user-1'],
          rideId: 'ride-nov20',
          eventId: 'ride.enquiry_discount_5pct.ride-nov20',
        }),
      );
      expect(mockEmailEvents.sendRideEnquiryDiscount).toHaveBeenCalledWith(
        'pax-user-1',
        'alex@example.com',
        expect.objectContaining({
          rideId: 'ride-nov20',
          discountPct: 5,
        }),
      );
    });
  });
});
