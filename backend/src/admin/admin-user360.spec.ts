jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
  })),
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: jest.fn().mockImplementation(() => ({
    sign: jest.fn(),
    verify: jest.fn(),
  })),
}));

import { AdminOpsService } from './admin.service';
import { RideStatus, UserRole } from '@prisma/client';

describe('AdminOpsService - user360 & listRides enhancements', () => {
  let service: AdminOpsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      ride: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      refund: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      rating: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      supportCase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userInternalNote: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userTagAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      driverWalletEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockConfig = { get: jest.fn() } as any;
    const mockNotifications = {} as any;
    const mockLaunchGate = {} as any;
    const mockFirebase = {} as any;
    const mockPasswords = {} as any;
    const mockTokens = {} as any;
    const mockStorage = { isReady: jest.fn().mockReturnValue(false) } as any;
    const mockPayments = {} as any;
    const mockSms = {} as any;

    service = new AdminOpsService(
      prisma,
      mockConfig,
      mockNotifications,
      mockLaunchGate,
      mockFirebase,
      mockPasswords,
      mockTokens,
      mockStorage,
      mockPayments,
      mockSms,
    );
  });

  describe('user360 ride query', () => {
    it('queries driver rides including assigned, original, selectedOffer, and offers', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-drv-1',
        createdAt: new Date(),
        role: UserRole.DRIVER,
        driverProfile: {
          id: 'drv-prof-1',
          documents: [],
        },
        passengerProfile: null,
        sessions: [],
        riskFlags: [],
        watchlistEntries: [],
      });

      await service.user360('user-drv-1');

      expect(prisma.ride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { assignedDriverId: 'drv-prof-1' },
              { originalDriverId: 'drv-prof-1' },
              { selectedOffer: { driverId: 'drv-prof-1' } },
              { offers: { some: { driverId: 'drv-prof-1' } } },
            ],
          },
        }),
      );
    });

    it('queries passenger rides when user is passenger', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-pax-1',
        createdAt: new Date(),
        role: UserRole.PASSENGER,
        driverProfile: null,
        passengerProfile: {
          id: 'pax-prof-1',
        },
        sessions: [],
        riskFlags: [],
        watchlistEntries: [],
      });

      await service.user360('user-pax-1');

      expect(prisma.ride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { passengerId: 'pax-prof-1' },
        }),
      );
    });

    it('queries both passenger and driver criteria when user is dual role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-dual-1',
        createdAt: new Date(),
        role: UserRole.DRIVER,
        driverProfile: {
          id: 'drv-prof-1',
          documents: [],
        },
        passengerProfile: {
          id: 'pax-prof-1',
        },
        sessions: [],
        riskFlags: [],
        watchlistEntries: [],
      });

      await service.user360('user-dual-1');

      expect(prisma.ride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { passengerId: 'pax-prof-1' },
              { assignedDriverId: 'drv-prof-1' },
              { originalDriverId: 'drv-prof-1' },
              { selectedOffer: { driverId: 'drv-prof-1' } },
              { offers: { some: { driverId: 'drv-prof-1' } } },
            ],
          },
        }),
      );
    });
  });

  describe('listRides search by user ID / actor query', () => {
    it('searches by passenger user ID, driver user ID, and offers when q is provided', async () => {
      await service.listRides({ q: 'user-12345' });

      expect(prisma.ride.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { id: { contains: 'user-12345', mode: 'insensitive' } },
              { passenger: { userId: 'user-12345' } },
              { assignedDriverId: 'user-12345' },
              { originalDriverId: 'user-12345' },
              { originalDriver: { userId: 'user-12345' } },
              { selectedOffer: { driver: { userId: 'user-12345' } } },
              { offers: { some: { driver: { userId: 'user-12345' } } } },
            ]),
          }),
        }),
      );
    });
  });
});
