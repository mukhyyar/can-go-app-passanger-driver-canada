import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  subtotal?: number;
  taxAmount?: number;
  platformFee?: number;
  driverEarning?: number;
  passengerTotal?: number;
  frozenAt?: string;
  ruleId?: string;
  priceBand?: 'competitive' | 'typical' | 'above_typical';
};

const PHASE3_TYPES = new Set([
  'RIDE',
  'PER_HOUR',
  'DELIVERY',
  'CAR_RENTAL',
  'EXPERIENCES',
]);

@Injectable()
export class PricingService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

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
          platformCommissionPct: 15,
          taxPct: 0,
        },
        update: {},
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
    let catalogItemId = input.catalogItemId;
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
      distanceKm = this.haversineKm(
        input.fromLat,
        input.fromLng,
        input.toLat,
        input.toLng,
      );
      durationMin = Math.max(8, (distanceKm / 30) * 60);
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
    opts?: { outboundPrice?: number; returnPrice?: number | null },
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

    const subtotal = round2(bidAmount);
    const taxAmount = round2(subtotal * (guidance.taxPct / 100));
    const passengerTotal = round2(subtotal + taxAmount);
    const platformFee = round2(
      subtotal * (guidance.platformCommissionPct / 100),
    );
    const driverEarning = round2(subtotal - platformFee);
    const outbound =
      opts?.outboundPrice != null ? round2(opts.outboundPrice) : subtotal;
    const returnPrice =
      opts?.returnPrice != null ? round2(opts.returnPrice) : undefined;

    let priceBand: PriceSnapshot['priceBand'] = 'typical';
    const span = Math.max(0.01, guidance.maxBid - guidance.minBid);
    const t = (subtotal - guidance.minBid) / span;
    if (t <= 0.33) priceBand = 'competitive';
    else if (t >= 0.67) priceBand = 'above_typical';

    return {
      ...guidance,
      bidAmount: subtotal,
      outboundPrice: outbound,
      returnPrice,
      subtotal,
      taxAmount,
      platformFee,
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
  return snapshot as unknown as Prisma.InputJsonValue;
}
