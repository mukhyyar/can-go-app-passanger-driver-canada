import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DocumentLifecycleStatus,
  DocumentReviewStatus,
  DriverApprovalStatus,
  OfferStatus,
  Prisma,
  RideStatus,
  SupportCaseType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../providers/payment/payment-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { PromoService } from '../cms/cms.service';
import {
  asJson,
  PricingService,
  round2,
  type PriceSnapshot,
} from './pricing.service';
import type {
  CreateChangeRequestDto,
  CreateOfferDto,
  CreatePaymentIntentDto,
  CreateRideDto,
  PaymentQuoteDto,
  UpdateOfferDto,
  UpdateRideDto,
} from './dto/marketplace.dto';
import { isAllowedOfferValidity, OFFER_OPTION_KEYS } from './offer.constants';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { RideLifecycleService } from './ride-lifecycle.service';
import {
  loadRideLifecycleConfig,
  serializeLifecycleFlags,
} from './ride-lifecycle';
import { OfferPresentationService } from './offer-presentation.service';
import {
  isMaterialRideEdit,
  isPassengerEditableStatus,
} from './ride-update.logic';
import { StorageService } from '../storage/storage.service';
import { sanitizeContentDispositionFilename } from '../drivers/vehicle-photos.util';

const DEFAULT_OFFER_VALIDITY_SECONDS = 30 * 60;

