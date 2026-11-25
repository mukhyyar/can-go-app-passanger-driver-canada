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
import { UserRole, DriverApprovalStatus } from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('AdminOpsService - createUser', () => {
  let service: AdminOpsService;
  let prisma: any;
  let mockPasswords: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPasswords = {
      hash: jest.fn().mockResolvedValue('hashed-secret-pw'),
      verify: jest.fn().mockResolvedValue(true),
    };

    const mockConfig = { get: jest.fn() } as any;
    const mockNotifications = {} as any;
    const mockLaunchGate = {} as any;
    const mockFirebase = {} as any;
    const mockTokens = {} as any;
    const mockStorage = { isReady: () => false } as any;
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

  it('creates a passenger successfully with provided password', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'usr-p-1',
      email: 'jane@example.com',
      phoneE164: '+14035550199',
      role: UserRole.PASSENGER,
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      passengerProfile: { id: 'prof-p-1', fullName: 'Jane Doe', isVip: true },
    });

    const res = await service.createUser('admin-1', {
      role: UserRole.PASSENGER,
      fullName: 'Jane Doe',
      phoneE164: '+14035550199',
      email: 'jane@example.com',
      password: 'SecurePassword123!',
      phoneVerified: true,
      isVip: true,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPasswords.hash).toHaveBeenCalledWith('SecurePassword123!');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'jane@example.com',
          phoneE164: '+14035550199',
          role: UserRole.PASSENGER,
          passengerProfile: {
            create: {
              fullName: 'Jane Doe',
              isVip: true,
            },
          },
        }),
      }),
    );
    expect(res.id).toBe('usr-p-1');
    expect(res.temporaryPassword).toBe('SecurePassword123!');
    expect(res.phoneVerified).toBe(true);
  });

  it('creates a driver successfully with auto-generated password and vehicle', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'usr-d-1',
      email: 'driver@example.com',
      phoneE164: '+14035550200',
      role: UserRole.DRIVER,
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      driverProfile: {
        id: 'prof-d-1',
        fullName: 'John Driver',
        approvalStatus: DriverApprovalStatus.APPROVED,
        isActivated: true,
        baseLocation: 'Calgary, AB',
        vehicles: [
          {
            id: 'veh-1',
            plate: 'CALGARY1',
            make: 'Toyota',
            model: 'Camry',
            year: 2022,
          },
        ],
      },
    });

    const res = await service.createUser('admin-1', {
      role: UserRole.DRIVER,
      fullName: 'John Driver',
      phoneE164: '+14035550200',
      email: 'driver@example.com',
      baseLocation: 'Calgary, AB',
      approvalStatus: DriverApprovalStatus.APPROVED,
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2022,
      vehicleColor: 'Black',
      vehiclePlate: 'CALGARY1',
      vehicleClass: 'sedan',
    });

    expect(mockPasswords.hash).toHaveBeenCalled();
    expect(res.temporaryPassword).toMatch(/^CR-[a-f0-9]{12}$/);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: UserRole.DRIVER,
          driverProfile: expect.objectContaining({
            create: expect.objectContaining({
              fullName: 'John Driver',
              approvalStatus: DriverApprovalStatus.APPROVED,
              isActivated: true,
              baseLocation: 'Calgary, AB',
              vehicles: expect.objectContaining({
                create: expect.objectContaining({
                  plate: 'CALGARY1',
                  make: 'Toyota',
                  model: 'Camry',
                  vehicleClass: 'sedan',
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('rejects invalid phone format', async () => {
    await expect(
      service.createUser('admin-1', {
        role: UserRole.PASSENGER,
        fullName: 'Invalid Phone',
        phoneE164: '4035550199',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate email registered to driver when creating passenger', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'existing-driver',
      role: UserRole.DRIVER,
      driverProfile: { id: 'dp-1' },
    });

    await expect(
      service.createUser('admin-1', {
        role: UserRole.PASSENGER,
        fullName: 'Jane Doe',
        phoneE164: '+14035550199',
        email: 'driver@example.com',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects duplicate phone number', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'existing-phone-user',
        role: UserRole.PASSENGER,
        passengerProfile: { id: 'pp-1' },
      });

    await expect(
      service.createUser('admin-1', {
        role: UserRole.PASSENGER,
        fullName: 'Jane Doe',
        phoneE164: '+14035550199',
        email: 'jane2@example.com',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

