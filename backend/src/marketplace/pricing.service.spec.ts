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
      currency: 'USD',
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
      currency: 'USD',
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
      taxPct: 13,
    };
    const frozen = pricing.freezeBid(guidance, 100);
    expect(frozen.bidAmount).toBe(100);
    expect(frozen.taxAmount).toBe(13);
    expect(frozen.passengerTotal).toBe(113);
    expect(frozen.platformFee).toBe(15);
    expect(frozen.driverEarning).toBe(85);
    expect(frozen.frozenAt).toBeTruthy();
  });

  it('freezeBid stores outbound/return and price band', () => {
    const guidance: PriceSnapshot = {
      currency: 'USD',
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
      platformCommissionPct: 13,
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
    expect(frozen.platformFee).toBe(28.6);
    expect(frozen.driverEarning).toBe(191.4);
    expect(frozen.priceBand).toBe('typical');
  });

  it('freezeBid rejects zero/negative via min band', () => {
    const guidance: PriceSnapshot = {
      currency: 'USD',
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
