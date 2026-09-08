import { round2 } from './pricing.service';

/** Pure helpers — kept separate so unit tests need no Nest DI. */

export function computePaymentQuote(input: {
  totalAmount: number;
  currency: string;
  paymentMode: 'FULL' | 'PARTIAL';
  partialEnabled?: boolean;
  onlinePct?: number;
}) {
  const enabled = input.partialEnabled !== false;
  const onlinePct =
    input.onlinePct != null &&
    Number.isFinite(input.onlinePct) &&
    input.onlinePct > 0 &&
    input.onlinePct < 100
      ? round2(input.onlinePct)
      : 20;
  const total = round2(input.totalAmount);
  const currency = input.currency.toUpperCase();
  if (input.paymentMode === 'PARTIAL' && enabled) {
    const onlineAmount = round2((total * onlinePct) / 100);
    const cashAmount = round2(total - onlineAmount);
    return {
      paymentMode: 'PARTIAL' as const,
      totalAmount: total,
      totalCurrency: currency,
      onlineAmount,
      onlineCurrency: currency,
      cashAmount,
      cashCurrency: currency,
      onlinePct,
      partialEnabled: true,
    };
  }
  return {
    paymentMode: 'FULL' as const,
    totalAmount: total,
    totalCurrency: currency,
    onlineAmount: total,
    onlineCurrency: currency,
    cashAmount: 0,
    cashCurrency: currency,
    onlinePct: 100,
    partialEnabled: enabled,
  };
}

export function parseVehicleName(name: string): {
  brand: string;
  model: string;
  year: number | null;
  displayName: string;
} {
  const cleaned = (name ?? '').trim();
  if (!cleaned) {
    return { brand: 'Vehicle', model: '', year: null, displayName: 'Vehicle' };
  }
  const yearMatch = cleaned.match(/(?:,\s*)?(19|20)\d{2}\s*$/);
  const year = yearMatch ? Number(yearMatch[0].replace(/[^\d]/g, '')) : null;
  const withoutYear = cleaned.replace(/,?\s*(19|20)\d{2}\s*$/, '').trim();
  const parts = withoutYear.split(/\s+/);
  const brand = parts[0] ?? cleaned;
  const model = parts.slice(1).join(' ') || withoutYear;
  return {
    brand,
    model,
    year,
    displayName: year ? `${withoutYear}, ${year}` : withoutYear,
  };
}
