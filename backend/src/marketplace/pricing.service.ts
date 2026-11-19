import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MAPS_PROVIDER,
  type MapsProvider,
} from '../maps/maps-provider.interface';

export type PriceSnapshot = {
  currency: string;
  serviceType: string;
  vehicleClass: string;
  distanceKm: number;
  durationMin: number;
  hours?: number;
  days?: number;
  catalogItemId?: string;
  vipApplied?: boolean;
  isRoundTrip?: boolean;
  legs?: number;
  guidanceAmount: number;
  minBid: number;
  maxBid: number;
  minFare: number;
  baseFare: number;
  perKm: number;
  perMinute: number;
  perHour: number;
  platformCommissionPct: number;
  taxPct: number;
  bidAmount?: number;
  outboundPrice?: number;
  returnPrice?: number;
  discountedReturnPrice?: number;
  returnDiscountPct?: number;
  returnDiscountAmount?: number;
  enquiryDiscountPct?: number;
  enquiryDiscountAmount?: number;
  enquiryDiscountApplied?: boolean;
  enquiryDiscountActivatedAt?: string;
  enquiryDiscountExpiresAt?: string;
  originalPassengerTotal?: number;
  subtotal?: number;
  taxAmount?: number;
  platformFee?: number;
  marketplaceFee?: number;
  driverCommission?: number;
  canRideGrossRevenue?: number;
  driverEarning?: number;
  passengerTotal?: number;
  frozenAt?: string;
  ruleId?: string;
  priceBand?: 'competitive' | 'typical' | 'above_typical';
};

export type VehicleCategoryConfig = {
  id: string;
  catalogId?: string;
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  fromPrice: string;
  currency: string;
  passengerSeats: number;
  luggagePlaces: number;
  seatsRange: string | null;
  imageAsset: string;
  isLuxury: boolean;
  sortOrder: number;
  active: boolean;
};

export const DEFAULT_VEHICLE_CATEGORIES: Array<{
  slug: string;
  title: string;
  description: string;
  basePrice: number;
  passengerSeats: number;
  luggagePlaces: number;
  seatsRange?: string | null;
  imageAsset: string;
  isLuxury: boolean;
  sortOrder: number;
}> = [
  {
    slug: 'economy',
    title: 'Economy',
    description:
      'Seating capacity: Up to 4 passengers\nLuggage capacity: Up to 2 standard bags',
    basePrice: 22,
    passengerSeats: 4,
    luggagePlaces: 2,
    seatsRange: null,
    imageAsset: 'assets/vehicles/economy.png',
    isLuxury: false,
    sortOrder: 1,
  },
  {
    slug: 'comfort',
    title: 'Comfort',
    description:
      'Seating capacity: Up to 4 passengers\nLuggage capacity: Up to 2 standard bags',
    basePrice: 35,
    passengerSeats: 4,
    luggagePlaces: 2,
    seatsRange: null,
    imageAsset: 'assets/vehicles/comfort.png',
    isLuxury: false,
    sortOrder: 2,
  },
  {
    slug: 'suv_xl',
    title: 'SUV (XL)',
    description:
      'Seating capacity: Up to 7 - 8 passengers\nLuggage capacity: Up to 4 standard bags',
    basePrice: 55,
    passengerSeats: 8,
    luggagePlaces: 4,
    seatsRange: '7 - 8',
    imageAsset: 'assets/vehicles/suv_xl.png',
    isLuxury: false,
    sortOrder: 3,
  },
  {
    slug: 'van',
    title: '7-Seater / Minivan',
    description:
      'Seating capacity: Up to 7 - 8 passengers\nLuggage capacity: Up to 6 standard bags',
    basePrice: 85,
    passengerSeats: 8,
    luggagePlaces: 6,
    seatsRange: '7 - 8',
    imageAsset: 'assets/vehicles/van.png',
    isLuxury: false,
    sortOrder: 4,
  },
  {
    slug: 'minibus',
    title: 'Mini bus',
    description:
      'Seating capacity: Up to 12 - 25 passengers\nLuggage capacity: Up to 10 standard bags',
    basePrice: 110,
    passengerSeats: 25,
    luggagePlaces: 10,
    seatsRange: '12 - 25',
    imageAsset: 'assets/vehicles/minibus.png',
    isLuxury: false,
    sortOrder: 5,
  },
  {
    slug: 'premium',
    title: 'Premium',
    description:
      'Seating capacity: Up to 4 passengers\nLuggage capacity: Up to 2 standard bags',
    basePrice: 65,
    passengerSeats: 4,
    luggagePlaces: 2,
    seatsRange: null,
    imageAsset: 'assets/vehicles/premium.png',
    isLuxury: true,
    sortOrder: 6,
  },
  {
    slug: 'suv',
    title: 'SUV',
    description:
      'Seating capacity: Up to 6 passengers\nLuggage capacity: Up to 4 standard bags',
    basePrice: 75,
    passengerSeats: 6,
    luggagePlaces: 4,
    seatsRange: null,
    imageAsset: 'assets/vehicles/suv.png',
    isLuxury: true,
    sortOrder: 7,
  },
  {
    slug: 'luxury',
    title: 'Luxury Vehicle',
    description:
      'Seating capacity: Up to 4 passengers\nLuggage capacity: Up to 3 standard bags',
    basePrice: 95,
    passengerSeats: 4,
    luggagePlaces: 3,
    seatsRange: null,
    imageAsset: 'assets/vehicles/premium.png',
    isLuxury: true,
    sortOrder: 8,
  },
];

