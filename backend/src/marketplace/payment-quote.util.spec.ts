import { computePaymentQuote, parseVehicleName } from './payment-quote.util';

describe('payment-quote.util', () => {
  it('FULL mode charges full total in same currency', () => {
    const q = computePaymentQuote({
      totalAmount: 4353,
      currency: 'CAD',
      paymentMode: 'FULL',
    });
    expect(q.paymentMode).toBe('FULL');
    expect(q.onlineAmount).toBe(4353);
    expect(q.cashAmount).toBe(0);
    expect(q.onlineCurrency).toBe('CAD');
  });

  it('PARTIAL mode splits online vs cash from backend pct', () => {
    const q = computePaymentQuote({
      totalAmount: 4353,
      currency: 'CAD',
      paymentMode: 'PARTIAL',
      onlinePct: 20,
    });
    expect(q.paymentMode).toBe('PARTIAL');
    expect(q.onlineAmount).toBe(870.6);
    expect(q.cashAmount).toBe(3482.4);
    expect(q.onlineAmount + q.cashAmount).toBeCloseTo(4353, 2);
  });

  it('never mixes currencies for cash remainder', () => {
    const q = computePaymentQuote({
      totalAmount: 100,
      currency: 'USD',
      paymentMode: 'PARTIAL',
    });
    expect(q.onlineCurrency).toBe(q.cashCurrency);
    expect(q.totalCurrency).toBe('USD');
  });

  it('parses vehicle display names', () => {
    expect(parseVehicleName('Toyota Camry, 2022')).toMatchObject({
      brand: 'Toyota',
      model: 'Camry',
      year: 2022,
    });
    expect(parseVehicleName('Kia EV9, 2026').displayName).toContain('EV9');
  });
});
