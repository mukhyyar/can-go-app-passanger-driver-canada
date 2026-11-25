import {
  computeEnRouteEligibility,
  SCHEDULE_GATE_DEFAULTS,
} from './trip-schedule-gate.util';
import { type MapsProvider } from '../maps/maps-provider.interface';

describe('TripScheduleGate - computeEnRouteEligibility', () => {
  const baseRide = {
    pickupAt: new Date('2026-11-26T17:00:00.000Z'),
    createdAt: new Date('2026-11-25T10:00:00.000Z'),
    fromLat: 43.6532,
    fromLng: -79.3832,
  };

  it('allows immediate en-route for immediate rides created <= 15 minutes before pickup', async () => {
    const now = new Date('2026-11-25T12:00:00.000Z');
    const ride = {
      pickupAt: new Date('2026-11-25T12:10:00.000Z'),
      createdAt: new Date('2026-11-25T12:00:00.000Z'),
      fromLat: 43.6532,
      fromLng: -79.3832,
    };

    const res = await computeEnRouteEligibility(ride, { now });
    expect(res.canGoEnRoute).toBe(true);
    expect(res.isActivated).toBe(true);
    expect(res.isScheduled).toBe(false);
    expect(res.remainingMinutesUntilUnlock).toBe(0);
  });

  it('allows en-route if pickup time is in the past', async () => {
    const now = new Date('2026-11-26T17:05:00.000Z');
    const res = await computeEnRouteEligibility(baseRide, { now });
    expect(res.canGoEnRoute).toBe(true);
    expect(res.isActivated).toBe(true);
    expect(res.remainingMinutesUntilUnlock).toBe(0);
  });

  it('reports not activated when > 2 hours before pickup', async () => {
    // 5 hours before pickup
    const now = new Date('2026-11-26T12:00:00.000Z');
    const res = await computeEnRouteEligibility(baseRide, { now });

    expect(res.canGoEnRoute).toBe(false);
    expect(res.isActivated).toBe(false);
    expect(res.activationOpensAt.toISOString()).toBe('2026-11-26T15:00:00.000Z');
    // 180 min until 2-hour activation
    expect(res.remainingMinutesUntilActivation).toBe(180);
    expect(res.reason).toContain('Ride activates 2 hours before scheduled pickup');
  });

  it('caps max lead time at 120 minutes (2 hours) when driver travel ETA exceeds 2 hours', async () => {
    const now = new Date('2026-11-26T14:30:00.000Z');
    const mockMaps: MapsProvider = {
      name: 'mock-google',
      geocode: jest.fn(),
      reverseGeocode: jest.fn(),
      route: jest.fn().mockResolvedValue({
        distanceKm: 180,
        durationMin: 150, // 150 min drive
        provider: 'mock',
      }),
    };

    const driverCoords = { lat: 45.0, lng: -75.0 };
    const res = await computeEnRouteEligibility(baseRide, {
      now,
      driverCoords,
      maps: mockMaps,
    });

    expect(res.driveEtaMinutes).toBe(150);
    // 150 + 15 = 165 -> capped at 120 minutes
    expect(res.leadTimeMinutes).toBe(120);
    expect(res.allowedEnRouteAt.toISOString()).toBe('2026-11-26T15:00:00.000Z');
    expect(res.canGoEnRoute).toBe(false);
    expect(res.remainingMinutesUntilUnlock).toBe(30);
  });

  it('uses maps provider duration when available', async () => {
    const now = new Date('2026-11-26T16:00:00.000Z'); // 60 min before pickup (activated)
    const mockMaps: MapsProvider = {
      name: 'mock-google',
      geocode: jest.fn(),
      reverseGeocode: jest.fn(),
      route: jest.fn().mockResolvedValue({
        distanceKm: 15,
        durationMin: 25, // 25 min travel ETA
        provider: 'mock',
      }),
    };

    const driverCoords = { lat: 43.7000, lng: -79.4000 };
    const res = await computeEnRouteEligibility(baseRide, {
      now,
      driverCoords,
      maps: mockMaps,
    });

    expect(mockMaps.route).toHaveBeenCalledWith(driverCoords, {
      lat: baseRide.fromLat,
      lng: baseRide.fromLng,
    });
    expect(res.isActivated).toBe(true);
    expect(res.driveEtaMinutes).toBe(25);
    // leadTime = 25m drive + 15m buffer = 40m
    expect(res.leadTimeMinutes).toBe(40);
    // allowedEnRouteAt = 17:00 - 40m = 16:20
    expect(res.allowedEnRouteAt.toISOString()).toBe('2026-11-26T16:20:00.000Z');
    // At 16:00, still 20 min early
    expect(res.canGoEnRoute).toBe(false);
    expect(res.remainingMinutesUntilUnlock).toBe(20);
    expect(res.reason).toContain('Cannot start en route yet');
  });

  it('unlocks en-route once current time reaches allowedEnRouteAt', async () => {
    // Lead time is 40m (25m drive + 15m buffer). At 16:20 or later, it is unlocked.
    const now = new Date('2026-11-26T16:20:01.000Z');
    const mockMaps: MapsProvider = {
      name: 'mock-google',
      geocode: jest.fn(),
      reverseGeocode: jest.fn(),
      route: jest.fn().mockResolvedValue({
        distanceKm: 15,
        durationMin: 25,
        provider: 'mock',
      }),
    };

    const driverCoords = { lat: 43.7000, lng: -79.4000 };
    const res = await computeEnRouteEligibility(baseRide, {
      now,
      driverCoords,
      maps: mockMaps,
    });

    expect(res.canGoEnRoute).toBe(true);
    expect(res.isActivated).toBe(true);
    expect(res.remainingMinutesUntilUnlock).toBe(0);
    expect(res.reason).toBeUndefined();
  });

  it('falls back to Haversine calculation at 40 km/h when maps provider fails or is omitted', async () => {
    const now = new Date('2026-11-26T16:00:00.000Z');
    // Driver is ~10 km away
    const driverCoords = { lat: 43.7432, lng: -79.3832 };

    const res = await computeEnRouteEligibility(baseRide, {
      now,
      driverCoords,
      maps: null,
    });

    // 10 km / 40 km/h = 15 mins drive
    expect(res.driveEtaMinutes).toBeGreaterThanOrEqual(14);
    expect(res.driveEtaMinutes).toBeLessThanOrEqual(16);
    expect(res.bufferMinutes).toBe(SCHEDULE_GATE_DEFAULTS.BUFFER_MINUTES);
  });

  it('handles invalid pickup date gracefully by failing open', async () => {
    const ride = {
      pickupAt: 'invalid-date',
      fromLat: 43.6532,
      fromLng: -79.3832,
    };
    const res = await computeEnRouteEligibility(ride);
    expect(res.canGoEnRoute).toBe(true);
    expect(res.remainingMinutesUntilUnlock).toBe(0);
  });
});
