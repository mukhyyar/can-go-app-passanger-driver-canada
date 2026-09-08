import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DriverApprovalStatus,
  Prisma,
  RideStatus,
  SupportCaseStatus,
  SupportCaseType,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { TokensService } from '../auth/tokens.service';
import { PAYMENT_PROVIDER } from '../providers/payment/payment-provider.interface';
import type { PaymentProvider } from '../providers/payment/payment-provider.interface';
import { SMS_PROVIDER } from '../providers/sms/sms-provider.interface';
import type { SmsProvider } from '../providers/sms/sms-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { LaunchGateService } from '../providers/launch-gate.service';
import { FirebaseService } from '../firebase/firebase.service';
import {
  asNum,
  rangeStart,
  ridePublicCode,
  snapField,
  startOfUtcDay,
  writeAudit,
} from './admin.util';

const ACTIVE_TRIP: RideStatus[] = [
  RideStatus.BOOKED,
  RideStatus.DRIVER_EN_ROUTE,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.TRIP_STARTED,
  RideStatus.IN_PROGRESS,
];
const OPEN_REQ: RideStatus[] = [
  RideStatus.WAITING_FOR_OFFERS,
  RideStatus.OFFER_SELECTION,
];
const CANCELLED: RideStatus[] = [
  RideStatus.PASSENGER_CANCELLED,
  RideStatus.DRIVER_CANCELLED,
  RideStatus.ADMIN_CANCELLED,
];
const UNFULFILLED: RideStatus[] = [RideStatus.EXPIRED, RideStatus.NO_SHOW];
const CANCELLED_OR_UNFULFILLED: RideStatus[] = [...CANCELLED, ...UNFULFILLED];

/** City-center fallback so pending-KYC / unregistered vehicles still plot. */
function fallbackCoord(id: string, baseLat?: number | null, baseLng?: number | null) {
  if (typeof baseLat === 'number' && typeof baseLng === 'number') {
    return { lat: baseLat, lng: baseLng };
  }
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return {
    lat: 24.8607 + ((h % 180) - 90) / 380,
    lng: 67.0011 + (((h >> 8) % 180) - 90) / 380,
  };
}

