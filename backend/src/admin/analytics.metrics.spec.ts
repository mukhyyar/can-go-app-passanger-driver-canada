import {
  acceptanceRate,
  averageFare,
  cancellationRate,
  changePct,
  completionRate,
  demandSupplyRatio,
  funnelEdges,
  linearForecast,
  paymentSuccessRate,
  pct,
  revenuePerRide,
} from './analytics.metrics';
import { fromZoned, resolveAnalyticsRange, zonedParts } from './analytics.time';

describe('analytics formulas', () => {
  it('completionRate = completed / valid requests', () => {
    expect(completionRate(80, 100)).toBe(80);
    expect(completionRate(0, 0)).toBe(0);
  });

  it('acceptanceRate = accepted / offers', () => {
    expect(acceptanceRate(45, 50)).toBe(90);
  });

  it('cancellationRate = cancelled / eligible', () => {
    expect(cancellationRate(12, 100)).toBe(12);
  });

  it('averageFare and revenue per ride', () => {
    expect(averageFare(1000, 10)).toBe(100);
    expect(revenuePerRide(50, 10)).toBe(5);
    expect(averageFare(10, 0)).toBe(0);
  });

  it('paymentSuccessRate and demand/supply', () => {
    expect(paymentSuccessRate(90, 100)).toBe(90);
    expect(demandSupplyRatio(27, 10)).toBe(2.7);
    expect(demandSupplyRatio(5, 0)).toBe(99);
  });

  it('changePct handles zero previous', () => {
    expect(changePct(10, 0)).toBeNull();
    expect(changePct(0, 0)).toBe(0);
    expect(changePct(12, 10)).toBe(20);
  });

  it('funnel edges conversion and drop-off', () => {
    const edges = funnelEdges([
      { key: 'a', label: 'A', value: 100 },
      { key: 'b', label: 'B', value: 80 },
      { key: 'c', label: 'C', value: 40 },
    ]);
    expect(edges[0].conversionPct).toBe(80);
    expect(edges[0].dropoffPct).toBe(20);
    expect(edges[1].dropoffCount).toBe(40);
  });

  it('linearForecast is labeled statistical and non-negative', () => {
    const f = linearForecast([10, 12, 14, 16, 18], 3);
    expect(f.method).toBe('linear-regression');
    expect(f.forecast).toHaveLength(3);
    expect(f.forecast[0]).toBeGreaterThan(16);
    expect(f.lower[0]).toBeLessThanOrEqual(f.forecast[0]);
    expect(f.upper[0]).toBeGreaterThanOrEqual(f.forecast[0]);
  });

  it('pct helper', () => {
    expect(pct(1, 4)).toBe(25);
  });
});

describe('analytics timezone ranges', () => {
  it('fromZoned maps Toronto midnight to UTC morning (EDT)', () => {
    const d = fromZoned(2026, 9, 8, 0, 0, 'America/Toronto');
    expect(d.toISOString()).toBe('2026-09-08T04:00:00.000Z');
  });

  it('today stays inside the zoned calendar day', () => {
    const now = new Date('2026-09-08T19:00:00.000Z'); // 15:00 Toronto (EDT)
    const r = resolveAnalyticsRange({ range: 'today', timezone: 'America/Toronto', now });
    const start = zonedParts(r.current.start, 'America/Toronto');
    expect(start.y).toBe(2026);
    expect(start.m).toBe(9);
    expect(start.d).toBe(8);
    expect(start.h).toBe(0);
    expect(r.current.end.getTime()).toBe(now.getTime());
  });

  it('last 7 days is inclusive of today and 6 prior zoned days', () => {
    const now = new Date('2026-09-08T12:00:00.000-04:00');
    const r = resolveAnalyticsRange({ range: '7d', timezone: 'America/Toronto', now });
    const start = zonedParts(r.current.start, 'America/Toronto');
    expect(`${start.y}-${start.m}-${start.d}`).toBe('2026-9-2');
    expect(r.compareLabel).toContain('vs');
  });

  it('does not bucket UTC timestamps as the previous UTC date for Toronto evenings', () => {
    const now = new Date('2026-09-08T21:30:00.000-04:00');
    const r = resolveAnalyticsRange({ range: 'today', timezone: 'America/Toronto', now });
    expect(r.currentLabel).toContain('Sep 8');
  });
});
