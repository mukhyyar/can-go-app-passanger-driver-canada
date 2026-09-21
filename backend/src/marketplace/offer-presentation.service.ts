import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DocumentLifecycleStatus,
  DocumentReviewStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OFFER_OPTION_KEYS } from './offer.constants';
import { round2, type PriceSnapshot } from './pricing.service';
import {
  computePaymentQuote as computeQuoteUtil,
  parseVehicleName as parseVehicleNameUtil,
} from './payment-quote.util';
import { VEHICLE_PHOTO_PRIMARY_ORDER } from '../drivers/vehicle-photos.util';

const OPTION_LABELS: Record<string, string> = {
  wifi: 'Free Wi-Fi',
  charger: 'Charger',
  water: 'Water',
  wheelchair: 'Wheelchair assistance',
  name_sign: 'Name sign',
  child_seat: 'Child seat',
  booster_seat: 'Booster seat',
  extra_luggage: 'Extra luggage',
  flight_tracking: 'Flight tracking',
  meet_greet: 'Meet & greet',
  pet_friendly: 'Pet friendly',
  air_conditioner: 'Air conditioner',
};

export type WaitingTimePolicy = {
  airportMin: number;
  railMin: number;
  defaultMin: number;
  summary: string;
};

export type CancellationPolicy = {
  code: string;
  title: string;
  body: string;
  refundable: boolean;
};

