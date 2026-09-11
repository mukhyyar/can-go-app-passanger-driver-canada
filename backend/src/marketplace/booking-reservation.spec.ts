import { RideStatus } from '@prisma/client';
import { canTransition, paymentTimeoutOutcome } from './ride-lifecycle';

/**
 * Booking reservation policy tests (select → pay → confirm).
 * Competing offers stay open until payment succeeds; TTL releases reservation.
 */
describe('booking reservation policy', () => {
  const cfg = {
    unfulfilledGraceMs: 60 * 60_000,
    paymentTtlMs: 15 * 60_000,
    immediateThresholdMs: 120 * 60_000,
  };

  it('allows PAYMENT_PENDING → BOOKED and PAYMENT_PENDING → OFFER_SELECTION', () => {
    expect(canTransition(RideStatus.PAYMENT_PENDING, RideStatus.BOOKED)).toBe(
      true,
    );
    expect(
      canTransition(RideStatus.PAYMENT_PENDING, RideStatus.OFFER_SELECTION),
    ).toBe(true);
  });

  it('does not allow BOOKED → OFFER_SELECTION (no unbooking via reopen)', () => {
    expect(
      canTransition(RideStatus.BOOKED, RideStatus.OFFER_SELECTION),
    ).toBe(false);
  });

  it('payment TTL before pickup reopens offers instead of expiring ride', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const pickupAt = new Date('2026-09-11T17:00:00.000Z');
    expect(
      paymentTimeoutOutcome(
        {
          status: RideStatus.PAYMENT_PENDING,
          pickupAt,
        },
        now,
        cfg,
      ),
    ).toBe('reopen_offers');
  });

  it('BOOKED is a progressing status — cannot reopen marketplace from BOOKED', () => {
    expect(
      canTransition(RideStatus.BOOKED, RideStatus.OFFER_SELECTION),
    ).toBe(false);
    expect(
      canTransition(RideStatus.BOOKED, RideStatus.WAITING_FOR_OFFERS),
    ).toBe(false);
  });
});
