jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));

import { DriverWalletService } from './driver-wallet.service';
import { RideStatus, WalletDirection, WalletEntryStatus, WalletEntryType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('DriverWalletService - creditEarningForCompletedRide', () => {
  let service: DriverWalletService;
  let mockPrisma: any;
  let mockConfig: any;
  let mockNotifications: any;
  let mockPayoutProvider: any;
  let mockEmailEvents: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn(async (callback) => callback(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ now: new Date('2026-10-28T12:00:00.000Z') }]),
      ride: {
        findUnique: jest.fn(),
      },
      driverWalletEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'wallet.currency') return 'CAD';
        if (key === 'wallet.holdDays') return 2;
        return null;
      }),
    };

    mockNotifications = {
      sendToUser: jest.fn(),
    };

    mockPayoutProvider = {
      name: 'dev',
      ensureBeneficiary: jest.fn(),
      createPayout: jest.fn(),
    };

    mockEmailEvents = {
      sendWalletPayoutRequested: jest.fn(),
    };

    service = new DriverWalletService(
      mockPrisma,
      mockConfig,
      mockNotifications,
      mockPayoutProvider,
      mockEmailEvents,
    );
  });

  it('credits net driverEarning (CAD 160.00) instead of gross bidAmount (CAD 200.00)', async () => {
    mockPrisma.ride.findUnique.mockResolvedValue({
      id: 'ride-100',
      status: RideStatus.COMPLETED,
      assignedDriverId: 'driver-1',
      currency: 'CAD',
      fromLabel: 'Vancouver',
      toLabel: 'Richmond',
      priceSnapshot: {
        bidAmount: 200,
        subtotal: 200,
        platformFee: 40,
        driverEarning: 160,
        passengerTotal: 226,
      },
    });

    mockPrisma.driverWalletEntry.findFirst.mockResolvedValue(null);
    mockPrisma.driverWalletEntry.create.mockImplementation(({ data }: any) => ({
      id: 'entry-1',
      ...data,
    }));

    const result = await service.creditEarningForCompletedRide('ride-100');

    expect(result.created).toBe(true);
    expect(mockPrisma.driverWalletEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        driverId: 'driver-1',
        rideId: 'ride-100',
        type: WalletEntryType.EARNING,
        direction: WalletDirection.CREDIT,
        amount: new Decimal('160.00'),
        currency: 'CAD',
        status: WalletEntryStatus.PENDING,
      }),
    });
  });

  it('deducts tip from driverEarning when priceSnapshot has tip to avoid double-crediting tip adjustment', async () => {
    mockPrisma.ride.findUnique.mockResolvedValue({
      id: 'ride-tip-100',
      status: RideStatus.COMPLETED,
      assignedDriverId: 'driver-1',
      currency: 'CAD',
      fromLabel: 'Airport',
      toLabel: 'Downtown',
      priceSnapshot: {
        bidAmount: 100,
        subtotal: 100,
        platformFee: 20,
        driverEarning: 95, // 80 base + 15 tip
        tipAmount: 15,
        tip: 15,
        passengerTotal: 128,
      },
    });

    mockPrisma.driverWalletEntry.findFirst.mockResolvedValue(null);
    mockPrisma.driverWalletEntry.create.mockImplementation(({ data }: any) => ({
      id: 'entry-tip-1',
      ...data,
    }));

    const result = await service.creditEarningForCompletedRide('ride-tip-100');

    expect(result.created).toBe(true);
    // Base trip earning should be 80.00 (95 - 15)
    expect(mockPrisma.driverWalletEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Decimal('80.00'),
      }),
    });
  });

  it('falls back to 20% platform fee deduction when driverEarning is missing from snapshot', async () => {
    mockPrisma.ride.findUnique.mockResolvedValue({
      id: 'ride-legacy-100',
      status: RideStatus.COMPLETED,
      assignedDriverId: 'driver-1',
      currency: 'CAD',
      fromLabel: 'Burnaby',
      toLabel: 'Surrey',
      priceSnapshot: {
        bidAmount: 50,
        platformFee: 10,
        // driverEarning omitted
      },
    });

    mockPrisma.driverWalletEntry.findFirst.mockResolvedValue(null);
    mockPrisma.driverWalletEntry.create.mockImplementation(({ data }: any) => ({
      id: 'entry-legacy-1',
      ...data,
    }));

    const result = await service.creditEarningForCompletedRide('ride-legacy-100');

    expect(result.created).toBe(true);
    expect(mockPrisma.driverWalletEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Decimal('40.00'), // 50 - 10
      }),
    });
  });

  it('skips crediting when ride is not completed', async () => {
    mockPrisma.ride.findUnique.mockResolvedValue({
      id: 'ride-inprogress',
      status: RideStatus.IN_PROGRESS,
      assignedDriverId: 'driver-1',
      currency: 'CAD',
    });

    const result = await service.creditEarningForCompletedRide('ride-inprogress');
    expect(result.created).toBe(false);
    expect(result.skippedReason).toBe('not_completed');
    expect(mockPrisma.driverWalletEntry.create).not.toHaveBeenCalled();
  });

  it('is idempotent when ride earning is already credited', async () => {
    mockPrisma.ride.findUnique.mockResolvedValue({
      id: 'ride-dup',
      status: RideStatus.COMPLETED,
      assignedDriverId: 'driver-1',
      currency: 'CAD',
      priceSnapshot: {
        driverEarning: 80,
      },
    });

    mockPrisma.driverWalletEntry.findFirst.mockResolvedValue({
      id: 'existing-entry-1',
    });

    const result = await service.creditEarningForCompletedRide('ride-dup');
    expect(result.created).toBe(false);
    expect(result.skippedReason).toBe('already_credited');
    expect(mockPrisma.driverWalletEntry.create).not.toHaveBeenCalled();
  });
});
