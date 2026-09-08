import { BadRequestException } from '@nestjs/common';
import {
  PricingService,
  round2,
  type PriceSnapshot,
} from './pricing.service';

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
});