@Injectable()
export class MarketplaceService {
  private readonly payTtlMs: number;
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly notifications: NotificationsService,
    private readonly promos: PromoService,
    private readonly lifecycle: RideLifecycleService,
    private readonly presentation: OfferPresentationService,
    private readonly storage: StorageService,
    @Optional() private readonly tracking?: TrackingGateway,
  ) {
    this.payTtlMs = loadRideLifecycleConfig().paymentTtlMs;
  }

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
    const isRoundTrip = dto.isRoundTrip === true;
    let snapshot: PriceSnapshot & { promo?: Record<string, unknown> } = {
      ...quote,
      isRoundTrip,
      legs: isRoundTrip ? 2 : 1,
    };
    if (isRoundTrip) {
      // Round-trip guidance covers both legs unless fare rules say otherwise.
      const guidance = round2(quote.guidanceAmount * 2);
      const minMul = quote.minBid / Math.max(quote.guidanceAmount, 0.01);
      const maxMul = quote.maxBid / Math.max(quote.guidanceAmount, 0.01);
      snapshot = {
        ...snapshot,
        distanceKm: round2(quote.distanceKm * 2),
        durationMin: round2(quote.durationMin * 2),
        guidanceAmount: guidance,
        minBid: round2(guidance * minMul),
        maxBid: round2(guidance * maxMul),
      };
    }
    if (promo) {
      const guidance = snapshot.guidanceAmount;
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
      const minMul = quote.minBid / Math.max(quote.guidanceAmount, 0.01);
      const maxMul = quote.maxBid / Math.max(quote.guidanceAmount, 0.01);
      snapshot = {
        ...snapshot,
        guidanceAmount: guidanceAfter,
        minBid: round2(guidanceAfter * minMul),
        maxBid: round2(guidanceAfter * maxMul),
        promo: {
          code: promo.code,
          discount,
          percentOff: promo.percentOff,
          amountOff: promo.amountOff,
        },
      };
    }

    const requiredOptions = this.resolveRequiredOptions(dto);

    if (isRoundTrip && !dto.returnAt) {
      throw new BadRequestException('returnAt required for round-trip rides');
    }

    const pickupAt = new Date(dto.pickupAt);
    if (Number.isNaN(pickupAt.getTime())) {
      throw new BadRequestException('Invalid pickupAt');
    }
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
        pickupAt,
        returnAt: dto.returnAt ? new Date(dto.returnAt) : undefined,
        isRoundTrip,
        pickupWaitMin: dto.pickupWaitMin,
        returnWaitMin: dto.returnWaitMin,
        vehicleClassIds: dto.vehicleClassIds,
        adults: dto.adults ?? 1,
        childSeatsJson: (dto.childSeatsJson ?? {}) as Prisma.InputJsonValue,
        flight: dto.flight,
        returnFlight: dto.returnFlight,
        signage: dto.signage,
        comment: dto.comment,
        requiredOptions: requiredOptions as Prisma.InputJsonValue,
        promoCode: promo?.code ?? dto.promoCode,
        currency,
        priceSnapshot: asJson(snapshot),
        idempotencyKey: idempotencyKey ?? undefined,
        // Source of truth: pickupAt + grace — never createdAt + fixed TTL
        requestExpiresAt: this.lifecycle.computeRequestExpiresAt(pickupAt),
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
    void this.notifyDriversOfNewRequest(ride);
    return this.getRideForActor(userId, ride.id);
  }

  async updateRide(
    userId: string,
    rideId: string,
    dto: UpdateRideDto,
    ip?: string,
  ) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    if (!isPassengerEditableStatus(ride.status)) {
      throw new BadRequestException(`Cannot edit ride in ${ride.status}`);
    }

    const priorSnap =
      ride.priceSnapshot && typeof ride.priceSnapshot === 'object'
        ? (ride.priceSnapshot as Record<string, unknown>)
        : {};

    const fromLabel = dto.fromLabel ?? ride.fromLabel;
    const toLabel =
      dto.toLabel !== undefined ? dto.toLabel : ride.toLabel;
    const fromLat = dto.fromLat ?? ride.fromLat;
    const fromLng = dto.fromLng ?? ride.fromLng;
    const toLat = dto.toLat !== undefined ? dto.toLat : ride.toLat;
    const toLng = dto.toLng !== undefined ? dto.toLng : ride.toLng;
    const pickupAt = dto.pickupAt ? new Date(dto.pickupAt) : ride.pickupAt;
    if (Number.isNaN(pickupAt.getTime())) {
      throw new BadRequestException('Invalid pickupAt');
    }
    const isRoundTrip =
      dto.isRoundTrip !== undefined ? dto.isRoundTrip : ride.isRoundTrip;
    const returnAtRaw =
      dto.returnAt !== undefined
        ? dto.returnAt
          ? new Date(dto.returnAt)
          : null
        : ride.returnAt;
    if (isRoundTrip && !returnAtRaw) {
      throw new BadRequestException('returnAt required for round-trip rides');
    }
    const vehicleClassIds =
      dto.vehicleClassIds ?? ride.vehicleClassIds;
    if (!vehicleClassIds.length) {
      throw new BadRequestException('vehicleClassIds required');
    }

    const hours =
      dto.hours ??
      (typeof priorSnap.hours === 'number' ? priorSnap.hours : undefined);
    const days =
      dto.days ??
      (typeof priorSnap.days === 'number' ? priorSnap.days : undefined);
    const catalogItemId =
      dto.catalogItemId ??
      (typeof priorSnap.catalogItemId === 'string'
        ? priorSnap.catalogItemId
        : undefined);

    const material = isMaterialRideEdit(
      {
        fromLabel: ride.fromLabel,
        toLabel: ride.toLabel,
        fromLat: ride.fromLat,
        fromLng: ride.fromLng,
        toLat: ride.toLat,
        toLng: ride.toLng,
        pickupAt: ride.pickupAt,
        returnAt: ride.returnAt,
        isRoundTrip: ride.isRoundTrip,
        vehicleClassIds: ride.vehicleClassIds,
        hours: typeof priorSnap.hours === 'number' ? priorSnap.hours : null,
        days: typeof priorSnap.days === 'number' ? priorSnap.days : null,
      },
      {
        fromLabel,
        toLabel,
        fromLat,
        fromLng,
        toLat,
        toLng,
        pickupAt,
        returnAt: returnAtRaw,
        isRoundTrip,
        vehicleClassIds,
        hours: hours ?? null,
        days: days ?? null,
      },
    );

    const passengerUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passengerProfile: true },
    });
    const vip = passengerUser?.passengerProfile?.isVip === true;
    const vehicleClass = vehicleClassIds[0] ?? '*';
    const currency = ride.currency;
    const quote = await this.pricing.quote({
      serviceType: ride.serviceType as
        | 'RIDE'
        | 'PER_HOUR'
        | 'DELIVERY'
        | 'CAR_RENTAL'
        | 'EXPERIENCES',
      fromLat,
      fromLng,
      toLat: toLat ?? undefined,
      toLng: toLng ?? undefined,
      vehicleClass,
      currency,
      hours,
      days,
      catalogItemId,
      vip,
    });

    let snapshot: PriceSnapshot & { promo?: Record<string, unknown> } = {
      ...quote,
      isRoundTrip,
      legs: isRoundTrip ? 2 : 1,
    };
    if (isRoundTrip) {
      const guidance = round2(quote.guidanceAmount * 2);
      const minMul = quote.minBid / Math.max(quote.guidanceAmount, 0.01);
      const maxMul = quote.maxBid / Math.max(quote.guidanceAmount, 0.01);
      snapshot = {
        ...snapshot,
        distanceKm: round2(quote.distanceKm * 2),
        durationMin: round2(quote.durationMin * 2),
        guidanceAmount: guidance,
        minBid: round2(guidance * minMul),
        maxBid: round2(guidance * maxMul),
      };
    }
    if (priorSnap.promo && typeof priorSnap.promo === 'object') {
      snapshot = {
        ...snapshot,
        promo: priorSnap.promo as Record<string, unknown>,
      };
    }

    const adults = dto.adults ?? ride.adults;
    const childSeatsJson =
      dto.childSeatsJson !== undefined
        ? dto.childSeatsJson
        : ((ride.childSeatsJson as Record<string, unknown>) ?? {});
    const flight = dto.flight !== undefined ? dto.flight : ride.flight;
    const returnFlight =
      dto.returnFlight !== undefined ? dto.returnFlight : ride.returnFlight;
    const signage = dto.signage !== undefined ? dto.signage : ride.signage;
    const comment = dto.comment !== undefined ? dto.comment : ride.comment;
    const pickupWaitMin =
      dto.pickupWaitMin !== undefined ? dto.pickupWaitMin : ride.pickupWaitMin;
    const returnWaitMin =
      dto.returnWaitMin !== undefined ? dto.returnWaitMin : ride.returnWaitMin;

    const requiredOptions = this.resolveRequiredOptions({
      serviceType: ride.serviceType as CreateRideDto['serviceType'],
      fromLabel,
      fromLat,
      fromLng,
      pickupAt: pickupAt.toISOString(),
      vehicleClassIds,
      signage: signage ?? undefined,
      childSeatsJson,
      requiredOptions:
        dto.requiredOptions ??
        (Array.isArray(ride.requiredOptions)
          ? (ride.requiredOptions as string[])
          : undefined),
    });

    const nextStatus = material
      ? RideStatus.WAITING_FOR_OFFERS
      : ride.status;

    if (material) {
      await this.prisma.offer.updateMany({
        where: {
          rideId,
          status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] },
        },
        data: { status: OfferStatus.WITHDRAWN, withdrawnAt: new Date() },
      });
    }

    await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        fromLabel,
        toLabel,
        fromLat,
        fromLng,
        toLat,
        toLng,
        pickupAt,
        returnAt: returnAtRaw ?? undefined,
        isRoundTrip,
        pickupWaitMin,
        returnWaitMin,
        vehicleClassIds,
        adults,
        childSeatsJson: childSeatsJson as Prisma.InputJsonValue,
        flight,
        returnFlight,
        signage,
        comment,
        requiredOptions: requiredOptions as Prisma.InputJsonValue,
        priceSnapshot: asJson(snapshot),
        requestExpiresAt: this.lifecycle.computeRequestExpiresAt(pickupAt),
        status: nextStatus,
        ...(material
          ? { selectedOfferId: null, assignedDriverId: null }
          : {}),
      },
    });

    await this.transition(
      rideId,
      ride.status,
      nextStatus,
      'passenger',
      userId,
      {
        action: 'updateRide',
        material,
        quote: snapshot,
        withdrawnOffers: material,
      },
    );
    await this.audit(userId, 'ride.update', 'Ride', rideId, ip);

    if (material) {
      const updated = await this.prisma.ride.findUnique({
        where: { id: rideId },
      });
      if (updated) void this.notifyDriversOfNewRequest(updated);
    }

    return this.getRideForActor(userId, rideId);
  }

  /** Fan-out new open request to zone-matched (or zoneless) activated drivers. */
  private async notifyDriversOfNewRequest(ride: {
    id: string;
    fromLat: number;
    fromLng: number;
    fromLabel: string;
    toLabel: string | null;
    pickupAt: Date;
  }) {
    try {
      const userIds = await this.findEligibleDriverUserIds(
        ride.fromLat,
        ride.fromLng,
      );
      if (!userIds.length) return;

      const toLabel = ride.toLabel ?? '';
      const payload = {
        type: 'request.created',
        rideId: ride.id,
        fromLabel: ride.fromLabel,
        toLabel,
        fromLat: ride.fromLat,
        fromLng: ride.fromLng,
        pickupAt: ride.pickupAt.toISOString(),
      };
      this.tracking?.emitToDrivers(userIds, 'marketplace.request', payload);
      void this.notifications.notifyNewRideRequest({
        userIds,
        rideId: ride.id,
        fromLabel: ride.fromLabel,
        toLabel,
        pickupAt: ride.pickupAt.toISOString(),
      });
    } catch (err) {
      // Never fail createRide because of notification fan-out.
      this.logger.warn(
        `notifyDriversOfNewRequest failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Activated + approved drivers whose zones contain pickup (or have no geom zones). */
  private async findEligibleDriverUserIds(
    fromLat: number,
    fromLng: number,
  ): Promise<string[]> {
    const ids = new Set<string>();
    try {
      const matched = await this.prisma.$queryRawUnsafe<
        Array<{ userId: string }>
      >(
        `SELECT DISTINCT d."userId" AS "userId"
         FROM "DriverProfile" d
         INNER JOIN "OperatingZone" z ON z."driverId" = d.id
         WHERE d."isActivated" = true
           AND d."approvalStatus" = 'APPROVED'
           AND d."drivingEnabled" = true
           AND z.geom IS NOT NULL
           AND ST_Contains(
             z.geom,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)
           )`,
        fromLng,
        fromLat,
      );
      for (const row of matched) {
        if (row.userId) ids.add(row.userId);
      }
    } catch {
      // PostGIS unavailable — fall through to zoneless drivers only.
    }

    // Drivers with zero geom zones see all open rides (same as listOpenRequests fallback).
    try {
      const zoneless = await this.prisma.$queryRawUnsafe<
        Array<{ userId: string }>
      >(
        `SELECT d."userId" AS "userId"
         FROM "DriverProfile" d
         WHERE d."isActivated" = true
           AND d."approvalStatus" = 'APPROVED'
           AND d."drivingEnabled" = true
           AND NOT EXISTS (
             SELECT 1 FROM "OperatingZone" z
             WHERE z."driverId" = d.id AND z.geom IS NOT NULL
           )`,
      );
      for (const row of zoneless) {
        if (row.userId) ids.add(row.userId);
      }
    } catch {
      // ignore
    }

    return [...ids];
  }

  async listPassengerRides(userId: string) {
    const passenger = await this.requirePassenger(userId);
    const rides = await this.prisma.ride.findMany({
      where: { passengerId: passenger.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        offers: {
          where: { status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] } },
          include: {
            vehicle: true,
            driver: {
              select: {
                id: true,
                fullName: true,
                userId: true,
                createdAt: true,
                languagesJson: true,
              },
            },
          },
        },
        selectedOffer: {
          include: {
            vehicle: true,
            driver: {
              select: {
                id: true,
                fullName: true,
                userId: true,
                createdAt: true,
                languagesJson: true,
              },
            },
          },
        },
      },
    });
    return Promise.all(
      rides.map((r) => this.serializeRide(r, { enrichOffers: true })),
    );
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
            vehicle: true,
            driver: {
              select: {
                id: true,
                fullName: true,
                userId: true,
                createdAt: true,
                languagesJson: true,
                isActivated: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        selectedOffer: {
          include: {
            vehicle: true,
            driver: {
              select: {
                id: true,
                fullName: true,
                userId: true,
                createdAt: true,
                languagesJson: true,
              },
            },
          },
        },
        events: { orderBy: { createdAt: 'asc' }, take: 100 },
        payments: true,
        passenger: { select: { id: true, fullName: true, userId: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const isPassenger = ride.passenger.userId === userId;
    const isAssignedDriver =
      !!user.driverProfile && ride.assignedDriverId === user.driverProfile.id;
    const hasOffer =
      !!user.driverProfile &&
      ride.offers.some((o) => o.driverId === user.driverProfile!.id);
    const isOpenRequest =
      ride.status === RideStatus.WAITING_FOR_OFFERS ||
      ride.status === RideStatus.OFFER_SELECTION;
    const isEligibleOpenDriver =
      !!user.driverProfile &&
      user.driverProfile.isActivated &&
      user.driverProfile.approvalStatus === DriverApprovalStatus.APPROVED &&
      isOpenRequest &&
      (!ride.requestExpiresAt || ride.requestExpiresAt.getTime() > Date.now());
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (
      !isPassenger &&
      !isAssignedDriver &&
      !hasOffer &&
      !isEligibleOpenDriver &&
      !isAdmin
    ) {
      throw new ForbiddenException('Not allowed to view this ride');
    }

    return this.serializeRide(ride, {
      includeEvents: true,
      enrichOffers: isPassenger || isAdmin,
    });
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

    await this.lifecycle.requireTransition({
      rideId: ride.id,
      from: ride.status,
      to: RideStatus.PASSENGER_CANCELLED,
      actorType: 'passenger',
      actorId: userId,
      payload: {
        reason: 'passenger_cancel',
        cancelledBy: 'PASSENGER',
        cancelledAt: new Date().toISOString(),
      },
    });
    await this.prisma.offer.updateMany({
      where: { rideId, status: OfferStatus.ACTIVE },
      data: { status: OfferStatus.WITHDRAWN },
    });
    await this.audit(userId, 'ride.cancel', 'Ride', rideId, ip);
    void this.notifications.notifyRideStatus({
      userIds: [userId],
      rideId,
      status: RideStatus.PASSENGER_CANCELLED,
      title: 'Ride cancelled',
      body: 'Your ride request was cancelled.',
    });
    return this.getRideForActor(userId, rideId);
  }

  async createChangeRequest(
    userId: string,
    rideId: string,
    dto: CreateChangeRequestDto,
    ip?: string,
  ) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
      include: {
        selectedOffer: { include: { driver: { select: { userId: true } } } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const preTrip: RideStatus[] = [
      RideStatus.BOOKED,
      RideStatus.DRIVER_EN_ROUTE,
      RideStatus.DRIVER_ARRIVED,
    ];
    const ongoing: RideStatus[] = [
      RideStatus.DRIVER_EN_ROUTE,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.TRIP_STARTED,
      RideStatus.IN_PROGRESS,
    ];
    const allowedByType: Record<
      CreateChangeRequestDto['type'],
      RideStatus[]
    > = {
      FLIGHT_DELAY: preTrip,
      RESCHEDULE: preTrip,
      CURRENT_RIDE_HELP: ongoing,
      BILLING_HELP: [RideStatus.COMPLETED],
      REFUND_REQUEST: [RideStatus.COMPLETED],
    };
    const allowed = allowedByType[dto.type];
    if (!allowed.includes(ride.status)) {
      throw new BadRequestException(
        `Change request ${dto.type} not allowed from ${ride.status}`,
      );
    }

    const titles: Record<CreateChangeRequestDto['type'], string> = {
      FLIGHT_DELAY: 'Flight delay reported',
      RESCHEDULE: 'Reschedule request',
      BILLING_HELP: 'Billing help request',
      REFUND_REQUEST: 'Refund request',
      CURRENT_RIDE_HELP: 'Help with current ride',
    };
    const caseType =
      dto.type === 'BILLING_HELP' || dto.type === 'REFUND_REQUEST'
        ? SupportCaseType.BILLING
        : SupportCaseType.GENERAL;

    const noteLines = [
      `Type: ${dto.type}`,
      dto.flightNumber ? `Flight: ${dto.flightNumber}` : null,
      dto.proposedPickupAt ? `Proposed pickup: ${dto.proposedPickupAt}` : null,
      dto.note ? `Note: ${dto.note}` : null,
    ].filter(Boolean) as string[];

    const row = await this.prisma.supportCase.create({
      data: {
        title: titles[dto.type],
        type: caseType,
        createdById: userId,
        passengerProfileId: passenger.id,
        rideId,
        slaDueAt: new Date(Date.now() + 24 * 3600_000),
        notes: {
          create: {
            authorId: userId,
            body: noteLines.join('\n'),
            internal: false,
          },
        },
      },
    });

    await this.audit(userId, 'ride.change_request', 'SupportCase', row.id, ip);

    const driverUserId = ride.selectedOffer?.driver.userId;
    const notifyDriver =
      driverUserId &&
      (dto.type === 'FLIGHT_DELAY' ||
        dto.type === 'RESCHEDULE' ||
        dto.type === 'CURRENT_RIDE_HELP');
    if (notifyDriver) {
      void this.notifications.notifyRideStatus({
        userIds: [driverUserId],
        rideId,
        status: 'CHANGE_REQUEST',
        title: titles[dto.type],
        body: dto.note?.slice(0, 120) ?? titles[dto.type],
        data: {
          type: 'CHANGE_REQUEST',
          changeRequestId: row.id,
          requestType: dto.type,
          deepLink: `/driver/trip/${rideId}`,
        },
      });
    }

    return { id: row.id, status: 'OPEN' as const };
  }

  async selectOffer(
    userId: string,
    rideId: string,
    offerId: string,
    ip?: string,
  ) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
      include: { offers: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    // Idempotent: same offer already selected and awaiting payment.
    if (
      ride.status === RideStatus.PAYMENT_PENDING &&
      ride.selectedOfferId === offerId
    ) {
      return this.getRideForActor(userId, rideId);
    }

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

    // Reserve for payment only — do NOT close competing offers until payment
    // succeeds (markBooked). Optimistic locks prevent double-booking races.
    await this.prisma.$transaction(async (tx) => {
      const offerLock = await tx.offer.updateMany({
        where: {
          id: offerId,
          rideId,
          status: OfferStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
        data: { status: OfferStatus.SELECTED, acceptedAt: new Date() },
      });
      if (offerLock.count !== 1) {
        throw new BadRequestException('Offer not available');
      }

      const rideLock = await tx.ride.updateMany({
        where: {
          id: rideId,
          passengerId: passenger.id,
          status: {
            in: [RideStatus.WAITING_FOR_OFFERS, RideStatus.OFFER_SELECTION],
          },
        },
        data: {
          selectedOfferId: offerId,
          assignedDriverId: offer.driverId,
          priceSnapshot: offer.priceSnapshot as Prisma.InputJsonValue,
          status: RideStatus.PAYMENT_PENDING,
          paymentExpiresAt: new Date(Date.now() + this.payTtlMs),
        },
      });
      if (rideLock.count !== 1) {
        throw new BadRequestException(
          'Ride is no longer available for booking',
        );
      }

      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: ride.status,
          toStatus: RideStatus.PAYMENT_PENDING,
          actorType: 'passenger',
          actorId: userId,
          payload: { offerId, action: 'offer_reserved_for_payment' },
        },
      });
      await tx.offerHistory.create({
        data: {
          offerId,
          rideId,
          driverId: offer.driverId,
          action: 'RESERVED_FOR_PAYMENT',
          afterJson: { offerId, bidAmount: Number(offer.bidAmount) },
          actorId: userId,
        },
      });
    });

    await this.audit(userId, 'ride.select_offer', 'Offer', offerId, ip);

    const winnerUser = await this.prisma.driverProfile.findUnique({
      where: { id: offer.driverId },
      select: { userId: true },
    });
    if (winnerUser) {
      void this.notifications.notifyRideStatus({
        userIds: [winnerUser.userId],
        rideId,
        status: 'OFFER_RESERVED',
        title: 'Offer reserved',
        body: 'A passenger started booking your offer. Payment is pending.',
        data: { rideId, offerId, type: 'OFFER_RESERVED' },
      });
    }
    this.tracking?.emitRideEvent(rideId, {
      type: 'offer.reserved',
      offerId,
      rideId,
      status: RideStatus.PAYMENT_PENDING,
    });
    if (passenger.userId) {
      this.tracking?.emitToPassengers([passenger.userId], 'ride.status.changed', {
        rideId,
        status: RideStatus.PAYMENT_PENDING,
        offerId,
      });
    }

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

    const dismissals = await this.prisma.requestDismissal.findMany({
      where: { driverId: driver.id },
      select: { rideId: true },
    });
    const dismissed = new Set(dismissals.map((d) => d.rideId));

    const rides = await this.prisma.ride.findMany({
      where:
        matchedIds.length > 0
          ? { id: { in: matchedIds.filter((id) => !dismissed.has(id)) } }
          : {
              status: { in: openStatuses },
              requestExpiresAt: { gt: new Date() },
              id: { notIn: [...dismissed] },
            },
      include: {
        offers: {
          where: { driverId: driver.id },
          include: { vehicle: true },
          orderBy: { createdAt: 'desc' },
        },
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
      if (dismissed.has(r.id)) return false;
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
        const withGeom = await this.prisma.$queryRawUnsafe<
          Array<{ c: bigint }>
        >(
          `SELECT COUNT(*)::bigint AS c FROM "OperatingZone" WHERE "driverId" = $1 AND geom IS NOT NULL`,
          driver.id,
        );
        if (Number(withGeom[0]?.c ?? 0) > 0) {
          return [];
        }
      }
    }

    return Promise.all(
      filtered.map(async (r) => {
        const serialized = await this.serializeRide(r);
        // Always serialize offers — raw Prisma Decimals become JSON strings and
        // break Flutter `as num` casts, wiping the entire open-requests list.
        const myOffers = (r.offers ?? []).map((o) =>
          this.serializeOffer(o as unknown as Record<string, unknown>),
        );
        return { ...serialized, myOffers, offers: myOffers };
      }),
    );
  }

  /** Booked / in-progress / completed trips assigned to this driver. */
  async listDriverRides(userId: string) {
    const driver = await this.requireActivatedDriver(userId);
    const statuses: RideStatus[] = [
      RideStatus.BOOKED,
      RideStatus.DRIVER_EN_ROUTE,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.TRIP_STARTED,
      RideStatus.IN_PROGRESS,
      RideStatus.COMPLETED,
      RideStatus.NO_SHOW,
      RideStatus.PASSENGER_CANCELLED,
      RideStatus.DRIVER_CANCELLED,
      RideStatus.ADMIN_CANCELLED,
    ];
    const rides = await this.prisma.ride.findMany({
      where: {
        assignedDriverId: driver.id,
        status: { in: statuses },
      },
      include: {
        offers: {
          where: { driverId: driver.id },
          include: { vehicle: true },
          orderBy: { createdAt: 'desc' },
        },
        selectedOffer: {
          include: { vehicle: true },
        },
        passenger: { select: { fullName: true } },
      },
      orderBy: { pickupAt: 'asc' },
      take: 100,
    });

    return Promise.all(
      rides.map(async (r) => {
        const serialized = await this.serializeRide(r);
        const myOffers = (r.offers ?? []).map((o) =>
          this.serializeOffer(o as unknown as Record<string, unknown>),
        );
        return {
          ...serialized,
          myOffers,
          offers: myOffers,
          passengerName: r.passenger?.fullName ?? null,
        };
      }),
    );
  }

  async getDriverRequest(userId: string, rideId: string) {
    const driver = await this.requireActivatedDriver(userId);
    const dismissed = await this.prisma.requestDismissal.findUnique({
      where: {
        rideId_driverId: { rideId, driverId: driver.id },
      },
    });
    if (dismissed) {
      throw new NotFoundException('Request not available');
    }
    const ride = await this.getRideForActor(userId, rideId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { driverId: driver.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...ride,
      eligibleVehicles: vehicles.map((v) => this.serializeVehicle(v)),
      offerValidityOptions: this.offerValidityLabels(),
    };
  }

  async skipRequest(userId: string, rideId: string, ip?: string) {
    const driver = await this.requireActivatedDriver(userId);
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (
      ride.status !== RideStatus.WAITING_FOR_OFFERS &&
      ride.status !== RideStatus.OFFER_SELECTION
    ) {
      throw new BadRequestException('Request is no longer open');
    }

    await this.prisma.requestDismissal.upsert({
      where: {
        rideId_driverId: { rideId, driverId: driver.id },
      },
      create: { rideId, driverId: driver.id },
      update: {},
    });
    await this.audit(userId, 'driver.request_skipped', 'Ride', rideId, ip);

    const next = await this.listOpenRequests(userId);
    return {
      ok: true,
      skippedRideId: rideId,
      nextRequestId: next[0]?.id ?? null,
      remaining: next.length,
    };
  }

  async createOffer(
    userId: string,
    rideId: string,
    dto: CreateOfferDto,
    ip?: string,
  ) {
    const driver = await this.requireActivatedDriver(userId);

    if (dto.idempotencyKey) {
      const prior = await this.prisma.offer.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (prior) return this.serializeOffer(prior);
    }

    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    const dismissed = await this.prisma.requestDismissal.findUnique({
      where: {
        rideId_driverId: { rideId, driverId: driver.id },
      },
    });
    if (dismissed) {
      throw new BadRequestException('You skipped this request');
    }

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
      throw new BadRequestException(
        'You already have an active offer on this ride — edit or withdraw it',
      );
    }

    const priced = this.resolveOfferPrices(ride, dto);
    const vehicle = await this.requireEligibleVehicle(
      driver.id,
      dto.vehicleId,
      ride,
    );
    const selectedOptions = this.normalizeSelectedOptions(
      [...(dto.selectedOptions ?? []), ...this.requiredOptionList(ride)],
      vehicle?.amenitiesJson,
    );
    this.assertRequiredOptions(ride, selectedOptions);

    const guidance = (ride.priceSnapshot ?? {}) as PriceSnapshot;
    if (!guidance.guidanceAmount) {
      throw new BadRequestException('Ride missing pricing guidance');
    }
    const snapshot = this.pricing.freezeBid(guidance, priced.bidAmount, {
      outboundPrice: priced.outboundPrice,
      returnPrice: priced.returnPrice,
    });

    const validForSeconds = this.resolveValiditySeconds(
      dto.validForSeconds,
      ride.requestExpiresAt,
    );
    const expiresAt = new Date(Date.now() + validForSeconds * 1000);

    const offer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.offer.create({
        data: {
          rideId,
          driverId: driver.id,
          vehicleId: vehicle?.id,
          outboundPrice: priced.outboundPrice,
          returnPrice: priced.returnPrice,
          bidAmount: snapshot.bidAmount!,
          currency: dto.currency ?? ride.currency,
          priceSnapshot: asJson(snapshot),
          selectedOptions: selectedOptions as Prisma.InputJsonValue,
          validForSeconds,
          status: OfferStatus.ACTIVE,
          expiresAt,
          idempotencyKey: dto.idempotencyKey ?? undefined,
        },
      });
      await tx.offerHistory.create({
        data: {
          offerId: created.id,
          rideId,
          driverId: driver.id,
          action: 'CREATED',
          afterJson: this.offerAuditPayload(created),
          actorId: userId,
        },
      });
      if (ride.status === RideStatus.WAITING_FOR_OFFERS) {
        await tx.ride.update({
          where: { id: ride.id },
          data: { status: RideStatus.OFFER_SELECTION },
        });
        await tx.rideEvent.create({
          data: {
            rideId: ride.id,
            fromStatus: ride.status,
            toStatus: RideStatus.OFFER_SELECTION,
            actorType: 'system',
            payload: { offerId: created.id, action: 'first_offer' },
          },
        });
      }
      return created;
    });

    await this.audit(userId, 'offer.create', 'Offer', offer.id, ip);

    const passenger = await this.prisma.passengerProfile.findUnique({
      where: { id: ride.passengerId },
      select: { userId: true },
    });
    if (passenger) {
      void this.notifyPassengerNewOffer({
        passengerUserId: passenger.userId,
        rideId,
        offerId: offer.id,
        driverId: driver.id,
        vehicleId: vehicle?.id ?? offer.vehicleId,
        currency: offer.currency,
        amount: Number(offer.bidAmount),
        vehicleName: vehicle?.name,
      });
      this.tracking?.emitToPassengers(
        [passenger.userId],
        'marketplace.offer',
        {
          type: 'offer.created',
          offerId: offer.id,
          rideId,
        },
      );
    }
    this.tracking?.emitRideEvent(rideId, {
      type: 'offer.created',
      offerId: offer.id,
      rideId,
    });

    return this.serializeOffer(offer);
  }

  async updateOffer(
    userId: string,
    rideId: string,
    offerId: string,
    dto: UpdateOfferDto,
    ip?: string,
  ) {
    const driver = await this.requireActivatedDriver(userId);

    if (dto.idempotencyKey) {
      const prior = await this.prisma.offer.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (prior) return this.serializeOffer(prior);
    }

    const existing = await this.prisma.offer.findFirst({
      where: { id: offerId, rideId, driverId: driver.id },
    });
    if (!existing) throw new NotFoundException('Offer not found');
    if (existing.status !== OfferStatus.ACTIVE) {
      throw new BadRequestException('Only active offers can be edited');
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Offer expired');
    }

    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (
      ride.status !== RideStatus.WAITING_FOR_OFFERS &&
      ride.status !== RideStatus.OFFER_SELECTION
    ) {
      throw new BadRequestException('Request is no longer open for offers');
    }

    const priced = this.resolveOfferPrices(ride, {
      outboundPrice: dto.outboundPrice ?? Number(existing.outboundPrice),
      returnPrice:
        dto.returnPrice !== undefined
          ? dto.returnPrice
          : existing.returnPrice != null
            ? Number(existing.returnPrice)
            : undefined,
      bidAmount: dto.bidAmount,
    });
    const vehicle = await this.requireEligibleVehicle(
      driver.id,
      dto.vehicleId ?? existing.vehicleId ?? undefined,
      ride,
    );
    const selectedOptions = this.normalizeSelectedOptions(
      dto.selectedOptions ??
        (Array.isArray(existing.selectedOptions)
          ? (existing.selectedOptions as string[])
          : []),
      vehicle?.amenitiesJson,
    );
    this.assertRequiredOptions(ride, selectedOptions);

    const guidance = (ride.priceSnapshot ?? {}) as PriceSnapshot;
    const snapshot = this.pricing.freezeBid(guidance, priced.bidAmount, {
      outboundPrice: priced.outboundPrice,
      returnPrice: priced.returnPrice,
    });
    const validForSeconds = this.resolveValiditySeconds(
      dto.validForSeconds ?? existing.validForSeconds,
      ride.requestExpiresAt,
    );
    const expiresAt = new Date(Date.now() + validForSeconds * 1000);

    const replacement = await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: existing.id },
        data: {
          status: OfferStatus.SUPERSEDED,
          withdrawnAt: new Date(),
        },
      });
      const created = await tx.offer.create({
        data: {
          rideId,
          driverId: driver.id,
          vehicleId: vehicle?.id,
          outboundPrice: priced.outboundPrice,
          returnPrice: priced.returnPrice,
          bidAmount: snapshot.bidAmount!,
          currency: existing.currency,
          priceSnapshot: asJson(snapshot),
          selectedOptions: selectedOptions as Prisma.InputJsonValue,
          validForSeconds,
          status: OfferStatus.ACTIVE,
          expiresAt,
          version: existing.version + 1,
          supersedesOfferId: existing.id,
          idempotencyKey: dto.idempotencyKey ?? undefined,
        },
      });
      await tx.offerHistory.create({
        data: {
          offerId: created.id,
          rideId,
          driverId: driver.id,
          action: 'UPDATED',
          beforeJson: this.offerAuditPayload(existing),
          afterJson: this.offerAuditPayload(created),
          actorId: userId,
        },
      });
      return created;
    });

    await this.audit(userId, 'offer.update', 'Offer', replacement.id, ip);
    const passenger = await this.prisma.passengerProfile.findUnique({
      where: { id: ride.passengerId },
      select: { userId: true },
    });
    if (passenger) {
      this.tracking?.emitToPassengers(
        [passenger.userId],
        'marketplace.offer',
        {
          type: 'offer.updated',
          offerId: replacement.id,
          rideId,
          supersededOfferId: existing.id,
        },
      );
      void this.notifications.notifyOfferUpdated({
        userId: passenger.userId,
        rideId,
        offerId: replacement.id,
        supersededOfferId: existing.id,
        title: 'Offer updated',
        body: 'A driver enhanced or updated their offer. Review the new details.',
      });
    }
    this.tracking?.emitRideEvent(rideId, {
      type: 'offer.updated',
      offerId: replacement.id,
      rideId,
      supersededOfferId: existing.id,
    });
    return this.serializeOffer(replacement);
  }

  async withdrawOffer(userId: string, offerId: string, ip?: string) {
    const driver = await this.requireActivatedDriver(userId);
    const offer = await this.prisma.offer.findFirst({
      where: { id: offerId, driverId: driver.id },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== OfferStatus.ACTIVE) {
      throw new BadRequestException('Only active offers can be withdrawn');
    }

    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        status: OfferStatus.WITHDRAWN,
        withdrawnAt: new Date(),
      },
    });
    await this.prisma.offerHistory.create({
      data: {
        offerId,
        rideId: offer.rideId,
        driverId: driver.id,
        action: 'WITHDRAWN',
        beforeJson: this.offerAuditPayload(offer),
        afterJson: this.offerAuditPayload(updated),
        actorId: userId,
      },
    });
    await this.audit(userId, 'offer.withdraw', 'Offer', offerId, ip);

    const ride = await this.prisma.ride.findUnique({
      where: { id: offer.rideId },
      include: { passenger: { select: { userId: true } } },
    });
    if (ride?.passenger?.userId) {
      void this.notifications.notifyRideStatus({
        userIds: [ride.passenger.userId],
        rideId: offer.rideId,
        status: 'OFFER_WITHDRAWN',
        title: 'Offer withdrawn',
        body: 'A driver withdrew their offer.',
        data: {
          type: 'OFFER_WITHDRAWN',
          offerId,
          deepLink: `/offers/${offer.rideId}`,
        },
      });
      this.tracking?.emitToPassengers(
        [ride.passenger.userId],
        'marketplace.offer',
        {
          type: 'offer.withdrawn',
          offerId,
          rideId: offer.rideId,
        },
      );
    }
    this.tracking?.emitRideEvent(offer.rideId, {
      type: 'offer.withdrawn',
      offerId,
      rideId: offer.rideId,
    });
    return this.serializeOffer(updated);
  }

  // ---------- Passenger book / pay enrichment ----------

  async validateBook(userId: string, rideId: string, offerId: string) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const offer = await this.loadOfferWithPresentation(offerId);
    if (!offer || offer.rideId !== rideId) {
      throw new NotFoundException('Offer not found');
    }

    const alreadySelected =
      ride.status === RideStatus.PAYMENT_PENDING &&
      ride.selectedOfferId === offerId &&
      offer.status === OfferStatus.SELECTED;

    if (
      !alreadySelected &&
      ride.status !== RideStatus.WAITING_FOR_OFFERS &&
      ride.status !== RideStatus.OFFER_SELECTION
    ) {
      throw new BadRequestException(
        `Cannot book from ride status ${ride.status}`,
      );
    }

    if (!alreadySelected) {
      if (offer.status !== OfferStatus.ACTIVE) {
        throw new BadRequestException('Offer is not active');
      }
      if (offer.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Offer expired');
      }
      await this.assertOfferBookableDriverVehicle(offer);
    }

    const snap = offer.priceSnapshot as PriceSnapshot;
    const total =
      snap?.passengerTotal != null
        ? Number(snap.passengerTotal)
        : Number(offer.bidAmount);
    const paymentQuote = this.presentation.computePaymentQuote({
      totalAmount: total,
      currency: offer.currency,
      paymentMode: 'FULL',
    });

    return {
      ok: true as const,
      offer: await this.serializeOfferForPassenger(
        offer as unknown as Record<string, unknown>,
      ),
      paymentQuote,
      cancellationPolicy: this.presentation.cancellationPolicy({
        paymentMode: 'FULL',
      }),
      paymentMethods: this.presentation.paymentMethodsAvailable(),
    };
  }

  async getPaymentQuote(userId: string, dto: PaymentQuoteDto) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: dto.rideId, passengerId: passenger.id },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const offer = await this.loadOfferWithPresentation(dto.offerId);
    if (!offer || offer.rideId !== dto.rideId) {
      throw new NotFoundException('Offer not found');
    }

    const selectedForRide =
      offer.status === OfferStatus.SELECTED &&
      ride.selectedOfferId === offer.id;
    const bookable =
      offer.status === OfferStatus.ACTIVE &&
      offer.expiresAt.getTime() >= Date.now() &&
      (ride.status === RideStatus.WAITING_FOR_OFFERS ||
        ride.status === RideStatus.OFFER_SELECTION ||
        ride.status === RideStatus.PAYMENT_PENDING);

    if (!selectedForRide && !bookable) {
      throw new BadRequestException('Offer is not available for payment');
    }
    if (!selectedForRide) {
      await this.assertOfferBookableDriverVehicle(offer);
    }

    const mode = dto.paymentMode ?? 'FULL';
    const partialCfg = this.presentation.partialPaymentConfig();
    if (mode === 'PARTIAL' && !partialCfg.enabled) {
      throw new BadRequestException('Partial payment is not enabled');
    }

    const snap = offer.priceSnapshot as PriceSnapshot;
    const total =
      snap?.passengerTotal != null
        ? Number(snap.passengerTotal)
        : Number(offer.bidAmount);
    const paymentQuote = this.presentation.computePaymentQuote({
      totalAmount: total,
      currency: offer.currency,
      paymentMode: mode,
    });

    return {
      paymentQuote,
      partialEnabled: paymentQuote.partialEnabled,
      cancellationPolicy: this.presentation.cancellationPolicy({
        paymentMode: mode,
      }),
      paymentMethods: this.presentation.paymentMethodsAvailable(dto.platform),
      terms: {
        termsOfServiceUrl: '/legal/terms',
        privacyPolicyUrl: '/legal/privacy',
        cancellationPolicyUrl: '/legal/cancellation',
      },
    };
  }

  async getOfferDetail(userId: string, rideId: string, offerId: string) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
      select: { id: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const offer = await this.loadOfferWithPresentation(offerId);
    if (!offer || offer.rideId !== rideId) {
      throw new NotFoundException('Offer not found');
    }

    const base = this.serializeOffer(offer as unknown as Record<string, unknown>);
    const enriched = await this.presentation.enrichOffer(
      offer as unknown as Record<string, unknown>,
      { includeReviews: true },
    );
    return {
      ...base,
      ...enriched,
      reviews: enriched.presentation.reviews,
    };
  }

  /** Authenticated binary stream for approved vehicle photos on an offer. */
  async getOfferVehiclePhotoContent(
    userId: string,
    rideId: string,
    offerId: string,
    documentId: string,
  ) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
      select: { id: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const offer = await this.prisma.offer.findFirst({
      where: { id: offerId, rideId },
      select: { id: true, vehicleId: true },
    });
    if (!offer?.vehicleId) throw new NotFoundException('Offer not found');

    const doc = await this.prisma.driverDocument.findFirst({
      where: {
        id: documentId,
        vehicleId: offer.vehicleId,
        docType: 'vehicle_photo',
        status: DocumentReviewStatus.APPROVED,
        lifecycleStatus: DocumentLifecycleStatus.CURRENT,
      },
      select: {
        id: true,
        storageKey: true,
        mimeType: true,
        originalFilename: true,
        docType: true,
      },
    });
    if (!doc) throw new NotFoundException('Photo not found');
    if (!doc.storageKey?.trim()) {
      throw new NotFoundException('Photo storage key missing');
    }
    if (!this.storage.isReady()) {
      throw new NotFoundException('Photo storage unavailable');
    }
    let object: { body: Buffer; contentType: string };
    try {
      object = await this.storage.getObjectBytes(doc.storageKey);
    } catch {
      throw new NotFoundException('Photo object no longer available');
    }
    return {
      body: object.body,
      contentType: doc.mimeType || object.contentType,
      filename: sanitizeContentDispositionFilename(
        doc.originalFilename ?? `${doc.docType}`,
      ),
    };
  }

  async listOfferReviews(
    userId: string,
    offerId: string,
    opts?: { cursor?: string; take?: number },
  ) {
    const passenger = await this.requirePassenger(userId);
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        ride: { select: { passengerId: true } },
        driver: { select: { userId: true } },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.ride.passengerId !== passenger.id) {
      throw new ForbiddenException('Not allowed to view these reviews');
    }

    const take = Math.min(Math.max(opts?.take ?? 20, 1), 50);
    const ratings = await this.prisma.rating.findMany({
      where: {
        toUserId: offer.driver.userId,
        moderationStatus: 'VISIBLE',
        ...(opts?.cursor
          ? { createdAt: { lt: new Date(opts.cursor) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: {
        stars: true,
        comment: true,
        createdAt: true,
        fromUserId: true,
      },
    });
    const hasMore = ratings.length > take;
    const page = hasMore ? ratings.slice(0, take) : ratings;
    return {
      items: page.map((r) => ({
        stars: r.stars,
        text: r.comment ?? '',
        createdAt: r.createdAt,
        translatedFrom: null as string | null,
      })),
      nextCursor: hasMore
        ? page[page.length - 1]?.createdAt.toISOString()
        : null,
    };
  }

  async getPaymentStatus(userId: string, rideId: string) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
      select: {
        id: true,
        status: true,
        paymentExpiresAt: true,
        selectedOfferId: true,
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const payment = await this.prisma.payment.findFirst({
      where: { rideId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      rideId: ride.id,
      rideStatus: ride.status,
      paymentExpiresAt: ride.paymentExpiresAt,
      selectedOfferId: ride.selectedOfferId,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amount: Number(payment.amount),
            currency: payment.currency,
            paymentMode: payment.paymentMode,
            onlineAmount:
              payment.onlineAmount != null
                ? Number(payment.onlineAmount)
                : null,
            cashAmount:
              payment.cashAmount != null ? Number(payment.cashAmount) : null,
            provider: payment.provider,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt,
          }
        : null,
    };
  }

  async recordRideView(userId: string, rideId: string) {
    const passenger = await this.requirePassenger(userId);
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, passengerId: passenger.id },
      select: { id: true, viewCount: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    const updated = await this.prisma.ride.update({
      where: { id: rideId },
      data: { viewCount: { increment: 1 } },
      select: { id: true, viewCount: true },
    });
    return { ok: true as const, rideId: updated.id, viewCount: updated.viewCount };
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
      throw new BadRequestException(
        `Ride is not awaiting payment (${ride.status})`,
      );
    }
    if (!ride.selectedOffer) {
      throw new BadRequestException('No selected offer');
    }
    if (ride.paymentExpiresAt && ride.paymentExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Payment window expired');
    }

    const snap = ride.selectedOffer.priceSnapshot as PriceSnapshot;
    const totalAmount = snap.passengerTotal;
    if (totalAmount == null) {
      throw new BadRequestException('Frozen passenger total missing');
    }

    const paymentMode = dto.paymentMode ?? 'FULL';
    const partialCfg = this.presentation.partialPaymentConfig();
    if (paymentMode === 'PARTIAL' && !partialCfg.enabled) {
      throw new BadRequestException('Partial payment is not enabled');
    }

    const paymentQuote = this.presentation.computePaymentQuote({
      totalAmount: Number(totalAmount),
      currency: ride.currency,
      paymentMode,
    });
    const amount = paymentQuote.onlineAmount;

    const idem =
      dto.idempotencyKey ??
      `pay_${ride.id}_${ride.selectedOfferId}_${paymentMode}_${amount}`;

    const prior = await this.prisma.payment.findUnique({
      where: { idempotencyKey: idem },
    });
    if (prior && prior.status === 'succeeded') {
      return {
        payment: prior,
        paymentQuote,
        ride: await this.getRideForActor(userId, ride.id),
      };
    }

    const intent = await this.payments.createIntent({
      amount,
      currency: ride.currency,
      rideId: ride.id,
      idempotencyKey: idem,
      metadata: {
        offerId: ride.selectedOfferId!,
        paymentMode,
        onlineAmount: String(amount),
      },
    });

    const termsAcceptedAt =
      dto.termsAccepted === true ? new Date() : undefined;

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
        paymentMode: paymentQuote.paymentMode,
        onlineAmount: paymentQuote.onlineAmount,
        cashAmount: paymentQuote.cashAmount,
        cashCurrency: paymentQuote.cashCurrency,
        paymentMethod: dto.paymentMethod ?? null,
        termsVersion: dto.termsVersion ?? null,
        policyVersion: dto.policyVersion ?? null,
        termsAcceptedAt: termsAcceptedAt ?? null,
      },
      update: {
        providerRef: intent.intentId,
        status: intent.status,
        amount,
        paymentMode: paymentQuote.paymentMode,
        onlineAmount: paymentQuote.onlineAmount,
        cashAmount: paymentQuote.cashAmount,
        cashCurrency: paymentQuote.cashCurrency,
        paymentMethod: dto.paymentMethod ?? undefined,
        termsVersion: dto.termsVersion ?? undefined,
        policyVersion: dto.policyVersion ?? undefined,
        ...(termsAcceptedAt ? { termsAcceptedAt } : {}),
      },
    });

    if (intent.status === 'succeeded') {
      await this.markBooked(ride.id, payment.id, userId);
    }

    await this.audit(userId, 'payment.intent', 'Payment', payment.id, ip);
    return {
      payment,
      paymentQuote,
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
      // Do not leave the ride stuck — release reservation so passenger can retry.
      await this.releasePaymentReservation(
        payment.rideId,
        'payment_failed',
        RideStatus.OFFER_SELECTION,
      );
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
    // Offers expire independently — never propagates to ride.status
    const expiredOffers = await this.prisma.offer.updateMany({
      where: { status: OfferStatus.ACTIVE, expiresAt: { lt: new Date() } },
      data: { status: OfferStatus.EXPIRED, expiredAt: new Date() },
    });
    if (expiredOffers.count > 0) {
      // bulk offer expiry is intentional and isolated from ride lifecycle
    }

    const expiredRequests = await this.lifecycle.expireUnfulfilledRequests();
    const pay = await this.lifecycle.handlePaymentWindowTimeouts();

    return {
      expiredOffers: expiredOffers.count,
      expiredRequests,
      expiredPayments: pay.expiredPayments,
      reopenedPayments: pay.reopenedPayments,
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
        offers: {
          where: { status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] } },
          select: { id: true, driverId: true, status: true },
        },
      },
    });
    if (!ride) return;
    if (ride.status === RideStatus.BOOKED) return;
    if (ride.status !== RideStatus.PAYMENT_PENDING) {
      throw new BadRequestException(
        `Cannot book from ${ride.status} for payment ${paymentId}`,
      );
    }
    if (!ride.selectedOfferId) {
      throw new BadRequestException('No selected offer to book');
    }

    const now = new Date();
    const booked = await this.prisma.$transaction(async (tx) => {
      const rideLock = await tx.ride.updateMany({
        where: { id: rideId, status: RideStatus.PAYMENT_PENDING },
        data: { status: RideStatus.BOOKED, paymentExpiresAt: null },
      });
      if (rideLock.count !== 1) {
        return false;
      }

      // Winning offer stays SELECTED (accepted). Close all other open offers.
      await tx.offer.updateMany({
        where: {
          rideId,
          id: { not: ride.selectedOfferId! },
          status: {
            in: [OfferStatus.ACTIVE, OfferStatus.SELECTED],
          },
        },
        data: {
          status: OfferStatus.REJECTED,
          rejectedAt: now,
        },
      });

      await tx.rideEvent.create({
        data: {
          rideId,
          fromStatus: RideStatus.PAYMENT_PENDING,
          toStatus: RideStatus.BOOKED,
          actorType: actorId ? 'passenger' : 'system',
          actorId,
          payload: {
            paymentId,
            action: 'payment_succeeded',
            offerId: ride.selectedOfferId,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.offerHistory.create({
        data: {
          offerId: ride.selectedOfferId!,
          rideId,
          driverId: ride.selectedOffer!.driverId,
          action: 'ACCEPTED',
          afterJson: { paymentId, status: 'BOOKED' },
          actorId: actorId ?? undefined,
        },
      });
      return true;
    });

    if (!booked) {
      const again = await this.prisma.ride.findUnique({
        where: { id: rideId },
        select: { status: true },
      });
      if (again?.status === RideStatus.BOOKED) return;
      throw new BadRequestException(
        `Cannot book from ${again?.status ?? 'unknown'} for payment ${paymentId}`,
      );
    }

    const bookingData = {
      bookingId: rideId,
      rideId,
      offerId: ride.selectedOfferId,
      type: 'ride.booked',
      deepLink: `/booking-confirmed/${rideId}`,
    };
    void this.notifications.notifyRideStatus({
      userIds: [ride.passenger.userId],
      rideId,
      status: RideStatus.BOOKED,
      title: 'Booking confirmed',
      body: `Your transfer from ${ride.fromLabel} is confirmed.`,
      data: bookingData,
    });
    const driverUserId = ride.selectedOffer?.driver.userId;
    if (driverUserId) {
      const pickupLabel = ride.fromLabel;
      const when =
        ride.pickupAt instanceof Date
          ? ride.pickupAt.toISOString()
          : String(ride.pickupAt);
      void this.notifications.notifyRideStatus({
        userIds: [driverUserId],
        rideId,
        status: RideStatus.BOOKED,
        title: 'Your offer has been accepted',
        body: `Pickup at ${pickupLabel} · ${when}`,
        data: bookingData,
      });
    }

    // Notify losing drivers only after payment confirms the booking.
    for (const o of ride.offers) {
      if (o.id === ride.selectedOfferId) continue;
      const d = await this.prisma.driverProfile.findUnique({
        where: { id: o.driverId },
        select: { userId: true },
      });
      if (d) {
        void this.notifications.notifyRideStatus({
          userIds: [d.userId],
          rideId,
          status: 'OFFER_NOT_SELECTED',
          title: 'Offer not selected',
          body: 'Another offer was booked for this request.',
          data: { rideId, offerId: o.id, type: 'OFFER_NOT_SELECTED' },
        });
      }
    }

    this.tracking?.emitRideEvent(rideId, {
      type: 'ride.booked',
      rideId,
      offerId: ride.selectedOfferId,
      status: RideStatus.BOOKED,
      paymentId,
    });
    this.tracking?.emitToPassengers([ride.passenger.userId], 'ride.status.changed', {
      rideId,
      status: RideStatus.BOOKED,
      offerId: ride.selectedOfferId,
    });
    if (driverUserId) {
      this.tracking?.emitToDrivers([driverUserId], 'ride.status.changed', {
        rideId,
        status: RideStatus.BOOKED,
        offerId: ride.selectedOfferId,
      });
    }
  }

  /** Release a payment reservation so competing offers stay bookable. */
  private async releasePaymentReservation(
    rideId: string,
    reason: string,
    toStatus: RideStatus = RideStatus.OFFER_SELECTION,
  ) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: {
        id: true,
        status: true,
        selectedOfferId: true,
        offers: { where: { status: OfferStatus.SELECTED }, select: { id: true } },
      },
    });
    if (!ride || ride.status !== RideStatus.PAYMENT_PENDING) return false;

    const now = new Date();
    const result = await this.lifecycle.transition({
      rideId,
      from: RideStatus.PAYMENT_PENDING,
      to: toStatus,
      actorType: 'system',
      payload: { reason },
      extraRideData: {
        selectedOfferId: null,
        assignedDriverId: null,
        paymentExpiresAt: null,
      },
    });
    if (!result.ok) return false;

    if (ride.selectedOfferId) {
      await this.prisma.offer.updateMany({
        where: { id: ride.selectedOfferId, status: OfferStatus.SELECTED },
        data: {
          status: OfferStatus.ACTIVE,
          acceptedAt: null,
        },
      });
    } else {
      await this.prisma.offer.updateMany({
        where: { rideId, status: OfferStatus.SELECTED },
        data: {
          status: OfferStatus.ACTIVE,
          acceptedAt: null,
        },
      });
    }

    this.tracking?.emitRideEvent(rideId, {
      type: 'offer.reservation_released',
      rideId,
      reason,
      status: toStatus,
      at: now.toISOString(),
    });
    return true;
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

  private async serializeRide(
    ride: Record<string, unknown>,
    opts?: { includeEvents?: boolean; enrichOffers?: boolean },
  ) {
    const snap = ride.priceSnapshot as PriceSnapshot | null | undefined;
    const status = ride.status as RideStatus;
    const offerRows = Array.isArray(ride.offers)
      ? (ride.offers as Array<Record<string, unknown>>)
      : [];
    // Passengers only see bookable offers — withdrawn/expired/superseded stay hidden.
    const visibleOfferRows = opts?.enrichOffers
      ? offerRows.filter((o) => {
          const status = String(o.status ?? '');
          return (
            status === OfferStatus.ACTIVE || status === OfferStatus.SELECTED
          );
        })
      : offerRows;
    const offers = opts?.enrichOffers
      ? await Promise.all(
          visibleOfferRows.map((o) => this.serializeOfferForPassenger(o)),
        )
      : visibleOfferRows.map((o) => this.serializeOffer(o));
    const selectedOffer = ride.selectedOffer
      ? opts?.enrichOffers
        ? await this.serializeOfferForPassenger(
            ride.selectedOffer as Record<string, unknown>,
          )
        : this.serializeOffer(ride.selectedOffer as Record<string, unknown>)
      : null;
    const id = String(ride.id ?? '');
    const base = {
      id: ride.id,
      shortId: shortIdFrom(id),
      status: ride.status,
      serviceType: ride.serviceType,
      fromLabel: ride.fromLabel,
      toLabel: ride.toLabel,
      fromLat: ride.fromLat,
      fromLng: ride.fromLng,
      toLat: ride.toLat,
      toLng: ride.toLng,
      pickupAt: ride.pickupAt,
      returnAt: ride.returnAt,
      isRoundTrip: ride.isRoundTrip ?? false,
      pickupWaitMin: ride.pickupWaitMin,
      returnWaitMin: ride.returnWaitMin,
      vehicleClassIds: ride.vehicleClassIds,
      adults: ride.adults,
      childSeatsJson: ride.childSeatsJson,
      flight: ride.flight,
      returnFlight: ride.returnFlight,
      signage: ride.signage,
      comment: ride.comment,
      requiredOptions: ride.requiredOptions ?? [],
      currency: ride.currency,
      priceSnapshot: ride.priceSnapshot,
      pricingGuidance: snap
        ? {
            guidanceAmount: snap.guidanceAmount,
            minBid: snap.minBid,
            maxBid: snap.maxBid,
            platformCommissionPct: snap.platformCommissionPct,
            distanceKm: snap.distanceKm,
            durationMin: snap.durationMin,
            isRoundTrip: snap.isRoundTrip ?? ride.isRoundTrip ?? false,
            legs: snap.legs ?? ((ride.isRoundTrip as boolean) ? 2 : 1),
          }
        : null,
      selectedOfferId: ride.selectedOfferId,
      assignedDriverId: ride.assignedDriverId,
      requestExpiresAt: ride.requestExpiresAt,
      paymentExpiresAt: ride.paymentExpiresAt,
      viewCount: Number(ride.viewCount ?? 0),
      offerCount: visibleOfferRows.length,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
      ...serializeLifecycleFlags({
        status,
        pickupAt: ride.pickupAt as Date,
        requestExpiresAt: ride.requestExpiresAt as Date | null | undefined,
        paymentExpiresAt: ride.paymentExpiresAt as Date | null | undefined,
      }),
      flags: {
        isWaitingForOffers: status === RideStatus.WAITING_FOR_OFFERS,
        isOfferSelection: status === RideStatus.OFFER_SELECTION,
        isPaymentPending: status === RideStatus.PAYMENT_PENDING,
        isBooked: status === RideStatus.BOOKED,
        isInProgress: (
          [
            RideStatus.DRIVER_EN_ROUTE,
            RideStatus.DRIVER_ARRIVED,
            RideStatus.TRIP_STARTED,
            RideStatus.IN_PROGRESS,
          ] as RideStatus[]
        ).includes(status),
        isCompleted: status === RideStatus.COMPLETED,
        isCancelled: (
          [
            RideStatus.PASSENGER_CANCELLED,
            RideStatus.DRIVER_CANCELLED,
            RideStatus.ADMIN_CANCELLED,
          ] as RideStatus[]
        ).includes(status),
        isExpired: status === RideStatus.EXPIRED,
      },
      scheduledPickupAt: ride.pickupAt,
      offers,
      selectedOffer,
      payments: ride.payments,
      passenger: ride.passenger,
    };
    if (opts?.includeEvents) {
      return { ...base, events: ride.events };
    }
    return base;
  }

  private serializeOffer(offer: Record<string, unknown>) {
    const snap = offer.priceSnapshot as PriceSnapshot | undefined;
    return {
      id: offer.id,
      rideId: offer.rideId,
      driverId: offer.driverId,
      vehicleId: offer.vehicleId ?? null,
      vehicle: offer.vehicle ?? null,
      driver: offer.driver ?? null,
      outboundPrice:
        offer.outboundPrice != null
          ? Number(offer.outboundPrice)
          : Number(offer.bidAmount),
      returnPrice: offer.returnPrice != null ? Number(offer.returnPrice) : null,
      bidAmount: Number(offer.bidAmount),
      currency: offer.currency,
      selectedOptions: offer.selectedOptions ?? [],
      validForSeconds: offer.validForSeconds,
      status: offer.status,
      expiresAt: offer.expiresAt,
      version: offer.version ?? 1,
      supersedesOfferId: offer.supersedesOfferId ?? null,
      priceSnapshot: offer.priceSnapshot,
      commission: snap
        ? {
            platformCommissionPct: snap.platformCommissionPct,
            platformFee: snap.platformFee,
            driverEarning: snap.driverEarning,
            passengerTotal: snap.passengerTotal,
            taxAmount: snap.taxAmount,
            priceBand: snap.priceBand,
          }
        : null,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
      withdrawnAt: offer.withdrawnAt ?? null,
      acceptedAt: offer.acceptedAt ?? null,
      rejectedAt: offer.rejectedAt ?? null,
      expiredAt: offer.expiredAt ?? null,
    };
  }

  private async serializeOfferForPassenger(offer: Record<string, unknown>) {
    const base = this.serializeOffer(offer);
    try {
      const enriched = await this.presentation.enrichOffer(offer, {
        includeReviews: false,
      });
      return { ...base, ...enriched };
    } catch {
      return base;
    }
  }

  private serializeVehicle(v: {
    id: string;
    name: string;
    plate: string;
    vehicleClass: string;
    amenitiesJson: unknown;
    isActive: boolean;
  }) {
    return {
      id: v.id,
      name: v.name,
      plate: v.plate,
      vehicleClass: v.vehicleClass,
      amenities: v.amenitiesJson,
      isActive: v.isActive,
    };
  }

  private resolveRequiredOptions(dto: CreateRideDto): string[] {
    const set = new Set<string>(dto.requiredOptions ?? []);
    if (dto.signage && dto.signage.trim()) set.add('name_sign');
    const seats = dto.childSeatsJson ?? {};
    if (typeof seats === 'object' && seats) {
      const record = seats as Record<string, unknown>;
      const convertible = Number(
        record.convertible ?? record.child ?? 0,
      );
      const infant = Number(record.infant ?? 0);
      const booster = Number(record.booster ?? 0);
      if (convertible > 0 || infant > 0) set.add('child_seat');
      if (booster > 0) set.add('booster_seat');
    }
    return [...set].filter((k) =>
      (OFFER_OPTION_KEYS as readonly string[]).includes(k),
    );
  }

  private resolveOfferPrices(
    ride: { isRoundTrip: boolean; currency: string },
    dto: {
      bidAmount?: number;
      outboundPrice?: number;
      returnPrice?: number | null;
    },
  ): {
    outboundPrice: number;
    returnPrice: number | null;
    bidAmount: number;
  } {
    let outbound = dto.outboundPrice;
    let ret = dto.returnPrice ?? null;
    if (outbound == null && dto.bidAmount != null) {
      if (ride.isRoundTrip) {
        outbound = round2(dto.bidAmount / 2);
        ret = round2(dto.bidAmount - outbound);
      } else {
        outbound = dto.bidAmount;
        ret = null;
      }
    }
    if (outbound == null || outbound <= 0) {
      throw new BadRequestException('outboundPrice (or bidAmount) is required');
    }
    if (ride.isRoundTrip) {
      if (ret == null || ret < 0) {
        throw new BadRequestException(
          'returnPrice is required for round-trip requests',
        );
      }
    } else {
      ret = null;
    }
    const bidAmount = round2(outbound + (ret ?? 0));
    if (bidAmount <= 0) {
      throw new BadRequestException('Offer total must be greater than zero');
    }
    return {
      outboundPrice: round2(outbound),
      returnPrice: ret != null ? round2(ret) : null,
      bidAmount,
    };
  }

  private resolveValiditySeconds(
    requested: number | undefined,
    requestExpiresAt: Date | null | undefined,
  ): number {
    const seconds = requested ?? DEFAULT_OFFER_VALIDITY_SECONDS;
    if (!isAllowedOfferValidity(seconds) && requested != null) {
      throw new BadRequestException('Invalid offer validity duration');
    }
    let effective = seconds;
    if (requestExpiresAt) {
      const maxSec = Math.max(
        60,
        Math.floor((requestExpiresAt.getTime() - Date.now()) / 1000),
      );
      effective = Math.min(effective, maxSec);
    }
    return effective;
  }

  private async requireEligibleVehicle(
    driverId: string,
    vehicleId: string | undefined,
    ride: { vehicleClassIds: string[] },
  ) {
    if (!vehicleId) {
      const fallback = await this.prisma.vehicle.findFirst({
        where: { driverId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!fallback) {
        throw new BadRequestException(
          'No eligible vehicle — add and activate a vehicle before offering',
        );
      }
      return this.assertVehicleClass(fallback, ride);
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, driverId },
    });
    if (!vehicle) {
      throw new ForbiddenException('Vehicle not found for this driver');
    }
    if (!vehicle.isActive) {
      throw new BadRequestException('Vehicle is not active');
    }
    return this.assertVehicleClass(vehicle, ride);
  }

  private assertVehicleClass<T extends { vehicleClass: string; name: string }>(
    vehicle: T,
    ride: { vehicleClassIds: string[] },
  ): T {
    const classes = (ride.vehicleClassIds ?? []).map((c) =>
      c.toLowerCase().trim(),
    );
    if (classes.length === 0) return vehicle;
    if (classes.some((c) => c === '*' || c === 'any')) return vehicle;
    const vc = vehicle.vehicleClass.toLowerCase().trim();
    if (classes.includes(vc)) return vehicle;
    // Map common aliases (Economy ↔ sedan, etc.)
    const aliases: Record<string, string[]> = {
      economy: ['economy', 'sedan'],
      sedan: ['economy', 'sedan'],
      business: ['business'],
      'first class': ['first', 'first class', 'first_class'],
      suv: ['suv'],
      van: ['van', 'minivan'],
      minivan: ['van', 'minivan'],
    };
    const ok = classes.some((requested) => {
      const group = aliases[requested] ?? [requested];
      return group.includes(vc) || (aliases[vc] ?? [vc]).includes(requested);
    });
    if (!ok) {
      throw new BadRequestException(
        `Vehicle class ${vehicle.vehicleClass} does not match requested transport types`,
      );
    }
    return vehicle;
  }

  private normalizeSelectedOptions(
    selected: string[] | undefined,
    amenitiesJson: unknown,
  ): string[] {
    const allowed = new Set(OFFER_OPTION_KEYS as readonly string[]);
    const vehicleAmenities =
      amenitiesJson && typeof amenitiesJson === 'object'
        ? (amenitiesJson as Record<string, unknown>)
        : {};
    const out: string[] = [];
    for (const raw of selected ?? []) {
      const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
      const mapped =
        key === 'free_wi-fi' || key === 'free_wifi' || key === 'wi-fi'
          ? 'wifi'
          : key === 'disabled'
            ? 'wheelchair'
            : key === 'name_sign' || key === 'meeting_with_a_name_sign'
              ? 'name_sign'
              : key;
      if (!allowed.has(mapped)) continue;
      // If vehicle declares amenities map, require true for promised options.
      const amenityAliases: Record<string, string[]> = {
        wifi: ['wifi', 'Free Wi-Fi', 'free_wifi'],
        charger: ['charger', 'Charger'],
        water: ['water', 'Water'],
        wheelchair: ['wheelchair', 'Disabled', 'disabled'],
        air_conditioner: ['air_conditioner', 'Air conditioner'],
      };
      const keys = amenityAliases[mapped] ?? [mapped];
      const declared = keys.some((k) => vehicleAmenities[k] === true);
      const hasAmenityMap = Object.keys(vehicleAmenities).length > 0;
      if (
        hasAmenityMap &&
        !declared &&
        ['wifi', 'charger', 'water', 'wheelchair', 'air_conditioner'].includes(
          mapped,
        )
      ) {
        throw new BadRequestException(
          `Selected option "${mapped}" is not available on this vehicle`,
        );
      }
      if (!out.includes(mapped)) out.push(mapped);
    }
    return out;
  }

  private assertRequiredOptions(
    ride: { requiredOptions: unknown; signage: string | null },
    selected: string[],
  ) {
    const need = new Set(this.requiredOptionList(ride));
    for (const r of need) {
      if (!selected.includes(r)) {
        throw new BadRequestException(
          `Required option missing: ${r}. Passenger requires this for the trip.`,
        );
      }
    }
  }

  private requiredOptionList(ride: {
    requiredOptions: unknown;
    signage: string | null;
  }): string[] {
    const required = Array.isArray(ride.requiredOptions)
      ? (ride.requiredOptions as string[])
      : [];
    const need = new Set(required);
    if (ride.signage && ride.signage.trim()) need.add('name_sign');
    return [...need];
  }

  private offerValidityLabels() {
    return [
      { seconds: 30 * 60, label: '30 min' },
      { seconds: 60 * 60, label: '1 h' },
      { seconds: 2 * 60 * 60, label: '2 h' },
      { seconds: 8 * 60 * 60, label: '8 h' },
      { seconds: 12 * 60 * 60, label: '12 h' },
      { seconds: 24 * 60 * 60, label: '1 d' },
      { seconds: 2 * 24 * 60 * 60, label: '2 d' },
      { seconds: 4 * 24 * 60 * 60, label: '4 d' },
      { seconds: 6 * 24 * 60 * 60, label: '6 d' },
    ];
  }

  private offerAuditPayload(
    offer: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const payload: Prisma.InputJsonObject = {
      id: String(offer.id ?? ''),
      outboundPrice:
        offer.outboundPrice != null ? Number(offer.outboundPrice) : null,
      returnPrice: offer.returnPrice != null ? Number(offer.returnPrice) : null,
      bidAmount: Number(offer.bidAmount ?? 0),
      vehicleId: offer.vehicleId != null ? String(offer.vehicleId) : null,
      selectedOptions: Array.isArray(offer.selectedOptions)
        ? offer.selectedOptions.map((x) => String(x))
        : [],
      validForSeconds: Number(offer.validForSeconds ?? 0),
      status: String(offer.status ?? ''),
      version: Number(offer.version ?? 1),
      expiresAt:
        offer.expiresAt instanceof Date
          ? offer.expiresAt.toISOString()
          : offer.expiresAt != null
            ? String(offer.expiresAt)
            : null,
    };
    return payload;
  }

  private async loadOfferWithPresentation(offerId: string) {
    return this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        vehicle: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            userId: true,
            createdAt: true,
            languagesJson: true,
            isActivated: true,
            approvalStatus: true,
            user: { select: { id: true, isSuspended: true } },
          },
        },
      },
    });
  }

  private async assertOfferBookableDriverVehicle(offer: {
    vehicleId: string | null;
    vehicle?: { id: string; isActive: boolean } | null;
    driver: {
      isActivated: boolean;
      approvalStatus: DriverApprovalStatus;
      user: { isSuspended: boolean };
    };
  }) {
    if (
      !offer.driver.isActivated ||
      offer.driver.approvalStatus !== DriverApprovalStatus.APPROVED
    ) {
      throw new BadRequestException('Driver is not available');
    }
    if (offer.driver.user.isSuspended) {
      throw new BadRequestException('Driver account is suspended');
    }
    const vehicle =
      offer.vehicle ??
      (offer.vehicleId
        ? await this.prisma.vehicle.findUnique({ where: { id: offer.vehicleId } })
        : null);
    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }
    if (!vehicle.isActive) {
      throw new BadRequestException('Vehicle is not active');
    }
  }

  private async notifyPassengerNewOffer(input: {
    passengerUserId: string;
    rideId: string;
    offerId: string;
    driverId: string;
    vehicleId?: string | null;
    currency: string;
    amount: number;
    vehicleName?: string | null;
  }) {
    try {
      let vehicleName = input.vehicleName ?? null;
      let imageUrl: string | null = null;
      try {
        if (!vehicleName && input.vehicleId) {
          const v = await this.prisma.vehicle.findUnique({
            where: { id: input.vehicleId },
            select: { name: true },
          });
          vehicleName = v?.name ?? null;
        }
        const enriched = await this.presentation.enrichOffer({
          id: input.offerId,
          driverId: input.driverId,
          vehicleId: input.vehicleId,
          bidAmount: input.amount,
          currency: input.currency,
        });
        imageUrl = enriched.presentation.imageUrl;
        if (!vehicleName) {
          vehicleName = enriched.presentation.vehicleDisplayName;
        }
      } catch {
        /* presentation enrichment is best-effort for push copy */
      }

      const money = formatMoney(input.amount, input.currency);
      const body = vehicleName
        ? `${money} — ${vehicleName}`
        : `${money} — new driver offer`;

      await this.notifications.notifyNewOffer({
        userId: input.passengerUserId,
        rideId: input.rideId,
        offerId: input.offerId,
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        title: 'New offer available',
        body,
        imageUrl,
      });
    } catch {
      void this.notifications.notifyRideStatus({
        userIds: [input.passengerUserId],
        rideId: input.rideId,
        status: 'OFFER_RECEIVED',
        title: 'New offer available',
        body: 'A driver submitted an offer on your transfer request.',
      });
    }
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

function shortIdFrom(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(-8);
  return id.slice(-8);
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
