import { RideStatus } from '@prisma/client';
import {
  isMaterialRideEdit,
  isPassengerEditableStatus,
} from './ride-update.logic';

describe('ride-update.logic', () => {
  it('allows edit only for open marketplace statuses', () => {
    expect(isPassengerEditableStatus(RideStatus.WAITING_FOR_OFFERS)).toBe(true);
    expect(isPassengerEditableStatus(RideStatus.OFFER_SELECTION)).toBe(true);
    expect(isPassengerEditableStatus(RideStatus.PAYMENT_PENDING)).toBe(false);
    expect(isPassengerEditableStatus(RideStatus.BOOKED)).toBe(false);
  });

  const base = {
    fromLabel: 'A',
    toLabel: 'B',
    fromLat: 1,
    fromLng: 2,
    toLat: 3,
    toLng: 4,
    pickupAt: '2026-09-20T10:00:00.000Z',
    returnAt: null,
    isRoundTrip: false,
    vehicleClassIds: ['economy'],
    hours: null,
    days: null,
  };

  it('treats comment-only style fields as non-material when comparable fields unchanged', () => {
    expect(isMaterialRideEdit(base, { ...base })).toBe(false);
  });

  it('flags route / time / vehicle changes as material', () => {
    expect(
      isMaterialRideEdit(base, { ...base, fromLat: 1.1 }),
    ).toBe(true);
    expect(
      isMaterialRideEdit(base, {
        ...base,
        pickupAt: '2026-09-20T11:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isMaterialRideEdit(base, {
        ...base,
        vehicleClassIds: ['business'],
      }),
    ).toBe(true);
  });
});