export function serializeVehicleCategoryRow(row: {
  id?: string;
  slug: string;
  title: string;
  description: string;
  basePrice: number;
  currency?: string;
  active?: boolean;
  meta?: unknown;
}): VehicleCategoryConfig {
  const meta =
    row.meta && typeof row.meta === 'object'
      ? (row.meta as Record<string, unknown>)
      : {};
  const categoryKey = row.slug.replace(/^vc-/, '');
  const basePrice = Number(row.basePrice ?? 22);
  const currency = (row.currency ?? 'CAD').toUpperCase();
  const prefix = currency === 'CAD' ? 'CA$' : `${currency} `;
  return {
    id: categoryKey,
    catalogId: row.id,
    slug: categoryKey,
    name: row.title,
    description: row.description,
    basePrice,
    fromPrice: `from ${prefix}${Math.round(basePrice)}`,
    currency,
    passengerSeats: Number(meta.passengerSeats ?? 4),
    luggagePlaces: Number(meta.luggagePlaces ?? 2),
    seatsRange:
      typeof meta.seatsRange === 'string' && meta.seatsRange.trim()
        ? meta.seatsRange.trim()
        : null,
    imageAsset:
      typeof meta.imageAsset === 'string' && meta.imageAsset.trim()
        ? meta.imageAsset.trim()
        : `assets/vehicles/${categoryKey}.png`,
    isLuxury: Boolean(meta.isLuxury),
    sortOrder: Number(meta.sortOrder ?? 99),
    active: row.active !== false,
  };
}

const PHASE3_TYPES = new Set([
  'RIDE',
  'PER_HOUR',
  'DELIVERY',
  'CAR_RENTAL',
  'EXPERIENCES',
]);

