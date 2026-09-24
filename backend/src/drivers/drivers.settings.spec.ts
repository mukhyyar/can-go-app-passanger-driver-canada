jest.mock('../storage/storage.service', () => ({
  StorageService: class StorageService {},
}));
jest.mock('./kyc-ops.service', () => ({
  KycOpsService: class KycOpsService {},
}));
jest.mock('./kyc-documents.service', () => ({
  KycDocumentsService: class KycDocumentsService {},
}));
jest.mock('../providers/stripe/stripe-connect.service', () => ({
  StripeConnectService: class StripeConnectService {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DriverApprovalStatus, UserRole } from '@prisma/client';
import { DriversService } from './drivers.service';

describe('DriversService settings ownership', () => {
  const driverA = {
    id: 'drv-a',
    userId: 'user-a',
    fullName: 'Driver A',
    legalName: '',
    isIndividual: true,
    approvalStatus: DriverApprovalStatus.PENDING_KYC,
    isActivated: false,
    baseLocation: 'Toronto',
    baseLatitude: 43.7,
    baseLongitude: -79.4,
    referredByCode: null as string | null,
    addressLine1: '1 King St',
    addressLine2: '',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M5V',
    country: 'CA',
    languagesJson: ['EN'],
    registrationNumber: '',
    taxpayerId: 'TAX-A',
    payoutSettingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const driverB = {
    ...driverA,
    id: 'drv-b',
    userId: 'user-b',
    fullName: 'Driver B',
    taxpayerId: 'TAX-B',
  };

  function makeService(opts: {
    profileByUserId: Record<string, typeof driverA>;
    vehicles?: Array<{ id: string; driverId: string; plate: string }>;
    zones?: Array<{ id: string; driverId: string }>;
  }) {
    const prisma: any = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => {
          const profile = opts.profileByUserId[where.id];
          if (!profile) return null;
          return {
            id: where.id,
            role: UserRole.DRIVER,
            isSuspended: false,
            email: `${where.id}@test.com`,
            phoneE164: '+10000000000',
            driverProfile: profile,
          };
        }),
      },
      driverProfile: {
        update: jest.fn(async ({ where, data }: any) => {
          const current = Object.values(opts.profileByUserId).find(
            (p) => p.id === where.id,
          );
          return { ...current, ...data };
        }),
      },
      operatingZone: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async ({ where }: any) =>
          (opts.zones ?? []).filter((z) => z.driverId === where.driverId),
        ),
        findFirst: jest.fn(async ({ where }: any) =>
          (opts.zones ?? []).find(
            (z) => z.id === where.id && z.driverId === where.driverId,
          ),
        ),
        delete: jest.fn(async () => ({})),
      },
      vehicle: {
        count: jest.fn(async () => (opts.vehicles ?? []).length),
        findMany: jest.fn(async ({ where }: any) =>
          (opts.vehicles ?? [])
            .filter((v) => v.driverId === where.driverId)
            .map((v) => ({
              ...v,
              name: 'Car',
              vehicleClass: 'sedan',
              color: '',
              year: null,
              passengerSeats: 4,
              luggagePlaces: 2,
              amenitiesJson: {},
              autocancelBefore: 10,
              autocancelAfter: 10,
              isActive: true,
              isDefault: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
        ),
        findFirst: jest.fn(async ({ where }: any) => {
          const list = opts.vehicles ?? [];
          return (
            list.find((v) => {
              if (where.id && v.id !== where.id) return false;
              if (where.driverId && v.driverId !== where.driverId) return false;
              if (where.plate && v.plate !== where.plate) return false;
              if (where.NOT?.id && v.id === where.NOT.id) return false;
              return true;
            }) ?? null
          );
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(async () => ({})),
      },
      driverDocument: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      auditLog: {
        create: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    return new DriversService(prisma, {} as any, {} as any, {} as any);
  }

  it('returns only the authenticated driver profile', async () => {
    const service = makeService({
      profileByUserId: { 'user-a': driverA, 'user-b': driverB },
    });
    const me = await service.getMyProfile('user-a');
    expect(me.id).toBe('drv-a');
    expect(me.fullName).toBe('Driver A');
    expect(me.taxpayerId).toBe('TAX-A');
  });

  it('lists only owned vehicles', async () => {
    const service = makeService({
      profileByUserId: { 'user-a': driverA, 'user-b': driverB },
      vehicles: [
        { id: 'v1', driverId: 'drv-a', plate: 'AAA111' },
        { id: 'v2', driverId: 'drv-b', plate: 'BBB222' },
      ],
    });
    const list = await service.listVehicles('user-a');
    expect(list).toHaveLength(1);
    expect(list[0].plate).toBe('AAA111');
  });

  it('rejects delete of another driver vehicle', async () => {
    const service = makeService({
      profileByUserId: { 'user-a': driverA },
      vehicles: [{ id: 'v2', driverId: 'drv-b', plate: 'BBB222' }],
    });
    await expect(service.deleteVehicle('user-a', 'v2')).rejects.toThrow();
  });

  it('rejects delete of another driver zone', async () => {
    const service = makeService({
      profileByUserId: { 'user-a': driverA },
      zones: [{ id: 'z-b', driverId: 'drv-b' }],
    });
    await expect(service.deleteZone('user-a', 'z-b')).rejects.toThrow();
  });

  it('rejects referral mutation after set', async () => {
    const service = makeService({
      profileByUserId: {
        'user-a': { ...driverA, referredByCode: 'OLDCODE' },
      },
    });
    await expect(
      service.updateMyProfile('user-a', { referralCode: 'NEWCODE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-driver access', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-x',
          role: UserRole.PASSENGER,
          isSuspended: false,
          driverProfile: null,
        })),
      },
    };
    const service = new DriversService(prisma, {} as any, {} as any, {} as any);
    await expect(service.getMyProfile('user-x')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
