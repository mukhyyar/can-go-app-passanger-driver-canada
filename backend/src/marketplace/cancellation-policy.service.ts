import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AmountRuleType,
  CancellationPolicyTier,
  CancellationWindowType,
  FeeTreatmentType,
  Prisma,
  Ride,
  RideStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { round2 } from './pricing.service';

export interface EvaluatedCancellation {
  tier: CancellationPolicyTier;
  hoursBeforePickup: number | null;
  driverArrivedAndWaitingExpired: boolean;
  passengerRefundAmount: number;
  cancellationFee: number;
  providerCompAmount: number;
  canRideRetainedFee: number;
  feeTreatment: FeeTreatmentType;
  currency: string;
  termsSummary: string;
  passengerDisplayLabel: string;
}

export interface CancellationPolicyPublicView {
  code: string;
  title: string;
  description: string;
  tiers: Array<{
    tierKey: string;
    name: string;
    windowLabel: string;
    refundLabel: string;
    passengerDisplayTerms: string;
    passengerRefundType: string;
    passengerRefundValue: number;
    feeTreatment: string;
  }>;
}

export type WaitingCategory =
  | 'FLIGHT'
  | 'AIRPORT_PORT'
  | 'TRAIN_STATION'
  | 'URGENT'
  | 'OTHER';

export interface WaitingDetailsResolution {
  category: WaitingCategory;
  label: string;
  minutes: number;
  flightDelayCoverageMaxHours?: number;
}

/**
 * Resolves free included waiting time according to Section 9 / Clause 8.1:
 * - Flight tracking: free waiting up to 7 hours from scheduled pickup + 60 min after arrival
 * - Airports and cruise ports: 60 min
 * - Train stations: 30 min
 * - Urgent transfers (on-demand / pickup <= 30 min from creation): 5 min
 * - Other places: 15 min
 */
export function resolveIncludedWaitingDetails(params: {
  fromLabel?: string | null;
  flight?: string | null;
  pickupAt?: Date | string | null;
  createdAt?: Date | string | null;
  pickupWaitMin?: number | null;
}): WaitingDetailsResolution {
  if (params.pickupWaitMin != null && params.pickupWaitMin > 0) {
    return {
      category: 'OTHER',
      label: `${params.pickupWaitMin} min waiting`,
      minutes: params.pickupWaitMin,
    };
  }

  const from = (params.fromLabel ?? '').toLowerCase();
  const hasFlight = Boolean(params.flight && params.flight.trim().length > 0);

  // 1. Flight tracking (if flight number provided)
  if (hasFlight) {
    return {
      category: 'FLIGHT',
      label: 'Flight tracking (delay up to 7h + 60 min wait)',
      minutes: 60,
      flightDelayCoverageMaxHours: 7,
    };
  }

  // 2. Airports and passenger cruise ports
  const isAirportOrPort =
    /(airport|aeroport|airfield|aerodrome|terminal|cruise|port\b|harbour|harbor|dock|pier|ferry)/i.test(
      from,
    );
  if (isAirportOrPort) {
    return {
      category: 'AIRPORT_PORT',
      label: 'Airports and cruise ports (60 min wait)',
      minutes: 60,
    };
  }

  // 3. Train stations
  const isTrainStation =
    /(station|train|railway|rail|gare\b|amtrak|via rail|subway|metro)/i.test(
      from,
    );
  if (isTrainStation) {
    return {
      category: 'TRAIN_STATION',
      label: 'Train stations (30 min wait)',
      minutes: 30,
    };
  }

  // 4. Urgent transfers: on-demand / ASAP rides scheduled within 30 min of creation
  if (params.pickupAt && params.createdAt) {
    const pickup = new Date(params.pickupAt).getTime();
    const created = new Date(params.createdAt).getTime();
    const diffMin = (pickup - created) / (1000 * 60);
    if (diffMin >= -5 && diffMin <= 30) {
      return {
        category: 'URGENT',
        label: 'Urgent transfers (5 min wait)',
        minutes: 5,
      };
    }
  }

  // 5. Other places
  return {
    category: 'OTHER',
    label: 'Other places (15 min wait)',
    minutes: 15,
  };
}