@Injectable()
export class PricingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(MAPS_PROVIDER)
    private readonly maps?: MapsProvider,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultRules();
    await this.ensureCatalogSeed();
  }

  async ensureDefaultRules() {
    const defaults: Array<{
      serviceType: string;
      vehicleClass: string;
      baseFare: number;
      perKm: number;
      perMinute: number;
      perHour: number;
      minFare: number;
    }> = [
      {
        serviceType: 'RIDE',
        vehicleClass: '*',
        baseFare: 8,
        perKm: 1.4,
        perMinute: 0.25,
        perHour: 0,
        minFare: 12,
      },
      {
        serviceType: 'RIDE',
        vehicleClass: 'sedan',
        baseFare: 8,
        perKm: 1.4,
        perMinute: 0.25,
        perHour: 0,
        minFare: 12,
      },
      {
        serviceType: 'RIDE',
        vehicleClass: 'van',
        baseFare: 14,
        perKm: 1.9,
        perMinute: 0.35,
        perHour: 0,
        minFare: 20,
      },
      {
        serviceType: 'PER_HOUR',
        vehicleClass: '*',
        baseFare: 0,
        perKm: 0,
        perMinute: 0,
        perHour: 45,
        minFare: 45,
      },
      {
        serviceType: 'DELIVERY',
        vehicleClass: '*',
        baseFare: 6,
        perKm: 1.1,
        perMinute: 0.15,
        perHour: 0,
        minFare: 10,
      },
      {
        serviceType: 'CAR_RENTAL',
        vehicleClass: '*',
        baseFare: 0,
        perKm: 0,
        perMinute: 0,
        perHour: 55, // treated as per-day in quote
        minFare: 55,
      },
      {
        serviceType: 'EXPERIENCES',
        vehicleClass: '*',
        baseFare: 75,
        perKm: 0,
        perMinute: 0,
        perHour: 0,
        minFare: 40,
      },
    ];

    for (const d of defaults) {
      await this.prisma.fareRule.upsert({
        where: {
          serviceType_vehicleClass_currency: {
            serviceType: d.serviceType,
            vehicleClass: d.vehicleClass,
            currency: 'CAD',
          },
        },
        create: {
          ...d,
          currency: 'CAD',
          minBidMultiplier: 0.8,
          maxBidMultiplier: 1.5,
          platformCommissionPct: 20,
          taxPct: 0,
        },
        update: {
          platformCommissionPct: 20,
        },
      });
    }
  }

  async ensureCatalogSeed() {
    const items = [
      {
        serviceType: 'EXPERIENCES',
        slug: 'toronto-food-tour',
        title: 'Toronto food tour',
        description: '3-hour guided tasting walk with private transfer.',
        city: 'Toronto',
        basePrice: 120,
        durationHours: 3,
      },
      {
        serviceType: 'EXPERIENCES',
        slug: 'niagara-day',
        title: 'Niagara day experience',
        description: 'Full-day Niagara Falls outing with sedan.',
        city: 'Niagara',
        basePrice: 280,
        durationHours: 8,
      },
      {
        serviceType: 'CAR_RENTAL',
        slug: 'weekly-sedan',
        title: 'Weekly sedan rental',
        description: 'Partner weekly sedan rate.',
        city: 'Toronto',
        basePrice: 320,
        durationHours: 168,
      },
    ];
    for (const item of items) {
      await this.prisma.catalogItem.upsert({
        where: { slug: item.slug },
        create: { ...item, currency: 'CAD', active: true },
        update: {},
      });
    }

    for (const vc of DEFAULT_VEHICLE_CATEGORIES) {
      const catalogSlug = `vc-${vc.slug}`;
      await this.prisma.catalogItem.upsert({
        where: { slug: catalogSlug },
        create: {
          serviceType: 'VEHICLE_CATEGORY',
          slug: catalogSlug,
          title: vc.title,
          description: vc.description,
          city: '',
          basePrice: vc.basePrice,
          currency: 'CAD',
          active: true,
          meta: {
            passengerSeats: vc.passengerSeats,
            luggagePlaces: vc.luggagePlaces,
            seatsRange: vc.seatsRange ?? null,
            imageAsset: vc.imageAsset,
            isLuxury: vc.isLuxury,
            sortOrder: vc.sortOrder,
          },
        },
        update: {},
      });
    }
  }

  async listActiveVehicleCategories(): Promise<VehicleCategoryConfig[]> {
    try {
      const rows = await this.prisma.catalogItem.findMany({
        where: {
          serviceType: 'VEHICLE_CATEGORY',
          active: true,
        },
      });
      if (!rows.length) {
        return DEFAULT_VEHICLE_CATEGORIES.map((vc) =>
          serializeVehicleCategoryRow({
            slug: `vc-${vc.slug}`,
            title: vc.title,
            description: vc.description,
            basePrice: vc.basePrice,
            currency: 'CAD',
            active: true,
            meta: vc,
          }),
        );
      }
      return rows
        .map((r) => serializeVehicleCategoryRow(r))
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        );
    } catch {
      return DEFAULT_VEHICLE_CATEGORIES.map((vc) =>
        serializeVehicleCategoryRow({
          slug: `vc-${vc.slug}`,
          title: vc.title,
          description: vc.description,
          basePrice: vc.basePrice,
          currency: 'CAD',
          active: true,
          meta: vc,
        }),
      );
    }
  }

  haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async quote(input: {
    serviceType: string;
    fromLat: number;
    fromLng: number;
    toLat?: number;
    toLng?: number;
    distanceKm?: number;
    durationMin?: number;
    vehicleClass?: string;
    currency?: string;
    hours?: number;
    days?: number;
    catalogItemId?: string;
    vip?: boolean;
  }): Promise<PriceSnapshot> {
    if (!PHASE3_TYPES.has(input.serviceType)) {
      throw new BadRequestException(
        `Unsupported serviceType ${input.serviceType}`,
      );
    }

    const currency = input.currency ?? 'CAD';
    const vehicleClass = input.vehicleClass ?? '*';
    const rule = await this.resolveRule(
      input.serviceType,
      vehicleClass,
      currency,
    );

    let distanceKm = 0;
    let durationMin = 0;
    let hours = input.hours ?? 2;
    let days = input.days;
    const catalogItemId = input.catalogItemId;
    let guidance = 0;

    const base = Number(rule.baseFare);
    const perKm = Number(rule.perKm);
    const perMinute = Number(rule.perMinute);
    const perHour = Number(rule.perHour);
    const minFare = Number(rule.minFare);

    if (input.serviceType === 'RIDE' || input.serviceType === 'DELIVERY') {
      if (input.toLat == null || input.toLng == null) {
        throw new BadRequestException(
          `toLat/toLng required for ${input.serviceType}`,
        );
      }
      if (input.distanceKm != null && Number(input.distanceKm) > 0) {
        distanceKm = Math.round(Number(input.distanceKm) * 10) / 10;
        durationMin =
          input.durationMin != null && Number(input.durationMin) > 0
            ? Math.round(Number(input.durationMin))
            : Math.max(5, Math.round((distanceKm / 45) * 60));
      } else if (this.maps?.route) {
        try {
          const route = await this.maps.route(
            { lat: input.fromLat, lng: input.fromLng },
            { lat: input.toLat, lng: input.toLng },
          );
          if (route && route.distanceKm > 0) {
            distanceKm = Math.round(route.distanceKm * 10) / 10;
            durationMin = Math.round(route.durationMin);
          }
        } catch {
          // fallback to haversine below
        }
      }
      if (distanceKm === 0) {
        distanceKm =
          Math.round(
            this.haversineKm(
              input.fromLat,
              input.fromLng,
              input.toLat,
              input.toLng,
            ) * 10,
          ) / 10;
        durationMin = Math.max(8, Math.round((distanceKm / 30) * 60));
      }
      guidance = base + distanceKm * perKm + durationMin * perMinute;
    } else if (input.serviceType === 'PER_HOUR') {
      hours = Math.max(1, hours);
      durationMin = hours * 60;
      guidance = hours * perHour;
    } else if (input.serviceType === 'CAR_RENTAL') {
      days = Math.max(1, days ?? Math.ceil((hours || 24) / 24));
      durationMin = days * 24 * 60;
      if (catalogItemId) {
        const item = await this.prisma.catalogItem.findFirst({
          where: {
            id: catalogItemId,
            serviceType: 'CAR_RENTAL',
            active: true,
          },
        });
        if (!item) throw new BadRequestException('Catalog item not found');
        guidance = Number(item.basePrice) * (days === 7 ? 1 : days / 7);
      } else {
        guidance = days * perHour; // perHour rule = per-day rate
      }
    } else if (input.serviceType === 'EXPERIENCES') {
      if (catalogItemId) {
        const item = await this.prisma.catalogItem.findFirst({
          where: {
            id: catalogItemId,
            serviceType: 'EXPERIENCES',
            active: true,
          },
        });
        if (!item) throw new BadRequestException('Catalog item not found');
        guidance = Number(item.basePrice);
        hours = item.durationHours ?? hours;
      } else {
        guidance = base;
      }
      durationMin = (hours || 3) * 60;
    }

    guidance = Math.max(minFare, round2(guidance));
    if (input.vip) {
      guidance = round2(guidance * 1.15);
    }

    const minMul = Number(rule.minBidMultiplier);
    const maxMul = Number(rule.maxBidMultiplier);

    return {
      currency,
      serviceType: input.serviceType,
      vehicleClass,
      distanceKm: round2(distanceKm),
      durationMin: round2(durationMin),
      hours:
        input.serviceType === 'PER_HOUR' || input.serviceType === 'EXPERIENCES'
          ? hours
          : undefined,
      days: input.serviceType === 'CAR_RENTAL' ? days : undefined,
      catalogItemId,
      vipApplied: !!input.vip,
      guidanceAmount: guidance,
      minBid: round2(guidance * minMul),
      maxBid: round2(guidance * maxMul),
      minFare,
      baseFare: base,
      perKm,
      perMinute,
      perHour,
      platformCommissionPct: Number(rule.platformCommissionPct),
      taxPct: Number(rule.taxPct),
      ruleId: rule.id,
    };
  }

  freezeBid(
    guidance: PriceSnapshot,
    bidAmount: number,
    opts?: {
      outboundPrice?: number;
      returnPrice?: number | null;
      enquiryDiscountPct?: number;
    },
  ): PriceSnapshot {
    if (bidAmount < guidance.minBid - 0.001) {
      throw new BadRequestException(
        `Bid below minimum (${guidance.minBid} ${guidance.currency})`,
      );
    }
    if (bidAmount > guidance.maxBid + 0.001) {
      throw new BadRequestException(
        `Bid above maximum (${guidance.maxBid} ${guidance.currency})`,
      );
    }

    const driverBid = round2(bidAmount);
    const isRoundTrip =
      Boolean(guidance.isRoundTrip) ||
      (guidance.legs != null && guidance.legs > 1) ||
      (opts?.returnPrice != null && opts.returnPrice > 0);
    const outbound =
      opts?.outboundPrice != null
        ? round2(opts.outboundPrice)
        : isRoundTrip && opts?.returnPrice == null
          ? round2(driverBid / 2)
          : driverBid;
    const returnPrice =
      opts?.returnPrice != null
        ? round2(opts.returnPrice)
        : isRoundTrip
          ? round2(Math.max(0, driverBid - outbound))
          : undefined;

    const ridePrice = driverBid;
    const platformFee = round2(ridePrice * 0.2);
    const driverCommission = round2(ridePrice * 0.2);
    const taxAmount = round2(ridePrice * (guidance.taxPct / 100));
    const originalPassengerTotal = round2(ridePrice + platformFee + taxAmount);

    const hasReturnLeg = returnPrice != null && returnPrice > 0;
    const returnDiscountPct = hasReturnLeg ? 15 : 0;
    const returnDiscountAmount = hasReturnLeg
      ? round2(returnPrice * (returnDiscountPct / 100))
      : 0;
    const discountedReturnPrice = hasReturnLeg
      ? round2(returnPrice - returnDiscountAmount)
      : undefined;

    const rawEnquiryDiscountPct =
      opts?.enquiryDiscountPct ?? guidance.enquiryDiscountPct ?? 0;
    const enquiryDiscountPct =
      rawEnquiryDiscountPct > 0 ? Number(rawEnquiryDiscountPct) : 0;
    const enquiryDiscountAmount =
      enquiryDiscountPct > 0
        ? round2(ridePrice * (enquiryDiscountPct / 100))
        : 0;

    const totalDiscountAmount = round2(
      returnDiscountAmount + enquiryDiscountAmount,
    );
    const passengerTotal = round2(
      Math.max(0, originalPassengerTotal - totalDiscountAmount),
    );
    const driverEarning = round2(ridePrice - driverCommission);
    const canRideGrossRevenue = round2(
      Math.max(0, platformFee + driverCommission - totalDiscountAmount),
    );

    let priceBand: PriceSnapshot['priceBand'] = 'typical';
    const span = Math.max(0.01, guidance.maxBid - guidance.minBid);
    const t = (driverBid - guidance.minBid) / span;
    if (t <= 0.33) priceBand = 'competitive';
    else if (t >= 0.67) priceBand = 'above_typical';

    return {
      ...guidance,
      bidAmount: driverBid,
      outboundPrice: outbound,
      returnPrice,
      discountedReturnPrice,
      returnDiscountPct,
      returnDiscountAmount,
      enquiryDiscountPct,
      enquiryDiscountAmount,
      originalPassengerTotal,
      subtotal: ridePrice,
      taxAmount,
      platformFee,
      marketplaceFee: platformFee,
      driverCommission,
      canRideGrossRevenue,
      driverEarning,
      passengerTotal,
      priceBand,
      frozenAt: new Date().toISOString(),
    };
  }

  private async resolveRule(
    serviceType: string,
    vehicleClass: string,
    currency: string,
  ) {
    const specific = await this.prisma.fareRule.findFirst({
      where: { serviceType, vehicleClass, currency, isActive: true },
    });
    if (specific) return specific;
    const fallback = await this.prisma.fareRule.findFirst({
      where: { serviceType, vehicleClass: '*', currency, isActive: true },
    });
    if (!fallback) {
      throw new BadRequestException(
        `No fare rule for ${serviceType}/${vehicleClass}/${currency}`,
      );
    }
    return fallback;
  }
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function asJson(snapshot: PriceSnapshot): Prisma.InputJsonValue {
  return snapshot;
}
