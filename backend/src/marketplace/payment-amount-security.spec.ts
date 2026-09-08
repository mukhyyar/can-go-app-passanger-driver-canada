import { computePaymentQuote } from './payment-quote.util';

/**
 * Security invariant: client cannot dictate charge amount.
 * Online amount is always derived from total + mode + configured pct.
 */
describe('payment amount authority', () => {
  it('ignores any client-supplied deposit by recomputing server-side', () => {
    const clientTriedToPay = 1; // attacker amount — never used
    const quote = computePaymentQuote({
      totalAmount: 4353,
      currency: 'CAD',
      paymentMode: 'PARTIAL',
      onlinePct: 20,
    });
    expect(quote.onlineAmount).not.toBe(clientTriedToPay);
    expect(quote.onlineAmount).toBe(870.6);
  });

  it('FULL mode never creates a cash remainder', () => {
    const quote = computePaymentQuote({
      totalAmount: 8705,
      currency: 'CAD',
      paymentMode: 'FULL',
    });
    expect(quote.cashAmount).toBe(0);
    expect(quote.onlineAmount).toBe(8705);
  });
});
