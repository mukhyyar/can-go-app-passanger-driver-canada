jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    sign = jest.fn();
    verify = jest.fn();
  },
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverPayoutStatus, Prisma, RideStatus, UserRole, WalletDirection, WalletEntryStatus, WalletEntryType } from '@prisma/client';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService - Ride Tip Feature (Stripe Processing)', () => {
  let service: MarketplaceService;
  let mockPrisma: any;
  let mockPricing: any;
  let mockPayments: any;
  let mockNotifications: any;
  let mockPromos: any;
  let mockLifecycle: any;
  let mockPresentation: any;
  let mockStorage: any;
  let mockTracking: any;
  let mockStripeConnect: any;

  const passengerUserId = 'user-passenger-1';
  const passengerProfileId = 'pass-1';
  const driverUserId = 'user-driver-1';
  const driverProfileId = 'driver-1';
  const rideId = 'ride-completed-123';

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === passengerUserId) {
            return Promise.resolve({
              id: passengerUserId,
              role: UserRole.PASSENGER,
              phoneVerifiedAt: new Date(),
              isSuspended: false,
              passengerProfile: { id: passengerProfileId, userId: passengerUserId },
            });
          }
          if (where.id === driverUserId) {
            return Promise.resolve({
              id: driverUserId,
              role: UserRole.DRIVER,
              phoneVerifiedAt: new Date(),
              isSuspended: false,
              driverProfile: { id: driverProfileId, userId: driverUserId },
            });
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: driverUserId,
          driverProfile: { id: driverProfileId },
        }),
      },
      ride: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      rideFinancial: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      driverWalletEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'entry-tip-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      webhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    mockPricing = {};
    mockPayments = {
      name: 'stripe',
      createIntent: jest.fn().mockResolvedValue({
        provider: 'stripe',
        intentId: 'pi_test_tip_123',
        clientSecret: 'pi_test_tip_123_secret_xyz',
        status: 'succeeded',
      }),
      parseWebhook: jest.fn(),
    };
    mockNotifications = {
      sendToUser: jest.fn().mockResolvedValue({}),
    };
    mockPromos = {};
    mockLifecycle = {};
    mockPresentation = {};
    mockStorage = {};
    mockTracking = {
      broadcastToRide: jest.fn(),
    };
    mockStripeConnect = {
      isConfigured: jest.fn().mockReturnValue(true),
      transferToDriver: jest.fn().mockResolvedValue({ transferId: 'tr_test_tip_123' }),
    };

    const mockConfig = {
      get: jest.fn().mockReturnValue('pk_test_123'),
    };

    service = new MarketplaceService(
      mockPrisma,
      mockPricing,
      mockPayments,
      mockNotifications,
      mockPromos,
      mockLifecycle,
      mockPresentation,
      mockStorage,
      mockConfig as any,
      mockTracking,
      mockStripeConnect,
    );
  });

  it('rejects tip if ride is not COMPLETED (e.g. IN_PROGRESS)', async () => {
    mockPrisma.ride.findFirst.mockResolvedValue({
      id: rideId,
      passengerId: passengerProfileId,
      status: RideStatus.IN_PROGRESS,
      assignedDriverId: driverProfileId,
    });

    await expect(
      service.addTipToRide(passengerUserId, rideId, { amount: 5.0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects tip if amount is below minimum (< 0.50 CAD)', async () => {
    mockPrisma.ride.findFirst.mockResolvedValue({
      id: rideId,
      passengerId: passengerProfileId,
      status: RideStatus.COMPLETED,
      assignedDriverId: driverProfileId,
    });

    await expect(
      service.addTipToRide(passengerUserId, rideId, { amount: 0.25 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects tip if amount exceeds maximum allowed (> 1000 CAD)', async () => {
    mockPrisma.ride.findFirst.mockResolvedValue({
      id: rideId,
      passengerId: passengerProfileId,
      status: RideStatus.COMPLETED,
      assignedDriverId: driverProfileId,
    });

    await expect(
      service.addTipToRide(passengerUserId, rideId, { amount: 1500 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects tip if ride has no assigned driver', async () => {
    mockPrisma.ride.findFirst.mockResolvedValue({
      id: rideId,
      passengerId: passengerProfileId,
      status: RideStatus.COMPLETED,
      assignedDriverId: null,
      selectedOffer: null,
    });

    await expect(
      service.addTipToRide(passengerUserId, rideId, { amount: 10.0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('successfully creates Stripe payment intent and finalizes tip for completed ride', async () => {
    const mockRide = {
      id: rideId,
      passengerId: passengerProfileId,
      passenger: { id: passengerProfileId, fullName: 'John Doe', userId: passengerUserId },
      status: RideStatus.COMPLETED,
      assignedDriverId: driverProfileId,
      currency: 'CAD',
      fromLabel: 'Toronto Pearson Airport',
      toLabel: 'Downtown Toronto',
      priceSnapshot: {
        passengerTotal: 85.0,
        driverEarning: 68.0,
        subtotal: 80.0,
        marketplaceFee: 5.0,
      },
      selectedOffer: {
        driverId: driverProfileId,
        driver: {
          id: driverProfileId,
          stripeAccountId: 'acct_driver_123',
          stripePayoutsEnabled: true,
        },
      },
      offers: [],
      events: [],
      payments: [],
      supportCases: [],
    };

    mockPrisma.ride.findFirst.mockResolvedValue(mockRide);
    mockPrisma.ride.findUnique.mockResolvedValue(mockRide);

    const mockPayment = {
      id: 'pay_tip_123',
      rideId,
      amount: new Prisma.Decimal(10.0),
      currency: 'CAD',
      provider: 'stripe',
      providerRef: 'pi_test_tip_123',
      status: 'succeeded',
      metaJson: { type: 'TIP', driverId: driverProfileId, tipAmount: 10.0 },
    };
    mockPrisma.payment.upsert.mockResolvedValue(mockPayment);
    mockPrisma.payment.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === 'pay_tip_123') {
        return Promise.resolve({
          ...mockPayment,
          ride: mockRide,
        });
      }
      return Promise.resolve(null);
    });

    const result = await service.addTipToRide(passengerUserId, rideId, {
      amount: 10.0,
      paymentMethod: 'CARD',
    });

    expect(result.success).toBe(true);
    expect(result.tipAmount).toBe(10.0);
    expect(result.clientSecret).toBe('pi_test_tip_123_secret_xyz');
    expect(mockPayments.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10.0,
        currency: 'CAD',
        rideId,
        metadata: expect.objectContaining({
          type: 'TIP',
          driverId: driverProfileId,
        }),
      }),
    );

    // Verifies ride.priceSnapshot was updated with tip
    expect(mockPrisma.ride.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: rideId },
        data: expect.objectContaining({
          priceSnapshot: expect.objectContaining({
            tip: 10.0,
            tipAmount: 10.0,
            passengerTotal: 95.0,
            driverEarning: 78.0,
          }),
        }),
      }),
    );

    // Verifies RideFinancial was updated with tip
    expect(mockPrisma.rideFinancial.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { rideId },
        update: expect.objectContaining({
          tipAmount: new Prisma.Decimal(10.0),
        }),
      }),
    );

    // Verifies driver wallet was credited
    expect(mockPrisma.driverWalletEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverId: driverProfileId,
          type: WalletEntryType.ADJUSTMENT,
          direction: WalletDirection.CREDIT,
          amount: new Prisma.Decimal(10.0),
          status: WalletEntryStatus.POSTED,
          description: expect.stringContaining('Tip from passenger'),
        }),
      }),
    );

    // Verifies Stripe Connect direct transfer was triggered
    expect(mockStripeConnect.transferToDriver).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10.0,
        currency: 'CAD',
        destinationAccountId: 'acct_driver_123',
      }),
    );

    // Verifies driver push notification was dispatched
    expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: driverUserId,
        title: 'You received a tip!',
        data: expect.objectContaining({
          type: 'TIP',
          tipAmount: '10',
        }),
      }),
    );

    // Verifies websocket broadcast
    expect(mockTracking.broadcastToRide).toHaveBeenCalledWith(
      rideId,
      'ride.tip',
      expect.objectContaining({
        rideId,
        tipAmount: 10.0,
      }),
    );
  });

  it('returns existing payment if idempotency key was already succeeded', async () => {
    const priorPayment = {
      id: 'prior_pay_123',
      amount: new Prisma.Decimal(15.0),
      status: 'succeeded',
      provider: 'stripe',
      providerRef: 'pi_prior',
    };
    const rideData = {
      id: rideId,
      passengerId: passengerProfileId,
      passenger: { id: passengerProfileId, fullName: 'John Doe', userId: passengerUserId },
      status: RideStatus.COMPLETED,
      assignedDriverId: driverProfileId,
      offers: [],
      events: [],
      payments: [priorPayment],
      supportCases: [],
    };
    mockPrisma.ride.findFirst.mockResolvedValue(rideData);
    mockPrisma.ride.findUnique.mockResolvedValue(rideData);
    mockPrisma.payment.findUnique.mockResolvedValue(priorPayment);

    const result = await service.addTipToRide(passengerUserId, rideId, {
      amount: 15.0,
      idempotencyKey: 'idem_tip_abc',
    });

    expect(result.tipAmount).toBe(15.0);
    expect(mockPayments.createIntent).not.toHaveBeenCalled();
  });
});
