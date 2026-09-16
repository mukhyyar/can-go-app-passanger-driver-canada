import {
  normalizeMoney,
  moneyToString,
  moneyToMinorUnits,
  moneyGte,
  d,
} from './money.util';

describe('money.util', () => {
  it('normalizes CAD to 2dp string-safe Decimal', () => {
    const m = normalizeMoney('125.50', 'CAD');
    expect(moneyToString(m, 'CAD')).toBe('125.50');
  });

  it('rejects zero, negative, excess precision', () => {
    expect(() => normalizeMoney('0', 'CAD')).toThrow();
    expect(() => normalizeMoney('-1', 'CAD')).toThrow();
    expect(() => normalizeMoney('1.234', 'CAD')).toThrow();
    expect(() => normalizeMoney('abc', 'CAD')).toThrow();
  });

  it('converts to minor units without float multiply', () => {
    expect(moneyToMinorUnits(normalizeMoney('10.00', 'CAD'), 'CAD')).toBe(1000);
    expect(moneyToMinorUnits(normalizeMoney('0.01', 'CAD'), 'CAD')).toBe(1);
  });

  it('compares decimals correctly', () => {
    expect(moneyGte(d('10.00'), d('9.99'))).toBe(true);
    expect(moneyGte(d('9.99'), d('10.00'))).toBe(false);
  });
});
