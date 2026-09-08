/** Centralized Can-Go analytics formulas. Keep UI and APIs on these definitions. */

export const METRIC_DEFINITIONS: Record<string, string> = {
  completionRate:
    'Completed trips ÷ valid ride requests × 100. Valid requests exclude payment-failed drafts that never entered the marketplace.',
  acceptanceRate: 'Accepted offers ÷ offers received × 100.',
  cancellationRate: 'Cancelled rides ÷ eligible ride requests × 100.',
  driverCancellationRate: 'Driver-cancelled rides ÷ eligible ride requests × 100.',
  passengerCancellationRate: 'Passenger-cancelled rides ÷ eligible ride requests × 100.',
  averageFare: 'Gross fare of completed rides ÷ completed rides.',
  revenuePerRide: 'Platform commission (net of refunds allocated) ÷ completed rides.',
  paymentSuccessRate: 'Succeeded payments ÷ payment attempts × 100.',
  repeatRideRate: 'Passengers with ≥2 completed rides ÷ passengers who took ≥1 completed ride × 100.',
  redemptionRate: 'Promo codes redeemed on rides ÷ codes issued (max uses or issued count) × 100.',
  demandSupplyRatio: 'Ride requests in the bucket ÷ available (online, not on-trip) drivers.',
  utilizationRate: 'Drivers on trip ÷ online drivers × 100.',
  grossBookings: 'Succeeded / captured payment volume (gross merchandise value).',
  netRevenue: 'Platform commission − succeeded refunds in the period.',
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

export function pct(numer: number, denom: number): number {
  if (!denom) return 0;
  return round1((numer / denom) * 100);
}

export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

export function completionRate(completed: number, validRequests: number): number {
  return pct(completed, validRequests);
}

export function acceptanceRate(acceptedOffers: number, offersReceived: number): number {
  return pct(acceptedOffers, offersReceived);
}

export function cancellationRate(cancelled: number, eligibleRequests: number): number {
  return pct(cancelled, eligibleRequests);
}

export function averageFare(grossFare: number, completed: number): number {
  if (!completed) return 0;
  return round2(grossFare / completed);
}

export function revenuePerRide(netRevenue: number, completed: number): number {
  if (!completed) return 0;
  return round2(netRevenue / completed);
}

export function paymentSuccessRate(succeeded: number, attempts: number): number {
  return pct(succeeded, attempts);
}

export function demandSupplyRatio(requests: number, availableDrivers: number): number {
  if (!availableDrivers) return requests > 0 ? 99 : 0;
  return round1(requests / availableDrivers);
}

export type FunnelStep = { key: string; label: string; value: number };

export type FunnelEdge = {
  from: string;
  to: string;
  conversionPct: number;
  dropoffPct: number;
  dropoffCount: number;
};

export function funnelEdges(steps: FunnelStep[]): FunnelEdge[] {
  const edges: FunnelEdge[] = [];
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1].value;
    const cur = steps[i].value;
    const conversion = prev ? pct(cur, prev) : 0;
    edges.push({
      from: steps[i - 1].key,
      to: steps[i].key,
      conversionPct: conversion,
      dropoffPct: round1(100 - conversion),
      dropoffCount: Math.max(0, prev - cur),
    });
  }
  return edges;
}

/** Linear regression y = a + b·x for daily series. Returns forecast + 80% band using residual stdev. */
export function linearForecast(
  values: number[],
  horizon: number,
): { history: number[]; forecast: number[]; lower: number[]; upper: number[]; method: string } {
  const n = values.length;
  if (n < 2) {
    const last = values[n - 1] ?? 0;
    const forecast = Array.from({ length: horizon }, () => round2(last));
    return {
      history: values,
      forecast,
      lower: forecast.map((v) => round2(v * 0.85)),
      upper: forecast.map((v) => round2(v * 1.15)),
      method: 'naive-hold',
    };
  }
  const xs = values.map((_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  const a = meanY - b * meanX;
  const fitted = xs.map((x) => a + b * x);
  const resid = values.map((v, i) => v - fitted[i]);
  const variance = resid.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2);
  const sd = Math.sqrt(Math.max(0, variance));
  const forecast: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];
  for (let h = 1; h <= horizon; h += 1) {
    const y = Math.max(0, a + b * (n - 1 + h));
    const band = 1.28 * sd * Math.sqrt(1 + 1 / n + (h * h) / Math.max(den, 1));
    forecast.push(round2(y));
    lower.push(round2(Math.max(0, y - band)));
    upper.push(round2(y + band));
  }
  return { history: values.map(round2), forecast, lower, upper, method: 'linear-regression' };
}

export function weekdayFactor(values: number[], weekdayOf: number[]): number[] {
  const buckets = Array.from({ length: 7 }, () => ({ s: 0, n: 0 }));
  values.forEach((v, i) => {
    const d = weekdayOf[i] ?? 0;
    buckets[d].s += v;
    buckets[d].n += 1;
  });
  const overall = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  return buckets.map((b) => (b.n && overall ? b.s / b.n / overall : 1));
}
