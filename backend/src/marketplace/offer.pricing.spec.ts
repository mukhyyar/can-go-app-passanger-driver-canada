import { BadRequestException } from '@nestjs/common';
import { isAllowedOfferValidity, OFFER_OPTION_KEYS } from './offer.constants';

/** Pure helpers extracted for unit testing without Nest DI. */
export function resolveOfferPricesForTest(
  ride: { isRoundTrip: boolean },
  dto: {
    bidAmount?: number;
    outboundPrice?: number;
    returnPrice?: number | null;
  },
) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let outbound = dto.outboundPrice;
  let ret = dto.returnPrice ?? null;
  if (outbound == null && dto.bidAmount != null) {
    if (ride.isRoundTrip) {
      outbound = round2(dto.bidAmount / 2);
      ret = round2(dto.bidAmount - outbound);
    } else {
      outbound = dto.bidAmount;
      ret = null;
    }
  }
  if (outbound == null || outbound <= 0) {
    throw new BadRequestException('outboundPrice (or bidAmount) is required');
  }
  if (ride.isRoundTrip) {
    if (ret == null || ret < 0) {
      throw new BadRequestException(
        'returnPrice is required for round-trip requests',
      );
    }
  } else {
    ret = null;
  }
  const bidAmount = round2(outbound + (ret ?? 0));
  if (bidAmount <= 0) {
    throw new BadRequestException('Offer total must be greater than zero');
  }
  return {
    outboundPrice: round2(outbound),
    returnPrice: ret != null ? round2(ret) : null,
    bidAmount,
  };
}

describe('resolveOfferPrices', () => {
  it('one-way uses outbound only', () => {
    const r = resolveOfferPricesForTest(
      { isRoundTrip: false },
      { outboundPrice: 100 },
    );
    expect(r).toEqual({
      outboundPrice: 100,
      returnPrice: null,
      bidAmount: 100,
    });
  });

  it('round-trip requires return price', () => {
    expect(() =>
      resolveOfferPricesForTest({ isRoundTrip: true }, { outboundPrice: 100 }),
    ).toThrow(BadRequestException);
  });

  it('round-trip sums legs', () => {
    const r = resolveOfferPricesForTest(
      { isRoundTrip: true },
      { outboundPrice: 120, returnPrice: 100 },
    );
    expect(r.bidAmount).toBe(220);
  });

  it('rejects zero total', () => {
    expect(() =>
      resolveOfferPricesForTest({ isRoundTrip: false }, { outboundPrice: 0 }),
    ).toThrow(BadRequestException);
  });

  it('legacy bidAmount splits on round-trip', () => {
    const r = resolveOfferPricesForTest(
      { isRoundTrip: true },
      { bidAmount: 200 },
    );
    expect(r.outboundPrice + (r.returnPrice ?? 0)).toBe(200);
  });
});

describe('offer option keys', () => {
  it('includes name_sign and wheelchair', () => {
    expect(OFFER_OPTION_KEYS).toEqual(
      expect.arrayContaining(['name_sign', 'wheelchair', 'wifi']),
    );
    expect(isAllowedOfferValidity(1800)).toBe(true);
  });
});
