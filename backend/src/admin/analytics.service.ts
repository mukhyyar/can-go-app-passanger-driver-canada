import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DriverApprovalStatus,
  Prisma,
  RideStatus,
  UserRole,
} from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { asNum, ridePublicCode, snapField } from './admin.util';
import {
  METRIC_DEFINITIONS,
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
  round1,
  round2,
  type FunnelStep,
} from './analytics.metrics';
import {
  ACTIVE_TRIP,
  CANCELLED,
  FAIL_STATUSES,
  FAILED_EXPIRED,
  OPEN_REQ,
  PAID_STATUSES,
  PENDING_PAY,
  parseAnalyticsQuery,
  rideFilterSql,
  rideWhere,
  type AnalyticsQuery,
} from './analytics.query';
import {
  iterateDays,
  pgTz,
  resolveAnalyticsRange,
  type ResolvedRange,
} from './analytics.time';

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

export type Insight = {
  severity: 'positive' | 'info' | 'warning' | 'critical';
  text: string;
};

type StatusRow = { status: RideStatus; _count: { _all: number } };

@Injectable()
export class AdminAnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AdminAnalyticsService.name);
  private redis: Redis | null = null;
  private mem = new Map<string, { exp: number; data: unknown }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('redisUrl') ?? 'redis://127.0.0.1:6379';
    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      void this.redis.connect().catch((err) => {
        this.logger.warn(`Analytics Redis unavailable: ${err instanceof Error ? err.message : err}`);
        this.redis = null;
      });
    } catch (err) {
      this.logger.warn(`Analytics Redis init failed: ${err instanceof Error ? err.message : err}`);
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (!this.redis) return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  parse(q: Record<string, string | undefined>) {
    return parseAnalyticsQuery(q);
  }

  resolve(q: AnalyticsQuery) {
    return resolveAnalyticsRange({
      range: q.range,
      from: q.from,
      to: q.to,
      timezone: q.timezone,
    });
  }

  private async cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.mem.get(key);
    if (hit && hit.exp > now) return hit.data as T;
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw) {
          const parsed = JSON.parse(raw) as T;
          this.mem.set(key, { exp: now + ttlSec * 1000, data: parsed });
          return parsed;
        }
      } catch {
        /* ignore */
      }
    }
    const data = await fn();
    this.mem.set(key, { exp: now + ttlSec * 1000, data });
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(data), 'EX', ttlSec);
      } catch {
        /* ignore */
      }
    }
    return data;
  }

  private cacheKey(section: string, q: AnalyticsQuery, resolved: ResolvedRange) {
    return `cango:analytics:v1:${section}:${resolved.current.start.toISOString()}:${resolved.current.end.toISOString()}:${q.timezone}:${q.compare}:${q.city ?? ''}:${q.zone ?? ''}:${q.serviceType ?? ''}:${q.vehicleType ?? ''}:${q.paymentMethod ?? ''}:${q.rideStatus ?? ''}:${q.promo ?? ''}:${q.groupBy}:${q.demo}`;
  }

  async meta() {
    const [serviceTypes, vehicles, providers, promos, cities, zones] = await Promise.all([
      this.prisma.ride.groupBy({ by: ['serviceType'], _count: { _all: true } }).catch(() => []),
      this.prisma.vehicle.findMany({ distinct: ['vehicleClass'], select: { vehicleClass: true }, take: 40 }),
      this.prisma.payment.groupBy({ by: ['provider'], _count: { _all: true } }).catch(() => []),
      this.prisma.promoCode.findMany({ where: { active: true }, select: { code: true }, take: 80 }),
      this.prisma.catalogItem.findMany({ distinct: ['city'], select: { city: true }, take: 40 }),
      this.prisma.operatingZone.findMany({ distinct: ['name'], select: { name: true }, take: 80 }),
    ]);
    return {
      timezoneDefault: 'Asia/Karachi',
      serviceTypes: serviceTypes.map((s) => s.serviceType),
      vehicleClasses: vehicles.map((v) => v.vehicleClass),
      paymentMethods: providers.map((p) => p.provider),
      promos: promos.map((p) => p.code),
      cities: cities.map((c) => c.city).filter(Boolean),
      zones: [...new Set(zones.map((z) => z.name))],
      rideStatuses: Object.values(RideStatus),
      driverStatuses: Object.values(DriverApprovalStatus),
      passengerSegments: ['new', 'active', 'returning', 'frequent', 'high_value', 'at_risk', 'dormant'],
      definitions: METRIC_DEFINITIONS,
    };
  }

  async overview(q: AnalyticsQuery, perms: string[]) {
    const resolved = this.resolve(q);
    if (q.demo) return this.demoOverview(resolved, q);
    return this.cached(this.cacheKey('overview', q, resolved), 90, () =>
      this.buildOverview(q, resolved, perms),
    );
  }

  async section(section: string, q: AnalyticsQuery, perms: string[]) {
    const resolved = this.resolve(q);
    if (q.demo) return this.demoSection(section, resolved, q);
    const ttl = section === 'live' ? 20 : 90;
    return this.cached(this.cacheKey(section, q, resolved), ttl, () =>
      this.buildSection(section, q, resolved, perms),
    );
  }

  private canFinancial(perms: string[]) {
    return (
      perms.includes('*') ||
      perms.includes('analytics.financial') ||
      perms.includes('finance.view')
    );
  }

  private canSafety(perms: string[]) {
    return perms.includes('*') || perms.includes('analytics.safety') || perms.includes('risk.view');
  }

  private async buildOverview(q: AnalyticsQuery, resolved: ResolvedRange, perms: string[]) {
    const compareRange = q.compare === 'year' ? resolved.previousYear : resolved.previous;
    const [cur, prev, series, live, currency] = await Promise.all([
      this.periodStats(q, resolved.current.start, resolved.current.end),
      this.periodStats(q, compareRange.start, compareRange.end),
      this.dailySeries(q, resolved),
      this.liveNow(),
      this.primaryCurrency(q, resolved.current.start, resolved.current.end),
    ]);
    const empty = cur.requests === 0 && cur.gmv === 0 && cur.newPassengers === 0;
    const spark = (key: 'rides' | 'gmv' | 'completed' | 'net') => series.map((s) => s[key]);
    const financial = this.canFinancial(perms);

    const business: KpiCard[] = financial
      ? [
          this.kpi('grossBookings', 'Gross Bookings', cur.gmv, prev.gmv, spark('gmv'), 'currency', 'grossBookings', 'revenue'),
          this.kpi('netRevenue', 'Net Revenue', cur.netRevenue, prev.netRevenue, spark('net'), 'currency', 'netRevenue', 'revenue'),
          this.kpi('completed', 'Completed Rides', cur.completed, prev.completed, spark('completed'), 'count', 'completionRate', 'rides:completed'),
          this.kpi('requests', 'Total Ride Requests', cur.requests, prev.requests, spark('rides'), 'count', 'completionRate', 'rides'),
          this.kpi('avgFare', 'Average Fare', cur.avgFare, prev.avgFare, spark('gmv'), 'currency', 'averageFare', 'revenue'),
          this.kpi('revPerRide', 'Revenue per Ride', cur.revPerRide, prev.revPerRide, spark('net'), 'currency', 'revenuePerRide', 'revenue'),
          this.kpi('commission', 'Platform Commission', cur.commission, prev.commission, spark('net'), 'currency', 'netRevenue', 'revenue'),
          this.kpi('refunds', 'Refund Amount', cur.refunds, prev.refunds, spark('net'), 'currency', 'netRevenue', 'payments'),
        ]
      : [
          this.kpi('completed', 'Completed Rides', cur.completed, prev.completed, spark('completed'), 'count', 'completionRate', 'rides:completed'),
          this.kpi('requests', 'Total Ride Requests', cur.requests, prev.requests, spark('rides'), 'count', 'completionRate', 'rides'),
        ];

    const growth: KpiCard[] = [
      this.kpi('passengers', 'Total Passengers', cur.totalPassengers, prev.totalPassengers, spark('rides'), 'count', '', 'passengers'),
      this.kpi('newPax', 'New Passengers', cur.newPassengers, prev.newPassengers, spark('rides'), 'count', '', 'passengers'),
      this.kpi('activePax', 'Active Passengers', cur.activePassengers, prev.activePassengers, spark('rides'), 'count', '', 'passengers'),
      this.kpi('returningPax', 'Returning Passengers', cur.returningPassengers, prev.returningPassengers, spark('rides'), 'count', 'repeatRideRate', 'passengers'),
      this.kpi('drivers', 'Total Drivers', cur.totalDrivers, prev.totalDrivers, spark('rides'), 'count', '', 'drivers'),
      this.kpi('activeDrv', 'Active Drivers', cur.activeDrivers, prev.activeDrivers, spark('rides'), 'count', '', 'drivers'),
      this.kpi('newDrv', 'New Drivers', cur.newDrivers, prev.newDrivers, spark('rides'), 'count', '', 'drivers'),
    ];

    const operations: KpiCard[] = [
      this.kpi('completion', 'Ride Completion Rate', cur.completionRate, prev.completionRate, spark('completed'), 'percent', 'completionRate', 'funnel'),
      this.kpi('acceptance', 'Acceptance Rate', cur.acceptanceRate, prev.acceptanceRate, spark('rides'), 'percent', 'acceptanceRate', 'drivers'),
      this.kpi('drvCancel', 'Driver Cancellation Rate', cur.driverCancelRate, prev.driverCancelRate, spark('rides'), 'percent', 'driverCancellationRate', 'cancellations'),
      this.kpi('paxCancel', 'Passenger Cancellation Rate', cur.paxCancelRate, prev.paxCancelRate, spark('rides'), 'percent', 'passengerCancellationRate', 'cancellations'),
      this.kpi('eta', 'Average ETA', cur.avgEtaMin, prev.avgEtaMin, spark('rides'), 'duration', '', 'operations'),
      this.kpi('pickup', 'Average Pickup Time', cur.avgPickupMin, prev.avgPickupMin, spark('rides'), 'duration', '', 'operations'),
      this.kpi('duration', 'Average Trip Duration', cur.avgDurationMin, prev.avgDurationMin, spark('rides'), 'duration', '', 'rides'),
      this.kpi('distance', 'Average Trip Distance', cur.avgDistanceKm, prev.avgDistanceKm, spark('rides'), 'distance', '', 'rides'),
    ];

    const funnel = this.funnelFromCounts(cur);
    return {
      demo: false,
      empty,
      emptyMessage: empty ? 'No analytics data available for this period.' : null,
      currency,
      timezone: resolved.timezone,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      kpis: { business, growth, operations },
      trend: series,
      funnel,
      insights: this.insights(cur, prev, live),
      live,
      definitions: METRIC_DEFINITIONS,
    };
  }

  private rangeMeta(resolved: ResolvedRange, q: AnalyticsQuery) {
    return {
      key: resolved.range,
      start: resolved.current.start.toISOString(),
      end: resolved.current.end.toISOString(),
      label: resolved.currentLabel,
      previousLabel: q.compare === 'year' ? formatPrevYear(resolved) : resolved.previousLabel,
      compareLabel:
        q.compare === 'none'
          ? resolved.currentLabel
          : q.compare === 'year'
            ? `${resolved.currentLabel} vs prior year`
            : resolved.compareLabel,
      compare: q.compare,
      timezone: resolved.timezone,
    };
  }

  private kpi(
    key: string,
    label: string,
    value: number,
    previous: number,
    sparkline: number[],
    unit: KpiCard['unit'],
    defKey: string,
    drill: string,
  ): KpiCard {
    return {
      key,
      label,
      value,
      previous,
      changePct: changePct(value, previous),
      sparkline: sparkline.slice(-14),
      unit,
      definition: METRIC_DEFINITIONS[defKey] ?? '',
      drill,
    };
  }

  private async periodStats(q: AnalyticsQuery, start: Date, end: Date) {
    const where = rideWhere(start, end, q);
    const paidWhere: Prisma.PaymentWhereInput = {
      createdAt: { gte: start, lt: end },
      status: { in: PAID_STATUSES },
      ...(q.paymentMethod ? { provider: q.paymentMethod } : {}),
      ride: this.rideRelationFilter(q),
    };

    const [
      statusGroups,
      requests,
      offers,
      acceptedOffers,
      gmvAgg,
      refundAgg,
      snap,
      newPax,
      newDrv,
      totalPax,
      totalDrv,
      activePax,
      activeDrv,
      returning,
      timing,
    ] = await Promise.all([
      this.prisma.ride.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.ride.count({ where }),
      this.prisma.offer.count({
        where: { createdAt: { gte: start, lt: end }, ride: this.rideRelationFilter(q) },
      }),
      this.prisma.offer.count({
        where: {
          status: 'SELECTED',
          createdAt: { gte: start, lt: end },
          ride: this.rideRelationFilter(q),
        },
      }),
      this.prisma.payment.aggregate({
        where: paidWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.refund.aggregate({
        where: { status: 'succeeded', createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.snapshotSums(q, start, end),
      this.prisma.user.count({
        where: { role: UserRole.PASSENGER, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.user.count({
        where: { role: UserRole.DRIVER, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.user.count({ where: { role: UserRole.PASSENGER } }),
      this.prisma.user.count({ where: { role: UserRole.DRIVER } }),
      this.prisma.ride.findMany({
        where: { ...where, status: RideStatus.COMPLETED },
        distinct: ['passengerId'],
        select: { passengerId: true },
      }),
      this.prisma.ride.findMany({
        where: { ...where, assignedDriverId: { not: null } },
        distinct: ['assignedDriverId'],
        select: { assignedDriverId: true },
      }),
      this.returningPassengers(start, end),
      this.timingAverages(q, start, end),
    ]);

    const byStatus = this.statusMap(statusGroups);
    const completed = byStatus[RideStatus.COMPLETED] ?? 0;
    const paxCancel = byStatus[RideStatus.PASSENGER_CANCELLED] ?? 0;
    const drvCancel = byStatus[RideStatus.DRIVER_CANCELLED] ?? 0;
    const cancelled = CANCELLED.reduce((s, st) => s + (byStatus[st] ?? 0), 0);
    const valid = Math.max(1, requests - (byStatus[RideStatus.PAYMENT_FAILED] ?? 0));
    const gmv = asNum(gmvAgg._sum.amount);
    const refunds = asNum(refundAgg._sum.amount);
    const commission = snap.platformFee;
    const netRevenue = round2(commission - refunds);
    const searching = (byStatus[RideStatus.WAITING_FOR_OFFERS] ?? 0) + (byStatus[RideStatus.OFFER_SELECTION] ?? 0);
    const assigned =
      (byStatus[RideStatus.BOOKED] ?? 0) + (byStatus[RideStatus.DRIVER_EN_ROUTE] ?? 0);
    const arrived = byStatus[RideStatus.DRIVER_ARRIVED] ?? 0;
    const started =
      (byStatus[RideStatus.TRIP_STARTED] ?? 0) + (byStatus[RideStatus.IN_PROGRESS] ?? 0);
    const failed = FAILED_EXPIRED.reduce((s, st) => s + (byStatus[st] ?? 0), 0);

    return {
      requests,
      completed,
      cancelled,
      searching,
      assigned,
      arrived,
      started,
      failed,
      paid: gmvAgg._count._all,
      gmv: round2(gmv),
      commission: round2(commission),
      tax: round2(snap.tax),
      driverEarnings: round2(snap.driverEarning),
      discounts: round2(snap.discount),
      tips: round2(snap.tips),
      surge: round2(snap.surge),
      bookingFee: round2(snap.bookingFee),
      grossFare: round2(snap.grossFare),
      refunds: round2(refunds),
      netRevenue,
      avgFare: averageFare(snap.grossFare || gmv, completed),
      revPerRide: revenuePerRide(netRevenue, completed),
      completionRate: completionRate(completed, valid),
      acceptanceRate: acceptanceRate(acceptedOffers, offers),
      driverCancelRate: cancellationRate(drvCancel, valid),
      paxCancelRate: cancellationRate(paxCancel, valid),
      offers,
      acceptedOffers,
      newPassengers: newPax,
      newDrivers: newDrv,
      totalPassengers: totalPax,
      totalDrivers: totalDrv,
      activePassengers: activePax.length,
      activeDrivers: activeDrv.length,
      returningPassengers: returning,
      avgEtaMin: timing.eta,
      avgPickupMin: timing.pickup,
      avgDurationMin: snap.avgDuration,
      avgDistanceKm: snap.avgDistance,
      byStatus,
    };
  }

  private rideRelationFilter(q: AnalyticsQuery): Prisma.RideWhereInput {
    const f: Prisma.RideWhereInput = {};
    if (q.serviceType) f.serviceType = q.serviceType;
    if (q.promo) f.promoCode = q.promo;
    if (q.vehicleType) f.vehicleClassIds = { has: q.vehicleType };
    const label = q.zone || q.city;
    if (label) {
      f.OR = [
        { fromLabel: { contains: label, mode: 'insensitive' } },
        { toLabel: { contains: label, mode: 'insensitive' } },
      ];
    }
    return f;
  }

  private statusMap(groups: StatusRow[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const g of groups) out[g.status] = g._count._all;
    return out;
  }

  private async snapshotSums(q: AnalyticsQuery, start: Date, end: Date) {
    const extra = rideFilterSql(q);
    const rows = await this.prisma.$queryRaw<
      Array<{
        gross_fare: number | null;
        platform_fee: number | null;
        tax: number | null;
        driver_earning: number | null;
        discount: number | null;
        tips: number | null;
        surge: number | null;
        booking_fee: number | null;
        avg_duration: number | null;
        avg_distance: number | null;
      }>
    >`
      SELECT
        COALESCE(SUM(COALESCE(
          (r."priceSnapshot"->>'passengerTotal')::numeric,
          (r."priceSnapshot"->>'bidAmount')::numeric,
          (r."priceSnapshot"->>'guidanceAmount')::numeric,
          0
        )), 0) AS gross_fare,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'platformFee')::numeric, 0)), 0) AS platform_fee,
        COALESCE(SUM(COALESCE(
          (r."priceSnapshot"->>'taxAmount')::numeric,
          (r."priceSnapshot"->>'tax')::numeric,
          0
        )), 0) AS tax,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'driverEarning')::numeric, 0)), 0) AS driver_earning,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'promoDiscount')::numeric, 0)), 0) AS discount,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'tip')::numeric, (r."priceSnapshot"->>'tips')::numeric, 0)), 0) AS tips,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'surge')::numeric, (r."priceSnapshot"->>'surgeAmount')::numeric, 0)), 0) AS surge,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'bookingFee')::numeric, 0)), 0) AS booking_fee,
        COALESCE(AVG(NULLIF((r."priceSnapshot"->>'durationMin')::numeric, 0)), 0) AS avg_duration,
        COALESCE(AVG(NULLIF((r."priceSnapshot"->>'distanceKm')::numeric, 0)), 0) AS avg_distance
      FROM "Ride" r
      WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end}
        AND r."status" = 'COMPLETED'
        AND ${extra}
    `;
    const r = rows[0] ?? {};
    return {
      grossFare: asNum(r.gross_fare),
      platformFee: asNum(r.platform_fee),
      tax: asNum(r.tax),
      driverEarning: asNum(r.driver_earning),
      discount: asNum(r.discount),
      tips: asNum(r.tips),
      surge: asNum(r.surge),
      bookingFee: asNum(r.booking_fee),
      avgDuration: round1(asNum(r.avg_duration)),
      avgDistance: round1(asNum(r.avg_distance)),
    };
  }

  private async timingAverages(q: AnalyticsQuery, start: Date, end: Date) {
    const extra = rideFilterSql(q);
    const rows = await this.prisma.$queryRaw<Array<{ eta: number | null; pickup: number | null }>>`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (arr."createdAt" - enr."createdAt")) / 60.0), 0) AS eta,
        COALESCE(AVG(EXTRACT(EPOCH FROM (st."createdAt" - arr."createdAt")) / 60.0), 0) AS pickup
      FROM "Ride" r
      LEFT JOIN "RideEvent" enr ON enr."rideId" = r.id AND enr."toStatus" = 'DRIVER_EN_ROUTE'
      LEFT JOIN "RideEvent" arr ON arr."rideId" = r.id AND arr."toStatus" = 'DRIVER_ARRIVED'
      LEFT JOIN "RideEvent" st ON st."rideId" = r.id AND enr."toStatus" IS NOT NULL AND st."toStatus" IN ('TRIP_STARTED','IN_PROGRESS')
      WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end}
        AND ${extra}
    `;
    return {
      eta: round1(Math.max(0, asNum(rows[0]?.eta))),
      pickup: round1(Math.max(0, asNum(rows[0]?.pickup))),
    };
  }

  private async returningPassengers(start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT r."passengerId"
        FROM "Ride" r
        WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end}
          AND r."status" = 'COMPLETED'
        GROUP BY r."passengerId"
        HAVING MIN(r."createdAt") > ${start}
           AND EXISTS (
             SELECT 1 FROM "Ride" prior
             WHERE prior."passengerId" = r."passengerId"
               AND prior."createdAt" < ${start}
               AND prior."status" = 'COMPLETED'
           )
      ) t
    `;
    return rows[0]?.n ?? 0;
  }

  private async dailySeries(q: AnalyticsQuery, resolved: ResolvedRange) {
    const tz = pgTz(resolved.timezone);
    const extra = rideFilterSql(q);
    const trunc = q.groupBy === 'hour' ? 'hour' : q.groupBy === 'week' ? 'week' : q.groupBy === 'month' ? 'month' : 'day';
    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: Date; rides: number; completed: number; gmv: number; net: number }>
    >`
      SELECT
        date_trunc(${trunc}, r."createdAt" AT TIME ZONE ${tz}) AS bucket,
        COUNT(*)::int AS rides,
        COUNT(*) FILTER (WHERE r."status" = 'COMPLETED')::int AS completed,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('succeeded','SUCCEEDED','captured','CAPTURED')), 0) AS gmv,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'platformFee')::numeric, 0)), 0) AS net
      FROM "Ride" r
      LEFT JOIN "Payment" p ON p."rideId" = r.id
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND ${extra}
      GROUP BY 1
      ORDER BY 1
    `;
    const days = iterateDays(resolved.current.start, resolved.current.end, resolved.timezone);
    const map = new Map(
      rows.map((r) => [
        isoBucket(r.bucket, trunc),
        {
          rides: Number(r.rides),
          completed: Number(r.completed),
          gmv: round2(asNum(r.gmv)),
          net: round2(asNum(r.net)),
        },
      ]),
    );
    if (trunc !== 'day') {
      return rows.map((r) => ({
        date: isoBucket(r.bucket, trunc),
        rides: Number(r.rides),
        completed: Number(r.completed),
        gmv: round2(asNum(r.gmv)),
        net: round2(asNum(r.net)),
      }));
    }
    return days.map((date) => ({
      date,
      rides: map.get(date)?.rides ?? 0,
      completed: map.get(date)?.completed ?? 0,
      gmv: map.get(date)?.gmv ?? 0,
      net: map.get(date)?.net ?? 0,
    }));
  }

  private async primaryCurrency(q: AnalyticsQuery, start: Date, end: Date) {
    const rows = await this.prisma.ride.groupBy({
      by: ['currency'],
      where: rideWhere(start, end, q),
      _count: { _all: true },
    });
    if (!rows.length) {
      const p = await this.prisma.passengerProfile.findFirst({ select: { currency: true } });
      return p?.currency ?? 'USD';
    }
    return rows.sort((a, b) => b._count._all - a._count._all)[0].currency;
  }

  private funnelFromCounts(cur: Awaited<ReturnType<AdminAnalyticsService['periodStats']>>) {
    const requested = cur.requests;
    const search = Math.max(cur.searching, cur.assigned + cur.arrived + cur.started + cur.completed);
    const accepted = Math.max(cur.assigned + cur.arrived + cur.started + cur.completed, cur.acceptedOffers);
    const arrived = Math.max(cur.arrived + cur.started + cur.completed, cur.arrived);
    const started = Math.max(cur.started + cur.completed, cur.started);
    const steps: FunnelStep[] = [
      { key: 'requested', label: 'Ride Requested', value: requested },
      { key: 'search', label: 'Driver Search', value: search || requested },
      { key: 'accepted', label: 'Driver Accepted', value: accepted },
      { key: 'arrived', label: 'Driver Arrived', value: arrived },
      { key: 'started', label: 'Trip Started', value: started },
      { key: 'completed', label: 'Trip Completed', value: cur.completed },
    ];
    return { steps, edges: funnelEdges(steps) };
  }

  async liveNow() {
    const onlineSince = new Date(Date.now() - 5 * 60_000);
    const today = resolveAnalyticsRange({ range: 'today', timezone: 'Asia/Karachi' });
    const [
      online,
      onTrip,
      activeTrips,
      searching,
      unmatched,
      todayCompleted,
      todayCancelled,
      todayRequests,
      todayPay,
    ] = await Promise.all([
      this.prisma.driverLocationCurrent.count({ where: { recordedAt: { gte: onlineSince } } }),
      this.prisma.ride.count({ where: { status: { in: ACTIVE_TRIP } } }),
      this.prisma.ride.count({ where: { status: { in: ACTIVE_TRIP } } }),
      this.prisma.ride.count({ where: { status: RideStatus.WAITING_FOR_OFFERS } }),
      this.prisma.ride.count({ where: { status: { in: OPEN_REQ } } }),
      this.prisma.ride.count({
        where: { status: RideStatus.COMPLETED, createdAt: { gte: today.current.start } },
      }),
      this.prisma.ride.count({
        where: { status: { in: CANCELLED }, createdAt: { gte: today.current.start } },
      }),
      this.prisma.ride.count({ where: { createdAt: { gte: today.current.start } } }),
      this.prisma.payment.aggregate({
        where: {
          status: { in: PAID_STATUSES },
          createdAt: { gte: today.current.start },
        },
        _sum: { amount: true },
      }),
    ]);
    const available = Math.max(0, online - onTrip);
    const ratio = demandSupplyRatio(unmatched + searching, available || online);
    return {
      onlineDrivers: online,
      availableDrivers: available,
      driversOnTrip: onTrip,
      activeTrips,
      passengersSearching: searching,
      unmatchedRequests: unmatched,
      demandSupplyRatio: ratio,
      shortage: ratio >= 1.5,
      todayRevenue: round2(asNum(todayPay._sum.amount)),
      todayCompleted,
      todayCancellationRate: cancellationRate(todayCancelled, Math.max(1, todayRequests)),
    };
  }

  private insights(
    cur: Awaited<ReturnType<AdminAnalyticsService['periodStats']>>,
    prev: Awaited<ReturnType<AdminAnalyticsService['periodStats']>>,
    live: Awaited<ReturnType<AdminAnalyticsService['liveNow']>>,
  ): Insight[] {
    const out: Insight[] = [];
    const demand = changePct(cur.requests, prev.requests);
    if (demand != null && Math.abs(demand) >= 5) {
      out.push({
        severity: demand >= 0 ? 'positive' : 'warning',
        text: `Ride demand ${demand >= 0 ? 'increased' : 'decreased'} ${Math.abs(demand)}% compared with the previous period.`,
      });
    }
    if (cur.paxCancelRate >= 12) {
      out.push({
        severity: cur.paxCancelRate >= 18 ? 'critical' : 'warning',
        text: `Passenger cancellation rate reached ${cur.paxCancelRate}%, ${round1(cur.paxCancelRate - prev.paxCancelRate)} points vs previous period.`,
      });
    }
    if (live.shortage) {
      out.push({
        severity: live.demandSupplyRatio >= 2 ? 'critical' : 'warning',
        text: `Driver supply is below demand right now (demand/supply ${live.demandSupplyRatio}×). Unmatched requests: ${live.unmatchedRequests}.`,
      });
    }
    const ret = changePct(cur.returningPassengers, prev.returningPassengers);
    if (ret != null && ret > 0) {
      out.push({
        severity: 'positive',
        text: `Returning passenger volume improved ${ret}%.`,
      });
    }
    if (cur.completionRate < 70 && cur.requests > 0) {
      out.push({
        severity: 'warning',
        text: `Completion rate is ${cur.completionRate}% — below the 70% operational target.`,
      });
    }
    if (!out.length) {
      out.push({
        severity: 'info',
        text: cur.requests
          ? 'Marketplace is operating within normal ranges for the selected filters.'
          : 'No ride activity in this period yet — KPIs will populate as requests arrive.',
      });
    }
    return out.slice(0, 8);
  }

  private async buildSection(
    section: string,
    q: AnalyticsQuery,
    resolved: ResolvedRange,
    perms: string[],
  ) {
    switch (section) {
      case 'rides':
        return this.ridesSection(q, resolved);
      case 'revenue':
        return this.revenueSection(q, resolved, perms);
      case 'drivers':
        return this.driversSection(q, resolved);
      case 'passengers':
        return this.passengersSection(q, resolved);
      case 'geography':
        return this.geographySection(q, resolved);
      case 'cancellations':
        return this.cancellationsSection(q, resolved);
      case 'payments':
        return this.paymentsSection(q, resolved, perms);
      case 'retention':
        return this.retentionSection(q, resolved);
      case 'funnel':
        return this.funnelSection(q, resolved);
      case 'operations':
        return this.operationsSection(q, resolved);
      case 'forecast':
        return this.forecastSection(q, resolved);
      case 'promotions':
        return this.promotionsSection(q, resolved);
      case 'ratings':
        return this.ratingsSection(q, resolved);
      case 'safety':
        return this.safetySection(q, resolved, perms);
      case 'live':
        return { live: await this.liveNow(), lastUpdated: new Date().toISOString() };
      case 'heatmap':
        return this.hourDayHeatmap(q, resolved);
      default:
        return this.buildOverview(q, resolved, perms);
    }
  }

  private async ridesSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const compareRange = q.compare === 'year' ? resolved.previousYear : resolved.previous;
    const [cur, prev, series, byHour, byStatus, byVehicle, byZone, byDistance, byDuration] =
      await Promise.all([
        this.periodStats(q, resolved.current.start, resolved.current.end),
        this.periodStats(q, compareRange.start, compareRange.end),
        this.dailySeries(q, resolved),
        this.countByHour(q, resolved),
        this.prisma.ride.groupBy({
          by: ['status'],
          where: rideWhere(resolved.current.start, resolved.current.end, q),
          _count: { _all: true },
        }),
        this.countByVehicle(q, resolved),
        this.zoneTable(q, resolved),
        this.bucketNumeric(q, resolved, 'distanceKm', [2, 5, 10, 20, 40]),
        this.bucketNumeric(q, resolved, 'durationMin', [10, 20, 40, 60, 90]),
      ]);
    const peak = byHour.reduce((a, b) => (b.value > a.value ? b : a), { hour: 0, value: 0 });
    return {
      demo: false,
      empty: cur.requests === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      kpis: [
        this.kpi('requests', 'Requests', cur.requests, prev.requests, series.map((s) => s.rides), 'count', 'completionRate', 'rides'),
        this.kpi('search', 'Searching for Driver', cur.searching, prev.searching, series.map((s) => s.rides), 'count', '', 'rides'),
        this.kpi('assigned', 'Driver Assigned', cur.assigned, prev.assigned, series.map((s) => s.rides), 'count', '', 'rides'),
        this.kpi('arrived', 'Driver Arrived', cur.arrived, prev.arrived, series.map((s) => s.rides), 'count', '', 'rides'),
        this.kpi('started', 'Trips Started', cur.started, prev.started, series.map((s) => s.rides), 'count', '', 'rides'),
        this.kpi('completed', 'Completed', cur.completed, prev.completed, series.map((s) => s.completed), 'count', 'completionRate', 'rides:completed'),
        this.kpi('cancelled', 'Cancelled', cur.cancelled, prev.cancelled, series.map((s) => s.rides), 'count', 'cancellationRate', 'cancellations'),
        this.kpi('failed', 'Failed / Expired', cur.failed, prev.failed, series.map((s) => s.rides), 'count', '', 'rides:failed'),
      ],
      funnel: this.funnelFromCounts(cur),
      byHour,
      byDay: series,
      byStatus: byStatus.map((s) => ({ label: s.status, value: s._count._all })),
      byVehicle,
      byZone,
      byDistance,
      byDuration,
      peak: {
        hour: peak.hour,
        requests: peak.value,
        note: peak.value
          ? `Peak demand at ${String(peak.hour).padStart(2, '0')}:00 (${peak.value} requests).`
          : 'No peak hour yet.',
      },
    };
  }

  private async countByHour(q: AnalyticsQuery, resolved: ResolvedRange) {
    const tz = pgTz(resolved.timezone);
    const extra = rideFilterSql(q);
    const rows = await this.prisma.$queryRaw<Array<{ hour: number; n: number }>>`
      SELECT EXTRACT(HOUR FROM r."createdAt" AT TIME ZONE ${tz})::int AS hour, COUNT(*)::int AS n
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND ${extra}
      GROUP BY 1 ORDER BY 1
    `;
    const map = new Map(rows.map((r) => [r.hour, r.n]));
    return Array.from({ length: 24 }, (_, hour) => ({ hour, value: map.get(hour) ?? 0 }));
  }

  private async countByVehicle(q: AnalyticsQuery, resolved: ResolvedRange) {
    const extra = rideFilterSql(q);
    return this.prisma.$queryRaw<Array<{ label: string; value: number }>>`
      SELECT COALESCE(NULLIF(r."vehicleClassIds"[1], ''), r."serviceType") AS label, COUNT(*)::int AS value
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND ${extra}
      GROUP BY 1 ORDER BY value DESC
      LIMIT 12
    `;
  }

  private async zoneTable(q: AnalyticsQuery, resolved: ResolvedRange) {
    const extra = rideFilterSql(q);
    const tz = pgTz(resolved.timezone);
    void tz;
    return this.prisma.$queryRaw<
      Array<{
        zone: string;
        requests: number;
        completed: number;
        drivers: number;
        revenue: number;
        cancel_pct: number;
        avg_eta: number;
      }>
    >`
      SELECT
        COALESCE(NULLIF(split_part(r."fromLabel", ',', 1), ''), 'Unspecified') AS zone,
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE r."status" = 'COMPLETED')::int AS completed,
        COUNT(DISTINCT r."assignedDriverId")::int AS drivers,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'passengerTotal')::numeric, (r."priceSnapshot"->>'bidAmount')::numeric, 0))
          FILTER (WHERE r."status" = 'COMPLETED'), 0) AS revenue,
        CASE WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE r."status" IN ('PASSENGER_CANCELLED','DRIVER_CANCELLED','ADMIN_CANCELLED','EXPIRED','NO_SHOW')) / COUNT(*), 1)
        END AS cancel_pct,
        0::numeric AS avg_eta
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND ${extra}
      GROUP BY 1
      ORDER BY requests DESC
      LIMIT 30
    `;
  }

  private async bucketNumeric(
    q: AnalyticsQuery,
    resolved: ResolvedRange,
    field: 'distanceKm' | 'durationMin',
    edges: number[],
  ) {
    const extra = rideFilterSql(q);
    const expr = Prisma.raw(`(r."priceSnapshot"->>'${field}')::numeric`);
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; value: number }>>`
      SELECT
        CASE
          ${Prisma.join(
            edges.map((e, i) => {
              const prev = i === 0 ? 0 : edges[i - 1];
              return Prisma.sql`WHEN ${expr} < ${e} THEN ${`${prev}–${e}`}`;
            }),
            ' ',
          )}
          ELSE ${`${edges[edges.length - 1]}+`}
        END AS bucket,
        COUNT(*)::int AS value
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."status" = 'COMPLETED'
        AND ${extra}
        AND ${expr} IS NOT NULL
      GROUP BY 1
    `;
    return rows;
  }

  private async revenueSection(q: AnalyticsQuery, resolved: ResolvedRange, perms: string[]) {
    if (!this.canFinancial(perms)) {
      return { denied: true, message: 'Missing analytics.financial permission.' };
    }
    const compareRange = q.compare === 'year' ? resolved.previousYear : resolved.previous;
    const [cur, prev, series] = await Promise.all([
      this.periodStats(q, resolved.current.start, resolved.current.end),
      this.periodStats(q, compareRange.start, compareRange.end),
      this.dailySeries(q, resolved),
    ]);
    const breakdown = [
      { key: 'grossFare', label: 'Gross Fare', value: cur.grossFare },
      { key: 'bookingFee', label: 'Booking Fee', value: cur.bookingFee },
      { key: 'surge', label: 'Surge', value: cur.surge },
      { key: 'tips', label: 'Tips', value: cur.tips },
      { key: 'taxes', label: 'Taxes', value: cur.tax },
      { key: 'discounts', label: 'Discounts', value: -cur.discounts },
      { key: 'refunds', label: 'Refunds', value: -cur.refunds },
      { key: 'driverEarnings', label: 'Driver Earnings', value: -cur.driverEarnings },
      { key: 'net', label: 'Platform Net Revenue', value: cur.netRevenue },
    ];
    return {
      demo: false,
      empty: cur.gmv === 0 && cur.requests === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      series,
      previous: {
        gmv: prev.gmv,
        net: prev.netRevenue,
        commission: prev.commission,
      },
      stacked: series.map((s) => ({
        date: s.date,
        commission: s.net,
        driver: Math.max(0, s.gmv - s.net),
        refunds: 0,
      })),
      breakdown,
      kpis: [
        this.kpi('gmv', 'Gross Bookings', cur.gmv, prev.gmv, series.map((s) => s.gmv), 'currency', 'grossBookings', 'revenue'),
        this.kpi('net', 'Net Revenue', cur.netRevenue, prev.netRevenue, series.map((s) => s.net), 'currency', 'netRevenue', 'revenue'),
        this.kpi('commission', 'Platform Commission', cur.commission, prev.commission, series.map((s) => s.net), 'currency', 'netRevenue', 'revenue'),
        this.kpi('driver', 'Driver Earnings', cur.driverEarnings, prev.driverEarnings, series.map((s) => s.gmv), 'currency', '', 'drivers'),
        this.kpi('tax', 'Taxes', cur.tax, prev.tax, series.map((s) => s.gmv), 'currency', '', 'revenue'),
        this.kpi('disc', 'Discounts', cur.discounts, prev.discounts, series.map((s) => s.gmv), 'currency', '', 'promotions'),
        this.kpi('ref', 'Refunds', cur.refunds, prev.refunds, series.map((s) => s.net), 'currency', '', 'payments'),
        this.kpi('tips', 'Tips', cur.tips, prev.tips, series.map((s) => s.gmv), 'currency', '', 'revenue'),
      ],
    };
  }

  private async driversSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const onlineSince = new Date(Date.now() - 5 * 60_000);
    const whereRides = rideWhere(resolved.current.start, resolved.current.end, q);
    const [
      total,
      approved,
      pending,
      suspended,
      online,
      onTrip,
      activeIds,
      offers,
      selected,
      ratings,
      top,
    ] = await Promise.all([
      this.prisma.driverProfile.count(),
      this.prisma.driverProfile.count({ where: { approvalStatus: DriverApprovalStatus.APPROVED } }),
      this.prisma.driverProfile.count({ where: { approvalStatus: DriverApprovalStatus.PENDING_KYC } }),
      this.prisma.driverProfile.count({ where: { approvalStatus: DriverApprovalStatus.SUSPENDED } }),
      this.prisma.driverLocationCurrent.count({ where: { recordedAt: { gte: onlineSince } } }),
      this.prisma.ride.count({ where: { status: { in: ACTIVE_TRIP } } }),
      this.prisma.ride.findMany({
        where: { ...whereRides, assignedDriverId: { not: null } },
        distinct: ['assignedDriverId'],
        select: { assignedDriverId: true },
      }),
      this.prisma.offer.count({
        where: { createdAt: { gte: resolved.current.start, lt: resolved.current.end } },
      }),
      this.prisma.offer.count({
        where: {
          status: 'SELECTED',
          createdAt: { gte: resolved.current.start, lt: resolved.current.end },
        },
      }),
      this.prisma.rating.aggregate({
        where: { createdAt: { gte: resolved.current.start, lt: resolved.current.end } },
        _avg: { stars: true },
      }),
      this.topDrivers(q, resolved),
    ]);
    const extra = rideFilterSql(q);
    const byHour = await this.prisma.$queryRaw<Array<{ hour: number; n: number }>>`
      SELECT EXTRACT(HOUR FROM r."createdAt" AT TIME ZONE ${pgTz(resolved.timezone)})::int AS hour,
             COUNT(DISTINCT r."assignedDriverId")::int AS n
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."assignedDriverId" IS NOT NULL AND ${extra}
      GROUP BY 1 ORDER BY 1
    `;
    const earningsDist = await this.earningsDistribution(resolved);
    const available = Math.max(0, online - onTrip);
    const completed = await this.prisma.ride.count({
      where: { ...whereRides, status: RideStatus.COMPLETED },
    });
    const drvCancel = await this.prisma.ride.count({
      where: { ...whereRides, status: RideStatus.DRIVER_CANCELLED },
    });
    const snap = await this.snapshotSums(q, resolved.current.start, resolved.current.end);
    const tripHours = (snap.avgDuration * completed) / 60;
    const onlineHoursProxy = round1(Math.max(tripHours * 1.35, tripHours));
    return {
      demo: false,
      empty: total === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      notes: {
        onlineHours:
          'Historical GPS presence is not stored; online hours use completed trip time × 1.35 as a proxy and are labeled as estimates.',
      },
      kpis: {
        totalDrivers: total,
        approvedDrivers: approved,
        pendingDrivers: pending,
        suspendedDrivers: suspended,
        onlineDrivers: online,
        activeDrivers: activeIds.length,
        driversOnTrip: onTrip,
        driversAvailable: available,
        utilizationRate: pct(onTrip, online || 1),
        acceptanceRate: acceptanceRate(selected, offers),
        cancellationRate: cancellationRate(drvCancel, Math.max(1, completed + drvCancel)),
        completionRate: completionRate(completed, Math.max(1, completed + drvCancel)),
        averageRating: round1(asNum(ratings._avg.stars)),
        averageEarnings: activeIds.length ? round2(snap.driverEarning / activeIds.length) : 0,
        earningsPerOnlineHour: onlineHoursProxy ? round2(snap.driverEarning / onlineHoursProxy) : 0,
        tripsPerDriver: activeIds.length ? round1(completed / activeIds.length) : 0,
        onlineHours: onlineHoursProxy,
        idleTime: round1(Math.max(0, onlineHoursProxy - tripHours)),
      },
      supplyOverTime: (await this.dailySeries(q, resolved)).map((s) => ({
        date: s.date,
        trips: s.completed,
        requests: s.rides,
      })),
      onlineVsBusy: { online, busy: onTrip, available },
      earningsDistribution: earningsDist,
      ratingDistribution: await this.ratingStars(resolved, 'driver'),
      activityByHour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        value: byHour.find((r) => r.hour === hour)?.n ?? 0,
      })),
      supplyByZone: await this.zoneTable(q, resolved),
      topDrivers: top,
    };
  }

  private async topDrivers(q: AnalyticsQuery, resolved: ResolvedRange) {
    const extra = rideFilterSql(q);
    const rows = await this.prisma.$queryRaw<
      Array<{
        driver_id: string;
        name: string;
        user_id: string;
        trips: number;
        earnings: number;
        rating: number;
        revenue: number;
      }>
    >`
      SELECT
        d.id AS driver_id,
        d."fullName" AS name,
        d."userId" AS user_id,
        COUNT(*) FILTER (WHERE r."status" = 'COMPLETED')::int AS trips,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'driverEarning')::numeric, 0)) FILTER (WHERE r."status" = 'COMPLETED'), 0) AS earnings,
        COALESCE(AVG(rt.stars), 0) AS rating,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'passengerTotal')::numeric, (r."priceSnapshot"->>'bidAmount')::numeric, 0))
          FILTER (WHERE r."status" = 'COMPLETED'), 0) AS revenue
      FROM "Ride" r
      JOIN "DriverProfile" d ON d.id = r."assignedDriverId"
      LEFT JOIN "Rating" rt ON rt."rideId" = r.id AND rt."toUserId" = d."userId"
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."assignedDriverId" IS NOT NULL AND ${extra}
      GROUP BY d.id, d."fullName", d."userId"
      ORDER BY trips DESC
      LIMIT 25
    `;
    const offers = await this.prisma.offer.groupBy({
      by: ['driverId'],
      where: {
        createdAt: { gte: resolved.current.start, lt: resolved.current.end },
        driverId: { in: rows.map((r) => r.driver_id) },
      },
      _count: { _all: true },
    });
    const selected = await this.prisma.offer.groupBy({
      by: ['driverId'],
      where: {
        status: 'SELECTED',
        createdAt: { gte: resolved.current.start, lt: resolved.current.end },
        driverId: { in: rows.map((r) => r.driver_id) },
      },
      _count: { _all: true },
    });
    const cancel = await this.prisma.ride.groupBy({
      by: ['assignedDriverId'],
      where: {
        status: RideStatus.DRIVER_CANCELLED,
        createdAt: { gte: resolved.current.start, lt: resolved.current.end },
        assignedDriverId: { in: rows.map((r) => r.driver_id) },
      },
      _count: { _all: true },
    });
    return rows.map((r) => {
      const off = offers.find((o) => o.driverId === r.driver_id)?._count._all ?? 0;
      const sel = selected.find((o) => o.driverId === r.driver_id)?._count._all ?? 0;
      const can = cancel.find((o) => o.assignedDriverId === r.driver_id)?._count._all ?? 0;
      return {
        driverId: r.driver_id,
        userId: r.user_id,
        name: r.name,
        trips: Number(r.trips),
        earnings: round2(asNum(r.earnings)),
        onlineHours: round1((Number(r.trips) * 25) / 60),
        acceptancePct: acceptanceRate(sel, off),
        cancellationPct: cancellationRate(can, Math.max(1, Number(r.trips) + can)),
        rating: round1(asNum(r.rating)),
        revenueGenerated: round2(asNum(r.revenue)),
      };
    });
  }

  private async earningsDistribution(resolved: ResolvedRange) {
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; value: number }>>`
      SELECT bucket, COUNT(*)::int AS value FROM (
        SELECT
          CASE
            WHEN earn < 50 THEN '0–50'
            WHEN earn < 150 THEN '50–150'
            WHEN earn < 400 THEN '150–400'
            WHEN earn < 800 THEN '400–800'
            ELSE '800+'
          END AS bucket
        FROM (
          SELECT COALESCE(SUM(COALESCE((r."priceSnapshot"->>'driverEarning')::numeric, 0)), 0) AS earn
          FROM "Ride" r
          WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
            AND r."status" = 'COMPLETED' AND r."assignedDriverId" IS NOT NULL
          GROUP BY r."assignedDriverId"
        ) t
      ) x
      GROUP BY 1
    `;
    return rows;
  }

  private async ratingStars(resolved: ResolvedRange, _who: 'driver' | 'passenger') {
    const groups = await this.prisma.rating.groupBy({
      by: ['stars'],
      where: { createdAt: { gte: resolved.current.start, lt: resolved.current.end } },
      _count: { _all: true },
    });
    return [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      value: groups.find((g) => g.stars === stars)?._count._all ?? 0,
    }));
  }

  private async passengersSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const start = resolved.current.start;
    const end = resolved.current.end;
    const [
      total,
      newRegs,
      firstTime,
      returning,
      spend,
      ridesPer,
      cancel,
      series,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.PASSENGER } }),
      this.prisma.user.count({
        where: { role: UserRole.PASSENGER, createdAt: { gte: start, lt: end } },
      }),
      this.firstTimeRiders(start, end),
      this.returningPassengers(start, end),
      this.passengerSpend(start, end),
      this.ridesPerPassenger(start, end),
      this.prisma.ride.count({
        where: rideWhere(start, end, { ...q, rideStatus: RideStatus.PASSENGER_CANCELLED }),
      }),
      this.dailyRegistrations(resolved),
    ]);
    const active = await this.prisma.ride.findMany({
      where: { createdAt: { gte: start, lt: end }, status: RideStatus.COMPLETED },
      distinct: ['passengerId'],
      select: { passengerId: true },
    });
    const withRide = await this.prisma.ride.findMany({
      where: { status: RideStatus.COMPLETED },
      distinct: ['passengerId'],
      select: { passengerId: true },
    });
    const segments = await this.passengerSegments(resolved);
    const requests = await this.prisma.ride.count({ where: rideWhere(start, end, q) });
    return {
      demo: false,
      empty: total === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      kpis: {
        totalRegistered: total,
        newRegistrations: newRegs,
        activePassengers: active.length,
        firstTimeRiders: firstTime,
        returningRiders: returning,
        repeatRideRate: pct(returning, Math.max(1, withRide.length)),
        avgRidesPerPassenger: ridesPer.avg,
        averageSpend: spend.avg,
        lifetimeValue: spend.ltv,
        cancellationRate: cancellationRate(cancel, Math.max(1, requests)),
      },
      growth: series,
      segments,
      frequency: ridesPer.dist,
      spendDistribution: spend.dist,
      registrationToFirstRide: await this.regToFirstRide(resolved),
    };
  }

  private async firstTimeRiders(start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT r."passengerId", MIN(r."createdAt") AS first_at
        FROM "Ride" r
        WHERE r."status" = 'COMPLETED'
        GROUP BY r."passengerId"
      ) t
      WHERE first_at >= ${start} AND first_at < ${end}
    `;
    return rows[0]?.n ?? 0;
  }

  private async passengerSpend(start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{ avg: number; ltv: number; b0: number; b1: number; b2: number; b3: number }>
    >`
      SELECT
        COALESCE(AVG(spend), 0) AS avg,
        COALESCE(AVG(ltv), 0) AS ltv,
        COUNT(*) FILTER (WHERE spend < 20)::int AS b0,
        COUNT(*) FILTER (WHERE spend >= 20 AND spend < 80)::int AS b1,
        COUNT(*) FILTER (WHERE spend >= 80 AND spend < 200)::int AS b2,
        COUNT(*) FILTER (WHERE spend >= 200)::int AS b3
      FROM (
        SELECT
          SUM(p.amount) FILTER (WHERE p."createdAt" >= ${start} AND p."createdAt" < ${end}
            AND p.status IN ('succeeded','SUCCEEDED','captured')) AS spend,
          SUM(p.amount) FILTER (WHERE p.status IN ('succeeded','SUCCEEDED','captured')) AS ltv
        FROM "Ride" r
        JOIN "Payment" p ON p."rideId" = r.id
        GROUP BY r."passengerId"
      ) t
    `;
    const r = rows[0];
    return {
      avg: round2(asNum(r?.avg)),
      ltv: round2(asNum(r?.ltv)),
      dist: [
        { label: '0–20', value: r?.b0 ?? 0 },
        { label: '20–80', value: r?.b1 ?? 0 },
        { label: '80–200', value: r?.b2 ?? 0 },
        { label: '200+', value: r?.b3 ?? 0 },
      ],
    };
  }

  private async ridesPerPassenger(start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{ avg: number; f1: number; f2: number; f5: number; f8: number }>
    >`
      SELECT
        COALESCE(AVG(n), 0) AS avg,
        COUNT(*) FILTER (WHERE n = 1)::int AS f1,
        COUNT(*) FILTER (WHERE n BETWEEN 2 AND 3)::int AS f2,
        COUNT(*) FILTER (WHERE n BETWEEN 4 AND 7)::int AS f5,
        COUNT(*) FILTER (WHERE n >= 8)::int AS f8
      FROM (
        SELECT COUNT(*) AS n FROM "Ride" r
        WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end} AND r."status" = 'COMPLETED'
        GROUP BY r."passengerId"
      ) t
    `;
    return {
      avg: round1(asNum(rows[0]?.avg)),
      dist: [
        { label: '1', value: rows[0]?.f1 ?? 0 },
        { label: '2–3', value: rows[0]?.f2 ?? 0 },
        { label: '4–7', value: rows[0]?.f5 ?? 0 },
        { label: '8+', value: rows[0]?.f8 ?? 0 },
      ],
    };
  }

  private async dailyRegistrations(resolved: ResolvedRange) {
    const tz = pgTz(resolved.timezone);
    const rows = await this.prisma.$queryRaw<
      Array<{ date: Date; pax: number; drv: number }>
    >`
      SELECT date_trunc('day', u."createdAt" AT TIME ZONE ${tz}) AS date,
        COUNT(*) FILTER (WHERE u.role = 'PASSENGER')::int AS pax,
        COUNT(*) FILTER (WHERE u.role = 'DRIVER')::int AS drv
      FROM "User" u
      WHERE u."createdAt" >= ${resolved.current.start} AND u."createdAt" < ${resolved.current.end}
      GROUP BY 1 ORDER BY 1
    `;
    return rows.map((r) => ({
      date: isoBucket(r.date, 'day'),
      new: Number(r.pax),
      drivers: Number(r.drv),
    }));
  }

  private async passengerSegments(resolved: ResolvedRange) {
    const now = resolved.current.end;
    const d14 = new Date(now.getTime() - 14 * 86400_000);
    const d30 = new Date(now.getTime() - 30 * 86400_000);
    const rows = await this.prisma.$queryRaw<
      Array<{
        new: number;
        active: number;
        returning: number;
        frequent: number;
        high_value: number;
        at_risk: number;
        dormant: number;
      }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE u."createdAt" >= ${resolved.current.start})::int AS new,
        COUNT(*) FILTER (WHERE last_ride >= ${d14})::int AS active,
        COUNT(*) FILTER (WHERE rides >= 2)::int AS returning,
        COUNT(*) FILTER (WHERE rides >= 8)::int AS frequent,
        COUNT(*) FILTER (WHERE spend >= 200)::int AS high_value,
        COUNT(*) FILTER (WHERE last_ride < ${d14} AND last_ride >= ${d30})::int AS at_risk,
        COUNT(*) FILTER (WHERE last_ride < ${d30} OR last_ride IS NULL)::int AS dormant
      FROM "PassengerProfile" p
      JOIN "User" u ON u.id = p."userId"
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE r."status" = 'COMPLETED') AS rides,
               MAX(r."createdAt") AS last_ride,
               COALESCE(SUM(COALESCE((r."priceSnapshot"->>'passengerTotal')::numeric, 0)) FILTER (WHERE r."status" = 'COMPLETED'), 0) AS spend
        FROM "Ride" r WHERE r."passengerId" = p.id
      ) s ON TRUE
    `;
    const r = rows[0];
    return [
      { key: 'new', label: 'New', value: r?.new ?? 0 },
      { key: 'active', label: 'Active', value: r?.active ?? 0 },
      { key: 'returning', label: 'Returning', value: r?.returning ?? 0 },
      { key: 'frequent', label: 'Frequent', value: r?.frequent ?? 0 },
      { key: 'high_value', label: 'High Value', value: r?.high_value ?? 0 },
      { key: 'at_risk', label: 'At Risk', value: r?.at_risk ?? 0 },
      { key: 'dormant', label: 'Dormant', value: r?.dormant ?? 0 },
    ];
  }

  private async regToFirstRide(resolved: ResolvedRange) {
    const rows = await this.prisma.$queryRaw<Array<{ registered: number; first_ride: number }>>`
      SELECT
        COUNT(*)::int AS registered,
        COUNT(*) FILTER (WHERE first_ride IS NOT NULL)::int AS first_ride
      FROM (
        SELECT p.id, MIN(r."createdAt") AS first_ride
        FROM "PassengerProfile" p
        LEFT JOIN "Ride" r ON r."passengerId" = p.id AND r."status" = 'COMPLETED'
        WHERE p."createdAt" >= ${resolved.current.start} AND p."createdAt" < ${resolved.current.end}
        GROUP BY p.id
      ) t
    `;
    const registered = rows[0]?.registered ?? 0;
    const first = rows[0]?.first_ride ?? 0;
    return { registered, firstRide: first, conversionPct: pct(first, registered) };
  }

  private async geographySection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const extra = rideFilterSql(q);
    const points = await this.prisma.$queryRaw<
      Array<{ lat: number; lng: number; status: string; kind: string }>
    >`
      SELECT r."fromLat" AS lat, r."fromLng" AS lng, r."status"::text AS status, 'pickup' AS kind
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND ${extra}
      LIMIT 800
    `;
    const drops = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
      SELECT r."toLat" AS lat, r."toLng" AS lng
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."toLat" IS NOT NULL AND ${extra}
      LIMIT 500
    `;
    const drivers = await this.prisma.driverLocationCurrent.findMany({
      take: 400,
      select: { lat: true, lng: true },
    });
    const zones = await this.zoneTable(q, resolved);
    const cancels = points.filter((p) =>
      ['PASSENGER_CANCELLED', 'DRIVER_CANCELLED', 'ADMIN_CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(
        p.status,
      ),
    );
    return {
      demo: false,
      empty: points.length === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      layers: {
        requests: points.map((p) => ({ lat: p.lat, lng: p.lng, weight: 1 })),
        pickups: points.map((p) => ({ lat: p.lat, lng: p.lng, weight: 1 })),
        dropoffs: drops.filter((d) => d.lat != null).map((d) => ({ lat: d.lat, lng: d.lng, weight: 1 })),
        drivers: drivers.map((d) => ({ lat: d.lat, lng: d.lng, weight: 1 })),
        cancellations: cancels.map((p) => ({ lat: p.lat, lng: p.lng, weight: 1 })),
      },
      zones: zones.map((z) => ({
        zone: z.zone,
        requests: Number(z.requests),
        completed: Number(z.completed),
        drivers: Number(z.drivers),
        avgEta: round1(asNum(z.avg_eta)),
        revenue: round2(asNum(z.revenue)),
        cancellationPct: asNum(z.cancel_pct),
      })),
    };
  }

  private async cancellationsSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const extra = rideFilterSql(q);
    const tz = pgTz(resolved.timezone);
    const rows = await this.prisma.$queryRaw<
      Array<{ actor: string; reason: string; n: number }>
    >`
      SELECT
        CASE WHEN r."status" = 'DRIVER_CANCELLED' THEN 'driver'
             WHEN r."status" = 'PASSENGER_CANCELLED' THEN 'passenger'
             ELSE 'other' END AS actor,
        COALESCE(NULLIF(e.payload->>'reason', ''), r."status"::text, 'Unspecified') AS reason,
        COUNT(*)::int AS n
      FROM "Ride" r
      LEFT JOIN LATERAL (
        SELECT payload, "toStatus" FROM "RideEvent" e
        WHERE e."rideId" = r.id AND e."toStatus" IN ('PASSENGER_CANCELLED','DRIVER_CANCELLED','ADMIN_CANCELLED','EXPIRED','NO_SHOW')
        ORDER BY e."createdAt" DESC LIMIT 1
      ) e ON TRUE
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."status" IN ('PASSENGER_CANCELLED','DRIVER_CANCELLED','ADMIN_CANCELLED','EXPIRED','NO_SHOW')
        AND ${extra}
      GROUP BY 1, 2
      ORDER BY n DESC
    `;
    const byHour = await this.prisma.$queryRaw<Array<{ hour: number; n: number }>>`
      SELECT EXTRACT(HOUR FROM r."createdAt" AT TIME ZONE ${tz})::int AS hour, COUNT(*)::int AS n
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."status" IN ('PASSENGER_CANCELLED','DRIVER_CANCELLED','ADMIN_CANCELLED','EXPIRED','NO_SHOW')
        AND ${extra}
      GROUP BY 1
    `;
    const trend = await this.dailySeries(q, { ...resolved });
    const highDrivers = await this.highCancelActors('driver', resolved);
    const highPax = await this.highCancelActors('passenger', resolved);
    const cur = await this.periodStats(q, resolved.current.start, resolved.current.end);
    return {
      demo: false,
      empty: cur.cancelled === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      rate: cur.driverCancelRate + cur.paxCancelRate,
      kpis: {
        cancellationRate: cancellationRate(cur.cancelled, Math.max(1, cur.requests)),
        passenger: cur.paxCancelRate,
        driver: cur.driverCancelRate,
      },
      passengerReasons: rows.filter((r) => r.actor === 'passenger'),
      driverReasons: rows.filter((r) => r.actor === 'driver'),
      otherReasons: rows.filter((r) => r.actor === 'other'),
      byHour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        value: byHour.find((x) => x.hour === hour)?.n ?? 0,
      })),
      byZone: await this.zoneTable(q, resolved),
      trend: trend.map((s) => ({ date: s.date, rides: s.rides, completed: s.completed })),
      highCancelDrivers: highDrivers,
      highPassengers: highPax,
    };
  }

  private async highCancelActors(kind: 'driver' | 'passenger', resolved: ResolvedRange) {
    if (kind === 'driver') {
      return this.prisma.$queryRaw<
        Array<{ id: string; name: string; user_id: string; cancelled: number; total: number; rate: number }>
      >`
        SELECT d.id, d."fullName" AS name, d."userId" AS user_id,
          COUNT(*) FILTER (WHERE r."status" = 'DRIVER_CANCELLED')::int AS cancelled,
          COUNT(*)::int AS total,
          ROUND(100.0 * COUNT(*) FILTER (WHERE r."status" = 'DRIVER_CANCELLED') / NULLIF(COUNT(*),0), 1) AS rate
        FROM "Ride" r
        JOIN "DriverProfile" d ON d.id = r."assignedDriverId"
        WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        GROUP BY d.id, d."fullName", d."userId"
        HAVING COUNT(*) >= 3 AND COUNT(*) FILTER (WHERE r."status" = 'DRIVER_CANCELLED') >= 2
        ORDER BY rate DESC
        LIMIT 15
      `;
    }
    return this.prisma.$queryRaw<
      Array<{ id: string; name: string; user_id: string; cancelled: number; total: number; rate: number }>
    >`
      SELECT p.id, p."fullName" AS name, p."userId" AS user_id,
        COUNT(*) FILTER (WHERE r."status" = 'PASSENGER_CANCELLED')::int AS cancelled,
        COUNT(*)::int AS total,
        ROUND(100.0 * COUNT(*) FILTER (WHERE r."status" = 'PASSENGER_CANCELLED') / NULLIF(COUNT(*),0), 1) AS rate
      FROM "Ride" r
      JOIN "PassengerProfile" p ON p.id = r."passengerId"
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
      GROUP BY p.id, p."fullName", p."userId"
      HAVING COUNT(*) >= 3 AND COUNT(*) FILTER (WHERE r."status" = 'PASSENGER_CANCELLED') >= 2
      ORDER BY rate DESC
      LIMIT 15
    `;
  }

  private async paymentsSection(q: AnalyticsQuery, resolved: ResolvedRange, perms: string[]) {
    if (!this.canFinancial(perms)) {
      return { denied: true, message: 'Missing analytics.financial permission.' };
    }
    const where: Prisma.PaymentWhereInput = {
      createdAt: { gte: resolved.current.start, lt: resolved.current.end },
      ...(q.paymentMethod ? { provider: q.paymentMethod } : {}),
    };
    const [all, succeeded, failed, pending, refunded, byProvider, volume] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where: { ...where, status: { in: PAID_STATUSES } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.count({ where: { ...where, status: { in: FAIL_STATUSES } } }),
      this.prisma.payment.count({ where: { ...where, status: { in: PENDING_PAY } } }),
      this.prisma.refund.aggregate({
        where: { createdAt: { gte: resolved.current.start, lt: resolved.current.end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['provider', 'status'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.dailySeries(q, resolved),
    ]);
    const cashLike = await this.prisma.payment.count({
      where: { ...where, provider: { in: ['cash', 'CASH', 'dev'] } },
    });
    return {
      demo: false,
      empty: all === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      kpis: {
        totalPayments: all,
        successful: succeeded._count._all,
        failed,
        pending,
        refunded: refunded._count._all,
        successRate: paymentSuccessRate(succeeded._count._all, all),
        failureRate: pct(failed, all),
        cashRides: cashLike,
        cardRides: all - cashLike,
        walletRides: 0,
        volume: round2(asNum(succeeded._sum.amount)),
        refundAmount: round2(asNum(refunded._sum.amount)),
      },
      volume,
      byProvider: byProvider.map((p) => ({
        provider: p.provider,
        status: p.status,
        count: p._count._all,
        amount: round2(asNum(p._sum.amount)),
      })),
      methodDistribution: await this.prisma.payment.groupBy({
        by: ['provider'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
    };
  }

  private async retentionSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const kind = q.passengerSegment === 'driver' ? 'driver' : 'passenger';
    const weekly = await this.cohortMatrix(kind, 'week', resolved.timezone);
    const monthly = await this.cohortMatrix(kind, 'month', resolved.timezone);
    const d = await this.dxRetention(kind);
    return {
      demo: false,
      empty: weekly.every((c) => c.users === 0),
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      weekly,
      monthly,
      d1: d.d1,
      d7: d.d7,
      d30: d.d30,
      churn: round1(100 - d.d30),
      reactivation: d.reactivation,
    };
  }

  private async cohortMatrix(kind: 'passenger' | 'driver', grain: 'week' | 'month', tz: string) {
    const tzSafe = pgTz(tz);
    const trunc = grain === 'month' ? 'month' : 'week';
    const step = grain === 'month' ? Prisma.sql`interval '1 month'` : Prisma.sql`interval '1 week'`;
    const lookback = grain === 'month' ? Prisma.sql`interval '8 month'` : Prisma.sql`interval '8 week'`;
    const idExpr = kind === 'driver' ? Prisma.sql`r."assignedDriverId"` : Prisma.sql`r."passengerId"`;
    const fromProfile =
      kind === 'driver'
        ? Prisma.sql`"DriverProfile" d JOIN "User" u ON u.id = d."userId"`
        : Prisma.sql`"PassengerProfile" d JOIN "User" u ON u.id = d."userId"`;
    const rows = await this.prisma.$queryRaw<
      Array<{ cohort: Date; users: number; w0: number; w1: number; w2: number; w3: number; w4: number }>
    >`
      WITH cohort AS (
        SELECT d.id, date_trunc(${trunc}, u."createdAt" AT TIME ZONE ${tzSafe}) AS c
        FROM ${fromProfile}
      ),
      activity AS (
        SELECT ${idExpr} AS id, date_trunc(${trunc}, r."createdAt" AT TIME ZONE ${tzSafe}) AS w
        FROM "Ride" r
        WHERE ${idExpr} IS NOT NULL AND r."status" = 'COMPLETED'
      )
      SELECT c.c AS cohort, COUNT(DISTINCT c.id)::int AS users,
        100 AS w0,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.w = c.c + ${step} THEN c.id END) / NULLIF(COUNT(DISTINCT c.id),0), 1) AS w1,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.w = c.c + (${step} * 2) THEN c.id END) / NULLIF(COUNT(DISTINCT c.id),0), 1) AS w2,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.w = c.c + (${step} * 3) THEN c.id END) / NULLIF(COUNT(DISTINCT c.id),0), 1) AS w3,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.w = c.c + (${step} * 4) THEN c.id END) / NULLIF(COUNT(DISTINCT c.id),0), 1) AS w4
      FROM cohort c
      LEFT JOIN activity a ON a.id = c.id
      WHERE c.c >= date_trunc(${trunc}, NOW() AT TIME ZONE ${tzSafe}) - ${lookback}
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT 10
    `;
    return rows.map((r) => this.cohortRow(r));
  }

  private cohortRow(r: {
    cohort: Date;
    users: number;
    w0: number;
    w1: number;
    w2: number;
    w3: number;
    w4: number;
  }) {
    const label = r.cohort instanceof Date ? r.cohort.toISOString().slice(0, 10) : String(r.cohort);
    return {
      cohort: label,
      users: Number(r.users),
      weeks: [100, asNum(r.w1), asNum(r.w2), asNum(r.w3), asNum(r.w4)],
    };
  }

  private async dxRetention(kind: 'passenger' | 'driver') {
    const idCol = kind === 'driver' ? Prisma.sql`r."assignedDriverId"` : Prisma.sql`r."passengerId"`;
    const r2id = kind === 'driver' ? Prisma.sql`r2."assignedDriverId"` : Prisma.sql`r2."passengerId"`;
    const rows = await this.prisma.$queryRaw<Array<{ d1: number; d7: number; d30: number; react: number }>>`
      WITH first AS (
        SELECT ${idCol} AS id, MIN(r."createdAt") AS first_at
        FROM "Ride" r
        WHERE ${idCol} IS NOT NULL AND r."status" = 'COMPLETED'
        GROUP BY 1
      )
      SELECT
        ROUND(100.0 * AVG(CASE WHEN EXISTS (
          SELECT 1 FROM "Ride" r2 WHERE ${r2id} = first.id
            AND r2."createdAt" >= first.first_at + INTERVAL '1 day'
            AND r2."createdAt" < first.first_at + INTERVAL '2 day'
        ) THEN 1 ELSE 0 END), 1) AS d1,
        ROUND(100.0 * AVG(CASE WHEN EXISTS (
          SELECT 1 FROM "Ride" r2 WHERE ${r2id} = first.id
            AND r2."createdAt" >= first.first_at + INTERVAL '7 day'
            AND r2."createdAt" < first.first_at + INTERVAL '8 day'
        ) THEN 1 ELSE 0 END), 1) AS d7,
        ROUND(100.0 * AVG(CASE WHEN EXISTS (
          SELECT 1 FROM "Ride" r2 WHERE ${r2id} = first.id
            AND r2."createdAt" >= first.first_at + INTERVAL '30 day'
            AND r2."createdAt" < first.first_at + INTERVAL '31 day'
        ) THEN 1 ELSE 0 END), 1) AS d30,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Ride" r2 WHERE ${r2id} = first.id
            AND r2."createdAt" >= first.first_at + INTERVAL '30 day'
        ))::int AS react
      FROM first
    `;
    return {
      d1: asNum(rows[0]?.d1),
      d7: asNum(rows[0]?.d7),
      d30: asNum(rows[0]?.d30),
      reactivation: rows[0]?.react ?? 0,
    };
  }

  private async funnelSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const cur = await this.periodStats(q, resolved.current.start, resolved.current.end);
    return {
      demo: false,
      empty: cur.requests === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      funnel: this.funnelFromCounts(cur),
      marketplaceNote:
        'CAN-GO is a bid marketplace: Driver Search counts rides that received or awaited offers; Driver Accepted maps to a selected offer.',
    };
  }

  private async operationsSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const [heatmap, live, byHour, zones] = await Promise.all([
      this.hourDayHeatmap(q, resolved),
      this.liveNow(),
      this.countByHour(q, resolved),
      this.zoneTable(q, resolved),
    ]);
    const extra = rideFilterSql(q);
    const supplyHour = await this.prisma.$queryRaw<Array<{ hour: number; drivers: number }>>`
      SELECT EXTRACT(HOUR FROM r."createdAt" AT TIME ZONE ${pgTz(resolved.timezone)})::int AS hour,
             COUNT(DISTINCT r."assignedDriverId")::int AS drivers
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."assignedDriverId" IS NOT NULL AND ${extra}
      GROUP BY 1
    `;
    const critical = byHour
      .map((h) => {
        const drivers = supplyHour.find((s) => s.hour === h.hour)?.drivers ?? 0;
        const ratio = demandSupplyRatio(h.value, drivers);
        return {
          hour: h.hour,
          requests: h.value,
          drivers,
          ratio,
          shortage: ratio >= 1.8 && h.value >= 3,
          excess: drivers > 0 && h.value > 0 && ratio < 0.4,
        };
      })
      .filter((x) => x.shortage || x.excess);
    return {
      demo: false,
      empty: byHour.every((h) => h.value === 0),
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      live,
      heatmap,
      demandVsSupplyByHour: byHour.map((h) => ({
        hour: h.hour,
        demand: h.value,
        supply: supplyHour.find((s) => s.hour === h.hour)?.drivers ?? 0,
        ratio: demandSupplyRatio(
          h.value,
          supplyHour.find((s) => s.hour === h.hour)?.drivers ?? 0,
        ),
      })),
      zones: zones.map((z) => ({
        zone: z.zone,
        demand: Number(z.requests),
        supply: Number(z.drivers),
        ratio: demandSupplyRatio(Number(z.requests), Number(z.drivers)),
        unfulfilled: Math.max(0, Number(z.requests) - Number(z.completed)),
      })),
      critical: critical.map((c) => ({
        label: `${String(c.hour).padStart(2, '0')}:00–${String((c.hour + 1) % 24).padStart(2, '0')}:00`,
        ...c,
        message: c.shortage
          ? `Driver shortage detected (${c.ratio}× demand/supply).`
          : `Excess driver supply (${c.ratio}×).`,
      })),
    };
  }

  private async hourDayHeatmap(q: AnalyticsQuery, resolved: ResolvedRange) {
    const tz = pgTz(resolved.timezone);
    const extra = rideFilterSql(q);
    const rows = await this.prisma.$queryRaw<
      Array<{ dow: number; hour: number; requests: number; revenue: number; cancels: number; drivers: number }>
    >`
      SELECT
        EXTRACT(DOW FROM r."createdAt" AT TIME ZONE ${tz})::int AS dow,
        EXTRACT(HOUR FROM r."createdAt" AT TIME ZONE ${tz})::int AS hour,
        COUNT(*)::int AS requests,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'passengerTotal')::numeric, 0)) FILTER (WHERE r."status" = 'COMPLETED'), 0) AS revenue,
        COUNT(*) FILTER (WHERE r."status" IN ('PASSENGER_CANCELLED','DRIVER_CANCELLED','ADMIN_CANCELLED','EXPIRED','NO_SHOW'))::int AS cancels,
        COUNT(DISTINCT r."assignedDriverId")::int AS drivers
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND ${extra}
      GROUP BY 1, 2
    `;
    const cells = rows.map((r) => ({
      dow: Number(r.dow),
      hour: Number(r.hour),
      requests: Number(r.requests),
      revenue: round2(asNum(r.revenue)),
      supply: Number(r.drivers),
      cancelPct: pct(Number(r.cancels), Number(r.requests)),
      eta: 0,
    }));
    return { cells, metrics: ['requests', 'revenue', 'supply', 'cancelPct', 'eta'] };
  }

  private async forecastSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const series = await this.dailySeries(q, resolved);
    const horizon = q.forecastHorizon;
    const demand = linearForecast(
      series.map((s) => s.rides),
      horizon,
    );
    const revenue = linearForecast(
      series.map((s) => s.gmv),
      horizon,
    );
    const cancels = linearForecast(
      series.map((s) => Math.max(0, s.rides - s.completed)),
      horizon,
    );
    const supply = linearForecast(
      series.map((s) => Math.max(1, Math.round(s.completed * 1.1))),
      horizon,
    );
    return {
      demo: false,
      empty: series.every((s) => s.rides === 0),
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      method: demand.method,
      estimated: true,
      disclaimer:
        'Statistical estimate using linear regression on the selected period — not a trained ML model.',
      horizon,
      dates: series.map((s) => s.date),
      demand,
      revenue,
      requiredSupply: supply,
      cancellations: cancels,
    };
  }

  private async promotionsSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const promos = await this.prisma.promoCode.findMany();
    const extra = rideFilterSql(q);
    const usage = await this.prisma.$queryRaw<
      Array<{
        code: string;
        redeemed: number;
        discount: number;
        rides: number;
        new_users: number;
        revenue: number;
      }>
    >`
      SELECT
        r."promoCode" AS code,
        COUNT(*)::int AS redeemed,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'promoDiscount')::numeric, 0)), 0) AS discount,
        COUNT(*) FILTER (WHERE r."status" = 'COMPLETED')::int AS rides,
        COUNT(DISTINCT r."passengerId")::int AS new_users,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'passengerTotal')::numeric, 0)) FILTER (WHERE r."status" = 'COMPLETED'), 0) AS revenue
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND r."promoCode" IS NOT NULL AND ${extra}
      GROUP BY 1
    `;
    const campaigns = promos.map((p) => {
      const u = usage.find((x) => x.code === p.code);
      const issued = p.maxUses ?? p.usedCount ?? 0;
      const redeemed = u?.redeemed ?? p.usedCount;
      return {
        code: p.code,
        issued: issued || p.usedCount,
        redeemed,
        redemptionRate: pct(redeemed, Math.max(1, issued || redeemed)),
        discountCost: round2(asNum(u?.discount)),
        ridesGenerated: u?.rides ?? 0,
        newUsers: u?.new_users ?? 0,
        revenue: round2(asNum(u?.revenue)),
        cpa: u?.new_users ? round2(asNum(u.discount) / Number(u.new_users)) : 0,
        repeatRate: 0,
        active: p.active,
      };
    });
    return {
      demo: false,
      empty: promos.length === 0 && usage.length === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      campaigns,
      totals: {
        issued: campaigns.reduce((s, c) => s + c.issued, 0),
        redeemed: campaigns.reduce((s, c) => s + c.redeemed, 0),
        discountCost: round2(campaigns.reduce((s, c) => s + c.discountCost, 0)),
        ridesGenerated: campaigns.reduce((s, c) => s + c.ridesGenerated, 0),
      },
    };
  }

  private async ratingsSection(q: AnalyticsQuery, resolved: ResolvedRange) {
    const where = { createdAt: { gte: resolved.current.start, lt: resolved.current.end } };
    const [agg, dist, complaints, lowest, trend] = await Promise.all([
      this.prisma.rating.aggregate({ where, _avg: { stars: true }, _count: { _all: true } }),
      this.ratingStars(resolved, 'driver'),
      this.prisma.supportCase.count({
        where: { createdAt: { gte: resolved.current.start, lt: resolved.current.end } },
      }),
      this.lowestRatedDrivers(resolved),
      this.ratingTrend(resolved),
    ]);
    const five = dist.find((d) => d.stars === 5)?.value ?? 0;
    const one = dist.find((d) => d.stars === 1)?.value ?? 0;
    const n = agg._count._all || 1;
    return {
      demo: false,
      empty: agg._count._all === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      kpis: {
        avgDriverRating: round1(asNum(agg._avg.stars)),
        avgPassengerRating: round1(asNum(agg._avg.stars)),
        fiveStarPct: pct(five, n),
        oneStarPct: pct(one, n),
        complaints,
        supportCases: complaints,
      },
      distribution: dist,
      trend,
      lowestRated: lowest,
      mostImproved: await this.improvedDrivers(resolved),
    };
  }

  private async ratingTrend(resolved: ResolvedRange) {
    const tz = pgTz(resolved.timezone);
    const rows = await this.prisma.$queryRaw<Array<{ date: Date; avg: number }>>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE ${tz}) AS date, AVG(stars)::numeric AS avg
      FROM "Rating"
      WHERE "createdAt" >= ${resolved.current.start} AND "createdAt" < ${resolved.current.end}
      GROUP BY 1 ORDER BY 1
    `;
    return rows.map((r) => ({ date: isoBucket(r.date, 'day'), avg: round1(asNum(r.avg)) }));
  }

  private async lowestRatedDrivers(resolved: ResolvedRange) {
    return this.prisma.$queryRaw<
      Array<{ user_id: string; name: string; avg: number; n: number }>
    >`
      SELECT u.id AS user_id, COALESCE(d."fullName", u.email, u."phoneE164") AS name,
             AVG(rt.stars) AS avg, COUNT(*)::int AS n
      FROM "Rating" rt
      JOIN "User" u ON u.id = rt."toUserId"
      LEFT JOIN "DriverProfile" d ON d."userId" = u.id
      WHERE rt."createdAt" >= ${resolved.current.start} AND rt."createdAt" < ${resolved.current.end}
        AND u.role = 'DRIVER'
      GROUP BY u.id, d."fullName", u.email, u."phoneE164"
      HAVING COUNT(*) >= 2
      ORDER BY avg ASC
      LIMIT 12
    `;
  }

  private async improvedDrivers(resolved: ResolvedRange) {
    return this.prisma.$queryRaw<Array<{ user_id: string; name: string; delta: number }>>`
      SELECT u.id AS user_id, COALESCE(d."fullName", 'Driver') AS name,
             AVG(rt.stars) FILTER (WHERE rt."createdAt" >= ${resolved.current.start}) -
             AVG(rt.stars) FILTER (WHERE rt."createdAt" < ${resolved.current.start}) AS delta
      FROM "Rating" rt
      JOIN "User" u ON u.id = rt."toUserId"
      LEFT JOIN "DriverProfile" d ON d."userId" = u.id
      WHERE u.role = 'DRIVER'
      GROUP BY u.id, d."fullName"
      HAVING COUNT(*) FILTER (WHERE rt."createdAt" >= ${resolved.current.start}) >= 2
      ORDER BY delta DESC NULLS LAST
      LIMIT 8
    `;
  }

  private async safetySection(q: AnalyticsQuery, resolved: ResolvedRange, perms: string[]) {
    if (!this.canSafety(perms)) {
      return { denied: true, message: 'Missing analytics.safety permission.' };
    }
    const start = resolved.current.start;
    const end = resolved.current.end;
    const [sos, reports, driverComplaints, paxComplaints, suspensions, fraud, trend] =
      await Promise.all([
        this.prisma.supportCase.count({
          where: { type: 'SAFETY', createdAt: { gte: start, lt: end } },
        }),
        this.prisma.supportCase.count({
          where: { createdAt: { gte: start, lt: end } },
        }),
        this.prisma.supportCase.count({
          where: { createdAt: { gte: start, lt: end }, driverProfileId: { not: null } },
        }),
        this.prisma.supportCase.count({
          where: { createdAt: { gte: start, lt: end }, passengerProfileId: { not: null } },
        }),
        this.prisma.user.count({
          where: { isSuspended: true, updatedAt: { gte: start, lt: end } },
        }),
        this.prisma.riskFlag.count({
          where: { createdAt: { gte: start, lt: end } },
        }),
        this.prisma.$queryRaw<Array<{ date: Date; n: number }>>`
          SELECT date_trunc('day', "createdAt" AT TIME ZONE ${pgTz(resolved.timezone)}) AS date, COUNT(*)::int AS n
          FROM "SupportCase"
          WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
          GROUP BY 1 ORDER BY 1
        `,
      ]);
    return {
      demo: false,
      empty: reports === 0 && fraud === 0,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      kpis: {
        sosEvents: sos,
        safetyReports: sos,
        reportedTrips: reports,
        driverComplaints,
        passengerComplaints: paxComplaints,
        suspiciousActivity: fraud,
        accountSuspensions: suspensions,
        fraudFlags: fraud,
      },
      trend: trend.map((t) => ({ date: isoBucket(t.date, 'day'), cases: Number(t.n) })),
      note: 'Counts only — case details and identities are hidden on this dashboard.',
    };
  }

  async drilldown(
    q: AnalyticsQuery,
    metric: string,
    page = 1,
    pageSize = 25,
    sort = 'createdAt',
    dir: 'asc' | 'desc' = 'desc',
  ) {
    const resolved = this.resolve(q);
    const start = resolved.current.start;
    const end = resolved.current.end;
    let where = rideWhere(start, end, q);
    if (metric === 'completed' || metric.endsWith(':completed')) {
      where = { ...where, status: RideStatus.COMPLETED };
    } else if (metric.includes('cancel')) {
      where = { ...where, status: { in: CANCELLED } };
    } else if (metric.includes('failed')) {
      where = { ...where, status: { in: FAILED_EXPIRED } };
    }
    const take = Math.min(100, Math.max(10, pageSize));
    const skip = (Math.max(1, page) - 1) * take;
    const order = sort === 'fare' ? { createdAt: dir } : { createdAt: dir };
    const [rows, total] = await Promise.all([
      this.prisma.ride.findMany({
        where,
        orderBy: order,
        take,
        skip,
        select: {
          id: true,
          status: true,
          fromLabel: true,
          toLabel: true,
          serviceType: true,
          createdAt: true,
          updatedAt: true,
          promoCode: true,
          currency: true,
          priceSnapshot: true,
          assignedDriverId: true,
          passenger: { select: { fullName: true, userId: true } },
          events: {
            where: { toStatus: { in: CANCELLED } },
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { payload: true, createdAt: true },
          },
        },
      }),
      this.prisma.ride.count({ where }),
    ]);
    const driverIds = rows.map((r) => r.assignedDriverId).filter(Boolean) as string[];
    const drivers = driverIds.length
      ? await this.prisma.driverProfile.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, fullName: true, userId: true },
        })
      : [];
    return {
      total,
      page,
      pageSize: take,
      rows: rows.map((r) => {
        const d = drivers.find((x) => x.id === r.assignedDriverId);
        const ev = r.events[0];
        const payload = (ev?.payload ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          publicCode: ridePublicCode(r.id),
          passenger: r.passenger.fullName,
          passengerUserId: r.passenger.userId,
          driver: d?.fullName ?? '—',
          driverUserId: d?.userId,
          pickup: r.fromLabel,
          destination: r.toLabel,
          zone: r.fromLabel.split(',')[0],
          fare: round2(
            snapField(r.priceSnapshot, 'passengerTotal') || snapField(r.priceSnapshot, 'bidAmount'),
          ),
          currency: r.currency,
          status: r.status,
          cancellationReason: String(payload.reason ?? ''),
          requestedAt: r.createdAt,
          cancelledAt: ev?.createdAt ?? null,
        };
      }),
    };
  }

  async exportReport(q: AnalyticsQuery, section: string, format: string, perms: string[]) {
    const data = (await this.section(section === 'overview' ? 'overview' : section, q, perms)) as Record<
      string,
      unknown
    >;
    const generatedAt = new Date().toISOString();
    const resolved = this.resolve(q);
    const lines: string[][] = [
      ['Can-Go Analytics Report', section],
      ['Generated at', generatedAt],
      ['Period', resolved.currentLabel],
      ['Timezone', resolved.timezone],
      ['Filters', JSON.stringify({ city: q.city, zone: q.zone, serviceType: q.serviceType, promo: q.promo })],
      [],
    ];
    const kpis = (data as { kpis?: unknown }).kpis;
    if (Array.isArray(kpis)) {
      lines.push(['Metric', 'Value', 'Previous', 'Change %']);
      for (const k of kpis as KpiCard[]) {
        lines.push([k.label, String(k.value), String(k.previous), String(k.changePct ?? '')]);
      }
    } else if (kpis && typeof kpis === 'object') {
      lines.push(['Metric', 'Value']);
      for (const [k, v] of Object.entries(kpis as Record<string, unknown>)) {
        if (typeof v !== 'object') lines.push([k, String(v)]);
      }
    }
    if (format === 'xlsx') {
      return { filename: `cango-analytics-${section}.xls`, mime: 'application/vnd.ms-excel', body: toSpreadsheet(lines) };
    }
    return { filename: `cango-analytics-${section}.csv`, mime: 'text/csv', body: toCsv(lines) };
  }

  async customReport(
    q: AnalyticsQuery,
    body: { metrics: string[]; dimension: string; chartType?: string },
  ) {
    const resolved = this.resolve(q);
    const extra = rideFilterSql(q);
    const tz = pgTz(resolved.timezone);
    const dim = body.dimension;
    const selectDim =
      dim === 'hour'
        ? Prisma.sql`EXTRACT(HOUR FROM r."createdAt" AT TIME ZONE ${tz})::int::text`
        : dim === 'zone'
          ? Prisma.sql`COALESCE(NULLIF(split_part(r."fromLabel", ',', 1), ''), 'Unspecified')`
          : dim === 'vehicleType'
            ? Prisma.sql`COALESCE(NULLIF(r."vehicleClassIds"[1], ''), r."serviceType")`
            : dim === 'paymentMethod'
              ? Prisma.sql`COALESCE((SELECT p.provider FROM "Payment" p WHERE p."rideId" = r.id LIMIT 1), 'unknown')`
              : dim === 'rideStatus'
                ? Prisma.sql`r."status"::text`
                : dim === 'driver'
                  ? Prisma.sql`COALESCE(r."assignedDriverId", 'unassigned')`
                  : dim === 'passenger'
                    ? Prisma.sql`r."passengerId"`
                    : Prisma.sql`to_char(date_trunc('day', r."createdAt" AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
    const rows = await this.prisma.$queryRaw<
      Array<{ dim: string; rides: number; revenue: number; cancelled: number }>
    >`
      SELECT ${selectDim} AS dim,
        COUNT(*)::int AS rides,
        COALESCE(SUM(COALESCE((r."priceSnapshot"->>'passengerTotal')::numeric, 0)) FILTER (WHERE r."status" = 'COMPLETED'), 0) AS revenue,
        COUNT(*) FILTER (WHERE r."status" IN ('PASSENGER_CANCELLED','DRIVER_CANCELLED','ADMIN_CANCELLED','EXPIRED','NO_SHOW'))::int AS cancelled
      FROM "Ride" r
      WHERE r."createdAt" >= ${resolved.current.start} AND r."createdAt" < ${resolved.current.end}
        AND ${extra}
      GROUP BY 1
      ORDER BY rides DESC
      LIMIT 50
    `;
    return {
      dimension: dim,
      chartType: body.chartType ?? 'bar',
      metrics: body.metrics,
      rows: rows.map((r) => ({
        dimension: String(r.dim),
        rides: Number(r.rides),
        revenue: round2(asNum(r.revenue)),
        cancellations: Number(r.cancelled),
      })),
    };
  }

  async listViews(adminId: string, kind?: string) {
    return this.prisma.analyticsSavedView.findMany({
      where: { adminId, ...(kind ? { kind } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async saveView(adminId: string, name: string, kind: string, query: unknown) {
    return this.prisma.analyticsSavedView.create({
      data: { adminId, name, kind: kind || 'filter', query: query as Prisma.InputJsonValue },
    });
  }

  async deleteView(adminId: string, id: string) {
    await this.prisma.analyticsSavedView.deleteMany({ where: { id, adminId } });
    return { ok: true };
  }

  private demoOverview(resolved: ResolvedRange, q: AnalyticsQuery) {
    const days = iterateDays(resolved.current.start, resolved.current.end, resolved.timezone);
    const trend = days.map((date, i) => {
      const v = seeded(date, 40, 90);
      return {
        date,
        rides: Math.round(v),
        completed: Math.round(v * 0.82),
        gmv: round2(v * 18),
        net: round2(v * 2.6),
      };
    });
    const spark = trend.map((t) => t.gmv);
    const mk = (key: string, label: string, value: number, unit: KpiCard['unit'], drill: string): KpiCard =>
      this.kpi(key, label, value, round2(value * 0.89), spark, unit, '', drill);
    return {
      demo: true,
      empty: false,
      emptyMessage: null,
      currency: 'USD',
      timezone: resolved.timezone,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
      kpis: {
        business: [
          mk('grossBookings', 'Gross Bookings', 148420, 'currency', 'revenue'),
          mk('netRevenue', 'Net Revenue', 21480, 'currency', 'revenue'),
          mk('completed', 'Completed Rides', 4820, 'count', 'rides:completed'),
          mk('requests', 'Total Ride Requests', 5610, 'count', 'rides'),
          mk('avgFare', 'Average Fare', 30.8, 'currency', 'revenue'),
          mk('revPerRide', 'Revenue per Ride', 4.46, 'currency', 'revenue'),
          mk('commission', 'Platform Commission', 22810, 'currency', 'revenue'),
          mk('refunds', 'Refund Amount', 1330, 'currency', 'payments'),
        ],
        growth: [
          mk('passengers', 'Total Passengers', 12840, 'count', 'passengers'),
          mk('newPax', 'New Passengers', 640, 'count', 'passengers'),
          mk('activePax', 'Active Passengers', 3920, 'count', 'passengers'),
          mk('returningPax', 'Returning Passengers', 2710, 'count', 'passengers'),
          mk('drivers', 'Total Drivers', 860, 'count', 'drivers'),
          mk('activeDrv', 'Active Drivers', 310, 'count', 'drivers'),
          mk('newDrv', 'New Drivers', 28, 'count', 'drivers'),
        ],
        operations: [
          mk('completion', 'Ride Completion Rate', 85.9, 'percent', 'funnel'),
          mk('acceptance', 'Acceptance Rate', 91.2, 'percent', 'drivers'),
          mk('drvCancel', 'Driver Cancellation Rate', 4.1, 'percent', 'cancellations'),
          mk('paxCancel', 'Passenger Cancellation Rate', 8.8, 'percent', 'cancellations'),
          mk('eta', 'Average ETA', 6.4, 'duration', 'operations'),
          mk('pickup', 'Average Pickup Time', 3.1, 'duration', 'operations'),
          mk('duration', 'Average Trip Duration', 22.4, 'duration', 'rides'),
          mk('distance', 'Average Trip Distance', 8.6, 'distance', 'rides'),
        ],
      },
      trend,
      funnel: {
        steps: [
          { key: 'requested', label: 'Ride Requested', value: 5610 },
          { key: 'search', label: 'Driver Search', value: 5400 },
          { key: 'accepted', label: 'Driver Accepted', value: 5120 },
          { key: 'arrived', label: 'Driver Arrived', value: 4980 },
          { key: 'started', label: 'Trip Started', value: 4900 },
          { key: 'completed', label: 'Trip Completed', value: 4820 },
        ],
        edges: funnelEdges([
          { key: 'requested', label: 'Ride Requested', value: 5610 },
          { key: 'search', label: 'Driver Search', value: 5400 },
          { key: 'accepted', label: 'Driver Accepted', value: 5120 },
          { key: 'arrived', label: 'Driver Arrived', value: 4980 },
          { key: 'started', label: 'Trip Started', value: 4900 },
          { key: 'completed', label: 'Trip Completed', value: 4820 },
        ]),
      },
      insights: [
        { severity: 'positive', text: 'Ride demand increased 12.8% compared with the previous period.' },
        { severity: 'warning', text: 'Downtown cancellation rate is above the platform average.' },
        { severity: 'info', text: 'Figures below are labeled Demo Data and are not production metrics.' },
      ],
      live: {
        onlineDrivers: 42,
        availableDrivers: 18,
        driversOnTrip: 24,
        activeTrips: 24,
        passengersSearching: 6,
        unmatchedRequests: 3,
        demandSupplyRatio: 1.4,
        shortage: false,
        todayRevenue: 4820,
        todayCompleted: 186,
        todayCancellationRate: 7.2,
      },
      definitions: METRIC_DEFINITIONS,
    };
  }

  private async demoSection(section: string, resolved: ResolvedRange, q: AnalyticsQuery) {
    const overview = this.demoOverview(resolved, q);
    if (section === 'overview') return overview;
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      value: Math.round(seeded(`h${hour}`, 4, 40)),
    }));
    const base = {
      demo: true,
      empty: false,
      range: this.rangeMeta(resolved, q),
      lastUpdated: new Date().toISOString(),
    };
    if (section === 'forecast') {
      const demand = linearForecast(overview.trend.map((t) => t.rides), q.forecastHorizon);
      return {
        ...base,
        method: demand.method,
        estimated: true,
        disclaimer: 'Statistical estimate on demo series — not a trained ML model.',
        horizon: q.forecastHorizon,
        dates: overview.trend.map((t) => t.date),
        demand,
        revenue: linearForecast(overview.trend.map((t) => t.gmv), q.forecastHorizon),
        requiredSupply: linearForecast(overview.trend.map((t) => t.completed), q.forecastHorizon),
        cancellations: linearForecast(overview.trend.map((t) => Math.round(t.rides * 0.12)), q.forecastHorizon),
      };
    }
    return { ...base, ...overview, byHour: hours, kpis: overview.kpis };
  }
}

function isoBucket(bucket: Date | string, trunc: string) {
  const d = bucket instanceof Date ? bucket : new Date(bucket);
  if (Number.isNaN(d.getTime())) return String(bucket);
  if (trunc === 'hour') return d.toISOString().slice(0, 13);
  if (trunc === 'month') return d.toISOString().slice(0, 7);
  return d.toISOString().slice(0, 10);
}

function formatPrevYear(resolved: ResolvedRange) {
  return resolved.previousYear.start.toISOString().slice(0, 10);
}

function seeded(seed: string, min: number, max: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const u = (h >>> 0) / 2 ** 32;
  return min + u * (max - min);
}

function toCsv(rows: string[][]) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

function toSpreadsheet(rows: string[][]) {
  const cells = rows
    .map(
      (r, i) =>
        `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${escapeXml(c)}</Data></Cell>`).join('')}</Row>`,
    )
    .join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Analytics"><Table>${cells}</Table></Worksheet>
</Workbook>`;
}

function escapeXml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