@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly launchGate: LaunchGateService,
    private readonly firebase: FirebaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  private async audit(
    actorId: string | undefined,
    action: string,
    resource?: string,
    resourceId?: string,
    extra?: {
      ip?: string;
      reason?: string;
      before?: unknown;
      after?: unknown;
      meta?: Record<string, unknown>;
      device?: string;
    },
  ) {
    await writeAudit(this.prisma, {
      actorId,
      action,
      resource,
      resourceId,
      ip: extra?.ip,
      reason: extra?.reason,
      before: extra?.before,
      after: extra?.after,
      meta: extra?.meta,
      device: extra?.device,
    });
  }

  // ---------- Dashboard ----------

  async dashboardKpis(range = '30d', from?: string, to?: string) {
    const { start, end } = rangeStart(range, from, to);
    const today = startOfUtcDay();
    const d7 = new Date(today);
    d7.setUTCDate(d7.getUTCDate() - 7);
    const d30 = new Date(today);
    d30.setUTCDate(d30.getUTCDate() - 30);
    const onlineSince = new Date(Date.now() - 5 * 60_000);

    const [
      totalUsers,
      newToday,
      new7,
      new30,
      passengers,
      drivers,
      onlineDrivers,
      suspended,
      pendingKyc,
      requestsToday,
      openRequests,
      bidsInRange,
      ridesInRange,
      completed,
      cancelled,
      adminCancelled,
      inProgress,
      accepted,
      failedPay,
      paymentsOk,
      refundSum,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { createdAt: { gte: d7 } } }),
      this.prisma.user.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.user.count({ where: { role: UserRole.PASSENGER } }),
      this.prisma.user.count({ where: { role: UserRole.DRIVER } }),
      this.prisma.driverLocationCurrent.count({
        where: { recordedAt: { gte: onlineSince } },
      }),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.prisma.driverProfile.count({
        where: {
          approvalStatus: {
            in: [
              DriverApprovalStatus.PENDING_KYC,
              DriverApprovalStatus.IN_REVIEW,
              DriverApprovalStatus.ACTION_REQUIRED,
            ],
          },
        },
      }),
      this.prisma.ride.count({ where: { createdAt: { gte: today } } }),
      this.prisma.ride.count({ where: { status: { in: OPEN_REQ } } }),
      this.prisma.offer.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.prisma.ride.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: {
          id: true,
          status: true,
          createdAt: true,
          priceSnapshot: true,
          _count: { select: { offers: true } },
        },
      }),
      this.prisma.ride.count({
        where: { status: RideStatus.COMPLETED, updatedAt: { gte: start, lte: end } },
      }),
      this.prisma.ride.count({
        where: { status: { in: CANCELLED }, updatedAt: { gte: start, lte: end } },
      }),
      this.prisma.ride.count({
        where: { status: RideStatus.ADMIN_CANCELLED },
      }),
      this.prisma.ride.count({ where: { status: { in: ACTIVE_TRIP } } }),
      this.prisma.ride.count({
        where: {
          selectedOfferId: { not: null },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.payment.count({
        where: { status: { in: ['failed', 'FAILED'] } },
      }),
      this.prisma.payment.findMany({
        where: {
          status: { in: ['succeeded', 'SUCCEEDED', 'captured'] },
          createdAt: { gte: start, lte: end },
        },
        select: { amount: true, createdAt: true, ride: { select: { priceSnapshot: true } } },
      }),
      this.prisma.refund.aggregate({
        _sum: { amount: true },
        where: { status: 'succeeded', createdAt: { gte: start, lte: end } },
      }),
    ]);

    const gmv = paymentsOk.reduce((s, p) => s + asNum(p.amount), 0);
    const commission = paymentsOk.reduce(
      (s, p) => s + snapField(p.ride?.priceSnapshot, 'platformFee'),
      0,
    );
    const tax = paymentsOk.reduce(
      (s, p) => s + snapField(p.ride?.priceSnapshot, 'tax'),
      0,
    );
    const driverShare = paymentsOk.reduce(
      (s, p) => s + snapField(p.ride?.priceSnapshot, 'driverEarning'),
      0,
    );
    const refunds = asNum(refundSum._sum.amount);
    const avgBids =
      ridesInRange.length === 0
        ? 0
        : ridesInRange.reduce((s, r) => s + r._count.offers, 0) /
          ridesInRange.length;
    const denom = completed + cancelled || 1;

    const slaBreached = await this.prisma.supportCase.count({
      where: {
        status: { not: SupportCaseStatus.RESOLVED },
        slaDueAt: { lt: new Date() },
      },
    });
    const vipPending = await this.prisma.passengerProfile.count({
      where: { isVip: false, vipRequestedAt: { not: null } },
    });
    const ratingsReview = await this.prisma.rating.count({
      where: { moderationStatus: 'PENDING_REVIEW' },
    });

    return {
      range: { start, end },
      users: {
        total: totalUsers,
        newToday,
        new7d: new7,
        new30d: new30,
        activePassengers: passengers,
        activeDrivers: drivers,
        onlineDrivers,
        suspended,
        pendingKyc,
      },
      marketplace: {
        rideRequestsToday: requestsToday,
        openRequests,
        bidsReceived: bidsInRange,
        averageBidsPerRide: Math.round(avgBids * 100) / 100,
        acceptedRides: accepted,
        inProgress,
        completed,
        cancelled,
        adminCancelled,
        completionRate: Math.round((completed / denom) * 1000) / 10,
        cancellationRate: Math.round((cancelled / denom) * 1000) / 10,
      },
      revenue: {
        gmv: Math.round(gmv * 100) / 100,
        platformRevenue: Math.round(commission * 100) / 100,
        commissionRevenue: Math.round(commission * 100) / 100,
        taxes: Math.round(tax * 100) / 100,
        driverShare: Math.round(driverShare * 100) / 100,
        refunds: Math.round(refunds * 100) / 100,
        failedPayments: failedPay,
        averageRideValue:
          paymentsOk.length === 0
            ? 0
            : Math.round((gmv / paymentsOk.length) * 100) / 100,
        netRevenue: Math.round((commission - refunds) * 100) / 100,
      },
      live: {
        inProgress,
        openRequests,
        onlineDrivers,
        failedPayments: failedPay,
        pendingKyc,
        slaBreached,
        vipPending,
        ratingsReview,
      },
    };
  }

  async dashboardSeries(metric: string, range = '30d', from?: string, to?: string) {
    const { start, end } = rangeStart(range, from, to);
    const rides = await this.prisma.ride.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        status: true,
        serviceType: true,
        createdAt: true,
        fromLat: true,
        fromLng: true,
        selectedOfferId: true,
        priceSnapshot: true,
        offers: { select: { createdAt: true, bidAmount: true, status: true } },
        payments: { select: { status: true, amount: true, createdAt: true } },
        events: { select: { toStatus: true, createdAt: true, payload: true } },
      },
    });
    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, role: true },
    });
    const docs = await this.prisma.driverDocument.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { status: true },
    });

    const bucket = (d: Date) => d.toISOString().slice(0, 10);
    const days: Record<string, { rides: number; gmv: number; pax: number; drv: number; paid: number; fail: number }> = {};
    const walk = new Date(start);
    while (walk <= end) {
      days[walk.toISOString().slice(0, 10)] = {
        rides: 0,
        gmv: 0,
        pax: 0,
        drv: 0,
        paid: 0,
        fail: 0,
      };
      walk.setUTCDate(walk.getUTCDate() + 1);
    }
    for (const r of rides) {
      const k = bucket(r.createdAt);
      if (!days[k]) continue;
      days[k].rides += 1;
      for (const p of r.payments) {
        if (/succeed|captur/i.test(p.status)) {
          days[k].gmv += asNum(p.amount);
          days[k].paid += 1;
        } else if (/fail/i.test(p.status)) days[k].fail += 1;
      }
    }
    for (const u of users) {
      const k = bucket(u.createdAt);
      if (!days[k]) continue;
      if (u.role === UserRole.PASSENGER) days[k].pax += 1;
      if (u.role === UserRole.DRIVER) days[k].drv += 1;
    }

    const funnel = {
      requested: rides.length,
      withBids: rides.filter((r) => r.offers.length > 0).length,
      accepted: rides.filter((r) => r.selectedOfferId).length,
      paid: rides.filter((r) =>
        r.payments.some((p) => /succeed|captur/i.test(p.status)),
      ).length,
      started: rides.filter((r) =>
        r.events.some((e) =>
          e.toStatus === RideStatus.TRIP_STARTED ||
          e.toStatus === RideStatus.IN_PROGRESS,
        ),
      ).length,
      completed: rides.filter((r) => r.status === RideStatus.COMPLETED).length,
    };

    const serviceType: Record<string, number> = {};
    for (const r of rides) {
      serviceType[r.serviceType] = (serviceType[r.serviceType] ?? 0) + 1;
    }
    const cancelReasons: Record<string, number> = {};
    for (const r of rides) {
      if (!CANCELLED.includes(r.status)) continue;
      const ev = r.events.find((e) => CANCELLED.includes(e.toStatus));
      const payload = ev?.payload as Record<string, unknown> | null;
      const reason = String(payload?.reason ?? r.status ?? 'Unspecified');
      cancelReasons[reason] = (cancelReasons[reason] ?? 0) + 1;
    }

    let bidSum = 0;
    let bidN = 0;
    let ttfb: number[] = [];
    let ttab: number[] = [];
    for (const r of rides) {
      if (!r.offers.length) continue;
      const first = r.offers.reduce((a, b) =>
        a.createdAt < b.createdAt ? a : b,
      );
      ttfb.push(first.createdAt.getTime() - r.createdAt.getTime());
      for (const o of r.offers) {
        bidSum += asNum(o.bidAmount);
        bidN += 1;
      }
      const sel = r.offers.find((o) => o.status === 'SELECTED');
      if (sel) ttab.push(sel.createdAt.getTime() - r.createdAt.getTime());
    }

    const geo = rides.slice(0, 500).map((r) => ({
      lat: r.fromLat,
      lng: r.fromLng,
      status: r.status,
      serviceType: r.serviceType,
    }));

    const approved = docs.filter((d) => d.status === 'APPROVED').length;
    const kycRate = docs.length ? Math.round((approved / docs.length) * 1000) / 10 : 0;

    const trend = Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return {
      metric,
      trend,
      funnel,
      serviceType,
      cancelReasons,
      avgBidAmount: bidN ? Math.round((bidSum / bidN) * 100) / 100 : 0,
      avgMsToFirstBid: ttfb.length
        ? Math.round(ttfb.reduce((a, b) => a + b, 0) / ttfb.length)
        : 0,
      avgMsToAcceptedBid: ttab.length
        ? Math.round(ttab.reduce((a, b) => a + b, 0) / ttab.length)
        : 0,
      kycApprovalRate: kycRate,
      geo,
    };
  }

  // ---------- Search ----------

  async search(q: string) {
    const query = q.trim();
    if (query.length < 2) return { users: [], rides: [], payments: [], vehicles: [], promos: [] };
    const contains = { contains: query, mode: 'insensitive' as const };
    const rideIdHint = query.replace(/^CG-RIDE-/i, '');

    const [users, rides, payments, vehicles, promos] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { id: query },
            { email: contains },
            { phoneE164: contains },
            { passengerProfile: { fullName: contains } },
            { driverProfile: { fullName: contains } },
          ],
        },
        take: 8,
        select: {
          id: true,
          email: true,
          phoneE164: true,
          role: true,
          isSuspended: true,
          passengerProfile: { select: { fullName: true } },
          driverProfile: { select: { fullName: true } },
        },
      }),
      this.prisma.ride.findMany({
        where: {
          OR: [
            { id: { contains: rideIdHint, mode: 'insensitive' } },
            { fromLabel: contains },
            { toLabel: contains },
          ],
        },
        take: 8,
        select: {
          id: true,
          status: true,
          fromLabel: true,
          toLabel: true,
          serviceType: true,
          createdAt: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          OR: [{ id: query }, { providerRef: contains }],
        },
        take: 8,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          providerRef: true,
          rideId: true,
        },
      }),
      this.prisma.vehicle.findMany({
        where: { OR: [{ plate: contains }, { name: contains }] },
        take: 8,
        select: {
          id: true,
          plate: true,
          name: true,
          vehicleClass: true,
          driverId: true,
          driver: { select: { fullName: true, userId: true } },
        },
      }),
      this.prisma.promoCode.findMany({
        where: { code: contains },
        take: 5,
      }),
    ]);

    return {
      users: users.map((u) => ({
        ...u,
        label:
          u.passengerProfile?.fullName ||
          u.driverProfile?.fullName ||
          u.email ||
          u.phoneE164,
      })),
      rides: rides.map((r) => ({ ...r, publicCode: ridePublicCode(r.id) })),
      payments,
      vehicles,
      promos,
    };
  }

  // ---------- Users / 360 ----------

  private buildUserWhere(params: {
    role?: string;
    q?: string;
    suspended?: string;
    status?: string;
    kyc?: string;
    phoneVerified?: string;
    watchlisted?: string;
    vip?: string;
    hasOpenCase?: string;
    registeredFrom?: string;
    registeredTo?: string;
    lastActiveFrom?: string;
    lastActiveTo?: string;
  }): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    const and: Prisma.UserWhereInput[] = [];

    if (params.role && Object.values(UserRole).includes(params.role as UserRole)) {
      where.role = params.role as UserRole;
    }

    const status = (params.status || '').toLowerCase();
    if (status === 'archived') {
      where.archivedAt = { not: null };
    } else if (status === 'anonymized') {
      where.anonymizedAt = { not: null };
    } else if (status === 'suspended' || params.suspended === 'true') {
      where.isSuspended = true;
      where.archivedAt = null;
    } else if (status === 'active' || params.suspended === 'false') {
      where.isSuspended = false;
      where.archivedAt = null;
    } else {
      // Default directory hides archived accounts
      where.archivedAt = null;
    }

    if (params.phoneVerified === 'true') {
      where.phoneVerifiedAt = { not: null };
    } else if (params.phoneVerified === 'false') {
      where.phoneVerifiedAt = null;
    }

    if (params.kyc) {
      const kyc = params.kyc.toUpperCase();
      if (Object.values(DriverApprovalStatus).includes(kyc as DriverApprovalStatus)) {
        and.push({
          driverProfile: { approvalStatus: kyc as DriverApprovalStatus },
        });
      } else if (kyc === 'NOT_STARTED' || kyc === 'NONE') {
        and.push({
          role: UserRole.DRIVER,
          OR: [
            { driverProfile: null },
            { driverProfile: { approvalStatus: DriverApprovalStatus.PENDING_KYC, kycSubmittedAt: null } },
          ],
        });
      }
    }

    if (params.watchlisted === 'true') {
      and.push({ watchlistEntries: { some: {} } });
    } else if (params.watchlisted === 'false') {
      and.push({ watchlistEntries: { none: {} } });
    }

    if (params.vip === 'true') {
      and.push({ passengerProfile: { isVip: true } });
    }

    if (params.hasOpenCase === 'true') {
      const openStatuses = [
        SupportCaseStatus.OPEN,
        SupportCaseStatus.ASSIGNED,
        SupportCaseStatus.ESCALATED,
      ];
      and.push({
        OR: [
          { passengerProfile: { supportCases: { some: { status: { in: openStatuses } } } } },
          { driverProfile: { supportCases: { some: { status: { in: openStatuses } } } } },
        ],
      });
    }

    if (params.registeredFrom || params.registeredTo) {
      where.createdAt = {};
      if (params.registeredFrom) where.createdAt.gte = new Date(params.registeredFrom);
      if (params.registeredTo) where.createdAt.lte = new Date(params.registeredTo);
    }

    if (params.lastActiveFrom || params.lastActiveTo) {
      const lastSeen: Prisma.DateTimeFilter = {};
      if (params.lastActiveFrom) lastSeen.gte = new Date(params.lastActiveFrom);
      if (params.lastActiveTo) lastSeen.lte = new Date(params.lastActiveTo);
      and.push({
        sessions: { some: { revokedAt: null, lastSeenAt: lastSeen } },
      });
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      const contains = { contains: q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { id: q },
          { email: contains },
          { phoneE164: contains },
          { passengerProfile: { id: q } },
          { passengerProfile: { fullName: contains } },
          { driverProfile: { id: q } },
          { driverProfile: { fullName: contains } },
          { driverProfile: { vehicles: { some: { plate: contains } } } },
          {
            passengerProfile: {
              rides: { some: { OR: [{ id: { contains: q, mode: 'insensitive' } }] } },
            },
          },
          {
            driverProfile: {
              offers: {
                some: {
                  ride: { id: { contains: q, mode: 'insensitive' } },
                },
              },
            },
          },
        ],
      });
    }

    if (and.length) where.AND = and;
    return where;
  }

  async userStats() {
    const startToday = startOfUtcDay(new Date());
    const startWeek = new Date(startToday);
    startWeek.setUTCDate(startWeek.getUTCDate() - 7);

    const [
      total,
      passengers,
      drivers,
      admins,
      active,
      suspended,
      phoneUnverified,
      kycPending,
      kycInReview,
      kycActionRequired,
      watchlisted,
      newToday,
      newThisWeek,
      openCasesUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.PASSENGER } }),
      this.prisma.user.count({ where: { role: UserRole.DRIVER } }),
      this.prisma.user.count({
        where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } },
      }),
      this.prisma.user.count({ where: { isSuspended: false } }),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.prisma.user.count({ where: { phoneVerifiedAt: null } }),
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.PENDING_KYC },
      }),
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.IN_REVIEW },
      }),
      this.prisma.driverProfile.count({
        where: { approvalStatus: DriverApprovalStatus.ACTION_REQUIRED },
      }),
      this.prisma.watchlistEntry.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startToday } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startWeek } } }),
      this.prisma.supportCase.count({
        where: {
          status: {
            in: [
              SupportCaseStatus.OPEN,
              SupportCaseStatus.ASSIGNED,
              SupportCaseStatus.ESCALATED,
            ],
          },
        },
      }),
    ]);

    return {
      total,
      passengers,
      drivers,
      admins,
      active,
      suspended,
      pendingVerification: phoneUnverified,
      kycPending: kycPending + kycInReview + kycActionRequired,
      kycAwaiting: kycPending,
      kycInReview,
      kycActionRequired,
      watchlisted,
      blocked: 0,
      newToday,
      newThisWeek,
      openCases: openCasesUsers,
    };
  }

  async listUsers(params: {
    role?: string;
    q?: string;
    suspended?: string;
    status?: string;
    kyc?: string;
    phoneVerified?: string;
    watchlisted?: string;
    vip?: string;
    hasOpenCase?: string;
    registeredFrom?: string;
    registeredTo?: string;
    lastActiveFrom?: string;
    lastActiveTo?: string;
    page?: number;
    pageSize?: number;
    take?: number;
    sort?: string;
    order?: string;
  }) {
    const where = this.buildUserWhere(params);
    const paginated = params.page != null || params.pageSize != null;
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? params.take ?? 25, 1), 100);
    const skip = paginated ? (page - 1) * pageSize : 0;
    const take = paginated ? pageSize : Math.min(params.take ?? 80, 200);

    const sortKey = (params.sort || 'createdAt').toLowerCase();
    const order = params.order?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.UserOrderByWithRelationInput =
      sortKey === 'email'
        ? { email: order }
        : sortKey === 'role'
          ? { role: order }
          : { createdAt: order };

    const select = {
      id: true,
      email: true,
      phoneE164: true,
      phoneVerifiedAt: true,
      role: true,
      isSuspended: true,
      archivedAt: true,
      anonymizedAt: true,
      createdAt: true,
      updatedAt: true,
      passengerProfile: {
        select: {
          id: true,
          fullName: true,
          isVip: true,
          vipRequestedAt: true,
          language: true,
          _count: { select: { rides: true } },
        },
      },
      driverProfile: {
        select: {
          id: true,
          fullName: true,
          approvalStatus: true,
          isActivated: true,
          baseLocation: true,
          kycSubmittedAt: true,
          vehicles: { take: 1, select: { plate: true, vehicleClass: true } },
        },
      },
      sessions: {
        where: { revokedAt: null },
        orderBy: { lastSeenAt: 'desc' as const },
        take: 1,
        select: { lastSeenAt: true, ip: true, userAgent: true, deviceId: true },
      },
      watchlistEntries: { select: { id: true, reason: true }, take: 1 },
      riskFlags: { where: { open: true }, select: { id: true, severity: true }, take: 5 },
      _count: {
        select: {
          sessions: true,
          riskFlags: true,
        },
      },
    } satisfies Prisma.UserSelect;

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select,
      }),
    ]);

    const items = rows.map((u) => {
      const name =
        u.passengerProfile?.fullName ||
        u.driverProfile?.fullName ||
        u.email ||
        u.phoneE164 ||
        '—';
      const openRisk = u.riskFlags.length;
      const watchlisted = u.watchlistEntries.length > 0;
      let riskBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (u.isSuspended || openRisk >= 3) riskBand = 'CRITICAL';
      else if (openRisk >= 2 || watchlisted) riskBand = 'HIGH';
      else if (openRisk === 1) riskBand = 'MEDIUM';

      return {
        ...u,
        displayName: name,
        accountStatus: u.archivedAt
          ? 'ARCHIVED'
          : u.anonymizedAt
            ? 'ANONYMIZED'
            : u.isSuspended
              ? 'SUSPENDED'
              : 'ACTIVE',
        kycStatus: u.driverProfile?.approvalStatus ?? null,
        rideCount: u.passengerProfile?._count.rides ?? null,
        lastActiveAt: u.sessions[0]?.lastSeenAt ?? null,
        location: u.driverProfile?.baseLocation || null,
        plate: u.driverProfile?.vehicles[0]?.plate ?? null,
        watchlisted,
        riskBand,
        riskOpen: openRisk,
      };
    });

    if (!paginated) return items;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async bulkSetSuspended(
    adminId: string,
    userIds: string[],
    isSuspended: boolean,
    reason: string,
    ip?: string,
  ) {
    if (!userIds.length) throw new BadRequestException('No users selected');
    if (!reason || reason.trim().length < 4) {
      throw new BadRequestException('Reason required (min 4 characters)');
    }
    const unique = [...new Set(userIds)].slice(0, 100);
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of unique) {
      try {
        await this.setSuspended(adminId, id, isSuspended, reason.trim(), ip);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return {
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async user360(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passengerProfile: true,
        driverProfile: {
          include: {
            vehicles: true,
            documents: { orderBy: { createdAt: 'desc' }, take: 12 },
            locationCurrent: true,
          },
        },
        sessions: { orderBy: { lastSeenAt: 'desc' }, take: 20 },
        riskFlags: { where: { open: true } },
        watchlistEntries: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const rideWhere: Prisma.RideWhereInput = user.passengerProfile
      ? { passengerId: user.passengerProfile.id }
      : user.driverProfile
        ? { assignedDriverId: user.driverProfile.id }
        : { id: '__none__' };

    const rides = await this.prisma.ride.findMany({
      where: rideWhere,
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { payments: true, ratings: true, offers: true },
    });
    const payments = rides.flatMap((r) => r.payments);
    const refunds = await this.prisma.refund.findMany({
      where: { paymentId: { in: payments.map((p) => p.id) } },
    });
    const ratings = await this.prisma.rating.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    const flagged = await this.prisma.chatMessage.findMany({
      where: { senderId: userId, flagged: true },
      take: 20,
    });
    const cases = await this.prisma.supportCase.findMany({
      where: {
        OR: [
          { passengerProfileId: user.passengerProfile?.id },
          { driverProfileId: user.driverProfile?.id },
          { createdById: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const audits = await this.prisma.auditLog.findMany({
      where: { OR: [{ actorId: userId }, { resourceId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const notes = await this.prisma.userInternalNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { author: { select: { id: true, email: true } } },
    });
    const tags = await this.prisma.userTagAssignment.findMany({
      where: { userId },
      include: { tag: true },
    });

    const completed = rides.filter((r) => r.status === RideStatus.COMPLETED).length;
    const cancelled = rides.filter((r) => CANCELLED.includes(r.status)).length;
    const unfulfilled = rides.filter((r) => UNFULFILLED.includes(r.status)).length;
    const spend = payments
      .filter((p) => /succeed|captur/i.test(p.status))
      .reduce((s, p) => s + asNum(p.amount), 0);
    const earnings = rides.reduce(
      (s, r) => s + snapField(r.priceSnapshot, 'driverEarning'),
      0,
    );
    const avgRating =
      ratings.length === 0
        ? null
        : Math.round(
            (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length) * 10,
          ) / 10;

    const timeline: Array<{ at: string; kind: string; label: string }> = [
      { at: user.createdAt.toISOString(), kind: 'registered', label: 'Registered' },
    ];
    if (user.phoneVerifiedAt) {
      timeline.push({
        at: user.phoneVerifiedAt.toISOString(),
        kind: 'verified',
        label: 'Verified phone',
      });
    }
    for (const d of user.driverProfile?.documents ?? []) {
      timeline.push({
        at: d.createdAt.toISOString(),
        kind: 'kyc',
        label: `KYC ${d.docType} ${d.status}`,
      });
    }
    for (const r of rides.slice(0, 15)) {
      timeline.push({
        at: r.createdAt.toISOString(),
        kind: 'ride',
        label: `Ride ${ridePublicCode(r.id)} ${r.status}`,
      });
    }
    for (const a of audits.slice(0, 15)) {
      timeline.push({
        at: a.createdAt.toISOString(),
        kind: 'admin',
        label: a.action,
      });
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));

    const score = this.riskScoreFromSignals({
      cancelled,
      completed,
      failedPay: payments.filter((p) => /fail/i.test(p.status)).length,
      flagged: flagged.length,
      refunds: refunds.length,
      suspended: user.isSuspended,
    });

    const { passwordHash: _ph, adminTotpSecret: _totp, ...safe } = user;
    return {
      user: safe,
      marketplace: {
        rides: rides.length,
        completed,
        cancelled,
        unfulfilled,
        spend: Math.round(spend * 100) / 100,
        earnings: Math.round(earnings * 100) / 100,
        avgRating,
      },
      rides: rides.slice(0, 40).map((r) => ({
        id: r.id,
        publicCode: ridePublicCode(r.id),
        status: r.status,
        serviceType: r.serviceType,
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        createdAt: r.createdAt,
        pickupAt: r.pickupAt,
        assignedDriverId: r.assignedDriverId,
        offerCount: r.offers?.length ?? 0,
        fare: snapField(r.priceSnapshot, 'total') || snapField(r.priceSnapshot, 'passengerTotal'),
        currency: (r.priceSnapshot as { currency?: string } | null)?.currency ?? 'USD',
      })),
      payments: payments.slice(0, 30),
      refunds,
      ratings,
      flaggedChats: flagged,
      cases,
      notes,
      tags,
      timeline,
      risk: score,
    };
  }

  private riskScoreFromSignals(s: {
    cancelled: number;
    completed: number;
    failedPay: number;
    flagged: number;
    refunds: number;
    suspended: boolean;
  }) {
    let pts = 0;
    if (s.suspended) pts += 40;
    if (s.cancelled > 3) pts += 15;
    if (s.completed > 0 && s.cancelled / (s.completed + s.cancelled) > 0.4) pts += 20;
    pts += Math.min(20, s.failedPay * 5);
    pts += Math.min(15, s.flagged * 5);
    pts += Math.min(20, s.refunds * 8);
    const band =
      pts >= 70 ? 'CRITICAL' : pts >= 45 ? 'HIGH' : pts >= 20 ? 'MEDIUM' : 'LOW';
    return { score: pts, band };
  }

  async setSuspended(
    adminId: string,
    userId: string,
    isSuspended: boolean,
    reason: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.SUPER_ADMIN && isSuspended) {
      throw new ForbiddenException('Cannot suspend Super Admin');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isSuspended },
    });
    if (isSuspended) {
      await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit(adminId, isSuspended ? 'USER_SUSPEND' : 'USER_UNSUSPEND', 'User', userId, {
      ip,
      reason,
      before: { isSuspended: user.isSuspended },
      after: { isSuspended },
    });
    return { id: updated.id, isSuspended: updated.isSuspended };
  }

  async resetUserPassword(
    adminId: string,
    userId: string,
    dto: { newPassword?: string; reason: string; revokeSessions?: boolean },
    ip?: string,
  ) {
    const [admin, user] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: adminId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (user.anonymizedAt) {
      throw new BadRequestException('Cannot reset password for an anonymized account');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot reset Super Admin password');
    }
    if (user.role === UserRole.ADMIN && admin?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can reset an admin password');
    }

    const generated = !dto.newPassword?.trim();
    const plain =
      dto.newPassword?.trim() ||
      `Cg-${randomBytes(9).toString('base64url')}`;
    if (plain.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await this.passwords.hash(plain);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    const revokeSessions = dto.revokeSessions !== false;
    if (revokeSessions) {
      await this.tokens.revokeAllForUser(userId);
    }

    await this.audit(adminId, 'USER_PASSWORD_RESET', 'User', userId, {
      ip,
      reason: dto.reason,
      meta: { generated, sessionsRevoked: revokeSessions },
    });

    return {
      ok: true as const,
      sessionsRevoked: revokeSessions,
      ...(generated ? { temporaryPassword: plain } : {}),
    };
  }

  private async userLifecycleImpact(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passengerProfile: { select: { id: true, fullName: true } },
        driverProfile: { select: { id: true, fullName: true, isActivated: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const passengerId = user.passengerProfile?.id;
    const driverId = user.driverProfile?.id;

    const paymentWhere: Prisma.PaymentWhereInput[] = [];
    if (passengerId) paymentWhere.push({ ride: { passengerId } });
    if (driverId) paymentWhere.push({ ride: { assignedDriverId: driverId } });

    const [passengerRides, activePassengerRides, driverAssigned, activeDriverRides, payments, refunds, openCases] =
      await Promise.all([
        passengerId
          ? this.prisma.ride.count({ where: { passengerId } })
          : Promise.resolve(0),
        passengerId
          ? this.prisma.ride.count({
              where: { passengerId, status: { in: ACTIVE_TRIP } },
            })
          : Promise.resolve(0),
        driverId
          ? this.prisma.ride.count({ where: { assignedDriverId: driverId } })
          : Promise.resolve(0),
        driverId
          ? this.prisma.ride.count({
              where: { assignedDriverId: driverId, status: { in: ACTIVE_TRIP } },
            })
          : Promise.resolve(0),
        paymentWhere.length
          ? this.prisma.payment.count({ where: { OR: paymentWhere } })
          : Promise.resolve(0),
        this.prisma.refund.count({
          where: { requestedById: userId },
        }),
        this.prisma.supportCase.count({
          where: {
            OR: [
              ...(passengerId ? [{ passengerProfileId: passengerId }] : []),
              ...(driverId ? [{ driverProfileId: driverId }] : []),
              { createdById: userId },
            ],
          },
        }),
      ]);

    const hasMarketplaceHistory = passengerRides + driverAssigned + payments + refunds > 0;
    const hasActiveTrip = activePassengerRides + activeDriverRides > 0;
    const canHardDelete =
      !hasMarketplaceHistory &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN;

    return {
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        phoneE164: user.phoneE164,
        isSuspended: user.isSuspended,
        archivedAt: user.archivedAt,
        anonymizedAt: user.anonymizedAt,
        displayName:
          user.passengerProfile?.fullName ||
          user.driverProfile?.fullName ||
          user.email ||
          user.id,
      },
      counts: {
        passengerRides,
        driverAssignedRides: driverAssigned,
        activeTrips: activePassengerRides + activeDriverRides,
        payments,
        refunds,
        openCases,
      },
      warnings: [
        hasActiveTrip ? 'User has an active trip — resolve or cancel it before destructive actions.' : null,
        hasMarketplaceHistory
          ? 'Financial / ride history exists — permanent delete is blocked; use anonymize to remove PII.'
          : null,
        user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN
          ? 'Admin accounts cannot be permanently deleted from this console.'
          : null,
      ].filter(Boolean) as string[],
      canHardDelete,
      hasMarketplaceHistory,
      hasActiveTrip,
    };
  }

  async getUserLifecycleImpact(userId: string) {
    return this.userLifecycleImpact(userId);
  }

  async archiveUser(
    adminId: string,
    userId: string,
    dto: { reason: string; unarchive?: boolean },
    ip?: string,
  ) {
    if (!dto.reason || dto.reason.trim().length < 4) {
      throw new BadRequestException('Reason required (min 4 characters)');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (adminId === userId) {
      throw new ForbiddenException('Cannot archive your own account');
    }
    if (user.role === UserRole.SUPER_ADMIN && !dto.unarchive) {
      throw new ForbiddenException('Cannot archive Super Admin');
    }

    const impact = await this.userLifecycleImpact(userId);
    if (!dto.unarchive && impact.hasActiveTrip) {
      throw new BadRequestException(
        'Cannot archive while user has an active trip. Resolve the trip first.',
      );
    }

    const archivedAt = dto.unarchive ? null : new Date();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        archivedAt,
        isSuspended: dto.unarchive ? user.isSuspended : true,
      },
    });

    if (!dto.unarchive) {
      await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit(adminId, dto.unarchive ? 'USER_UNARCHIVED' : 'USER_ARCHIVED', 'User', userId, {
      ip,
      reason: dto.reason.trim(),
      before: { archivedAt: user.archivedAt, isSuspended: user.isSuspended },
      after: { archivedAt: updated.archivedAt, isSuspended: updated.isSuspended },
      meta: { impact: impact.counts },
    });

    return {
      id: updated.id,
      archivedAt: updated.archivedAt,
      isSuspended: updated.isSuspended,
      status: updated.archivedAt ? 'ARCHIVED' : updated.isSuspended ? 'SUSPENDED' : 'ACTIVE',
    };
  }

  async anonymizeUser(
    adminId: string,
    userId: string,
    dto: { reason: string; confirmName: string },
    ip?: string,
  ) {
    if (!dto.reason || dto.reason.trim().length < 4) {
      throw new BadRequestException('Reason required (min 4 characters)');
    }
    const impact = await this.userLifecycleImpact(userId);
    const expected = `ANONYMIZE ${impact.user.displayName}`.toUpperCase();
    if ((dto.confirmName || '').trim().toUpperCase() !== expected) {
      throw new BadRequestException(`Type exactly: ${expected}`);
    }
    if (adminId === userId) {
      throw new ForbiddenException('Cannot anonymize your own account');
    }
    if (impact.user.role === UserRole.SUPER_ADMIN || impact.user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot anonymize admin accounts');
    }
    if (impact.hasActiveTrip) {
      throw new BadRequestException(
        'Cannot anonymize while user has an active trip. Resolve the trip first.',
      );
    }
    if (impact.user.anonymizedAt) {
      throw new BadRequestException('User is already anonymized');
    }

    const stamp = Date.now().toString(36);
    const anonEmail = `deleted+${userId.slice(0, 8)}.${stamp}@anonymized.invalid`;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          email: anonEmail,
          phoneE164: null,
          phoneVerifiedAt: null,
          passwordHash: null,
          adminTotpSecret: null,
          adminTotpEnabled: false,
          isSuspended: true,
          archivedAt: new Date(),
          anonymizedAt: new Date(),
        },
      });

      if (impact.user.displayName) {
        await tx.passengerProfile.updateMany({
          where: { userId },
          data: {
            fullName: 'Deleted User',
            isVip: false,
            vipRequestedAt: null,
            referralCode: null,
          },
        });
        await tx.driverProfile.updateMany({
          where: { userId },
          data: {
            fullName: 'Deleted User',
            legalName: 'Deleted User',
            isActivated: false,
            baseLocation: '',
            baseLatitude: null,
            baseLongitude: null,
            referredByCode: null,
            approvalStatus: DriverApprovalStatus.SUSPENDED,
            kycCustomerMessage: null,
            kycDecisionNote: null,
          },
        });
      }

      await tx.oAuthAccount.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.userLoginLink.updateMany({
        where: { targetUserId: userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.impersonationSession.updateMany({
        where: { targetUserId: userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.watchlistEntry.deleteMany({ where: { userId } });
    });

    await this.audit(adminId, 'USER_ANONYMIZED', 'User', userId, {
      ip,
      reason: dto.reason.trim(),
      before: {
        email: impact.user.email,
        phoneE164: impact.user.phoneE164,
        displayName: impact.user.displayName,
      },
      after: { anonymized: true },
      meta: { impact: impact.counts, retained: 'rides/payments/audit preserved' },
    });

    return {
      id: userId,
      status: 'ANONYMIZED',
      retained: impact.counts,
      message: 'Personal data removed. Financial and audit records retained.',
    };
  }

  async permanentlyDeleteUser(
    adminId: string,
    userId: string,
    dto: { reason: string; confirmName: string },
    ip?: string,
  ) {
    if (!dto.reason || dto.reason.trim().length < 4) {
      throw new BadRequestException('Reason required (min 4 characters)');
    }
    if (adminId === userId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const impact = await this.userLifecycleImpact(userId);
    const expected = `DELETE ${impact.user.displayName}`.toUpperCase();
    if ((dto.confirmName || '').trim().toUpperCase() !== expected) {
      throw new BadRequestException(`Type exactly: ${expected}`);
    }

    if (impact.user.role === UserRole.SUPER_ADMIN) {
      const remaining = await this.prisma.user.count({
        where: { role: UserRole.SUPER_ADMIN, id: { not: userId }, archivedAt: null },
      });
      if (remaining < 1) {
        throw new ForbiddenException('Cannot delete the last Super Admin');
      }
      throw new ForbiddenException('Super Admin accounts cannot be permanently deleted');
    }
    if (impact.user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot be permanently deleted');
    }
    if (impact.hasActiveTrip) {
      throw new BadRequestException('Cannot delete while user has an active trip');
    }
    if (!impact.canHardDelete) {
      throw new BadRequestException(
        'Permanent delete blocked because ride/payment history exists. Use Anonymize instead to remove personal data while retaining legal/financial records.',
      );
    }

    // Soft-clear actor refs that would block delete
    await this.prisma.auditLog.updateMany({
      where: { actorId: userId },
      data: { actorId: null },
    });

    const authoredNotes = await this.prisma.kycReviewNote.count({ where: { authorId: userId } });
    const authoredUserNotes = await this.prisma.userInternalNote.count({
      where: { authorId: userId },
    });
    if (authoredNotes + authoredUserNotes > 0) {
      throw new BadRequestException(
        'User authored review/ops notes. Use Anonymize instead so historical notes remain attributable.',
      );
    }

    // Snapshot for audit before delete
    await this.audit(adminId, 'USER_DELETED', 'User', userId, {
      ip,
      reason: dto.reason.trim(),
      before: {
        email: impact.user.email,
        phoneE164: impact.user.phoneE164,
        displayName: impact.user.displayName,
        role: impact.user.role,
      },
      meta: { impact: impact.counts, mode: 'hard_delete' },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.userSession.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.oAuthAccount.deleteMany({ where: { userId } });
      await tx.otpChallenge.deleteMany({ where: { userId } });
      await tx.watchlistEntry.deleteMany({ where: { userId } });
      await tx.riskFlag.deleteMany({ where: { userId } });
      await tx.userTagAssignment.deleteMany({ where: { userId } });
      await tx.userInternalNote.deleteMany({ where: { userId } });
      await tx.userLoginLink.deleteMany({
        where: { OR: [{ targetUserId: userId }, { adminId: userId }] },
      });
      await tx.impersonationSession.deleteMany({
        where: { OR: [{ targetUserId: userId }, { adminId: userId }] },
      });
      await tx.notificationDelivery.deleteMany({ where: { userId } });
      await tx.rating.deleteMany({
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      });
      await tx.supportCase.updateMany({
        where: { createdById: userId },
        data: { createdById: adminId },
      });
      await tx.supportCase.updateMany({
        where: { assigneeId: userId },
        data: { assigneeId: null },
      });
      await tx.refund.updateMany({
        where: { requestedById: userId },
        data: { requestedById: adminId },
      });

      await tx.user.delete({ where: { id: userId } });
    });

    return {
      id: userId,
      status: 'DELETED',
      message: 'Account permanently deleted. No marketplace history was present.',
    };
  }

  async issueImpersonation(
    adminId: string,
    targetUserId: string,
    dto: { reason: string; readOnly?: boolean },
    meta?: { ip?: string; userAgent?: string },
  ) {
    if (!dto.reason || dto.reason.trim().length < 8) {
      throw new BadRequestException('Reason required (min 8 characters)');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { passengerProfile: true, driverProfile: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === UserRole.ADMIN || target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot impersonate an admin');
    }
    if (target.isSuspended) {
      throw new ForbiddenException('Target is suspended');
    }

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const minutes = this.config.get<number>('admin.impersonationTtlMinutes') ?? 12;
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const readOnly = dto.readOnly !== false;

    const session = await this.prisma.impersonationSession.create({
      data: {
        adminId,
        targetUserId,
        reason: dto.reason.trim(),
        readOnly,
        tokenHash,
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    const passengerBase =
      this.config.get<string>('admin.passengerWebBase') ?? 'http://127.0.0.1:3002';
    const adminBase =
      this.config.get<string>('admin.adminWebBase') ?? 'http://127.0.0.1:3001';
    const loginUrl =
      target.role === UserRole.DRIVER
        ? `${adminBase}/preview/driver?t=${raw}`
        : `${passengerBase}/impersonate?t=${raw}`;

    await this.audit(adminId, 'USER_IMPERSONATE_ISSUE', 'User', targetUserId, {
      ip: meta?.ip,
      reason: dto.reason.trim(),
      meta: { readOnly, sessionId: session.id, targetRole: target.role },
    });

    const displayName =
      target.passengerProfile?.fullName ||
      target.driverProfile?.fullName ||
      target.email ||
      target.id;

    return {
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
      readOnly,
      loginUrl,
      copyUrl: loginUrl,
      target: {
        id: target.id,
        role: target.role,
        displayName,
      },
    };
  }

  async listUserNotes(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.userInternalNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        author: { select: { id: true, email: true, role: true } },
      },
    });
  }

  async addUserNote(
    adminId: string,
    userId: string,
    dto: { body: string; category?: string; priority?: string },
    ip?: string,
  ) {
    if (!dto.body?.trim()) throw new BadRequestException('Note body required');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    const note = await this.prisma.userInternalNote.create({
      data: {
        userId,
        authorId: adminId,
        body: dto.body.trim(),
        category: dto.category?.trim() || 'General',
        priority: dto.priority?.trim() || 'normal',
      },
      include: { author: { select: { id: true, email: true, role: true } } },
    });
    await this.audit(adminId, 'INTERNAL_NOTE_CREATED', 'User', userId, {
      ip,
      reason: dto.category || 'General',
      meta: { noteId: note.id, priority: note.priority },
    });
    return note;
  }

  async listUserTags(userId: string) {
    return this.prisma.userTagAssignment.findMany({
      where: { userId },
      include: { tag: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignUserTag(
    adminId: string,
    userId: string,
    dto: { label: string },
    ip?: string,
  ) {
    const label = dto.label?.trim();
    if (!label) throw new BadRequestException('Tag label required');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    const tag = await this.prisma.userTag.upsert({
      where: { slug },
      create: { slug, label },
      update: { label },
    });
    const assignment = await this.prisma.userTagAssignment.upsert({
      where: { userId_tagId: { userId, tagId: tag.id } },
      create: { userId, tagId: tag.id, createdById: adminId },
      update: {},
      include: { tag: true },
    });
    await this.audit(adminId, 'USER_TAG_ADDED', 'User', userId, {
      ip,
      meta: { tag: tag.slug },
    });
    return assignment;
  }

  async removeUserTag(adminId: string, userId: string, tagId: string, ip?: string) {
    await this.prisma.userTagAssignment.deleteMany({ where: { userId, tagId } });
    await this.audit(adminId, 'USER_TAG_REMOVED', 'User', userId, {
      ip,
      meta: { tagId },
    });
    return { ok: true };
  }

  async issueLoginLink(
    adminId: string,
    targetUserId: string,
    dto: { reason?: string; expiresInMinutes?: number; singleUse?: boolean },
    meta?: { ip?: string },
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { passengerProfile: true, driverProfile: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === UserRole.ADMIN || target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot issue login link for an admin');
    }
    if (target.isSuspended) {
      throw new ForbiddenException('Target is suspended');
    }

    const allowed = [5, 15, 30, 60];
    const minutes = allowed.includes(Number(dto.expiresInMinutes))
      ? Number(dto.expiresInMinutes)
      : 15;
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const singleUse = dto.singleUse !== false;
    const reason = (dto.reason || 'Temporary secure login link').trim();

    const link = await this.prisma.userLoginLink.create({
      data: {
        adminId,
        targetUserId,
        tokenHash,
        reason,
        singleUse,
        expiresAt,
      },
    });

    // Reuse impersonation consume path for short-lived access (hashed separately).
    const impersonation = await this.prisma.impersonationSession.create({
      data: {
        adminId,
        targetUserId,
        reason: `LOGIN_LINK:${reason}`,
        readOnly: true,
        tokenHash,
        expiresAt,
        ip: meta?.ip,
      },
    });

    const passengerBase =
      this.config.get<string>('admin.passengerWebBase') ?? 'http://127.0.0.1:3002';
    const adminBase =
      this.config.get<string>('admin.adminWebBase') ?? 'http://127.0.0.1:3001';
    const loginUrl =
      target.role === UserRole.DRIVER
        ? `${adminBase}/preview/driver?t=${raw}`
        : `${passengerBase}/impersonate?t=${raw}`;

    await this.audit(adminId, 'LOGIN_LINK_CREATED', 'User', targetUserId, {
      ip: meta?.ip,
      reason,
      meta: {
        linkId: link.id,
        impersonationId: impersonation.id,
        expiresAt: expiresAt.toISOString(),
        singleUse,
        minutes,
      },
    });

    return {
      id: link.id,
      loginUrl,
      expiresAt: expiresAt.toISOString(),
      singleUse,
      status: 'ACTIVE',
      createdBy: adminId,
    };
  }

  async revokeLoginLink(adminId: string, linkId: string, ip?: string) {
    const link = await this.prisma.userLoginLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundException('Login link not found');
    if (link.revokedAt) return { id: link.id, status: 'REVOKED' };
    const updated = await this.prisma.userLoginLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });
    await this.prisma.impersonationSession.updateMany({
      where: { tokenHash: link.tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit(adminId, 'LOGIN_LINK_REVOKED', 'User', link.targetUserId, {
      ip,
      meta: { linkId },
    });
    return { id: updated.id, status: 'REVOKED' };
  }

  async listLoginLinks(userId: string) {
    const links = await this.prisma.userLoginLink.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { admin: { select: { id: true, email: true } } },
    });
    const now = Date.now();
    return links.map((l) => {
      let status = 'ACTIVE';
      if (l.revokedAt) status = 'REVOKED';
      else if (l.usedAt) status = 'USED';
      else if (l.expiresAt.getTime() < now) status = 'EXPIRED';
      return {
        id: l.id,
        status,
        singleUse: l.singleUse,
        reason: l.reason,
        expiresAt: l.expiresAt.toISOString(),
        usedAt: l.usedAt?.toISOString() ?? null,
        revokedAt: l.revokedAt?.toISOString() ?? null,
        createdAt: l.createdAt.toISOString(),
        createdBy: l.admin.email ?? l.adminId,
      };
    });
  }

  async listDrivers() {
    const onlineSince = new Date(Date.now() - 5 * 60_000);
    const drivers = await this.prisma.driverProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneE164: true,
            isSuspended: true,
            createdAt: true,
          },
        },
        vehicles: true,
        locationCurrent: true,
        _count: { select: { offers: true, documents: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 150,
    });
    const driverIds = drivers.map((d) => d.id);
    const rides = await this.prisma.ride.groupBy({
      by: ['assignedDriverId', 'status'],
      where: { assignedDriverId: { in: driverIds } },
      _count: true,
    });
    const counts = new Map<string, { completed: number; cancelled: number; active: number }>();
    for (const row of rides) {
      if (!row.assignedDriverId) continue;
      const cur = counts.get(row.assignedDriverId) ?? {
        completed: 0,
        cancelled: 0,
        active: 0,
      };
      if (row.status === RideStatus.COMPLETED) cur.completed += row._count;
      else if (CANCELLED.includes(row.status)) cur.cancelled += row._count;
      else if (ACTIVE_TRIP.includes(row.status)) cur.active += row._count;
      counts.set(row.assignedDriverId, cur);
    }

    return drivers.map((d) => {
      const loc = d.locationCurrent;
      const online = !!loc && loc.recordedAt >= onlineSince;
      const stats = counts.get(d.id) ?? { completed: 0, cancelled: 0, active: 0 };
      const presence = d.user.isSuspended
        ? 'SUSPENDED'
        : d.approvalStatus === DriverApprovalStatus.PENDING_KYC
          ? 'PENDING_KYC'
          : stats.active > 0
            ? 'ON_TRIP'
            : online
              ? 'ONLINE'
              : 'OFFLINE';
      return {
        ...d,
        presence,
        stats,
      };
    });
  }

  async listPassengers() {
    return this.prisma.passengerProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneE164: true,
            isSuspended: true,
            createdAt: true,
            phoneVerifiedAt: true,
          },
        },
        _count: { select: { rides: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  async listVehicles() {
    return this.prisma.vehicle.findMany({
      include: {
        driver: {
          select: { id: true, fullName: true, userId: true, approvalStatus: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async listVipRequests() {
    return this.prisma.passengerProfile.findMany({
      where: { isVip: false, vipRequestedAt: { not: null } },
      include: {
        user: { select: { id: true, email: true, phoneE164: true } },
      },
      orderBy: { vipRequestedAt: 'asc' },
    });
  }

  // ---------- Rides / map / offers ----------

  async listRides(params: {
    status?: string;
    bucket?: string;
    serviceType?: string;
    q?: string;
  }) {
    const where: Prisma.RideWhereInput = {};
    if (params.bucket === 'requests') where.status = { in: OPEN_REQ };
    else if (params.bucket === 'active') where.status = { in: ACTIVE_TRIP };
    else if (params.bucket === 'completed') where.status = RideStatus.COMPLETED;
    else if (params.bucket === 'cancelled') where.status = { in: CANCELLED };
    else if (params.bucket === 'expired' || params.bucket === 'unfulfilled')
      where.status = { in: UNFULFILLED };
    else if (
      params.status &&
      Object.values(RideStatus).includes(params.status as RideStatus)
    ) {
      where.status = params.status as RideStatus;
    }
    if (params.serviceType) where.serviceType = params.serviceType;
    if (params.q) {
      const q = params.q.replace(/^CG-RIDE-/i, '');
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { fromLabel: { contains: params.q, mode: 'insensitive' } },
        { toLabel: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    const rides = await this.prisma.ride.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        passenger: { select: { id: true, fullName: true, userId: true } },
        offers: { select: { id: true, bidAmount: true, status: true } },
        payments: { select: { id: true, status: true, amount: true } },
      },
    });
    return rides.map((r) => ({ ...r, publicCode: ridePublicCode(r.id) }));
  }

  async getRide(id: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id },
      include: {
        passenger: {
          select: { id: true, fullName: true, userId: true, isVip: true },
        },
        offers: {
          include: {
            driver: { select: { id: true, fullName: true, userId: true } },
          },
        },
        events: { orderBy: { createdAt: 'asc' } },
        payments: { include: { refunds: true } },
        ratings: true,
        chatThread: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    let driver = null;
    if (ride.assignedDriverId) {
      driver = await this.prisma.driverProfile.findUnique({
        where: { id: ride.assignedDriverId },
        select: {
          id: true,
          fullName: true,
          userId: true,
          locationCurrent: true,
        },
      });
    }
    return { ...ride, publicCode: ridePublicCode(ride.id), assignedDriver: driver };
  }

  async listOffers() {
    return this.prisma.offer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 150,
      include: {
        driver: { select: { id: true, fullName: true, userId: true } },
        ride: {
          select: {
            id: true,
            status: true,
            fromLabel: true,
            toLabel: true,
            serviceType: true,
          },
        },
      },
    });
  }

  async opsMap() {
    const onlineSince = new Date(Date.now() - 10 * 60_000);
    const driverSelect = {
      id: true,
      fullName: true,
      userId: true,
      isActivated: true,
      approvalStatus: true,
      baseLatitude: true,
      baseLongitude: true,
      vehicles: { select: { plate: true, name: true }, take: 1 },
    } as const;
    const [pings, trips, waiting, pendingDrivers] = await Promise.all([
      this.prisma.driverLocationCurrent.findMany({
        include: { driver: { select: driverSelect } },
        orderBy: { recordedAt: 'desc' },
        take: 400,
      }),
      this.prisma.ride.findMany({
        where: { status: { in: ACTIVE_TRIP } },
        select: {
          id: true,
          status: true,
          serviceType: true,
          fromLat: true,
          fromLng: true,
          toLat: true,
          toLng: true,
          fromLabel: true,
          toLabel: true,
          assignedDriverId: true,
        },
        take: 200,
      }),
      this.prisma.ride.findMany({
        where: { status: { in: OPEN_REQ } },
        select: {
          id: true,
          status: true,
          serviceType: true,
          fromLat: true,
          fromLng: true,
          fromLabel: true,
        },
        take: 200,
      }),
      this.prisma.driverProfile.findMany({
        where: {
          OR: [{ isActivated: false }, { approvalStatus: DriverApprovalStatus.PENDING_KYC }],
        },
        select: driverSelect,
        take: 200,
      }),
    ]);
    const pingIds = new Set(pings.map((p) => p.driverId));
    const mapped = pings.map((d) => ({
      lat: d.lat,
      lng: d.lng,
      live: d.recordedAt >= onlineSince,
      hasGps: true,
      unregistered: !d.driver.isActivated || d.driver.approvalStatus === DriverApprovalStatus.PENDING_KYC,
      driver: {
        id: d.driver.id,
        fullName: d.driver.fullName,
        isActivated: d.driver.isActivated,
        approvalStatus: d.driver.approvalStatus,
        plate: d.driver.vehicles[0]?.plate,
      },
    }));
    for (const drv of pendingDrivers) {
      if (pingIds.has(drv.id)) continue;
      const { lat, lng } = fallbackCoord(drv.id, drv.baseLatitude, drv.baseLongitude);
      mapped.push({
        lat,
        lng,
        live: false,
        hasGps: false,
        unregistered: true,
        driver: {
          id: drv.id,
          fullName: drv.fullName,
          isActivated: drv.isActivated,
          approvalStatus: drv.approvalStatus,
          plate: drv.vehicles[0]?.plate,
        },
      });
    }
    return { drivers: mapped, trips, waiting };
  }

  // ---------- Finance ----------

  async financeOverview(range = '30d') {
    const { start, end } = rangeStart(range);
    const payments = await this.prisma.payment.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { ride: { select: { priceSnapshot: true } }, refunds: true },
    });
    const succeeded = payments.filter((p) => /succeed|captur/i.test(p.status));
    const gmv = succeeded.reduce((s, p) => s + asNum(p.amount), 0);
    const refunds = payments.reduce(
      (s, p) =>
        s + p.refunds.filter((r) => r.status === 'succeeded').reduce((a, r) => a + asNum(r.amount), 0),
      0,
    );
    const driverShare = succeeded.reduce(
      (s, p) => s + snapField(p.ride?.priceSnapshot, 'driverEarning'),
      0,
    );
    const tax = succeeded.reduce((s, p) => s + snapField(p.ride?.priceSnapshot, 'tax'), 0);
    const commission = succeeded.reduce(
      (s, p) => s + snapField(p.ride?.priceSnapshot, 'platformFee'),
      0,
    );
    const gatewayFee = 0;
    return {
      range: { start, end },
      waterfall: {
        grossBookingValue: round2(gmv),
        refunds: round2(refunds),
        driverShare: round2(driverShare),
        gatewayFee,
        tax: round2(tax),
        netRevenue: round2(commission - refunds),
      },
      counts: {
        attempts: payments.length,
        succeeded: succeeded.length,
        failed: payments.filter((p) => /fail/i.test(p.status)).length,
      },
    };
  }

  async listPayments(status?: string) {
    return this.prisma.payment.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 150,
      include: {
        ride: { select: { id: true, status: true, fromLabel: true } },
        refunds: true,
      },
    });
  }

  async listRefunds() {
    return this.prisma.refund.findMany({
      orderBy: { createdAt: 'desc' },
      take: 150,
      include: {
        payment: {
          include: { ride: { select: { id: true, status: true } } },
        },
      },
    });
  }

  async issueRefund(
    adminId: string,
    paymentId: string,
    dto: { amount?: number; reason: string; internalNote?: string },
    ip?: string,
  ) {
    if (!dto.reason || dto.reason.trim().length < 4) {
      throw new BadRequestException('Refund reason required');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const already = payment.refunds
      .filter((r) => r.status === 'succeeded')
      .reduce((s, r) => s + asNum(r.amount), 0);
    const remaining = asNum(payment.amount) - already;
    const amount = dto.amount != null ? dto.amount : remaining;
    if (amount <= 0 || amount > remaining + 0.001) {
      throw new BadRequestException('Invalid refund amount');
    }
    const type = amount >= remaining - 0.001 ? 'FULL' : 'PARTIAL';
    let gateway: { refundId: string; status: string };
    try {
      gateway = await this.payments.refund(payment.providerRef ?? payment.id, amount);
    } catch (e) {
      const failed = await this.prisma.refund.create({
        data: {
          paymentId,
          amount,
          currency: payment.currency,
          type: type as 'FULL' | 'PARTIAL',
          reason: dto.reason.trim(),
          internalNote: dto.internalNote,
          status: 'failed',
          gatewayResponse: { error: e instanceof Error ? e.message : String(e) },
          requestedById: adminId,
        },
      });
      await this.audit(adminId, 'PAYMENT_REFUND_FAIL', 'Payment', paymentId, {
        ip,
        reason: dto.reason,
        after: failed,
      });
      throw e;
    }
    const row = await this.prisma.refund.create({
      data: {
        paymentId,
        amount,
        currency: payment.currency,
        type: type as 'FULL' | 'PARTIAL',
        reason: dto.reason.trim(),
        internalNote: dto.internalNote,
        status: gateway.status === 'succeeded' || gateway.status === 'pending' ? gateway.status : 'succeeded',
        gatewayRefundId: gateway.refundId,
        gatewayResponse: gateway as unknown as Prisma.InputJsonValue,
        requestedById: adminId,
        approvedById: adminId,
      },
    });
    await this.audit(adminId, 'PAYMENT_REFUND', 'Payment', paymentId, {
      ip,
      reason: dto.reason,
      before: { amount: payment.amount, refunded: already },
      after: { refundId: row.id, amount, type },
    });
    return row;
  }

  async earnings() {
    const rides = await this.prisma.ride.findMany({
      where: { status: RideStatus.COMPLETED, assignedDriverId: { not: null } },
      select: {
        assignedDriverId: true,
        priceSnapshot: true,
        currency: true,
      },
      take: 500,
    });
    const byDriver = new Map<string, { earning: number; commission: number; n: number }>();
    for (const r of rides) {
      if (!r.assignedDriverId) continue;
      const cur = byDriver.get(r.assignedDriverId) ?? { earning: 0, commission: 0, n: 0 };
      cur.earning += snapField(r.priceSnapshot, 'driverEarning');
      cur.commission += snapField(r.priceSnapshot, 'platformFee');
      cur.n += 1;
      byDriver.set(r.assignedDriverId, cur);
    }
    const ids = [...byDriver.keys()];
    const drivers = await this.prisma.driverProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, userId: true },
    });
    return drivers.map((d) => ({
      ...d,
      ...(byDriver.get(d.id) ?? { earning: 0, commission: 0, n: 0 }),
    }));
  }

  // ---------- Pricing / promos / cms / catalog ----------

  listFareRules() {
    return this.prisma.fareRule.findMany({ orderBy: [{ serviceType: 'asc' }, { vehicleClass: 'asc' }] });
  }

  async upsertFareRule(
    adminId: string,
    id: string | undefined,
    data: Prisma.FareRuleUncheckedCreateInput,
    ip?: string,
  ) {
    const before = id
      ? await this.prisma.fareRule.findUnique({ where: { id } })
      : null;
    const row = id
      ? await this.prisma.fareRule.update({ where: { id }, data })
      : await this.prisma.fareRule.create({ data });
    await this.audit(adminId, 'PRICING_CHANGE', 'FareRule', row.id, {
      ip,
      before,
      after: row,
    });
    return row;
  }

  async patchPromo(
    adminId: string,
    id: string,
    data: { active?: boolean; maxUses?: number; endsAt?: string | null },
    ip?: string,
  ) {
    const before = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Promo not found');
    const row = await this.prisma.promoCode.update({
      where: { id },
      data: {
        active: data.active,
        maxUses: data.maxUses,
        endsAt: data.endsAt === undefined ? undefined : data.endsAt ? new Date(data.endsAt) : null,
      },
    });
    await this.audit(adminId, 'PROMO_CHANGE', 'PromoCode', id, { ip, before, after: row });
    return row;
  }

  listCmsPages(kind?: string) {
    return this.prisma.cmsPage.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
    });
  }

  listCatalog() {
    return this.prisma.catalogItem.findMany({ orderBy: { serviceType: 'asc' } });
  }

  async upsertCatalog(
    adminId: string,
    id: string | undefined,
    data: Prisma.CatalogItemUncheckedCreateInput,
    ip?: string,
  ) {
    const row = id
      ? await this.prisma.catalogItem.update({ where: { id }, data })
      : await this.prisma.catalogItem.create({ data });
    await this.audit(adminId, 'CATALOG_UPSERT', 'CatalogItem', row.id, { ip, after: row });
    return row;
  }

  listReferrals() {
    return this.prisma.referralRedemption.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async growthStats() {
    const promos = await this.prisma.promoCode.findMany();
    const rides = await this.prisma.ride.findMany({
      where: { promoCode: { not: null } },
      select: { promoCode: true, createdAt: true, status: true, priceSnapshot: true },
    });
    const usage: Record<string, { rides: number; discount: number }> = {};
    for (const r of rides) {
      const code = r.promoCode ?? '';
      usage[code] = usage[code] ?? { rides: 0, discount: 0 };
      usage[code].rides += 1;
      usage[code].discount += snapField(r.priceSnapshot, 'promoDiscount');
    }
    const referrals = await this.prisma.referralRedemption.findMany();
    const pax = await this.prisma.passengerProfile.findMany({
      select: { id: true, isVip: true, createdAt: true, _count: { select: { rides: true } } },
    });
    const returning = pax.filter((p) => p._count.rides >= 2).length;
    return {
      promos: promos.map((p) => ({
        ...p,
        usage: usage[p.code] ?? { rides: 0, discount: 0 },
      })),
      referrals: {
        count: referrals.length,
        firstRide: referrals.filter((r) => r.creditAmount > 0).length,
      },
      vip: {
        active: pax.filter((p) => p.isVip).length,
        conversion: pax.length ? Math.round((pax.filter((p) => p.isVip).length / pax.length) * 1000) / 10 : 0,
      },
      repeatRideRate: pax.length ? Math.round((returning / pax.length) * 1000) / 10 : 0,
    };
  }

  // ---------- Trust ----------

  async flaggedChat() {
    return this.prisma.chatMessage.findMany({
      where: { flagged: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { thread: { include: { ride: { select: { id: true, status: true } } } } },
    });
  }

  async riskAccounts() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.PASSENGER, UserRole.DRIVER] } },
      take: 300,
      include: {
        riskFlags: { where: { open: true } },
        watchlistEntries: true,
        passengerProfile: { select: { id: true } },
        driverProfile: { select: { id: true } },
      },
    });
    const results = [];
    for (const u of users) {
      const rideWhere: Prisma.RideWhereInput = u.passengerProfile
        ? { passengerId: u.passengerProfile.id }
        : u.driverProfile
          ? { assignedDriverId: u.driverProfile.id }
          : { id: '__none__' };
      const rides = await this.prisma.ride.findMany({
        where: rideWhere,
        select: { status: true, payments: { select: { status: true } } },
      });
      const cancelled = rides.filter((r) => CANCELLED.includes(r.status)).length;
      const completed = rides.filter((r) => r.status === RideStatus.COMPLETED).length;
      const failedPay = rides.reduce(
        (s, r) => s + r.payments.filter((p) => /fail/i.test(p.status)).length,
        0,
      );
      const flagged = await this.prisma.chatMessage.count({
        where: { senderId: u.id, flagged: true },
      });
      const refunds = await this.prisma.refund.count({
        where: { requestedById: u.id },
      });
      const risk = this.riskScoreFromSignals({
        cancelled,
        completed,
        failedPay,
        flagged,
        refunds,
        suspended: u.isSuspended,
      });
      if (risk.score >= 20 || u.watchlistEntries.length || u.riskFlags.length) {
        results.push({
          id: u.id,
          email: u.email,
          role: u.role,
          isSuspended: u.isSuspended,
          watchlisted: u.watchlistEntries.length > 0,
          flags: u.riskFlags,
          ...risk,
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 100);
  }

  async watchlist(adminId: string, userId: string, reason: string) {
    const row = await this.prisma.watchlistEntry.upsert({
      where: { userId },
      create: { userId, reason, createdById: adminId },
      update: { reason },
    });
    await this.audit(adminId, 'WATCHLIST_ADD', 'User', userId, { reason });
    return row;
  }

  async unwatch(adminId: string, userId: string) {
    await this.prisma.watchlistEntry.deleteMany({ where: { userId } });
    await this.audit(adminId, 'WATCHLIST_REMOVE', 'User', userId);
    return { ok: true };
  }

  listWatchlist() {
    return this.prisma.watchlistEntry.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isSuspended: true,
            passengerProfile: { select: { fullName: true } },
            driverProfile: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listCases(params: { queue?: string; adminId?: string }) {
    const where: Prisma.SupportCaseWhereInput = {};
    const q = params.queue;
    if (q === 'unassigned') where.assigneeId = null;
    else if (q === 'assigned' && params.adminId) where.assigneeId = params.adminId;
    else if (q === 'escalated') where.status = SupportCaseStatus.ESCALATED;
    else if (q === 'resolved') where.status = SupportCaseStatus.RESOLVED;
    else if (q === 'sla') {
      where.status = { not: SupportCaseStatus.RESOLVED };
      where.slaDueAt = { lt: new Date() };
    } else if (q === 'open') where.status = { in: [SupportCaseStatus.OPEN, SupportCaseStatus.ASSIGNED] };
    return this.prisma.supportCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        assignee: { select: { id: true, email: true } },
        notes: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
  }

  async createCase(
    adminId: string,
    dto: {
      title: string;
      type?: SupportCaseType;
      passengerProfileId?: string;
      driverProfileId?: string;
      rideId?: string;
      paymentId?: string;
      slaHours?: number;
    },
  ) {
    const slaDueAt = dto.slaHours
      ? new Date(Date.now() + dto.slaHours * 3600_000)
      : new Date(Date.now() + 24 * 3600_000);
    const row = await this.prisma.supportCase.create({
      data: {
        title: dto.title,
        type: dto.type ?? SupportCaseType.GENERAL,
        createdById: adminId,
        passengerProfileId: dto.passengerProfileId,
        driverProfileId: dto.driverProfileId,
        rideId: dto.rideId,
        paymentId: dto.paymentId,
        slaDueAt,
      },
    });
    await this.audit(adminId, 'CASE_CREATE', 'SupportCase', row.id);
    return row;
  }

  async updateCase(
    adminId: string,
    id: string,
    dto: { status?: SupportCaseStatus; assigneeId?: string | null; note?: string },
  ) {
    const before = await this.prisma.supportCase.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Case not found');
    const row = await this.prisma.supportCase.update({
      where: { id },
      data: {
        status: dto.status,
        assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId,
      },
      include: { notes: true },
    });
    if (dto.note) {
      await this.prisma.supportCaseNote.create({
        data: { caseId: id, authorId: adminId, body: dto.note },
      });
    }
    await this.audit(adminId, 'CASE_UPDATE', 'SupportCase', id, { before, after: row });
    return this.prisma.supportCase.findUnique({
      where: { id },
      include: { notes: { orderBy: { createdAt: 'asc' } }, assignee: { select: { email: true } } },
    });
  }

  // ---------- Comms / platform ----------

  listTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } });
  }

  async upsertTemplate(
    data: { id?: string; key: string; channel: string; title: string; body: string; active?: boolean },
  ) {
    if (data.id) {
      return this.prisma.notificationTemplate.update({
        where: { id: data.id },
        data: { channel: data.channel, title: data.title, body: data.body, active: data.active },
      });
    }
    return this.prisma.notificationTemplate.upsert({
      where: { key: data.key },
      create: {
        key: data.key,
        channel: data.channel,
        title: data.title,
        body: data.body,
        active: data.active ?? true,
      },
      update: { title: data.title, body: data.body, channel: data.channel },
    });
  }

  listDeliveries() {
    return this.prisma.notificationDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  listCampaigns() {
    return this.prisma.notificationCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async sendBroadcast(
    adminId: string,
    dto: {
      channel: string;
      segment: string;
      title: string;
      body: string;
      city?: string;
      templateKey?: string;
    },
  ) {
    const campaign = await this.prisma.notificationCampaign.create({
      data: {
        title: dto.title,
        channel: dto.channel,
        segment: dto.segment,
        city: dto.city,
        templateKey: dto.templateKey,
        bodyTitle: dto.title,
        bodyText: dto.body,
        status: 'SENDING',
        createdById: adminId,
        sentAt: new Date(),
      },
    });
    const users = await this.resolveSegment(dto.segment, dto.city);
    let sent = 0;
    for (const u of users) {
      if (dto.channel === 'sms' && u.phoneE164) {
        try {
          await this.sms.sendSms(u.phoneE164, dto.body);
          await this.notifications.logDelivery({
            userId: u.id,
            channel: 'sms',
            title: dto.title,
            body: dto.body,
            status: 'sent',
            templateKey: dto.templateKey,
          });
          sent += 1;
        } catch {
          await this.notifications.logDelivery({
            userId: u.id,
            channel: 'sms',
            title: dto.title,
            body: dto.body,
            status: 'failed',
          });
        }
      } else {
        await this.notifications.sendToUser({
          userId: u.id,
          title: dto.title,
          body: dto.body,
          templateKey: dto.templateKey ?? 'admin_broadcast',
          data: { campaignId: campaign.id },
        });
        sent += 1;
      }
    }
    await this.prisma.notificationCampaign.update({
      where: { id: campaign.id },
      data: { status: 'SENT' },
    });
    await this.audit(adminId, 'NOTIFICATION_SEND', 'NotificationCampaign', campaign.id, {
      meta: { sent, segment: dto.segment },
    });
    return { campaign, sent };
  }

  private async resolveSegment(segment: string, city?: string) {
    const where: Prisma.UserWhereInput = { isSuspended: false };
    if (segment === 'DRIVERS') where.role = UserRole.DRIVER;
    else if (segment === 'PASSENGERS') where.role = UserRole.PASSENGER;
    else if (segment === 'VIP') {
      where.passengerProfile = { isVip: true };
    }
    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, phoneE164: true, role: true },
      take: 200,
    });
    if (segment === 'CITY' && city) {
      const inCity = await this.prisma.catalogItem.findMany({
        where: { city: { equals: city, mode: 'insensitive' } },
      });
      void inCity;
    }
    return users;
  }

  listAudit(params: { action?: string; resource?: string; q?: string }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.action) where.action = { contains: params.action, mode: 'insensitive' };
    if (params.resource) where.resource = params.resource;
    if (params.q) {
      where.OR = [
        { action: { contains: params.q, mode: 'insensitive' } },
        { resourceId: params.q },
        { reason: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 150,
      include: { actor: { select: { id: true, email: true } } },
    });
  }

  listSessions() {
    return this.prisma.userSession.findMany({
      orderBy: { lastSeenAt: 'desc' },
      take: 150,
      include: {
        user: { select: { id: true, email: true, role: true } },
      },
    });
  }

  listWebhooks() {
    return this.prisma.webhookEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  listErrors() {
    return this.prisma.apiErrorEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  listFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async setFlag(adminId: string, key: string, enabled: boolean) {
    const row = await this.prisma.featureFlag.update({
      where: { key },
      data: { enabled },
    });
    await this.audit(adminId, 'FEATURE_FLAG', 'FeatureFlag', row.id, {
      after: { key, enabled },
    });
    return row;
  }

  async platformHealth() {
    const db = await this.prisma.isReady();
    return {
      api: { status: 'up' },
      postgres: { status: db ? 'up' : 'down' },
      firebase: {
        status: this.firebase.isConfigured() ? 'up' : 'down',
        projectId: this.firebase.projectId,
      },
      payment: { status: 'up', name: this.launchGate.paymentName },
      payout: { status: 'up', name: this.launchGate.payoutName },
      sms: { status: 'up', name: this.launchGate.smsName },
      otp: { status: 'up', name: this.launchGate.otpName },
      launchGate: this.launchGate.status,
    };
  }

  async csvReport(kind: string) {
    if (kind === 'rides') {
      const rows = await this.prisma.ride.findMany({
        take: 500,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          serviceType: true,
          fromLabel: true,
          toLabel: true,
          currency: true,
          createdAt: true,
        },
      });
      return toCsv(
        ['id', 'publicCode', 'status', 'serviceType', 'from', 'to', 'createdAt'],
        rows.map((r) => [
          r.id,
          ridePublicCode(r.id),
          r.status,
          r.serviceType,
          r.fromLabel,
          r.toLabel ?? '',
          r.createdAt.toISOString(),
        ]),
      );
    }
    if (kind === 'users') {
      const rows = await this.prisma.user.findMany({
        take: 500,
        select: { id: true, email: true, phoneE164: true, role: true, isSuspended: true, createdAt: true },
      });
      return toCsv(
        ['id', 'email', 'phone', 'role', 'suspended', 'createdAt'],
        rows.map((r) => [
          r.id,
          r.email ?? '',
          r.phoneE164 ?? '',
          r.role,
          String(r.isSuspended),
          r.createdAt.toISOString(),
        ]),
      );
    }
    const pays = await this.prisma.payment.findMany({
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
    return toCsv(
      ['id', 'rideId', 'amount', 'currency', 'status', 'provider', 'createdAt'],
      pays.map((p) => [
        p.id,
        p.rideId,
        String(p.amount),
        p.currency,
        p.status,
        p.provider,
        p.createdAt.toISOString(),
      ]),
    );
  }

  listZones() {
    return this.prisma.operatingZone.findMany({
      take: 200,
      include: { driver: { select: { id: true, fullName: true } } },
    });
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toCsv(headers: string[], rows: string[][]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}
