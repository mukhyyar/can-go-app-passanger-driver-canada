import { BadRequestException } from '@nestjs/common';
import { validateRideSchedule } from './ride-schedule.logic';

describe('ride-schedule.logic', () => {
  const fixedNow = new Date('2026-10-18T12:00:00.000Z').getTime();

  it('allows valid future one-way ride', () => {
    const pickupAt = new Date('2026-10-18T13:00:00.000Z');
    expect(() =>
      validateRideSchedule({
        pickupAt,
        now: fixedNow,
      }),
    ).not.toThrow();
  });

  it('allows valid future round-trip ride when return is after pickup', () => {
    const pickupAt = new Date('2026-10-18T13:00:00.000Z');
    const returnAt = new Date('2026-10-18T16:00:00.000Z');
    expect(() =>
      validateRideSchedule({
        pickupAt,
        isRoundTrip: true,
        returnAt,
        now: fixedNow,
      }),
    ).not.toThrow();
  });

  it('rejects pickup time in the past beyond grace period', () => {
    const pastPickup = new Date('2026-10-18T11:50:00.000Z'); // 10 min in the past
    expect(() =>
      validateRideSchedule({
        pickupAt: pastPickup,
        now: fixedNow,
      }),
    ).toThrow(new BadRequestException('Pickup time cannot be in the past'));
  });

  it('allows pickup time within 5-min grace window (clock skew / latency)', () => {
    const gracePickup = new Date('2026-10-18T11:57:00.000Z'); // 3 min in the past
    expect(() =>
      validateRideSchedule({
        pickupAt: gracePickup,
        now: fixedNow,
      }),
    ).not.toThrow();
  });

  it('rejects round-trip without returnAt', () => {
    const pickupAt = new Date('2026-10-18T13:00:00.000Z');
    expect(() =>
      validateRideSchedule({
        pickupAt,
        isRoundTrip: true,
        returnAt: null,
        now: fixedNow,
      }),
    ).toThrow(new BadRequestException('returnAt required for round-trip rides'));
  });

  it('rejects returnAt in the past', () => {
    const pickupAt = new Date('2026-10-18T13:00:00.000Z');
    const pastReturn = new Date('2026-10-18T11:00:00.000Z');
    expect(() =>
      validateRideSchedule({
        pickupAt,
        isRoundTrip: true,
        returnAt: pastReturn,
        now: fixedNow,
      }),
    ).toThrow(new BadRequestException('Return time cannot be in the past'));
  });

  it('rejects returnAt earlier than or equal to pickupAt', () => {
    const pickupAt = new Date('2026-10-18T15:00:00.000Z');
    const earlierReturn = new Date('2026-10-18T14:30:00.000Z');
    expect(() =>
      validateRideSchedule({
        pickupAt,
        isRoundTrip: true,
        returnAt: earlierReturn,
        now: fixedNow,
      }),
    ).toThrow(new BadRequestException('Return time must be after pickup time'));

    // Equal timestamps
    expect(() =>
      validateRideSchedule({
        pickupAt,
        isRoundTrip: true,
        returnAt: new Date(pickupAt.getTime()),
        now: fixedNow,
      }),
    ).toThrow(new BadRequestException('Return time must be after pickup time'));
  });

  it('allows unchanged existing pickup timestamp when isPickupExplicitlyUpdated is false', () => {
    // Existing ride from earlier today where pickup has passed, but user edits only comment
    const pastPickup = new Date('2026-10-18T10:00:00.000Z');
    expect(() =>
      validateRideSchedule({
        pickupAt: pastPickup,
        isPickupExplicitlyUpdated: false,
        now: fixedNow,
      }),
    ).not.toThrow();
  });
});
