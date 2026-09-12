import { RideStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CompareMode } from './analytics.time';

export type GroupBy = 'hour' | 'day' | 'week' | 'month';

export type AnalyticsQuery = {
  range: string;
  from?: string;
  to?: string;
  timezone: string;
  compare: CompareMode;
  city?: string;
  zone?: string;
  serviceType?: string;
  rideType?: string;
  vehicleType?: string;
  driverStatus?: string;
  passengerSegment?: string;
  paymentMethod?: string;
  rideStatus?: string;
  promo?: string;
  groupBy: GroupBy;
  demo: boolean;
  forecastHorizon: number;
};

export const ACTIVE_TRIP: RideStatus[] = [
  RideStatus.BOOKED,
  RideStatus.DRIVER_EN_ROUTE,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.TRIP_STARTED,
  RideStatus.IN_PROGRESS,
];

export const OPEN_REQ: RideStatus[] = [
  RideStatus.WAITING_FOR_OFFERS,
  RideStatus.OFFER_SELECTION,
];

export const CANCELLED: RideStatus[] = [
  RideStatus.PASSENGER_CANCELLED,
  RideStatus.DRIVER_CANCELLED,
  RideStatus.ADMIN_CANCELLED,
];

/** Unfulfilled / missed — distinct from passenger/driver cancellation. */
export const UNFULFILLED: RideStatus[] = [
  RideStatus.EXPIRED,
  RideStatus.NO_SHOW,
];

export const FAILED_EXPIRED: RideStatus[] = [
  RideStatus.PAYMENT_FAILED,
  RideStatus.EXPIRED,
];

/** Legacy bucket used where ops historically bundled cancel + unfulfilled. Prefer CANCELLED vs UNFULFILLED. */
export const CANCELLED_OR_UNFULFILLED: RideStatus[] = [
  ...CANCELLED,
  ...UNFULFILLED,
];

export function parseAnalyticsQuery(q: Record<string, string | undefined>): AnalyticsQuery {
  const compare = q.compare === 'year' ? 'year' : q.compare === 'none' ? 'none' : 'period';
  const groupBy = (['hour', 'day', 'week', 'month'] as const).includes(q.groupBy as GroupBy)
    ? (q.groupBy as GroupBy)
    : 'day';
  const horizon = Math.min(30, Math.max(3, Number(q.horizon ?? 7) || 7));
  return {
    range: q.range ?? '7d',
    from: q.from || undefined,
    to: q.to || undefined,
    timezone: q.timezone || 'America/Toronto',
    compare,
    city: q.city || undefined,
    zone: q.zone || undefined,
    serviceType: q.serviceType || undefined,
    rideType: q.rideType || q.serviceType || undefined,
    vehicleType: q.vehicleType || undefined,
    driverStatus: q.driverStatus || undefined,
    passengerSegment: q.passengerSegment || undefined,
    paymentMethod: q.paymentMethod || undefined,
    rideStatus: q.rideStatus || undefined,
    promo: q.promo || undefined,
    groupBy,
    demo: q.demo === '1' || q.demo === 'true',
    forecastHorizon: horizon,
  };
}

export function rideWhere(
  start: Date,
  end: Date,
  q: AnalyticsQuery,
  extra?: Prisma.RideWhereInput,
): Prisma.RideWhereInput {
  const where: Prisma.RideWhereInput = {
    createdAt: { gte: start, lt: end },
    ...extra,
  };
  if (q.serviceType) where.serviceType = q.serviceType;
  if (q.rideType && q.rideType !== q.serviceType) where.serviceType = q.rideType;
  if (q.rideStatus && Object.values(RideStatus).includes(q.rideStatus as RideStatus)) {
    where.status = q.rideStatus as RideStatus;
  }
  if (q.promo) where.promoCode = q.promo;
  if (q.vehicleType) where.vehicleClassIds = { has: q.vehicleType };
  const label = q.zone || q.city;
  if (label) {
    where.OR = [
      { fromLabel: { contains: label, mode: 'insensitive' } },
      { toLabel: { contains: label, mode: 'insensitive' } },
    ];
  }
  if (q.paymentMethod) {
    where.payments = { some: { provider: q.paymentMethod } };
  }
  return where;
}

export function rideFilterSql(q: AnalyticsQuery): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (q.serviceType) parts.push(Prisma.sql`r."serviceType" = ${q.serviceType}`);
  if (q.rideStatus && Object.values(RideStatus).includes(q.rideStatus as RideStatus)) {
    parts.push(Prisma.sql`r."status" = ${q.rideStatus}::"RideStatus"`);
  }
  if (q.promo) parts.push(Prisma.sql`r."promoCode" = ${q.promo}`);
  if (q.vehicleType) {
    parts.push(Prisma.sql`${q.vehicleType} = ANY (r."vehicleClassIds")`);
  }
  const label = q.zone || q.city;
  if (label) {
    const like = `%${label}%`;
    parts.push(Prisma.sql`(r."fromLabel" ILIKE ${like} OR r."toLabel" ILIKE ${like})`);
  }
  if (q.paymentMethod) {
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Payment" pmt WHERE pmt."rideId" = r.id AND pmt.provider = ${q.paymentMethod})`,
    );
  }
  if (!parts.length) return Prisma.sql`TRUE`;
  return Prisma.join(parts, ' AND ');
}

export const PAID_STATUSES = ['succeeded', 'SUCCEEDED', 'captured', 'CAPTURED', 'paid'];
export const FAIL_STATUSES = ['failed', 'FAILED', 'canceled', 'CANCELLED'];
export const PENDING_PAY = ['pending', 'PENDING', 'requires_action', 'processing'];
