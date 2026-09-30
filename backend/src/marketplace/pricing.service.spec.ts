import { BadRequestException } from '@nestjs/common';
import { PricingService, round2, type PriceSnapshot } from './pricing.service';
import {
  isAllowedOfferValidity,
  OFFER_VALIDITY_OPTIONS_SECONDS,
} from './offer.constants';

describe('PricingService (unit)', () => {
  const pricing = new PricingService({} as never);

  it('haversineKm is ~0 for same point', () => {
    expect(pricing.haversineKm(43.67, -79.62, 43.67, -79.62)).toBeCloseTo(0, 5);
  });

  it('haversineKm YYZ→downtown is in a sensible band', () => {
    const km = pricing.haversineKm(43.6777, -79.6248, 43.6426, -79.3871);
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(30);
  });

  it('round2 rounds half-up to cents', () => {
    expect(round2(12.345)).toBe(12.35);
    expect(round2(12.344)).toBe(12.34);
  });

  it('freezeBid rejects below min and above max', () => {
    const guidance: PriceSnapshot = {
      currency: 'CAD',
      serviceType: 'RIDE',
      vehicleClass: 'sedan',
      distanceKm: 10,
      durationMin: 20,
      guidanceAmount: 100,
      minBid: 80,
      maxBid: 150,
      minFare: 12,
      baseFare: 8,
      perKm: 1.4,
      perMinute: 0.25,
      perHour: 0,
      platformCommissionPct: 15,
      taxPct: 0,
    };
    expect(() => pricing.freezeBid(guidance, 79)).toThrow(BadRequestException);
    expect(() => pricing.freezeBid(guidance, 151)).toThrow(BadRequestException);
  });

  it('freezeBid computes commission and driver earning', () => {
    const guidance: PriceSnapshot = {
      currency: 'CAD',
      serviceType: 'RIDE',
      vehicleClass: 'sedan',
      distanceKm: 10,
      durationMin: 20,
      guidanceAmount: 100,
      minBid: 80,
      maxBid: 150,
      minFare: 12,
      baseFare: 8,
      perKm: 1.4,
      perMinute: 0.25,
      perHour: 0,
      platformCommissionPct: 0,
      taxPct: 13,
    };
    const frozen = pricing.freezeBid(guidance, 100);
    expect(frozen.bidAmount).toBe(100);
    expect(frozen.subtotal).toBe(120);
    expect(frozen.platformFee).toBe(24);
    expect(frozen.taxAmount).toBe(18.72);
    expect(frozen.passengerTotal).toBe(162.72);
    expect(frozen.driverEarning).toBe(100);
    expect(frozen.frozenAt).toBeTruthy();
  });

  it('freezeBid computes user example ($17 offer -> $20.40 ride price + $4.08 platform fee -> $24.48 total)', () => {
    const guidance: PriceSnapshot = {
      currency: 'CAD',
      serviceType: 'RIDE',
      vehicleClass: 'sedan',
      distanceKm: 5,
      durationMin: 10,
      guidanceAmount: 20,
      minBid: 15,
      maxBid: 30,
      minFare: 10,
      baseFare: 5,
      perKm: 1.0,
      perMinute: 0.2,
      perHour: 0,
      platformCommissionPct: 0,
      taxPct: 0,
    };
    const frozen = pricing.freezeBid(guidance, 17);
    expect(frozen.bidAmount).toBe(17);
    expect(frozen.subtotal).toBe(20.4);
    expect(frozen.platformFee).toBe(4.08);
    expect(frozen.passengerTotal).toBe(24.48);
    expect(frozen.driverEarning).toBe(17);
  });

  it('freezeBid stores outbound/return and price band', () => {
    const guidance: PriceSnapshot = {
      currency: 'CAD',
      serviceType: 'RIDE',
      vehicleClass: 'sedan',
      distanceKm: 20,
      durationMin: 40,
      guidanceAmount: 200,
      minBid: 160,
      maxBid: 300,
      minFare: 12,
      baseFare: 8,
      perKm: 1.4,
      perMinute: 0.25,
      perHour: 0,
      platformCommissionPct: 0,
      taxPct: 0,
      isRoundTrip: true,
      legs: 2,
    };
    const frozen = pricing.freezeBid(guidance, 220, {
      outboundPrice: 120,
      returnPrice: 100,
    });
    expect(frozen.outboundPrice).toBe(120);
    expect(frozen.returnPrice).toBe(100);
    expect(frozen.subtotal).toBe(264);
    expect(frozen.platformFee).toBe(52.8);
    expect(frozen.passengerTotal).toBe(316.8);
    expect(frozen.driverEarning).toBe(220);
    expect(frozen.priceBand).toBe('typical');
  });

  it('freezeBid rejects zero/negative via min band', () => {
    const guidance: PriceSnapshot = {
      currency: 'CAD',
      serviceType: 'RIDE',
      vehicleClass: 'sedan',
      distanceKm: 10,
      durationMin: 20,
      guidanceAmount: 100,
      minBid: 80,
      maxBid: 150,
      minFare: 12,
      baseFare: 8,
      perKm: 1.4,
      perMinute: 0.25,
      perHour: 0,
      platformCommissionPct: 15,
      taxPct: 0,
    };
    expect(() => pricing.freezeBid(guidance, 0)).toThrow(BadRequestException);
  });

  it('quote respects client-provided distanceKm and durationMin', async () => {
    const mockPrisma = {
      fareRule: {
        findFirst: jest.fn().mockResolvedValue({
          baseFare: 10,
          perKm: 2,
          perMinute: 0.5,
          perHour: 0,
          minFare: 15,
          platformCommissionPct: 15,
          taxPct: 5,
        }),
      },
    };
    const svc = new PricingService(mockPrisma as never);
    const snap = await svc.quote({
      serviceType: 'RIDE',
      fromLat: 50.90,
      fromLng: -113.93,
      toLat: 51.11,
      toLng: -114.01,
      distanceKm: 36.5,
      durationMin: 33,
    });
    expect(snap.distanceKm).toBe(36.5);
    expect(snap.durationMin).toBe(33);
    // base (10) + 36.5*2 (73) + 33*0.5 (16.5) = 99.5
    expect(snap.guidanceAmount).toBe(99.5);
  });

  it('quote uses maps provider road route when client distance not provided', async () => {
    const mockPrisma = {
      fareRule: {
        findFirst: jest.fn().mockResolvedValue({
          baseFare: 10,
          perKm: 2,
          perMinute: 0.5,
          perHour: 0,
          minFare: 15,
          platformCommissionPct: 15,
          taxPct: 5,
        }),
      },
    };
    const mockMaps = {
      name: 'google',
      geocode: jest.fn(),
      reverseGeocode: jest.fn(),
      route: jest.fn().mockResolvedValue({
        distanceKm: 36.5,
        durationMin: 33,
        provider: 'google',
      }),
    };
    const svc = new PricingService(mockPrisma as never, mockMaps as never);
    const snap = await svc.quote({
      serviceType: 'RIDE',
      fromLat: 50.90,
      fromLng: -113.93,
      toLat: 51.11,
      toLng: -114.01,
    });
    expect(mockMaps.route).toHaveBeenCalled();
    expect(snap.distanceKm).toBe(36.5);
    expect(snap.durationMin).toBe(33);
    expect(snap.guidanceAmount).toBe(99.5);
  });
});

describe('offer validity options', () => {
  it('includes screenshot durations', () => {
    expect(OFFER_VALIDITY_OPTIONS_SECONDS).toEqual([
      1800, 3600, 7200, 28800, 43200, 86400, 172800, 345600, 518400,
    ]);
    expect(isAllowedOfferValidity(1800)).toBe(true);
    expect(isAllowedOfferValidity(900)).toBe(false);
  });
});
