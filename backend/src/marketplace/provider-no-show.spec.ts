jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn(() => null);
  },
}));

jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {},
}));

import { RideStatus, OfferStatus } from '@prisma/client';
import { MarketplaceService } from './marketplace.service';

describe('Provider Fails to Arrive (Section 11) - MarketplaceService', () => {
  let service: MarketplaceService;
  let mockPrisma: any;
  let mockTracking: any;
  let mockNotifications: any;
  let mockPayments: any;
  let mockDriverCancellation: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      ride: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      driverProfile: {
        findUnique: jest.fn(),
      },
      offer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      rideEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event_1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      payment: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      refund: {
        create: jest.fn(),
      },
      rideFinancial: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return Promise.all(cb);
      }),
    };

    mockTracking = {
      emitRideEvent: jest.fn(),
      emitToPassengers: jest.fn(),
    };

    mockNotifications = {
      notifyRideStatus: jest.fn().mockResolvedValue(undefined),
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };

    mockPayments = {
      name: 'stripe',
      refund: jest.fn().mockResolvedValue({ refundId: 're_123', status: 'succeeded' }),
    };

    mockDriverCancellation = {
      flagProviderForNoShow: jest.fn().mockResolvedValue({ id: 'rec_1' }),
    };

    service = new MarketplaceService(
      mockPrisma,
      {} as any, // pricing
      mockPayments,
      mockNotifications,
      {} as any, // promos
      {} as any, // lifecycle
      {} as any, // presentation
      {} as any, // storage
      { get: jest.fn() } as any, // config
      mockTracking,
      undefined,
      undefined,
      undefined,
      mockDriverCancellation,
    );

    // Mock serializeRide / getRideForActor internal call
    (service as any).getRideForActor = jest.fn().mockImplementation((userId, rideId) => ({
      id: rideId,
      status: 'UPDATED',
    }));
  });

  describe('attemptReplacement', () => {
    it('unassigns failing driver, retains originalDriverId, reopens ride, and flags driver', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_pax_1',
        passengerProfile: { id: 'pax_prof_1' },
      });

      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride_123',
        status: RideStatus.DRIVER_EN_ROUTE,
        assignedDriverId: 'driver_original_1',
        originalDriverId: null,
        passenger: { userId: 'user_pax_1' },
      });

      mockPrisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver_original_1',
        fullName: 'Original Driver Name',
        user: { id: 'user_driver_1' },
      });

      const res = await service.attemptReplacement('user_pax_1', 'ride_123');

      expect(res).toBeDefined();

      // Ride updated with originalDriverId retained and reassigned to WAITING_FOR_OFFERS
      expect(mockPrisma.ride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ride_123' },
          data: expect.objectContaining({
            originalDriverId: 'driver_original_1',
            assignedDriverId: null,
            selectedOfferId: null,
            status: RideStatus.WAITING_FOR_OFFERS,
          }),
        }),
      );

      // Failing driver's offer withdrawn
      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
        where: { rideId: 'ride_123', driverId: 'driver_original_1' },
        data: { status: OfferStatus.WITHDRAWN },
      });

      // Provider replaced RideEvent snapshot created
      expect(mockPrisma.rideEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          rideId: 'ride_123',
          fromStatus: RideStatus.DRIVER_EN_ROUTE,
          toStatus: RideStatus.WAITING_FOR_OFFERS,
          payload: expect.objectContaining({
            action: 'provider_replaced',
            failingDriverId: 'driver_original_1',
            originalDriverId: 'driver_original_1',
            failingDriverName: 'Original Driver Name',
            isUrgentReplacement: true,
          }),
        }),
      });

      // Failing driver flagged for review
      expect(mockDriverCancellation.flagProviderForNoShow).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: 'driver_original_1',
          rideId: 'ride_123',
        }),
      );

      // Urgent replacement broadcast sent
      expect(mockTracking.emitRideEvent).toHaveBeenCalledWith(
        'ride_123',
        expect.objectContaining({
          type: 'ride.replacement_requested',
          isUrgentReplacement: true,
        }),
      );
    });

    it('rejects if no driver was assigned', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_pax_1',
        passengerProfile: { id: 'pax_prof_1' },
      });

      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride_123',
        status: RideStatus.WAITING_FOR_OFFERS,
        assignedDriverId: null,
        passenger: { userId: 'user_pax_1' },
      });

      await expect(service.attemptReplacement('user_pax_1', 'ride_123')).rejects.toThrow(
        'No assigned provider to replace',
      );
    });
  });

  describe('cancelProviderNoShow', () => {
    it('cancels ride, issues 100% full refund via Stripe, voids driver earnings, and flags provider', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_pax_1',
        passengerProfile: { id: 'pax_prof_1' },
      });

      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride_123',
        status: RideStatus.BOOKED,
        assignedDriverId: 'driver_failing_1',
        originalDriverId: null,
        passenger: { userId: 'user_pax_1' },
      });

      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay_1',
        providerRef: 'pi_stripe_123',
        amount: 85.5,
        currency: 'CAD',
        refunds: [],
      });

      const res = await service.cancelProviderNoShow('user_pax_1', 'ride_123');

      expect(res).toBeDefined();

      // Ride transitioned to PASSENGER_CANCELLED
      expect(mockPrisma.ride.update).toHaveBeenCalledWith({
        where: { id: 'ride_123' },
        data: { status: RideStatus.PASSENGER_CANCELLED },
      });

      // Offers withdrawn
      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
        where: { rideId: 'ride_123', status: { in: [OfferStatus.ACTIVE, OfferStatus.SELECTED] } },
        data: { status: OfferStatus.WITHDRAWN },
      });

      // Stripe 100% full refund initiated
      expect(mockPayments.refund).toHaveBeenCalledWith('pi_stripe_123', 85.5);

      // Refund created & financial record zeroed
      expect(mockPrisma.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentId: 'pay_1',
          amount: 85.5,
          type: 'FULL',
        }),
      });

      expect(mockPrisma.rideFinancial.updateMany).toHaveBeenCalledWith({
        where: { rideId: 'ride_123' },
        data: expect.objectContaining({
          refundAmount: 85.5,
          driverNetEarning: 0,
          marketplaceFee: 0,
        }),
      });

      // Provider flagged for review
      expect(mockDriverCancellation.flagProviderForNoShow).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: 'driver_failing_1',
          rideId: 'ride_123',
        }),
      );

      // Notification sent to passenger confirming 100% refund
      expect(mockNotifications.notifyRideStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          rideId: 'ride_123',
          title: 'Booking Cancelled (Provider No-Show)',
          body: expect.stringContaining('100% full refund of CAD $85.50'),
        }),
      );
    });
  });
});
