jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverFinancialSummaryService } from './driver-financial-summary.service';
import { FinancialSummaryType } from './dto/financial-summary.dto';
import { DriverWalletScheduler } from './driver-wallet.scheduler';

describe('DriverFinancialSummaryService', () => {
  let service: DriverFinancialSummaryService;
  let prismaMock: any;
  let emailEventsMock: any;

  beforeEach(() => {
    prismaMock = {
      driverProfile: {
        findUnique: jest.fn(),
      },
      ride: {
        findMany: jest.fn(),
      },
      driverWalletEntry: {
        findMany: jest.fn(),
      },
      driverPayout: {
        findMany: jest.fn(),
      },
    };

    emailEventsMock = {
      sendDriverFinancialSummary: jest.fn().mockResolvedValue(undefined),
    };

    service = new DriverFinancialSummaryService(prismaMock, emailEventsMock);
  });

  describe('computePeriodDates', () => {
    it('computes monthly dates correctly for 30-day month (November 2026)', () => {
      const dates = service.computePeriodDates(
        FinancialSummaryType.MONTHLY,
        2026,
        11,
      );
      expect(dates.periodLabel).toBe('November 2026');
      expect(dates.periodType).toBe('MONTHLY');
      expect(dates.startDate.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(dates.endDate.toISOString()).toBe('2026-11-30T23:59:59.999Z');
      expect(dates.dateRangeFormatted).toBe(
        'November 1, 2026 – November 30, 2026',
      );
    });

    it('computes monthly dates correctly for leap year February (2024)', () => {
      const dates = service.computePeriodDates(
        FinancialSummaryType.MONTHLY,
        2024,
        2,
      );
      expect(dates.periodLabel).toBe('February 2024');
      expect(dates.endDate.getUTCDate()).toBe(29);
      expect(dates.dateRangeFormatted).toBe(
        'February 1, 2024 – February 29, 2024',
      );
    });

    it('computes annual dates correctly (2026)', () => {
      const dates = service.computePeriodDates(
        FinancialSummaryType.YEARLY,
        2026,
      );
      expect(dates.periodLabel).toBe('Annual Tax Year 2026');
      expect(dates.periodType).toBe('YEARLY');
      expect(dates.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(dates.endDate.toISOString()).toBe('2026-12-31T23:59:59.999Z');
      expect(dates.dateRangeFormatted).toBe(
        'January 1, 2026 – December 31, 2026',
      );
    });

    it('throws BadRequestException for invalid month', () => {
      expect(() =>
        service.computePeriodDates(FinancialSummaryType.MONTHLY, 2026, 13),
      ).toThrow(BadRequestException);
      expect(() =>
        service.computePeriodDates(FinancialSummaryType.MONTHLY, 2026, 0),
      ).toThrow(BadRequestException);
    });
  });

  describe('generateSummary', () => {
    it('aggregates gross fares, commission, net fares, tips, and adjustments', async () => {
      prismaMock.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        user: {
          id: 'user-1',
          fullName: 'Alex Driver',
          email: 'alex@example.ca',
        },
      });

      prismaMock.ride.findMany.mockResolvedValue([
        {
          id: 'ride-1',
          financial: {
            rideFare: 100.0,
            driverCommission: 20.0,
            driverNetEarning: 80.0,
            tipAmount: 15.0,
          },
        },
        {
          id: 'ride-2',
          financial: {
            rideFare: 50.0,
            driverCommission: 10.0,
            driverNetEarning: 40.0,
            tipAmount: 5.0,
          },
        },
      ]);

      prismaMock.driverWalletEntry.findMany.mockResolvedValue([
        {
          id: 'adj-1',
          type: 'ADJUSTMENT',
          direction: 'CREDIT',
          amount: 20.0, // e.g. return item compensation
          status: 'POSTED',
        },
      ]);

      prismaMock.driverPayout.findMany.mockResolvedValue([
        {
          id: 'payout-1',
          amount: 140.0,
          status: 'SUCCEEDED',
        },
      ]);

      const summary = await service.generateSummary('driver-1', {
        type: FinancialSummaryType.MONTHLY,
        year: 2026,
        month: 11,
      });

      expect(summary.driverName).toBe('Alex Driver');
      expect(summary.driverEmail).toBe('alex@example.ca');
      expect(summary.completedTripsCount).toBe(2);
      expect(summary.grossFareTotal).toContain('150.00'); // $100 + $50
      expect(summary.platformCommissionTotal).toContain('30.00'); // $20 + $10
      expect(summary.netFareTotal).toContain('120.00'); // $80 + $40
      expect(summary.tipsTotal).toContain('20.00'); // $15 + $5
      expect(summary.adjustmentsTotal).toContain('20.00'); // +$20
      // Net earnings = $120 net fares + $20 tips + $20 adjustment = $160
      expect(summary.netEarningsTotal).toContain('160.00');
      expect(summary.payoutsTotal).toContain('140.00');
      expect(summary.payoutsCount).toBe(1);
    });

    it('handles zero-activity periods with clean $0.00 figures without errors', async () => {
      prismaMock.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-2',
        user: {
          id: 'user-2',
          fullName: 'Jane Doe',
          email: 'jane@example.ca',
        },
      });

      prismaMock.ride.findMany.mockResolvedValue([]);
      prismaMock.driverWalletEntry.findMany.mockResolvedValue([]);
      prismaMock.driverPayout.findMany.mockResolvedValue([]);

      const summary = await service.generateSummary('driver-2', {
        type: FinancialSummaryType.YEARLY,
        year: 2026,
      });

      expect(summary.completedTripsCount).toBe(0);
      expect(summary.grossFareTotal).toContain('0.00');
      expect(summary.netEarningsTotal).toContain('0.00');
      expect(summary.payoutsTotal).toContain('0.00');
      expect(summary.payoutsCount).toBe(0);
    });

    it('throws NotFoundException if driver profile not found', async () => {
      prismaMock.driverProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.generateSummary('missing-driver', {
          type: FinancialSummaryType.MONTHLY,
          year: 2026,
          month: 11,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendSummaryEmail', () => {
    it('generates summary and dispatches email via emailEvents', async () => {
      prismaMock.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-1',
        user: {
          id: 'user-1',
          fullName: 'Alex Driver',
          email: 'alex@example.ca',
        },
      });

      prismaMock.ride.findMany.mockResolvedValue([]);
      prismaMock.driverWalletEntry.findMany.mockResolvedValue([]);
      prismaMock.driverPayout.findMany.mockResolvedValue([]);

      const res = await service.sendSummaryEmail('driver-1', {
        type: FinancialSummaryType.MONTHLY,
        year: 2026,
        month: 11,
      });

      expect(res.ok).toBe(true);
      expect(emailEventsMock.sendDriverFinancialSummary).toHaveBeenCalledWith(
        'user-1',
        'alex@example.ca',
        expect.objectContaining({
          periodLabel: 'November 2026',
        }),
      );
    });
  });

  describe('DriverWalletScheduler Automated Dispatch', () => {
    it('dispatches monthly summaries on day 1 of month and deduplicates', async () => {
      const walletMock = { runReconciliation: jest.fn().mockResolvedValue({}) };
      const dispatchMock = jest.fn().mockResolvedValue({
        activeDriversCount: 3,
        sentCount: 3,
      });
      const dispatchAnnualMock = jest.fn().mockResolvedValue({
        activeDriversCount: 3,
        sentCount: 3,
      });

      const summaryServiceMock = {
        dispatchMonthlySummariesForActiveDrivers: dispatchMock,
        dispatchAnnualSummariesForActiveDrivers: dispatchAnnualMock,
      } as any;

      const scheduler = new DriverWalletScheduler(
        walletMock as any,
        summaryServiceMock,
      );

      // November 1st at 02:00 UTC -> should dispatch October (month 10)
      const date1 = new Date(Date.UTC(2026, 10, 1, 2, 0, 0));
      await scheduler.checkAndDispatchAutomatedSummaries(date1);

      expect(dispatchMock).toHaveBeenCalledWith(2026, 10);
      expect(dispatchMock).toHaveBeenCalledTimes(1);

      // Calling again on same day should be deduplicated
      await scheduler.checkAndDispatchAutomatedSummaries(date1);
      expect(dispatchMock).toHaveBeenCalledTimes(1);
    });

    it('dispatches annual summary on January 1st', async () => {
      const walletMock = { runReconciliation: jest.fn().mockResolvedValue({}) };
      const dispatchMonthlyMock = jest.fn().mockResolvedValue({
        activeDriversCount: 1,
        sentCount: 1,
      });
      const dispatchAnnualMock = jest.fn().mockResolvedValue({
        activeDriversCount: 1,
        sentCount: 1,
      });

      const summaryServiceMock = {
        dispatchMonthlySummariesForActiveDrivers: dispatchMonthlyMock,
        dispatchAnnualSummariesForActiveDrivers: dispatchAnnualMock,
      } as any;

      const scheduler = new DriverWalletScheduler(
        walletMock as any,
        summaryServiceMock,
      );

      // January 1st at 02:00 UTC -> should dispatch December of prev year and Annual of prev year
      const dateJan1 = new Date(Date.UTC(2027, 0, 1, 2, 0, 0));
      await scheduler.checkAndDispatchAutomatedSummaries(dateJan1);

      expect(dispatchMonthlyMock).toHaveBeenCalledWith(2026, 12);
      expect(dispatchAnnualMock).toHaveBeenCalledWith(2026);
    });
  });
});