@Injectable()
export class OfferPresentationService {
  private readonly logger = new Logger(OfferPresentationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  waitingTimePolicy(): WaitingTimePolicy {
    const airportMin = parsePositiveEnv(
      process.env.WAITING_TIME_AIRPORT_MIN,
      60,
    );
    const railMin = parsePositiveEnv(process.env.WAITING_TIME_RAIL_MIN, 30);
    const defaultMin = parsePositiveEnv(
      process.env.WAITING_TIME_DEFAULT_MIN,
      15,
    );
    return {
      airportMin,
      railMin,
      defaultMin,
      summary: `Free waiting time: ${airportMin} minutes at airports, sea or river passenger port terminals, ${railMin} minutes at railway stations, ${defaultMin} minutes everywhere else.`,
    };
  }

  cancellationPolicy(_input?: {
    market?: string;
    paymentMode?: string;
  }): CancellationPolicy {
    const body =
      process.env.CANCELLATION_POLICY_DEFAULT?.trim() ||
      'The ride is not refundable in case of cancellation.';
    return {
      code: 'NON_REFUNDABLE_DEFAULT',
      title: 'Cancellation policy',
      body,
      refundable: false,
    };
  }

  partialPaymentConfig() {
    const enabled =
      (process.env.PARTIAL_PAYMENT_ENABLED ?? 'true').toLowerCase() !== 'false';
    const onlinePct = clampPct(
      parseFloat(process.env.PARTIAL_PAYMENT_ONLINE_PCT ?? '20'),
      20,
    );
    return { enabled, onlinePct };
  }

  paymentMethodsAvailable(platform?: string) {
    const methods: Array<'GOOGLE_PAY' | 'APPLE_PAY' | 'CARD'> = ['CARD'];
    const p = (platform ?? '').toLowerCase();
    if (p !== 'ios' && p !== 'apple') {
      methods.unshift('GOOGLE_PAY');
    }
    if (p === 'ios' || p === 'apple' || p === 'all') {
      if (!methods.includes('APPLE_PAY')) methods.unshift('APPLE_PAY');
    }
    return methods;
  }

  computePaymentQuote(input: {
    totalAmount: number;
    currency: string;
    paymentMode: 'FULL' | 'PARTIAL';
  }) {
    const cfg = this.partialPaymentConfig();
    return computeQuoteUtil({
      ...input,
      partialEnabled: cfg.enabled,
      onlinePct: cfg.onlinePct,
    });
  }

  priceBreakdown(snap?: PriceSnapshot | null) {
    if (!snap) return null;
    const driverBid = round2(
      (snap.bidAmount ??
        (snap.subtotal ? snap.subtotal / 1.2 : snap.guidanceAmount ?? 0)) as number,
    );
    const ridePrice = round2(driverBid * 1.2);
    const platformFee = round2(ridePrice * 0.2);
    const taxes = round2(snap.taxAmount ?? 0);
    const total = round2(ridePrice + platformFee + taxes);
    return {
      ridePrice,
      platformFee,
      marketplaceFee: platformFee,
      taxes,
      tolls: 0,
      waitingTime: 0,
      discount: 0,
      promotion: 0,
      total,
      currency: snap.currency,
      includesNote: 'Includes all taxes and fees',
      ridePriceNote: 'Includes waiting time, toll roads (if any) and taxes.',
      marketplaceFeeNote: 'Platform fee for booking and support.',
    };
  }


  parseVehicleName(name: string) {
    return parseVehicleNameUtil(name);
  }

  amenityLabels(
    selectedOptions: unknown,
    amenitiesJson: unknown,
  ): Array<{ key: string; label: string }> {
    const fromOptions = Array.isArray(selectedOptions)
      ? selectedOptions.map((o) => String(o))
      : [];
    const amenityMap =
      amenitiesJson && typeof amenitiesJson === 'object'
        ? (amenitiesJson as Record<string, unknown>)
        : {};
    const keys = new Set<string>();
    for (const k of fromOptions) keys.add(normalizeAmenityKey(k));
    for (const [k, v] of Object.entries(amenityMap)) {
      if (v === true) keys.add(normalizeAmenityKey(k));
    }
    const ordered = OFFER_OPTION_KEYS.filter((k) => keys.has(k));
    const extras = [...keys].filter(
      (k) => !(OFFER_OPTION_KEYS as readonly string[]).includes(k),
    );
    return [...ordered, ...extras].map((key) => ({
      key,
      label: OPTION_LABELS[key] ?? humanize(key),
    }));
  }

  /**
   * Passenger-facing image URLs prefer same-origin API paths so phones do not
   * need to reach MinIO. Falls back to signed URLs when ride/offer ids missing.
   */
  async loadVehicleImages(
    vehicleId: string | null | undefined,
    opts?: { rideId?: string; offerId?: string },
  ) {
    if (!vehicleId) return [] as Array<{ id: string; url: string }>;
    const docs = await this.prisma.driverDocument.findMany({
      where: {
        vehicleId,
        docType: 'vehicle_photo',
        status: {
          in: [
            DocumentReviewStatus.APPROVED,
            DocumentReviewStatus.PENDING,
          ],
        },
        lifecycleStatus: DocumentLifecycleStatus.CURRENT,
      },
      orderBy: VEHICLE_PHOTO_PRIMARY_ORDER,
      take: 12,
      select: { id: true, storageKey: true },
    });
    const rideId = opts?.rideId?.trim();
    const offerId = opts?.offerId?.trim();
    const useProxy = !!rideId && !!offerId;
    const out: Array<{ id: string; url: string }> = [];
    for (const d of docs) {
      if (useProxy) {
        out.push({
          id: d.id,
          url: `/rides/${rideId}/offers/${offerId}/photos/${d.id}/content`,
        });
        continue;
      }
      const url = await this.safeSignedUrl(d.storageKey);
      if (url) out.push({ id: d.id, url });
    }
    return out;
  }

  async loadDriverRating(driverUserId: string) {
    const ratings = await this.prisma.rating.findMany({
      where: {
        toUserId: driverUserId,
        moderationStatus: 'VISIBLE',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        stars: true,
        communicationStars: true,
        driverStars: true,
        vehicleStars: true,
        comment: true,
        createdAt: true,
        fromUserId: true,
      },
    });
    const count = ratings.length;
    const avg = (vals: number[]) =>
      vals.length === 0
        ? 0
        : round2(vals.reduce((s, v) => s + v, 0) / vals.length);
    const overall = avg(ratings.map((r) => r.stars));
    const communication = avg(
      ratings
        .map((r) => r.communicationStars)
        .filter((v): v is number => v != null),
    );
    const driver = avg(
      ratings.map((r) => r.driverStars).filter((v): v is number => v != null),
    );
    const vehicle = avg(
      ratings.map((r) => r.vehicleStars).filter((v): v is number => v != null),
    );
    return {
      overall,
      count,
      communication: communication > 0 ? communication : overall,
      driver: driver > 0 ? driver : overall,
      vehicle: vehicle > 0 ? vehicle : overall,
      completedRides: count,
      reviews: ratings.slice(0, 20).map((r) => ({
        stars: r.stars,
        communicationStars: r.communicationStars,
        driverStars: r.driverStars,
        vehicleStars: r.vehicleStars,
        text: r.comment ?? '',
        createdAt: r.createdAt,
        translatedFrom: null as string | null,
      })),
    };
  }

  async enrichOffer(
    offer: Record<string, unknown>,
    opts?: { includeReviews?: boolean },
  ) {
    const vehicle =
      (offer.vehicle as
        | {
            id: string;
            name: string;
            plate: string;
            vehicleClass: string;
            amenitiesJson: unknown;
            isActive: boolean;
          }
        | null
        | undefined) ?? null;

    let vehicleRow = vehicle;
    if (!vehicleRow && offer.vehicleId) {
      vehicleRow = await this.prisma.vehicle.findUnique({
        where: { id: String(offer.vehicleId) },
      });
    }

    const driverId = String(offer.driverId ?? '');
    const driver =
      (offer.driver as
        | {
            id: string;
            fullName?: string;
            userId?: string;
            createdAt?: Date;
            languagesJson?: unknown;
          }
        | null
        | undefined) ??
      (await this.prisma.driverProfile.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          fullName: true,
          userId: true,
          createdAt: true,
          languagesJson: true,
        },
      }));

    const parsed = this.parseVehicleName(vehicleRow?.name ?? 'Vehicle');
    const amenities = (vehicleRow?.amenitiesJson ?? {}) as Record<
      string,
      unknown
    >;
    const passengers =
      numOr(amenities.passengers, amenities.seats, amenities.capacity) ?? 4;
    const baggage =
      numOr(amenities.baggage, amenities.bags, amenities.luggage) ?? 2;
    const year =
      numOr(amenities.year) ??
      parsed.year;
    const color =
      typeof amenities.color === 'string' ? amenities.color : null;
    const brand =
      typeof amenities.brand === 'string' ? amenities.brand : parsed.brand;
    const model =
      typeof amenities.model === 'string' ? amenities.model : parsed.model;

    const offerId = String(offer.id ?? '');
    const rideId = String(offer.rideId ?? '');
    const images = await this.loadVehicleImages(vehicleRow?.id, {
      rideId: rideId || undefined,
      offerId: offerId || undefined,
    });
    const languages = normalizeLanguages(
      driver?.languagesJson ?? amenities.languages,
    );

    let ratingBlock = {
      overall: 0,
      count: 0,
      communication: 0,
      driver: 0,
      vehicle: 0,
      completedRides: 0,
      yearsWithPlatform: 0,
      reviews: [] as Array<{
        stars: number;
        text: string;
        createdAt: Date;
        translatedFrom: string | null;
      }>,
    };
    if (driver?.userId) {
      const loaded = await this.loadDriverRating(driver.userId);
      const years = driver.createdAt
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(driver.createdAt).getTime()) /
                (365.25 * 24 * 3600 * 1000),
            ),
          )
        : 0;
      ratingBlock = {
        ...loaded,
        yearsWithPlatform: years,
        reviews: opts?.includeReviews === false ? [] : loaded.reviews,
      };
    }

    const snap = offer.priceSnapshot as PriceSnapshot | undefined;
    const breakdown = this.priceBreakdown(snap);
    const passengerTotal = breakdown
      ? breakdown.total
      : (snap?.passengerTotal != null
          ? Number(snap.passengerTotal)
          : round2(Number(offer.bidAmount ?? 0) * 1.44));

    return {
      presentation: {
        vehicleDisplayName: year
          ? `${brand} ${model}`.trim() + `, ${year}`
          : `${brand} ${model}`.trim(),
        brand,
        model,
        year,
        color,
        vehicleClass: vehicleRow?.vehicleClass ?? snap?.vehicleClass ?? 'sedan',
        passengers,
        baggage,
        plate: vehicleRow?.plate ?? null,
        imageUrl: images[0]?.url ?? null,
        images,
        amenities: this.amenityLabels(offer.selectedOptions, amenities),
        languages,
        carrierId: publicCarrierId(driverId),
        rating: {
          overall: ratingBlock.overall,
          count: ratingBlock.count,
          communication: ratingBlock.communication,
          driver: ratingBlock.driver,
          vehicle: ratingBlock.vehicle,
          completedRides: ratingBlock.completedRides,
          yearsWithPlatform: ratingBlock.yearsWithPlatform,
        },
        reviews: ratingBlock.reviews,
        priceBreakdown: breakdown,
        passengerTotal,
        waitingTime: this.waitingTimePolicy(),
      },
    };

  }

  private async safeSignedUrl(storageKey: string): Promise<string | null> {
    if (!this.storage?.isReady()) return null;
    try {
      return await this.storage.getSignedGetUrl(storageKey, 3600);
    } catch (err) {
      this.logger.warn(
        `Signed URL failed for ${storageKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}

function parsePositiveEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function clampPct(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return fallback;
  return round2(n);
}

function normalizeAmenityKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function numOr(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function normalizeLanguages(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).toUpperCase()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,|/]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return ['EN'];
}

function publicCarrierId(driverId: string): string {
  const digits = driverId.replace(/\D/g, '');
  if (digits.length >= 6) return digits.slice(-6);
  let hash = 0;
  for (let i = 0; i < driverId.length; i++) {
    hash = (hash * 31 + driverId.charCodeAt(i)) >>> 0;
  }
  return String(100000 + (hash % 900000));
}

/** Prisma JSON helper for languagesJson column. */
export function asLanguagesJson(
  languages: string[],
): Prisma.InputJsonValue {
  return languages as Prisma.InputJsonValue;
}
