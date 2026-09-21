export const ANALYTICS_TABS = [
  { id: 'overview', label: 'Overview', permission: 'analytics.view' },
  { id: 'rides', label: 'Rides', permission: 'analytics.view' },
  { id: 'revenue', label: 'Revenue', permission: 'analytics.financial' },
  { id: 'passengers', label: 'Passengers', permission: 'analytics.view' },
  { id: 'drivers', label: 'Drivers', permission: 'analytics.view' },
  { id: 'geography', label: 'Geography', permission: 'analytics.view' },
  { id: 'operations', label: 'Operations', permission: 'analytics.view' },
  { id: 'cancellations', label: 'Cancellations', permission: 'analytics.view' },
  { id: 'payments', label: 'Payments', permission: 'analytics.financial' },
  { id: 'promotions', label: 'Promotions', permission: 'analytics.view' },
  { id: 'ratings', label: 'Ratings & Quality', permission: 'analytics.view' },
  { id: 'safety', label: 'Safety', permission: 'analytics.safety' },
  { id: 'retention', label: 'Cohorts & Retention', permission: 'analytics.view' },
  { id: 'funnel', label: 'Funnel / Conversion', permission: 'analytics.view' },
  { id: 'forecast', label: 'Forecasting', permission: 'analytics.view' },
  { id: 'reports', label: 'Custom Reports', permission: 'analytics.view' },
] as const;

export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]['id'];

export const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '90d', label: 'Last 90 Days' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'prev_month', label: 'Previous Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'this_year', label: 'This Year' },
  { id: 'custom', label: 'Custom Date Range' },
] as const;

export const FILTER_KEYS = [
  'tab',
  'range',
  'from',
  'to',
  'compare',
  'timezone',
  'city',
  'zone',
  'serviceType',
  'vehicleType',
  'driverStatus',
  'passengerSegment',
  'paymentMethod',
  'rideStatus',
  'promo',
  'groupBy',
  'demo',
  'horizon',
] as const;

export type KpiCard = {
  key: string;
  label: string;
  value: number;
  previous: number;
  changePct: number | null;
  sparkline: number[];
  unit: 'currency' | 'count' | 'percent' | 'duration' | 'distance' | 'rating';
  definition: string;
  drill: string;
};

export function qsFromParams(p: URLSearchParams) {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    if (k === 'tab') continue;
    const v = p.get(k);
    if (v) q.set(k, v);
  }
  return q.toString();
}

export function formatMetric(n: number, unit: KpiCard['unit'], currency = 'CAD') {
  if (n == null || Number.isNaN(n)) return '—';
  if (unit === 'currency') {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${n.toFixed(0)} ${currency}`;
    }
  }
  if (unit === 'percent') return `${n}%`;
  if (unit === 'duration') return `${n} min`;
  if (unit === 'distance') return `${n} km`;
  if (unit === 'rating') return n.toFixed(1);
  return new Intl.NumberFormat().format(n);
}

export function formatMoney(n: number, currency = 'CAD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function sectionPath(tab: string) {
  if (tab === 'reports') return '/admin/analytics/overview';
  if (tab === 'overview') return '/admin/analytics/overview';
  return `/admin/analytics/${tab}`;
}