export function resolveIncludedWaitingMinutes(params: {
  fromLabel?: string | null;
  flight?: string | null;
  pickupAt?: Date | string | null;
  createdAt?: Date | string | null;
  pickupWaitMin?: number | null;
}): number {
  return resolveIncludedWaitingDetails(params).minutes;
}

export const DEFAULT_CANCELLATION_TIERS = [
  {
    tierKey: 'GT_24H',
    name: 'More than 24 hours before pickup',
    windowType: CancellationWindowType.HOURS_BEFORE_PICKUP,
    minHoursBeforePickup: 24.0,
    maxHoursBeforePickup: null,
    passengerRefundType: AmountRuleType.PERCENTAGE,
    passengerRefundValue: new Prisma.Decimal(100.0),
    providerCompType: AmountRuleType.PERCENTAGE,
    providerCompValue: new Prisma.Decimal(0.0),
    feeTreatment: FeeTreatmentType.REFUND_TO_PASSENGER,
    passengerDisplayLabel: 'Full eligible refund',
    passengerDisplayTerms:
      'Cancellations made more than 24 hours before pickup receive a full eligible refund including platform fees.',
    sortOrder: 1,
    isActive: true,
  },
  {
    tierKey: 'BETWEEN_12_24H',
    name: '12–24 hours before pickup',
    windowType: CancellationWindowType.HOURS_BEFORE_PICKUP,
    minHoursBeforePickup: 12.0,
    maxHoursBeforePickup: 24.0,
    passengerRefundType: AmountRuleType.PERCENTAGE,
    passengerRefundValue: new Prisma.Decimal(50.0),
    providerCompType: AmountRuleType.PERCENTAGE,
    providerCompValue: new Prisma.Decimal(30.0),
    feeTreatment: FeeTreatmentType.RETAIN_BY_PLATFORM,
    passengerDisplayLabel: 'Partial refund',
    passengerDisplayTerms:
      'Cancellations made between 12 and 24 hours before pickup receive a partial refund. Platform fee is retained.',
    sortOrder: 2,
    isActive: true,
  },
  {
    tierKey: 'LT_12H',
    name: 'Less than 12 hours before pickup',
    windowType: CancellationWindowType.HOURS_BEFORE_PICKUP,
    minHoursBeforePickup: 0.0,
    maxHoursBeforePickup: 12.0,
    passengerRefundType: AmountRuleType.PERCENTAGE,
    passengerRefundValue: new Prisma.Decimal(0.0),
    providerCompType: AmountRuleType.PERCENTAGE,
    providerCompValue: new Prisma.Decimal(50.0),
    feeTreatment: FeeTreatmentType.RETAIN_BY_PLATFORM,
    passengerDisplayLabel: 'Cancellation fee may apply',
    passengerDisplayTerms:
      'Cancellations made less than 12 hours before pickup are subject to a cancellation fee. Provider compensation applies.',
    sortOrder: 3,
    isActive: true,
  },
  {
    tierKey: 'DRIVER_ARRIVED_NO_SHOW',
    name: 'Driver arrived + waiting period expired',
    windowType: CancellationWindowType.DRIVER_ARRIVED_WAITING_EXPIRED,
    minHoursBeforePickup: null,
    maxHoursBeforePickup: null,
    passengerRefundType: AmountRuleType.PERCENTAGE,
    passengerRefundValue: new Prisma.Decimal(0.0),
    providerCompType: AmountRuleType.PERCENTAGE,
    providerCompValue: new Prisma.Decimal(80.0),
    feeTreatment: FeeTreatmentType.RETAIN_BY_PLATFORM,
    passengerDisplayLabel: 'May become No-Show',
    passengerDisplayTerms:
      'If the driver has arrived and the waiting period has expired, this booking may be treated as a No-Show with no refund.',
    sortOrder: 4,
    isActive: true,
  },
];

