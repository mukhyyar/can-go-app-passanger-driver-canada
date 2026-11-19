jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    signAsync = jest.fn();
    verifyAsync = jest.fn();
  },
}));

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DriverApprovalStatus, UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

describe('Separate Email Registration & Cross-App Validation (Driver vs Passenger)', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockPasswords: any;
  let mockTokens: any;
  let mockOAuthVerify: any;
  let mockOtp: any;

  beforeEach(() => {
    mockPrisma = {
      isReady: jest.fn().mockResolvedValue(true),
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      oAuthAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      passengerProfile: {
        create: jest.fn(),
      },
      driverProfile: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    mockPasswords = {
      hash: jest.fn().mockResolvedValue('hashed_pw'),
      verify: jest.fn().mockResolvedValue(true),
    };
    mockTokens = {
      issueSession: jest.fn().mockResolvedValue({
        accessToken: 'acc_tok',
        refreshToken: 'ref_tok',
        tokenType: 'Bearer',
        expiresIn: '15m',
        sessionId: 'sid_1',
      }),
    };
    mockOAuthVerify = {
      verifyGoogleIdToken: jest.fn(),
      verifyAppleIdToken: jest.fn(),
      mockIdentity: jest.fn(
        (provider: string, email: string, fullName?: string) => ({
          provider,
          subject: `sub_${email}`,
          email,
          fullName,
        }),
      ),
    };
    mockOtp = {
      issue: jest.fn().mockResolvedValue({
        challengeId: 'chal_1',
        expiresAt: new Date(Date.now() + 300_000),
      }),
    };

    service = new AuthService(
      mockPrisma,
      mockPasswords,
      mockTokens,
      { get: jest.fn() } as any,
      { signAsync: jest.fn(), verifyAsync: jest.fn() } as any,
      mockOAuthVerify,
      {} as any,
      mockOtp,
    );
  });

  it('rejects Passenger App registration when email is already registered in the Driver App', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: 'drv-user-1',
      email: 'driver@can-rides.ca',
      phoneE164: '+14165550101',
      role: UserRole.DRIVER,
      passengerProfile: null,
      driverProfile: {
        id: 'drv-prof-1',
        fullName: 'Driver One',
        approvalStatus: DriverApprovalStatus.PENDING_KYC,
        isActivated: false,
      },
    });

    await expect(
      service.register({
        email: 'Driver@can-rides.ca',
        password: 'Password123!',
        phoneE164: '+14165550999',
        role: UserRole.PASSENGER,
        fullName: 'Passenger Attempt',
      }),
    ).rejects.toThrow(
      new ConflictException(
        'This email address is already registered with a Driver account and cannot be used in the Passenger App. Please use a different email address.',
      ),
    );
    expect(mockPrisma.passengerProfile.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects Driver App registration when email is already registered in the Passenger App', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: 'pax-user-1',
      email: 'passenger@can-rides.ca',
      phoneE164: '+14165550202',
      role: UserRole.PASSENGER,
      passengerProfile: {
        id: 'pax-prof-1',
        fullName: 'Passenger One',
      },
      driverProfile: null,
    });

    await expect(
      service.register({
        email: 'PASSENGER@can-rides.ca',
        password: 'Password123!',
        phoneE164: '+14165550888',
        role: UserRole.DRIVER,
        fullName: 'Driver Attempt',
      }),
    ).rejects.toThrow(
      new ConflictException(
        'This email address is already registered with a Passenger account and cannot be used in the Driver App. Please use a different email address.',
      ),
    );
    expect(mockPrisma.driverProfile.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects Google OAuth in the Passenger App when email is already registered in the Driver App', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: 'drv-user-1',
      email: 'driver@can-rides.ca',
      role: UserRole.DRIVER,
      passengerProfile: null,
      driverProfile: { id: 'drv-prof-1', fullName: 'Driver One' },
    });

    await expect(
      service.oauthGoogle({
        email: 'driver@can-rides.ca',
        fullName: 'Driver One',
        role: UserRole.PASSENGER,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'This email address is already registered with a Driver account and cannot be used in the Passenger App. Please use a different email address.',
      ),
    );
    expect(mockPrisma.oAuthAccount.create).not.toHaveBeenCalled();
    expect(mockPrisma.passengerProfile.create).not.toHaveBeenCalled();
  });

  it('rejects Google OAuth in the Driver App when email is already registered in the Passenger App', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: 'pax-user-1',
      email: 'passenger@can-rides.ca',
      role: UserRole.PASSENGER,
      passengerProfile: { id: 'pax-prof-1', fullName: 'Passenger One' },
      driverProfile: null,
    });

    await expect(
      service.oauthGoogle({
        email: 'passenger@can-rides.ca',
        fullName: 'Passenger One',
        role: UserRole.DRIVER,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'This email address is already registered with a Passenger account and cannot be used in the Driver App. Please use a different email address.',
      ),
    );
    expect(mockPrisma.oAuthAccount.create).not.toHaveBeenCalled();
    expect(mockPrisma.driverProfile.create).not.toHaveBeenCalled();
  });

  it('rejects email login when using a Driver email in the Passenger App and vice versa', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: 'drv-user-1',
      email: 'driver@can-rides.ca',
      passwordHash: 'hashed_pw',
      phoneVerifiedAt: new Date(),
      isSuspended: false,
      role: UserRole.DRIVER,
      passengerProfile: null,
      driverProfile: { id: 'drv-prof-1', fullName: 'Driver One' },
    });

    await expect(
      service.login({
        email: 'driver@can-rides.ca',
        password: 'Password123!',
        role: UserRole.PASSENGER,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'This email address is already registered with a Driver account and cannot be used in the Passenger App. Please use a different email address.',
      ),
    );

    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: 'pax-user-1',
      email: 'passenger@can-rides.ca',
      passwordHash: 'hashed_pw',
      phoneVerifiedAt: new Date(),
      isSuspended: false,
      role: UserRole.PASSENGER,
      passengerProfile: { id: 'pax-prof-1', fullName: 'Passenger One' },
      driverProfile: null,
    });

    await expect(
      service.login({
        email: 'passenger@can-rides.ca',
        password: 'Password123!',
        role: UserRole.DRIVER,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'This email address is already registered with a Passenger account and cannot be used in the Driver App. Please use a different email address.',
      ),
    );
  });

  it('rejects ADMIN user from signing into mobile apps', () => {
    expect(() => {
      service.assertMobileAppRole(UserRole.ADMIN, UserRole.PASSENGER);
    }).toThrow(ForbiddenException);
    expect(() => {
      service.assertMobileAppRole(UserRole.SUPER_ADMIN, UserRole.DRIVER);
    }).toThrow(ForbiddenException);
  });
});
