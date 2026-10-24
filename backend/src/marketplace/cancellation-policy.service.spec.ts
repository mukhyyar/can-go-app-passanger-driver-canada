import { AmountRuleType, CancellationPolicyTier, CancellationWindowType, FeeTreatmentType, Prisma } from '@prisma/client';
import {
  CancellationPolicyService,
  DEFAULT_CANCELLATION_TIERS,
  resolveIncludedWaitingDetails,
} from './cancellation-policy.service';

describe('CancellationPolicyService', () => {
  let service: CancellationPolicyService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      cancellationPolicyTier: {
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue(
          DEFAULT_CANCELLATION_TIERS.map((t) => ({
            ...t,
            id: `id_${t.tierKey}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        ),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      ride: {
        findUnique: jest.fn(),
      },
    };
    service = new CancellationPolicyService(mockPrisma);
  });

  describe('computeSettlement', () => {
    const tierGt24 = {
      ...DEFAULT_CANCELLATION_TIERS[0],
      passengerRefundValue: new Prisma.Decimal(100),
      providerCompValue: new Prisma.Decimal(0),
    } as unknown as CancellationPolicyTier;

    const tier12to24 = {
      ...DEFAULT_CANCELLATION_TIERS[1],
      passengerRefundValue: new Prisma.Decimal(50),
      providerCompValue: new Prisma.Decimal(30),
      feeTreatment: FeeTreatmentType.RETAIN_BY_PLATFORM,
    } as unknown as CancellationPolicyTier;

    const tierLt12 = {
      ...DEFAULT_CANCELLATION_TIERS[2],
      passengerRefundValue: new Prisma.Decimal(0),
      providerCompValue: new Prisma.Decimal(50),
      feeTreatment: FeeTreatmentType.RETAIN_BY_PLATFORM,
    } as unknown as CancellationPolicyTier;

    const tierNoShow = {
      ...DEFAULT_CANCELLATION_TIERS[3],
      passengerRefundValue: new Prisma.Decimal(0),
      providerCompValue: new Prisma.Decimal(80),
      feeTreatment: FeeTreatmentType.RETAIN_BY_PLATFORM,
    } as unknown as CancellationPolicyTier;

    it('calculates full eligible refund for >24h tier', () => {
      const result = service.computeSettlement(tierGt24, {
        rideFare: 100,
        marketplaceFee: 20,
        taxes: 15.6,
        totalPaid: 135.6,
      });

      expect(result.passengerRefundAmount).toBe(135.6);
      expect(result.cancellationFee).toBe(0);
      expect(result.providerCompAmount).toBe(0);
      expect(result.canRideRetainedFee).toBe(0);
    });

    it('calculates partial refund and provider comp for 12-24h tier', () => {
      const result = service.computeSettlement(tier12to24, {
        rideFare: 100,
        marketplaceFee: 20,
        taxes: 15.6,
        totalPaid: 135.6,
      });

      // 50% of $100 fare = $50. Marketplace fee retained ($0 fee refund).
      // Tax refund proportional: 50 / 120 * 15.6 = 6.5
      // Total passenger refund = 50 + 6.5 = 56.5
      expect(result.passengerRefundAmount).toBe(56.5);
      expect(result.cancellationFee).toBe(79.1);
      // Provider compensation: 30% of $100 = $30
      expect(result.providerCompAmount).toBe(30);
      // Retained by platform: cancellationFee ($79.1) - providerComp ($30) = $49.1
      expect(result.canRideRetainedFee).toBe(49.1);
    });

    it('calculates cancellation fee and provider comp for <12h tier', () => {
      const result = service.computeSettlement(tierLt12, {
        rideFare: 100,
        marketplaceFee: 20,
        taxes: 15.6,
        totalPaid: 135.6,
      });

      expect(result.passengerRefundAmount).toBe(0);
      expect(result.cancellationFee).toBe(135.6);
      expect(result.providerCompAmount).toBe(50);
      expect(result.canRideRetainedFee).toBe(85.6);
    });

    it('calculates no-show penalty and provider compensation', () => {
      const result = service.computeSettlement(tierNoShow, {
        rideFare: 100,
        marketplaceFee: 20,
        taxes: 15.6,
        totalPaid: 135.6,
      });

      expect(result.passengerRefundAmount).toBe(0);
      expect(result.cancellationFee).toBe(135.6);
      expect(result.providerCompAmount).toBe(80);
      expect(result.canRideRetainedFee).toBe(55.6);
    });
  });

  describe('evaluateCancellation for rides', () => {
    it('matches GT_24H when pickup is 30 hours in future', async () => {
      const now = new Date('2026-10-21T10:00:00Z');
      const pickupAt = new Date('2026-10-22T16:00:00Z'); // 30h ahead
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride_1',
        pickupAt,
        status: 'BOOKED',
        currency: 'CAD',
        events: [],
        financial: {
          rideFare: 100,
          marketplaceFee: 20,
          taxes: 0,
          passengerTotalCharged: 120,
        },
        payments: [{ amount: 120, status: 'succeeded' }],
      });

      const res = await service.evaluateCancellation('ride_1', now);
      expect(res.tier.tierKey).toBe('GT_24H');
      expect(res.passengerRefundAmount).toBe(120);
      expect(res.cancellationFee).toBe(0);
    });

    it('matches BETWEEN_12_24H when pickup is 18 hours in future', async () => {
      const now = new Date('2026-10-21T10:00:00Z');
      const pickupAt = new Date('2026-10-22T04:00:00Z'); // 18h ahead
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride_2',
        pickupAt,
        status: 'BOOKED',
        currency: 'CAD',
        events: [],
        financial: {
          rideFare: 100,
          marketplaceFee: 20,
          taxes: 0,
          passengerTotalCharged: 120,
        },
        payments: [{ amount: 120, status: 'succeeded' }],
      });

      const res = await service.evaluateCancellation('ride_2', now);
      expect(res.tier.tierKey).toBe('BETWEEN_12_24H');
      expect(res.passengerRefundAmount).toBe(50);
      expect(res.cancellationFee).toBe(70);
    });

    it('matches DRIVER_ARRIVED_NO_SHOW when driver has arrived and waiting expired', async () => {
      const now = new Date('2026-10-21T10:30:00Z');
      const pickupAt = new Date('2026-10-21T10:00:00Z');
      const arrivedAt = new Date('2026-10-21T10:00:00Z'); // 30 min ago, wait min is 15
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride_3',
        pickupAt,
        pickupWaitMin: 15,
        status: 'DRIVER_ARRIVED',
        currency: 'CAD',
        events: [{ toStatus: 'DRIVER_ARRIVED', createdAt: arrivedAt }],
        financial: {
          rideFare: 100,
          marketplaceFee: 20,
          taxes: 0,
          passengerTotalCharged: 120,
        },
        payments: [{ amount: 120, status: 'succeeded' }],
      });

      const res = await service.evaluateCancellation('ride_3', now);
      expect(res.tier.tierKey).toBe('DRIVER_ARRIVED_NO_SHOW');
      expect(res.driverArrivedAndWaitingExpired).toBe(true);
      expect(res.passengerRefundAmount).toBe(0);
      expect(res.providerCompAmount).toBe(80);
    });
  });

  describe('simulate', () => {
    it('returns simulation for all 4 default tiers', async () => {
      const sim = await service.simulate({
        rideFare: 100,
        marketplaceFee: 20,
        taxes: 10,
      });

      expect(sim).toHaveLength(4);
      expect(sim[0].tierKey).toBe('GT_24H');
      expect(sim[0].simulation.passengerRefund).toBe(130);
      expect(sim[1].tierKey).toBe('BETWEEN_12_24H');
      expect(sim[1].simulation.providerCompensation).toBe(30);
    });
  });

  describe('resolveIncludedWaitingDetails', () => {
    it('resolves flight tracking when flight number is present', () => {
      const details = resolveIncludedWaitingDetails({
        fromLabel: 'Toronto Downtown Hotel',
        flight: 'AC 102',
      });
      expect(details.category).toBe('FLIGHT');
      expect(details.minutes).toBe(60);
      expect(details.flightDelayCoverageMaxHours).toBe(7);
    });

    it('resolves airport / port when keyword is present in pickup location', () => {
      const detailsAirport = resolveIncludedWaitingDetails({
        fromLabel: 'Toronto Pearson International Airport, Terminal 1',
      });
      expect(detailsAirport.category).toBe('AIRPORT_PORT');
      expect(detailsAirport.minutes).toBe(60);

      const detailsPort = resolveIncludedWaitingDetails({
        fromLabel: 'Vancouver Cruise Ship Terminal, Pier 66',
      });
      expect(detailsPort.category).toBe('AIRPORT_PORT');
      expect(detailsPort.minutes).toBe(60);
    });

    it('resolves train station when station keyword is present in pickup location', () => {
      const details = resolveIncludedWaitingDetails({
        fromLabel: 'Union Station, Bay Street, Toronto',
      });
      expect(details.category).toBe('TRAIN_STATION');
      expect(details.minutes).toBe(30);
    });

    it('resolves urgent transfer for ASAP rides scheduled within 30 min of creation', () => {
      const created = new Date('2026-10-23T10:00:00Z');
      const pickup = new Date('2026-10-23T10:15:00Z');
      const details = resolveIncludedWaitingDetails({
        fromLabel: '123 King St W, Toronto',
        createdAt: created,
        pickupAt: pickup,
      });
      expect(details.category).toBe('URGENT');
      expect(details.minutes).toBe(5);
    });

    it('resolves other places as 15 min default', () => {
      const created = new Date('2026-10-23T10:00:00Z');
      const pickup = new Date('2026-10-23T14:00:00Z');
      const details = resolveIncludedWaitingDetails({
        fromLabel: '789 Queen St E, Toronto',
        createdAt: created,
        pickupAt: pickup,
      });
      expect(details.category).toBe('OTHER');
      expect(details.minutes).toBe(15);
    });

    it('respects explicit pickupWaitMin override', () => {
      const details = resolveIncludedWaitingDetails({
        fromLabel: 'Toronto Pearson Airport',
        pickupWaitMin: 45,
      });
      expect(details.minutes).toBe(45);
    });
  });

  describe('Early arrival waiting start', () => {
    it('does not expire waiting early if driver arrives before scheduled pickup time', async () => {
      const pickupAt = new Date('2026-10-21T10:00:00Z');
      const arrivedAt = new Date('2026-10-21T09:50:00Z'); // 10 min early
      const cancelledAt = new Date('2026-10-21T10:05:00Z'); // 5 min after pickup, 15 min after arrival
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride_early',
        pickupAt,
        pickupWaitMin: 15,
        status: 'DRIVER_ARRIVED',
        currency: 'CAD',
        events: [{ toStatus: 'DRIVER_ARRIVED', createdAt: arrivedAt }],
        financial: {
          rideFare: 100,
          marketplaceFee: 20,
          taxes: 0,
          passengerTotalCharged: 120,
        },
        payments: [{ amount: 120, status: 'succeeded' }],
      });

      const res = await service.evaluateCancellation('ride_early', cancelledAt);
      // Because free wait is from 10:00 to 10:15, at 10:05 it has NOT expired
      expect(res.driverArrivedAndWaitingExpired).toBe(false);
      expect(res.tier.tierKey).not.toBe('DRIVER_ARRIVED_NO_SHOW');
    });
  });
});

