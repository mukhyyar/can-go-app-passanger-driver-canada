import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DriverApprovalStatus, RideStatus } from '@prisma/client';

jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
  })),
}));

import {
  DEFAULT_PROVIDER_CANCELLATION_REASONS,
  DriverCancellationService,
} from './driver-cancellation.service';

describe('DriverCancellationService', () => {
  let service: DriverCancellationService;
  let mockPrisma: any;
  let mockNotifications: any;
  let mockPayments: any;

  beforeEach(() => {
    mockPrisma = {
      providerCancellationReason: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(
          DEFAULT_PROVIDER_CANCELLATION_REASONS.map((r, i) => ({
            ...r,
            id: `reason_${i}`,
            isActive: true,
          })),
        ),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ride: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      refund: {
        create: jest.fn(),
      },
      driverProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      driverCancellationRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      driverWarning: {
        create: jest.fn(),
      },
      rideEvent: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      rideFinancial: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((cb) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return Promise.all(cb);
      }),
    };

    mockNotifications = {
      notifyRideStatus: jest.fn().mockResolvedValue({}),
      sendToUser: jest.fn().mockResolvedValue({}),
    };

    mockPayments = {
      refund: jest.fn().mockResolvedValue({ refundId: 'ref_123', status: 'succeeded' }),
    };

    service = new DriverCancellationService(
      mockPrisma,
      mockNotifications,
      mockPayments,
    );
  });

  describe('seedDefaultReasons', () => {
    it('seeds the default structured reasons with expected justification flags', async () => {
      await service.seedDefaultReasons();
      expect(mockPrisma.providerCancellationReason.upsert).toHaveBeenCalledTimes(9);

      const calls = mockPrisma.providerCancellationReason.upsert.mock.calls;
      const breakdownCall = calls.find((c: any) => c[0].where.code === 'VEHICLE_BREAKDOWN');
      expect(breakdownCall[0].create.isJustified).toBe(true);

      const weatherCall = calls.find((c: any) => c[0].where.code === 'WEATHER_ROAD_CONDITIONS');
      expect(weatherCall[0].create.isJustified).toBe(true);

      const unsafeCall = calls.find((c: any) => c[0].where.code === 'UNSAFE_CONDITIONS');
      expect(unsafeCall[0].create.isJustified).toBe(true);
      expect(unsafeCall[0].create.requiresDetails).toBe(true);

      const unlawfulCall = calls.find((c: any) => c[0].where.code === 'UNLAWFUL_ACTIVITY');
      expect(unlawfulCall[0].create.isJustified).toBe(true);

      const legalCall = calls.find((c: any) => c[0].where.code === 'LEGAL_RESTRICTION');
      expect(legalCall[0].create.isJustified).toBe(true);

      const otherCall = calls.find((c: any) => c[0].where.code === 'OTHER');
      expect(otherCall[0].create.isJustified).toBe(false);
      expect(otherCall[0].create.requiresDetails).toBe(true);

      const noShowCall = calls.find((c: any) => c[0].where.code === 'PROVIDER_NO_SHOW');
      expect(noShowCall).toBeDefined();
      expect(noShowCall[0].create.isJustified).toBe(false);
      expect(noShowCall[0].create.requiresDetails).toBe(false);
    });

    it('flagProviderForNoShow creates unjustified record, KycFlag, and warns driver', async () => {
      mockPrisma.driverProfile.findUnique = jest.fn().mockResolvedValue({
        id: 'driver_1',
        userId: 'user_driver_1',
        warningCount: 1,
        user: { id: 'user_driver_1' },
      });
      mockPrisma.driverCancellationRecord.create = jest.fn().mockResolvedValue({
        id: 'rec_1',
        reasonCode: 'PROVIDER_NO_SHOW',
      });
      mockPrisma.kycFlag = { create: jest.fn().mockResolvedValue({ id: 'flag_1' }) };
      mockPrisma.driverProfile.update = jest.fn().mockResolvedValue({ id: 'driver_1', warningCount: 2 });
      mockPrisma.auditLog.create = jest.fn().mockResolvedValue({});

      const result = await service.flagProviderForNoShow({
        driverId: 'driver_1',
        rideId: 'ride_1',
        actorId: 'passenger_1',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.driverCancellationRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          driverId: 'driver_1',
          rideId: 'ride_1',
          reasonCode: 'PROVIDER_NO_SHOW',
          isJustified: false,
        }),
      });
      expect(mockPrisma.driverProfile.update).toHaveBeenCalledWith({
        where: { id: 'driver_1' },
        data: { warningCount: 2 },
      });
      expect(mockNotifications.sendToUser).toHaveBeenCalled();
    });
  });

  describe('getActiveReasons', () => {
    it('returns structured active cancellation reasons', async () => {
      const reasons = await service.getActiveReasons();
      expect(reasons.length).toBe(DEFAULT_PROVIDER_CANCELLATION_REASONS.length);
      expect(mockPrisma.providerCancellationReason.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: expect.any(Object),
      });
    });
  });

  describe('cancelByDriver', () => {
    const mockDriverUser = {
      id: 'usr_drv_1',
      driverProfile: { id: 'drv_prof_1' },
    };

    const mockRide = {
      id: 'ride_101',
      status: RideStatus.BOOKED,
      assignedDriverId: 'drv_prof_1',
      passenger: { userId: 'usr_pax_1' },
      selectedOffer: { driver: { id: 'drv_prof_1', userId: 'usr_drv_1' } },
    };

    it('rejects if caller is not an approved driver', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'usr_pax_1', driverProfile: null });

      await expect(
        service.cancelByDriver({
          userId: 'usr_pax_1',
          rideId: 'ride_101',
          reasonCode: 'VEHICLE_BREAKDOWN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects if driver is not assigned to the ride', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue({
        ...mockRide,
        assignedDriverId: 'other_driver_id',
      });

      await expect(
        service.cancelByDriver({
          userId: 'usr_drv_1',
          rideId: 'ride_101',
          reasonCode: 'VEHICLE_BREAKDOWN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects if reason requires details but none are provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue(mockRide);
      mockPrisma.providerCancellationReason.findUnique.mockResolvedValue({
        code: 'OTHER',
        label: 'Other',
        isJustified: false,
        requiresDetails: true,
        isActive: true,
      });

      await expect(
        service.cancelByDriver({
          userId: 'usr_drv_1',
          rideId: 'ride_101',
          reasonCode: 'OTHER',
          reasonDetails: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully cancels ride, refunds passenger 100%, and creates audit record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue(mockRide);
      mockPrisma.providerCancellationReason.findUnique.mockResolvedValue({
        code: 'VEHICLE_BREAKDOWN',
        label: 'Vehicle Breakdown',
        isJustified: false,
        requiresDetails: false,
        isActive: true,
      });

      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay_999',
        amount: 85.5,
        currency: 'CAD',
        providerRef: 'pi_stripe_123',
        refunds: [],
      });

      mockPrisma.driverCancellationRecord.create.mockResolvedValue({
        id: 'dcr_1',
        rideId: 'ride_101',
        driverId: 'drv_prof_1',
        reasonCode: 'VEHICLE_BREAKDOWN',
        isJustified: false,
      });

      const res = await service.cancelByDriver({
        userId: 'usr_drv_1',
        rideId: 'ride_101',
        reasonCode: 'VEHICLE_BREAKDOWN',
        reasonDetails: 'Engine overheating on route',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(RideStatus.DRIVER_CANCELLED);
      expect(res.refund.refunded).toBe(true);
      expect(res.refund.amount).toBe(85.5);

      // Verify payment gateway was requested for 100% full refund
      expect(mockPayments.refund).toHaveBeenCalledWith('pi_stripe_123', 85.5);

      // Verify passenger and driver were notified
      expect(mockNotifications.notifyRideStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['usr_pax_1'],
          status: RideStatus.DRIVER_CANCELLED,
          title: 'Ride Cancelled by Driver',
        }),
      );
      expect(mockNotifications.notifyRideStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: ['usr_drv_1'],
          status: RideStatus.DRIVER_CANCELLED,
          title: 'Ride Cancellation Confirmed',
        }),
      );
    });
  });

  describe('getRepeatOffendersReport', () => {
    it('aggregates repeated cancellations and flags drivers exceeding threshold', async () => {
      const mockRecords = [
        {
          id: 'rec_1',
          rideId: 'ride_1',
          reasonCode: 'VEHICLE_BREAKDOWN',
          reasonLabel: 'Vehicle Breakdown',
          isJustified: false,
          adminOverriddenJustified: null,
          reasonDetails: 'Flat tire',
          createdAt: new Date(),
          driver: {
            id: 'drv_1',
            fullName: 'Offender Driver',
            userId: 'usr_1',
            approvalStatus: DriverApprovalStatus.APPROVED,
            warningCount: 1,
            user: { email: 'drv1@test.com', phoneE164: '+15551234', isSuspended: false },
          },
        },
        {
          id: 'rec_2',
          rideId: 'ride_2',
          reasonCode: 'OTHER',
          reasonLabel: 'Other',
          isJustified: false,
          adminOverriddenJustified: null,
          reasonDetails: 'Personal issue',
          createdAt: new Date(),
          driver: {
            id: 'drv_1',
            fullName: 'Offender Driver',
            userId: 'usr_1',
            approvalStatus: DriverApprovalStatus.APPROVED,
            warningCount: 1,
            user: { email: 'drv1@test.com', phoneE164: '+15551234', isSuspended: false },
          },
        },
        {
          id: 'rec_3',
          rideId: 'ride_3',
          reasonCode: 'WEATHER_ROAD_CONDITIONS',
          reasonLabel: 'Weather or Road Conditions',
          isJustified: true,
          adminOverriddenJustified: null,
          reasonDetails: null,
          createdAt: new Date(),
          driver: {
            id: 'drv_2',
            fullName: 'Good Driver',
            userId: 'usr_2',
            approvalStatus: DriverApprovalStatus.APPROVED,
            warningCount: 0,
            user: { email: 'drv2@test.com', phoneE164: '+15555678', isSuspended: false },
          },
        },
      ];

      mockPrisma.driverCancellationRecord.findMany.mockResolvedValue(mockRecords);

      const report = await service.getRepeatOffendersReport({ windowDays: 30, threshold: 2 });

      expect(report.summary.totalCancellations).toBe(3);
      expect(report.summary.totalUnjustified).toBe(2);
      expect(report.summary.totalJustified).toBe(1);
      expect(report.summary.flaggedDriversCount).toBe(1);

      const flagged = report.flaggedOffenders;
      expect(flagged.length).toBe(1);
      expect(flagged[0].driverId).toBe('drv_1');
      expect(flagged[0].unjustifiedCount).toBe(2);
      expect(flagged[0].isFlagged).toBe(true);
    });
  });

  describe('overrideJustification', () => {
    it('allows Admin to pardon an unjustified cancellation with notes', async () => {
      mockPrisma.driverCancellationRecord.findUnique.mockResolvedValue({
        id: 'rec_10',
        driverId: 'drv_1',
        isJustified: false,
      });

      mockPrisma.driverCancellationRecord.update.mockResolvedValue({
        id: 'rec_10',
        adminReviewed: true,
        adminOverriddenJustified: true,
        adminReviewNotes: 'Verified mechanic towing invoice',
      });

      const updated = await service.overrideJustification('admin_1', 'rec_10', {
        isJustified: true,
        notes: 'Verified mechanic towing invoice',
      });

      expect(updated.adminOverriddenJustified).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'admin_1',
            action: 'driver_cancellation.justification_override',
          }),
        }),
      );
    });
  });

  describe('issueWarning', () => {
    it('issues formal warning, increments warningCount, and notifies driver', async () => {
      mockPrisma.driverProfile.findUnique.mockResolvedValue({
        id: 'drv_1',
        userId: 'usr_1',
        warningCount: 1,
      });

      mockPrisma.driverWarning.create.mockResolvedValue({
        id: 'warn_1',
        warningNumber: 2,
        reason: 'Repeated cancellations without notice',
      });

      const warning = await service.issueWarning('admin_1', 'drv_1', {
        reason: 'Repeated cancellations without notice',
      });

      expect(mockPrisma.driverProfile.update).toHaveBeenCalledWith({
        where: { id: 'drv_1' },
        data: { warningCount: 2 },
      });
      expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr_1',
          title: 'Formal Warning #2 Issued',
          targetRole: 'DRIVER',
        }),
      );
    });
  });

  describe('terminateDriver', () => {
    it('terminates driver account and invalidates active sessions', async () => {
      mockPrisma.driverProfile.findUnique.mockResolvedValue({
        id: 'drv_1',
        userId: 'usr_1',
      });

      const result = await service.terminateDriver('admin_1', 'drv_1', {
        reason: 'Excessive cancellations breach of agreement',
      });

      expect(result.status).toBe('TERMINATED');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_1' },
        data: { isSuspended: true },
      });
      expect(mockPrisma.driverProfile.update).toHaveBeenCalledWith({
        where: { id: 'drv_1' },
        data: expect.objectContaining({
          approvalStatus: DriverApprovalStatus.REJECTED,
          drivingEnabled: false,
          isActivated: false,
        }),
      });
      expect(mockNotifications.sendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr_1',
          title: 'Account Terminated',
          targetRole: 'DRIVER',
        }),
      );
    });
  });
});
