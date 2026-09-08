import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DriverApprovalStatus,
  OfferStatus,
  Prisma,
  RideStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment/payment-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { PromoService } from '../cms/cms.service';
import { asJson, PricingService, type PriceSnapshot } from './pricing.service';
import type {
  CreateOfferDto,
  CreatePaymentIntentDto,
  CreateRideDto,
} from './dto/marketplace.dto';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

const REQUEST_TTL_MS = 30 * 60 * 1000;
const OFFER_TTL_MS = 15 * 60 * 1000;
const PAY_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly notifications: NotificationsService,
    private readonly promos: PromoService,
  ) {}

  // ---------- Passenger rides ----------

  async createRide(
    userId: string,
    dto: CreateRideDto,
    idempotencyKey?: string,
    ip?: string,
  ) {
    const passenger = await this.requirePassenger(userId);

    if (idempotencyKey) {
      const existing = await this.prisma.ride.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return this.getRideForActor(userId, existing.id);
    }

    const vehicleClass = dto.vehicleClassIds[0] ?? '*';
    const currency = dto.currency ?? 'USD';
    const passengerUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passengerProfile: true },
    });
    const vip = passengerUser?.passengerProfile?.isVip === true;
    const quote = await this.pricing.quote({
      serviceType: dto.serviceType,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
      vehicleClass,
      currency,
      hours: dto.hours,
      days: dto.days,
      catalogItemId: dto.catalogItemId,
      vip,
    });

    const promo = await this.promos.validate(dto.promoCode, currency);
    let snapshot: PriceSnapshot & { promo?: Record<string, unknown> } = {
      ...quote,
    };
    if (promo) {
      const guidance = quote.guidanceAmount;
      let discount = 0;
      if (promo.percentOff != null) {
        discount = Math.round(guidance * (promo.percentOff / 100) * 100) / 100;
      } else if (promo.amountOff != null) {
        discount = promo.amountOff;
      }
      discount = Math.min(discount, guidance);
      const guidanceAfter = Math.max(
        quote.minFare,
        Math.round((guidance - discount) * 100) / 100,
      );
      snapshot = {
        ...quote,
        guidanceAmount: guidanceAfter,
        minBid: Math.round(guidanceAfter * Number(0.8) * 100) / 100,
        maxBid: Math.round(guidanceAfter * Number(1.5) * 100) / 100,
        promo: {
          code: promo.code,
          discount,
          percentOff: promo.percentOff,
          amountOff: promo.amountOff,
        },
      };
    }

    const now = Date.now();
    const ride = await this.prisma.ride.create({
      data: {
        passengerId: passenger.id,
        status: RideStatus.WAITING_FOR_OFFERS,
        serviceType: dto.serviceType,
        fromLabel: dto.fromLabel,
        toLabel: dto.toLabel,
        fromLat: dto.fromLat,
        fromLng: dto.fromLng,
        toLat: dto.toLat,
        toLng: dto.toLng,
        pickupAt: new Date(dto.pickupAt),
        vehicleClassIds: dto.vehicleClassIds,
        adults: dto.adults ?? 1,
        childSeatsJson: (dto.childSeatsJson ?? {}) as Prisma.InputJsonValue,
        flight: dto.flight,
        signage: dto.signage,
        comment: dto.comment,
        promoCode: promo?.code ?? dto.promoCode,
        currency,
        priceSnapshot: asJson(snapshot),
        idempotencyKey: idempotencyKey ?? undefined,
        requestExpiresAt: new Date(now + REQUEST_TTL_MS),
      },
    });

    if (promo) await this.promos.incrementUse(promo.id);

    await this.transition(
      ride.id,
      null,
      RideStatus.WAITING_FOR_OFFERS,
      'passenger',
      userId,
      { action: 'createRide', quote: snapshot },
    );
    await this.audit(userId, 'ride.create', 'Ride', ride.id, ip);
    return this.getRideForActor(userId, ride.id);
  }

  async listPassengerRides(userId: string) {
    const passenger = await this.requirePassenger(userId);
    const rides = await this.prisma.ride.findMany({
      where: { passengerId: passenger.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        offers: { where: { status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] } } },
        selectedOffer: true,
      },
    });
    return rides.map((r) => this.serializeRide(r));
  }

  async getRideForActor(userId: string, rideId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passengerProfile: true, driverProfile: true },
    });
    if (!user) throw new ForbiddenException();

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        offers: {
          include: {
            driver: { select: { id: true, fullName: true, isActivated: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        selectedOffer: true,
        events: { orderBy: { createdAt: 'asc' }, take: 100 },
        payments: true,
        passenger: { select: { id: true, fullName: true, userId: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const isPassenger = ride.passenger.userId === userId;
    const isDriver =
      !!user.driverProfile &&
      (ride.assignedDriverId === user.driverProfile.id ||
        ride.offers.some((o) => o.driverId === user.driverProfile!.id));
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isPassenger && !isDriver && !isAdmin) {
      throw new ForbiddenException('Not allowed to view this ride');
    }

    return this.serializeRide(ride, { includeEvents: true });
  }

  async cancelRide(userId: string, rideId: string, ip?: string) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const cancellable: RideStatus[] = [
      RideStatus.WAITING_FOR_OFFERS,
      RideStatus.OFFER_SELECTION,
      RideStatus.PAYMENT_PENDING,
    ];
    if (!cancellable.includes(ride.status)) {
      throw new BadRequestException(`Cannot cancel from ${ride.status}`);
    }

    await this.setStatus(
      ride.id,
      ride.status,
      RideStatus.PASSENGER_CANCELLED,
      'passenger',
      userId,
      { reason: 'passenger_cancel' },
    );
    await this.prisma.offer.updateMany({
      where: { rideId, status: OfferStatus.ACTIVE },
      data: { status: OfferStatus.WITHDRAWN },
    });
    await this.audit(userId, 'ride.cancel', 'Ride', rideId, ip);
    return this.getRideForActor(userId, rideId);
  }

  async selectOffer(userId: string, rideId: string, offerId: string, ip?: string) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
      include: { offers: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    if (
      ride.status !== RideStatus.OFFER_SELECTION &&
      ride.status !== RideStatus.WAITING_FOR_OFFERS
    ) {
      throw new BadRequestException(`Cannot select offer from ${ride.status}`);
    }

    const offer = ride.offers.find((o) => o.id === offerId);
    if (!offer || offer.status !== OfferStatus.ACTIVE) {
      throw new BadRequestException('Offer not available');
    }
    if (offer.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Offer expired');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.offer.updateMany({
        where: { rideId, id: { not: offerId }, status: OfferStatus.ACTIVE },
        data: { status: OfferStatus.WITHDRAWN },
      });
      await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.SELECTED },
      });
      await tx.ride.update({
        where: { id: rideId },
        data: {
          selectedOfferId: offerId,
          assignedDriverId: offer.driverId,
          priceSnapshot: offer.priceSnapshot as Prisma.InputJsonValue,
          status: RideStatus.PAYMENT_PENDING,
          paymentExpiresAt: new Date(Date.now() + PAY_TTL_MS),
        },
      });
      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: ride.status,
          toStatus: RideStatus.PAYMENT_PENDING,
          actorType: 'passenger',
          actorId: userId,
          payload: { offerId, action: 'selectOffer' },
        },
      });
    });

    await this.audit(userId, 'ride.select_offer', 'Offer', offerId, ip);
    return this.getRideForActor(userId, rideId);
  }

  // ---------- Driver matching / offers ----------

  async listOpenRequests(userId: string) {
    const driver = await this.requireActivatedDriver(userId);
    const openStatuses: RideStatus[] = [
      RideStatus.WAITING_FOR_OFFERS,
      RideStatus.OFFER_SELECTION,
    ];

    // Prefer PostGIS containment; fall back to all open rides if geom missing.
    let matchedIds: string[] = [];
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT r.id
         FROM "Ride" r
         WHERE r.status IN ('WAITING_FOR_OFFERS', 'OFFER_SELECTION')
           AND r."requestExpiresAt" > NOW()
           AND EXISTS (
             SELECT 1 FROM "OperatingZone" z
             WHERE z."driverId" = $1
               AND z.geom IS NOT NULL
               AND ST_Contains(
                 z.geom,
                 ST_SetSRID(ST_MakePoint(r."fromLng", r."fromLat"), 4326)
               )
           )
         ORDER BY r."createdAt" ASC
         LIMIT 50`,
        driver.id,
      );
      matchedIds = rows.map((r) => r.id);
    } catch {
      matchedIds = [];
    }

    const rides = await this.prisma.ride.findMany({
      where:
        matchedIds.length > 0
          ? { id: { in: matchedIds } }
          : {
              status: { in: openStatuses },
              requestExpiresAt: { gt: new Date() },
            },
      include: {
        offers: { where: { driverId: driver.id } },
        passenger: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    // Phase 3: exclude rides whose pickup date is a driver day-off
    const dayOffs = await this.prisma.driverDayOff.findMany({
      where: { driverId: driver.id },
      select: { date: true },
    });
    const offSet = new Set(
      dayOffs.map((d) => d.date.toISOString().slice(0, 10)),
    );
    const filtered = rides.filter((r) => {
      const day = r.pickupAt.toISOString().slice(0, 10);
      return !offSet.has(day);
    });

    // If PostGIS matched none but driver has zones, don't dump all rides —
    // only fall back when driver has zero zones with geom.
    if (matchedIds.length === 0) {
      const zoneCount = await this.prisma.operatingZone.count({
        where: { driverId: driver.id },
      });
      if (zoneCount > 0) {
        // Has zones but no match — return empty (strict).
        // If geom sync failed for all, still allow open list for local dev.
        const withGeom = await this.prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
          `SELECT COUNT(*)::bigint AS c FROM "OperatingZone" WHERE "driverId" = $1 AND geom IS NOT NULL`,
          driver.id,
        );
        if (Number(withGeom[0]?.c ?? 0) > 0) {
          return [];
        }
      }
    }

    return filtered.map((r) => ({
      ...this.serializeRide(r),
      myOffers: r.offers,
    }));
  }

  async createOffer(userId: string, rideId: string, dto: CreateOfferDto, ip?: string) {
    const driver = await this.requireActivatedDriver(userId);
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    if (
      ride.status !== RideStatus.WAITING_FOR_OFFERS &&
      ride.status !== RideStatus.OFFER_SELECTION
    ) {
      throw new BadRequestException(`Cannot offer on ride in ${ride.status}`);
    }
    if (ride.requestExpiresAt && ride.requestExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Ride request expired');
    }

    const existing = await this.prisma.offer.findFirst({
      where: {
        rideId,
        driverId: driver.id,
        status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] },
      },
    });
    if (existing) {
      throw new BadRequestException('You already have an active offer on this ride');
    }

    const guidance = (ride.priceSnapshot ?? {}) as PriceSnapshot;
    if (!guidance.guidanceAmount) {
      throw new BadRequestException('Ride missing pricing guidance');
    }
    const snapshot = this.pricing.freezeBid(guidance, dto.bidAmount);

    const offer = await this.prisma.offer.create({
      data: {
        rideId,
        driverId: driver.id,
        bidAmount: snapshot.bidAmount!,
        currency: dto.currency ?? ride.currency,
        priceSnapshot: asJson(snapshot),
        status: OfferStatus.ACTIVE,
        expiresAt: new Date(Date.now() + OFFER_TTL_MS),
      },
    });

    if (ride.status === RideStatus.WAITING_FOR_OFFERS) {
      await this.setStatus(
        ride.id,
        ride.status,
        RideStatus.OFFER_SELECTION,
        'system',
        undefined,
        { offerId: offer.id, action: 'first_offer' },
      );
    }

    await this.audit(userId, 'offer.create', 'Offer', offer.id, ip);
    return offer;
  }

  // ---------- Payments ----------

  async createPaymentIntent(
    userId: string,
    dto: CreatePaymentIntentDto,
    ip?: string,
  ) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: dto.rideId, passengerId: passenger.id },
      include: { selectedOffer: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.status !== RideStatus.PAYMENT_PENDING) {
      throw new BadRequestException(`Ride is not awaiting payment (${ride.status})`);
    }
    if (!ride.selectedOffer) {
      throw new BadRequestException('No selected offer');
    }
    if (ride.paymentExpiresAt && ride.paymentExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Payment window expired');
    }

    const snap = ride.selectedOffer.priceSnapshot as PriceSnapshot;
    const amount = snap.passengerTotal;
    if (amount == null) {
      throw new BadRequestException('Frozen passenger total missing');
    }

    const idem =
      dto.idempotencyKey ??
      `pay_${ride.id}_${ride.selectedOfferId}_${amount}`;

    const prior = await this.prisma.payment.findUnique({
      where: { idempotencyKey: idem },
    });
    if (prior && prior.status === 'succeeded') {
      return { payment: prior, ride: await this.getRideForActor(userId, ride.id) };
    }

    const intent = await this.payments.createIntent({
      amount,
      currency: ride.currency,
      rideId: ride.id,
      idempotencyKey: idem,
      metadata: { offerId: ride.selectedOfferId! },
    });

    const payment = await this.prisma.payment.upsert({
      where: { idempotencyKey: idem },
      create: {
        rideId: ride.id,
        provider: intent.provider,
        providerRef: intent.intentId,
        amount,
        currency: ride.currency,
        status: intent.status,
        idempotencyKey: idem,
      },
      update: {
        providerRef: intent.intentId,
        status: intent.status,
      },
    });

    if (intent.status === 'succeeded') {
      await this.markBooked(ride.id, payment.id, userId);
    }

    await this.audit(userId, 'payment.intent', 'Payment', payment.id, ip);
    return {
      payment,
      clientSecret: intent.clientSecret,
      ride: await this.getRideForActor(userId, ride.id),
    };
  }

  async handlePaymentWebhook(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ) {
    if (provider !== this.payments.name && provider !== 'dev') {
      throw new BadRequestException(`Unknown payment provider ${provider}`);
    }
    const event = await this.payments.parseWebhook(headers, rawBody);

    const existing = await this.prisma.webhookEvent.findUnique({
      where: {
        provider_eventId: { provider: event.provider, eventId: event.eventId },
      },
    });
    if (existing?.processedAt) {
      return { ok: true, duplicate: true };
    }

    await this.prisma.webhookEvent.upsert({
      where: {
        provider_eventId: { provider: event.provider, eventId: event.eventId },
      },
      create: {
        provider: event.provider,
        eventId: event.eventId,
        payload: event.raw as Prisma.InputJsonValue,
      },
      update: {},
    });

    const paymentRef = event.paymentRef;
    if (!paymentRef) {
      throw new BadRequestException('paymentRef required');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: paymentRef },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: event.status ?? 'succeeded',
        rawWebhookLast: event.raw as Prisma.InputJsonValue,
      },
    });

    if ((event.status ?? 'succeeded') === 'succeeded') {
      await this.markBooked(payment.rideId, payment.id, undefined);
    } else if (event.status === 'failed') {
      const ride = await this.prisma.ride.findUnique({ where: { id: payment.rideId } });
      if (ride && ride.status === RideStatus.PAYMENT_PENDING) {
        await this.setStatus(
          ride.id,
          ride.status,
          RideStatus.PAYMENT_FAILED,
          'system',
          undefined,
          { paymentId: payment.id },
        );
      }
    }

    await this.prisma.webhookEvent.update({
      where: {
        provider_eventId: { provider: event.provider, eventId: event.eventId },
      },
      data: { processedAt: new Date() },
    });

    return { ok: true };
  }

  async expireDueEntities() {
    const now = new Date();

    // Expire offers
    await this.prisma.offer.updateMany({
      where: { status: OfferStatus.ACTIVE, expiresAt: { lt: now } },
      data: { status: OfferStatus.EXPIRED },
    });

    // Expire waiting/selection rides
    const staleRequests = await this.prisma.ride.findMany({
      where: {
        status: {
          in: [RideStatus.WAITING_FOR_OFFERS, RideStatus.OFFER_SELECTION],
        },
        requestExpiresAt: { lt: now },
      },
      select: { id: true, status: true },
    });
    for (const r of staleRequests) {
      await this.setStatus(
        r.id,
        r.status,
        RideStatus.EXPIRED,
        'system',
        undefined,
        { reason: 'request_ttl' },
      );
      await this.prisma.offer.updateMany({
        where: { rideId: r.id, status: OfferStatus.ACTIVE },
        data: { status: OfferStatus.EXPIRED },
      });
    }

    // Expire payment windows
    const stalePay = await this.prisma.ride.findMany({
      where: {
        status: RideStatus.PAYMENT_PENDING,
        paymentExpiresAt: { lt: now },
      },
      select: { id: true, status: true, selectedOfferId: true },
    });
    for (const r of stalePay) {
      await this.prisma.$transaction(async (tx) => {
        await tx.ride.update({
          where: { id: r.id },
          data: {
            status: RideStatus.EXPIRED,
            selectedOfferId: null,
            assignedDriverId: null,
          },
        });
        await tx.rideEvent.create({
          data: {
            rideId: r.id,
            fromStatus: r.status,
            toStatus: RideStatus.EXPIRED,
            actorType: 'system',
            payload: { reason: 'payment_ttl' },
          },
        });
        if (r.selectedOfferId) {
          await tx.offer.update({
            where: { id: r.selectedOfferId },
            data: { status: OfferStatus.EXPIRED },
          });
        }
      });
    }

    return {
      expiredRequests: staleRequests.length,
      expiredPayments: stalePay.length,
    };
  }

  // ---------- helpers ----------

  private async markBooked(
    rideId: string,
    paymentId: string,
    actorId?: string,
  ) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: true,
        selectedOffer: { include: { driver: true } },
      },
    });
    if (!ride) return;
    if (ride.status === RideStatus.BOOKED) return;
    if (ride.status !== RideStatus.PAYMENT_PENDING) {
      throw new BadRequestException(
        `Cannot book from ${ride.status} for payment ${paymentId}`,
      );
    }
    await this.setStatus(
      rideId,
      ride.status,
      RideStatus.BOOKED,
      actorId ? 'passenger' : 'system',
      actorId,
      { paymentId, action: 'payment_succeeded' },
    );

    const targets = [
      ride.passenger.userId,
      ride.selectedOffer?.driver.userId,
    ].filter(Boolean) as string[];
    await this.notifications.notifyRideStatus({
      userIds: targets,
      rideId,
      status: RideStatus.BOOKED,
      title: 'Ride booked',
      body: `Your transfer from ${ride.fromLabel} is confirmed`,
    });
  }

  private async setStatus(
    rideId: string,
    from: RideStatus,
    to: RideStatus,
    actorType: string,
    actorId?: string,
    payload?: Record<string, unknown>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.ride.update({ where: { id: rideId }, data: { status: to } });
      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: from,
          toStatus: to,
          actorType,
          actorId,
          payload: (payload ?? {}) as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async transition(
    rideId: string,
    from: RideStatus | null,
    to: RideStatus,
    actorType: string,
    actorId?: string,
    payload?: Record<string, unknown>,
  ) {
    await this.prisma.rideEvent.create({
      data: {
        rideId,
        fromStatus: from ?? undefined,
        toStatus: to,
        actorType,
        actorId,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async requirePassenger(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passengerProfile: true },
    });
    if (!user || user.role !== UserRole.PASSENGER || !user.passengerProfile) {
      throw new ForbiddenException('Passenger account required');
    }
    if (user.isSuspended) throw new ForbiddenException('Account suspended');
    if (!user.phoneVerifiedAt) {
      throw new ForbiddenException('Phone verification required');
    }
    return user.passengerProfile;
  }

  private async requireActivatedDriver(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });
    if (!user || user.role !== UserRole.DRIVER || !user.driverProfile) {
      throw new ForbiddenException('Driver account required');
    }
    if (user.isSuspended) throw new ForbiddenException('Account suspended');
    if (
      !user.driverProfile.isActivated ||
      user.driverProfile.approvalStatus !== DriverApprovalStatus.APPROVED
    ) {
      throw new ForbiddenException('Driver not activated');
    }
    return user.driverProfile;
  }

  private serializeRide(
    ride: Record<string, unknown>,
    opts?: { includeEvents?: boolean },
  ) {
    const base = {
      id: ride.id,
      status: ride.status,
      serviceType: ride.serviceType,
      fromLabel: ride.fromLabel,
      toLabel: ride.toLabel,
      fromLat: ride.fromLat,
      fromLng: ride.fromLng,
      toLat: ride.toLat,
      toLng: ride.toLng,
      pickupAt: ride.pickupAt,
      vehicleClassIds: ride.vehicleClassIds,
      adults: ride.adults,
      currency: ride.currency,
      priceSnapshot: ride.priceSnapshot,
      selectedOfferId: ride.selectedOfferId,
      assignedDriverId: ride.assignedDriverId,
      requestExpiresAt: ride.requestExpiresAt,
      paymentExpiresAt: ride.paymentExpiresAt,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
      offers: ride.offers,
      selectedOffer: ride.selectedOffer,
      payments: ride.payments,
      passenger: ride.passenger,
    };
    if (opts?.includeEvents) {
      return { ...base, events: ride.events };
    }
    return base;
  }

  private async audit(
    actorId: string | undefined,
    action: string,
    resource?: string,
    resourceId?: string,
    ip?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: { actorId, action, resource, resourceId, ip },
      });
    } catch {
      /* non-fatal */
    }
  }
}
