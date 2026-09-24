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

describe('DriversService payment details', () => {
  const baseDriver = {
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
    payoutSettingsJson: {} as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function makeService(profile: typeof baseDriver) {
    const profiles: Record<string, typeof baseDriver> = {
      [profile.userId]: profile,
    };
    const prisma: any = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => {
          const p = profiles[where.id];
          if (!p) return null;
          return {
            id: where.id,
            role: UserRole.DRIVER,
            isSuspended: false,
            email: `${where.id}@test.com`,
            phoneE164: '+10000000000',
            driverProfile: p,
          };
        }),
      },
      driverProfile: {
        update: jest.fn(async ({ where, data }: any) => {
          const current = Object.values(profiles).find((p) => p.id === where.id);
          if (current && data.payoutSettingsJson) {
            current.payoutSettingsJson = data.payoutSettingsJson;
          }
          return { ...current, ...data };
        }),
      },
      fareRule: {
        findFirst: jest.fn(async () => ({ platformCommissionPct: 15 })),
      },
      operatingZone: { count: jest.fn(async () => 0) },
      vehicle: { count: jest.fn(async () => 0) },
      driverDocument: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      auditLog: {
        create: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const service = new DriversService(prisma, {} as any, {} as any, {} as any);
    return { service, prisma, profiles };
  }

  it('getPaymentDetails returns reviewNote/reviewedAt null-safe', async () => {
    const { service } = makeService({
      ...baseDriver,
      payoutSettingsJson: {
        billingPeriod: '3 days',
        outpaymentCurrency: 'CAD',
        bankCountry: 'Canada',
        status: 'VERIFIED',
      },
    });
    const details = await service.getPaymentDetails('user-a');
    expect(details.reviewNote).toBeNull();
    expect(details.reviewedAt).toBeNull();
    expect(details.paymentPeriod).toBeTruthy();
    expect(details.commissionPct).toBe(15);
  });

  it('getPaymentDetails returns review fields when rejected', async () => {
    const { service } = makeService({
      ...baseDriver,
      payoutSettingsJson: {
        status: 'REJECTED',
        reviewNote: 'Name mismatch',
        reviewedAt: '2026-03-01T10:00:00.000Z',
        accountHolderName: 'Wrong',
        accountMask: '****9999',
      },
    });
    const details = await service.getPaymentDetails('user-a');
    expect(details.status).toBe('REJECTED');
    expect(details.reviewNote).toBe('Name mismatch');
    expect(details.reviewedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('REJECTED resubmission moves status to PENDING and preserves audit', async () => {
    const { service, prisma } = makeService({
      ...baseDriver,
      payoutSettingsJson: {
        status: 'REJECTED',
        reviewNote: 'Fix mask',
        reviewedAt: '2026-03-01T10:00:00.000Z',
        accountHolderName: 'Old',
        accountMask: '****1111',
        billingPeriod: '3 days',
        outpaymentCurrency: 'CAD',
        bankCountry: 'Canada',
        payoutMethod: 'bank_transfer',
      },
    });
    const updated = await service.updatePaymentDetails('user-a', {
      accountHolderName: 'Correct Name',
      accountMask: '2222',
      billingPeriod: '3 days',
      outpaymentCurrency: 'CAD',
      bankCountry: 'Canada',
      payoutMethod: 'bank_transfer',
    });
    expect(updated.status).toBe('PENDING');
    expect(updated.accountMask).toBe('****2222');
    expect(updated.accountHolderName).toBe('Correct Name');
    // Historical review note may remain in JSON; status is authoritative.
    expect(prisma.auditLog.create).toHaveBeenCalled();
    const auditMeta = prisma.auditLog.create.mock.calls[0][0].data.meta;
    expect(auditMeta.previousStatus).toBe('REJECTED');
    expect(auditMeta.nextStatus).toBe('PENDING');
    expect(JSON.stringify(auditMeta)).not.toContain('2222');
  });

  it('rejects full account numbers on PATCH', async () => {
    const { service } = makeService({ ...baseDriver });
    await expect(
      service.updatePaymentDetails('user-a', {
        accountMask: '123456789012',
        accountHolderName: 'Jane Doe',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UpdatePaymentDetailsDto path cannot set status via service API', async () => {
    const { service } = makeService({
      ...baseDriver,
      payoutSettingsJson: { status: 'NOT_CONFIGURED' },
    });
    // Even if a client smuggled status on a plain object, only DTO fields apply.
    const result = await service.updatePaymentDetails('user-a', {
      accountHolderName: 'Jane Doe',
      accountMask: '4444',
      billingPeriod: '3 days',
      outpaymentCurrency: 'CAD',
      bankCountry: 'Canada',
      payoutMethod: 'bank_transfer',
      // @ts-expect-error intentional smuggle attempt
      status: 'VERIFIED',
      // @ts-expect-error intentional smuggle attempt
      reviewNote: 'hack',
    } as any);
    expect(result.status).toBe('PENDING');
    expect(result.status).not.toBe('VERIFIED');
  });

  it('rejects non-driver access to payment details', async () => {
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
    await expect(service.getPaymentDetails('user-x')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