@Injectable()
export class CancellationPolicyService {
  private readonly logger = new Logger(CancellationPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently seed default cancellation policy tiers if empty.
   */
  async ensureDefaults(): Promise<void> {
    const count = await this.prisma.cancellationPolicyTier.count();
    if (count > 0) return;

    for (const tier of DEFAULT_CANCELLATION_TIERS) {
      await this.prisma.cancellationPolicyTier.upsert({
        where: { tierKey: tier.tierKey },
        create: tier,
        update: {},
      });
    }
    this.logger.log('Seeded default cancellation policy tiers');
  }

  /**
   * List all configured tiers for Admin ops.
   */
  async listTiers(): Promise<CancellationPolicyTier[]> {
    await this.ensureDefaults();
    return this.prisma.cancellationPolicyTier.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Update an existing cancellation tier.
   */
  async updateTier(
    tierKey: string,
    data: {
      name?: string;
      minHoursBeforePickup?: number | null;
      maxHoursBeforePickup?: number | null;
      passengerRefundType?: AmountRuleType;
      passengerRefundValue?: number;
      providerCompType?: AmountRuleType;
      providerCompValue?: number;
      feeTreatment?: FeeTreatmentType;
      passengerDisplayLabel?: string;
      passengerDisplayTerms?: string;
      isActive?: boolean;
    },
    adminId?: string,
  ): Promise<CancellationPolicyTier> {
    const existing = await this.prisma.cancellationPolicyTier.findUnique({
      where: { tierKey },
    });
    if (!existing) {
      throw new NotFoundException(`Cancellation policy tier ${tierKey} not found`);
    }

    return this.prisma.cancellationPolicyTier.update({
      where: { tierKey },
      data: {
        ...(data.name != null ? { name: data.name } : {}),
        ...(data.minHoursBeforePickup !== undefined
          ? { minHoursBeforePickup: data.minHoursBeforePickup }
          : {}),
        ...(data.maxHoursBeforePickup !== undefined
          ? { maxHoursBeforePickup: data.maxHoursBeforePickup }
          : {}),
        ...(data.passengerRefundType != null
          ? { passengerRefundType: data.passengerRefundType }
          : {}),
        ...(data.passengerRefundValue != null
          ? { passengerRefundValue: new Prisma.Decimal(data.passengerRefundValue) }
          : {}),
        ...(data.providerCompType != null
          ? { providerCompType: data.providerCompType }
          : {}),
        ...(data.providerCompValue != null
          ? { providerCompValue: new Prisma.Decimal(data.providerCompValue) }
          : {}),
        ...(data.feeTreatment != null ? { feeTreatment: data.feeTreatment } : {}),
        ...(data.passengerDisplayLabel != null
          ? { passengerDisplayLabel: data.passengerDisplayLabel }
          : {}),
        ...(data.passengerDisplayTerms != null
          ? { passengerDisplayTerms: data.passengerDisplayTerms }
          : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
        updatedByAdminId: adminId ?? null,
      },
    });
  }

  /**
   * Public formatted cancellation policy view for client applications (Mobile & Web).
   */
  async getPublicPolicy(): Promise<CancellationPolicyPublicView> {
    await this.ensureDefaults();
    const tiers = await this.prisma.cancellationPolicyTier.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      code: 'CAN_RIDE_STANDARD',
      title: 'Cancellation Terms',
      description:
        'Cancellation fee and eligible refund depend on how far in advance you cancel.',
      tiers: tiers.map((t) => ({
        tierKey: t.tierKey,
        name: t.name,
        windowLabel: t.name,
        refundLabel: t.passengerDisplayLabel,
        passengerDisplayTerms: t.passengerDisplayTerms,
        passengerRefundType: t.passengerRefundType,
        passengerRefundValue: Number(t.passengerRefundValue),
        feeTreatment: t.feeTreatment,
      })),
    };
  }

  /**
   * Evaluate which cancellation tier applies to a given ride at the specified cancellation time.
   */
  async evaluateCancellation(
    rideId: string,
    cancelledAt = new Date(),
  ): Promise<EvaluatedCancellation> {
    await this.ensureDefaults();
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
        },
        financial: true,
        payments: {
          where: {
            status: { in: ['succeeded', 'captured', 'paid', 'SUCCEEDED', 'CAPTURED'] },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const tiers = await this.prisma.cancellationPolicyTier.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Check if Driver arrived and waiting period expired
    let driverArrivedAndWaitingExpired = false;
    if (
      ride.status === RideStatus.DRIVER_ARRIVED ||
      ride.status === RideStatus.NO_SHOW
    ) {
      const arrivedEvent = ride.events.find(
        (e) => e.toStatus === RideStatus.DRIVER_ARRIVED,
      );
      if (arrivedEvent) {
        const waitingAllowedMin =
          ride.pickupWaitMin ??
          resolveIncludedWaitingMinutes({
            fromLabel: ride.fromLabel,
            flight: ride.flight,
            pickupAt: ride.pickupAt,
            createdAt: ride.createdAt,
          });
        // Free waiting starts at the scheduled pickup time or arrival time, whichever is later
        const effectiveWaitStart = Math.max(
          arrivedEvent.createdAt.getTime(),
          ride.pickupAt.getTime(),
        );
        const elapsedMin =
          (cancelledAt.getTime() - effectiveWaitStart) / (1000 * 60);
        if (elapsedMin >= waitingAllowedMin) {
          driverArrivedAndWaitingExpired = true;
        }
      }
    }

    // Calculate hours before scheduled pickup
    const msDiff = ride.pickupAt.getTime() - cancelledAt.getTime();
    const hoursBeforePickup = round2(msDiff / (1000 * 60 * 60));

    // Match tier
    let matchedTier: CancellationPolicyTier | undefined;

    if (driverArrivedAndWaitingExpired) {
      matchedTier = tiers.find(
        (t) => t.windowType === CancellationWindowType.DRIVER_ARRIVED_WAITING_EXPIRED,
      );
    }

    if (!matchedTier) {
      const hourTiers = tiers.filter(
        (t) => t.windowType === CancellationWindowType.HOURS_BEFORE_PICKUP,
      );

      for (const t of hourTiers) {
        const min = t.minHoursBeforePickup ?? -Infinity;
        const max = t.maxHoursBeforePickup ?? Infinity;
        if (hoursBeforePickup >= min && hoursBeforePickup < max) {
          matchedTier = t;
          break;
        }
      }

      // Fallback: If above highest min, use the first tier (>24h). If below 0, use last hour tier.
      if (!matchedTier && hourTiers.length > 0) {
        if (hoursBeforePickup >= 24) matchedTier = hourTiers[0];
        else matchedTier = hourTiers[hourTiers.length - 1];
      }
    }

    if (!matchedTier) {
      // Safe fallback tier
      matchedTier = tiers[0] ?? (DEFAULT_CANCELLATION_TIERS[0] as unknown as CancellationPolicyTier);
    }

    // Extract financials
    const snap =
      (ride.priceSnapshot && typeof ride.priceSnapshot === 'object'
        ? (ride.priceSnapshot as Record<string, unknown>)
        : {}) as Record<string, unknown>;

    const rideFare = ride.financial
      ? Number(ride.financial.rideFare)
      : Number(snap.subtotal ?? snap.bidAmount ?? 0);

    const marketplaceFee = ride.financial
      ? Number(ride.financial.marketplaceFee)
      : Number(snap.platformFee ?? snap.marketplaceFee ?? round2(rideFare * 0.2));

    const taxes = ride.financial
      ? Number(ride.financial.taxes)
      : Number(snap.taxAmount ?? 0);

    const successfulPayment = ride.payments[0];
    const totalPaid = successfulPayment
      ? Number(successfulPayment.amount)
      : ride.financial
      ? Number(ride.financial.passengerTotalCharged)
      : round2(rideFare + marketplaceFee + taxes);

    const currency = ride.currency ?? 'CAD';

    const settlement = this.computeSettlement(matchedTier, {
      rideFare,
      marketplaceFee,
      taxes,
      totalPaid,
    });

    return {
      tier: matchedTier,
      hoursBeforePickup,
      driverArrivedAndWaitingExpired,
      passengerRefundAmount: settlement.passengerRefundAmount,
      cancellationFee: settlement.cancellationFee,
      providerCompAmount: settlement.providerCompAmount,
      canRideRetainedFee: settlement.canRideRetainedFee,
      feeTreatment: matchedTier.feeTreatment,
      currency,
      termsSummary: matchedTier.passengerDisplayTerms,
      passengerDisplayLabel: matchedTier.passengerDisplayLabel,
    };
  }

  /**
   * Compute mathematical split for a tier given gross financial components.
   */
  computeSettlement(
    tier: CancellationPolicyTier,
    financials: {
      rideFare: number;
      marketplaceFee: number;
      taxes: number;
      totalPaid: number;
    },
  ) {
    const { rideFare, marketplaceFee, taxes, totalPaid } = financials;
    const paxVal = Number(tier.passengerRefundValue);
    const provVal = Number(tier.providerCompValue);

    // 1. Passenger refund on base fare
    let fareRefund = 0;
    if (tier.passengerRefundType === AmountRuleType.PERCENTAGE) {
      fareRefund = round2(rideFare * (Math.max(0, Math.min(100, paxVal)) / 100));
    } else {
      fareRefund = round2(Math.min(rideFare, Math.max(0, paxVal)));
    }

    // 2. Fee treatment
    let feeRefund = 0;
    if (tier.feeTreatment === FeeTreatmentType.REFUND_TO_PASSENGER) {
      feeRefund = marketplaceFee;
    }

    // 3. Tax refund proportional to refund percentage
    let taxRefund = 0;
    if (totalPaid > 0 && (fareRefund + feeRefund) > 0) {
      const refundRatio = (fareRefund + feeRefund) / Math.max(1, rideFare + marketplaceFee);
      taxRefund = round2(taxes * Math.min(1, refundRatio));
    }

    const passengerRefundAmount = Math.min(
      totalPaid,
      round2(fareRefund + feeRefund + taxRefund),
    );
    const cancellationFee = Math.max(0, round2(totalPaid - passengerRefundAmount));

    // 4. Provider compensation
    let providerCompAmount = 0;
    if (tier.providerCompType === AmountRuleType.PERCENTAGE) {
      providerCompAmount = round2(rideFare * (Math.max(0, Math.min(100, provVal)) / 100));
    } else {
      providerCompAmount = round2(Math.min(rideFare, Math.max(0, provVal)));
    }
    // Cannot compensate more than the cancellation fee collected unless specifically subsidized
    providerCompAmount = Math.min(providerCompAmount, cancellationFee > 0 ? cancellationFee : rideFare);

    // 5. CAN-RIDE retained revenue
    const canRideRetainedFee = Math.max(
      0,
      round2(cancellationFee - providerCompAmount),
    );

    return {
      passengerRefundAmount,
      cancellationFee,
      providerCompAmount,
      canRideRetainedFee,
    };
  }

  /**
   * Simulation / Sandbox for Admin portal to preview all 4 tiers with test amounts.
   */
  async simulate(input: {
    rideFare: number;
    marketplaceFee?: number;
    taxes?: number;
  }) {
    await this.ensureDefaults();
    const tiers = await this.listTiers();
    const rideFare = round2(Number(input.rideFare) || 0);
    const marketplaceFee = round2(
      Number(input.marketplaceFee) ?? round2(rideFare * 0.2),
    );
    const taxes = round2(Number(input.taxes) || 0);
    const totalPaid = round2(rideFare + marketplaceFee + taxes);

    return tiers.map((tier) => {
      const calc = this.computeSettlement(tier, {
        rideFare,
        marketplaceFee,
        taxes,
        totalPaid,
      });
      return {
        tierKey: tier.tierKey,
        name: tier.name,
        passengerDisplayLabel: tier.passengerDisplayLabel,
        passengerRefundValue: Number(tier.passengerRefundValue),
        passengerRefundType: tier.passengerRefundType,
        providerCompValue: Number(tier.providerCompValue),
        providerCompType: tier.providerCompType,
        feeTreatment: tier.feeTreatment,
        simulation: {
          totalPaid,
          passengerRefund: calc.passengerRefundAmount,
          cancellationFee: calc.cancellationFee,
          providerCompensation: calc.providerCompAmount,
          platformRetained: calc.canRideRetainedFee,
        },
      };
    });
  }
}
