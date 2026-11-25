import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailEventsService } from '../email/email-events.service';
import { DriverFinancialSummaryData } from '../email/templates/driver_financial_summary';
import { FinancialSummaryType } from './dto/financial-summary.dto';
import { d, moneyToString } from './money.util';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

@Injectable()
export class DriverFinancialSummaryService {
  private readonly logger = new Logger(DriverFinancialSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailEvents: EmailEventsService,
  ) {}

  /**
   * Helper to compute start & end UTC dates, formatted range, and period labels.
   */
  computePeriodDates(
    type: FinancialSummaryType | 'MONTHLY' | 'YEARLY',
    year: number,
    month?: number,
  ): {
    startDate: Date;
    endDate: Date;
    periodLabel: string;
    dateRangeFormatted: string;
    periodType: 'MONTHLY' | 'YEARLY';
  } {
    if (type === FinancialSummaryType.MONTHLY || (type as string) === 'MONTHLY') {
      if (!month || month < 1 || month > 12) {
        throw new BadRequestException(
          'Month must be between 1 and 12 for monthly summary',
        );
      }
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      // Day 0 of next month is the last day of current month
      const lastDayDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      const monthName = MONTH_NAMES[month - 1];
      const lastDay = lastDayDate.getUTCDate();

      return {
        startDate,
        endDate: lastDayDate,
        periodLabel: `${monthName} ${year}`,
        dateRangeFormatted: `${monthName} 1, ${year} – ${monthName} ${lastDay}, ${year}`,
        periodType: 'MONTHLY',
      };
    } else {
      const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

      return {
        startDate,
        endDate,
        periodLabel: `Annual Tax Year ${year}`,
        dateRangeFormatted: `January 1, ${year} – December 31, ${year}`,
        periodType: 'YEARLY',
      };
    }
  }

  /**
   * Generates aggregated financial figures for a given driver and period.
   */
  async generateSummary(
    driverId: string,
    options: {
      type: FinancialSummaryType | 'MONTHLY' | 'YEARLY';
      year: number;
      month?: number;
    },
  ): Promise<DriverFinancialSummaryData> {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!driver || !driver.user) {
      throw new NotFoundException('Driver profile or user account not found');
    }

    const { startDate, endDate, periodLabel, dateRangeFormatted, periodType } =
      this.computePeriodDates(options.type, options.year, options.month);

    const currency = 'CAD';

    // 1. Query Completed Rides and Financials
    const completedRides = await this.prisma.ride.findMany({
      where: {
        assignedDriverId: driverId,
        status: 'COMPLETED',
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        financial: true,
      },
    });

    let grossFareTotal = d(0);
    let platformCommissionTotal = d(0);
    let netFareTotal = d(0);
    let tipsTotal = d(0);

    for (const r of completedRides) {
      if (r.financial) {
        const fare = d(r.financial.rideFare);
        const comm = d(r.financial.driverCommission);
        const net = d(r.financial.driverNetEarning);
        const tip = d(r.financial.tipAmount ?? 0);

        grossFareTotal = grossFareTotal.plus(fare);
        platformCommissionTotal = platformCommissionTotal.plus(comm);
        netFareTotal = netFareTotal.plus(net);
        tipsTotal = tipsTotal.plus(tip);
      } else {
        const snap = r.priceSnapshot as Record<string, any> | null;
        const fare = d(snap?.finalPrice ?? snap?.bidAmount ?? 0);
        const comm = fare.mul(0.2); // 20% commission fallback
        const net = fare.minus(comm);

        grossFareTotal = grossFareTotal.plus(fare);
        platformCommissionTotal = platformCommissionTotal.plus(comm);
        netFareTotal = netFareTotal.plus(net);
      }
    }

    // 2. Query Driver Wallet Entries for Adjustments
    const walletEntries = await this.prisma.driverWalletEntry.findMany({
      where: {
        driverId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    let adjustmentsTotal = d(0);
    for (const entry of walletEntries) {
      if (entry.type === 'ADJUSTMENT' || entry.type === 'REVERSAL') {
        if (entry.status === 'POSTED') {
          const amt = d(entry.amount);
          if (entry.direction === 'CREDIT') {
            adjustmentsTotal = adjustmentsTotal.plus(amt);
          } else {
            adjustmentsTotal = adjustmentsTotal.minus(amt);
          }
        }
      }
    }

    // 3. Query Successful Bank Payouts in period
    const payouts = await this.prisma.driverPayout.findMany({
      where: {
        driverId,
        status: 'SUCCEEDED',
        OR: [
          { processedAt: { gte: startDate, lte: endDate } },
          { processedAt: null, createdAt: { gte: startDate, lte: endDate } },
        ],
      },
    });

    let payoutsTotal = d(0);
    for (const p of payouts) {
      payoutsTotal = payoutsTotal.plus(d(p.amount));
    }

    const netEarningsTotal = netFareTotal.plus(tipsTotal).plus(adjustmentsTotal);

    const fmt = (val: Prisma.Decimal) => {
      const num = Number(moneyToString(val, currency));
      return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
      }).format(num);
    };

    return {
      driverName: driver.fullName || (driver.user as Record<string, any>).fullName || 'Driver',
      driverEmail: driver.user.email ?? '',
      driverId: driver.id,
      periodType,
      periodLabel,
      dateRangeFormatted,
      currency,
      completedTripsCount: completedRides.length,
      grossFareTotal: fmt(grossFareTotal),
      platformCommissionTotal: fmt(platformCommissionTotal),
      netFareTotal: fmt(netFareTotal),
      tipsTotal: fmt(tipsTotal),
      adjustmentsTotal: fmt(adjustmentsTotal),
      netEarningsTotal: fmt(netEarningsTotal),
      payoutsTotal: fmt(payoutsTotal),
      payoutsCount: payouts.length,
    };
  }

  /**
   * Generates summary and delivers it to the driver's registered email.
   */
  async sendSummaryEmail(
    driverId: string,
    options: {
      type: FinancialSummaryType | 'MONTHLY' | 'YEARLY';
      year: number;
      month?: number;
    },
  ) {
    const summary = await this.generateSummary(driverId, options);
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!driver?.user?.email) {
      throw new BadRequestException(
        'Driver does not have a registered email address',
      );
    }

    await this.emailEvents.sendDriverFinancialSummary(
      driver.user.id,
      driver.user.email,
      summary,
    );

    this.logger.log(
      `Dispatched financial summary email (${summary.periodLabel}) to ${driver.user.email}`,
    );

    return {
      ok: true,
      message: `Financial summary for ${summary.periodLabel} has been sent to ${driver.user.email}`,
      summary,
    };
  }

  async generateSummaryForUser(
    userId: string,
    options: {
      type: FinancialSummaryType | 'MONTHLY' | 'YEARLY';
      year: number;
      month?: number;
    },
  ) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }
    return this.generateSummary(driver.id, options);
  }

  async sendSummaryEmailForUser(
    userId: string,
    options: {
      type: FinancialSummaryType | 'MONTHLY' | 'YEARLY';
      year: number;
      month?: number;
    },
  ) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }
    return this.sendSummaryEmail(driver.id, options);
  }

  /**
   * Dispatches monthly summaries to all drivers with activity in the given month.
   */
  async dispatchMonthlySummariesForActiveDrivers(year: number, month: number) {
    const { startDate, endDate } = this.computePeriodDates(
      FinancialSummaryType.MONTHLY,
      year,
      month,
    );

    // Find all drivers who had completed rides or wallet entries in this period
    const activeDriverIds = new Set<string>();

    const rides = await this.prisma.ride.findMany({
      where: {
        status: 'COMPLETED',
        assignedDriverId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { assignedDriverId: true },
    });
    for (const r of rides) {
      if (r.assignedDriverId) activeDriverIds.add(r.assignedDriverId);
    }

    const entries = await this.prisma.driverWalletEntry.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { driverId: true },
    });
    for (const e of entries) {
      activeDriverIds.add(e.driverId);
    }

    this.logger.log(
      `Found ${activeDriverIds.size} active drivers for monthly summary (${year}-${month})`,
    );

    let sent = 0;
    for (const driverId of activeDriverIds) {
      try {
        await this.sendSummaryEmail(driverId, {
          type: FinancialSummaryType.MONTHLY,
          year,
          month,
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Failed sending monthly summary to driver ${driverId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { activeDriversCount: activeDriverIds.size, sentCount: sent };
  }

  /**
   * Dispatches annual summaries to all drivers with activity in the given year.
   */
  async dispatchAnnualSummariesForActiveDrivers(year: number) {
    const { startDate, endDate } = this.computePeriodDates(
      FinancialSummaryType.YEARLY,
      year,
    );

    const activeDriverIds = new Set<string>();

    const rides = await this.prisma.ride.findMany({
      where: {
        status: 'COMPLETED',
        assignedDriverId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { assignedDriverId: true },
    });
    for (const r of rides) {
      if (r.assignedDriverId) activeDriverIds.add(r.assignedDriverId);
    }

    const entries = await this.prisma.driverWalletEntry.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { driverId: true },
    });
    for (const e of entries) {
      activeDriverIds.add(e.driverId);
    }

    this.logger.log(
      `Found ${activeDriverIds.size} active drivers for annual summary (${year})`,
    );

    let sent = 0;
    for (const driverId of activeDriverIds) {
      try {
        await this.sendSummaryEmail(driverId, {
          type: FinancialSummaryType.YEARLY,
          year,
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Failed sending annual summary to driver ${driverId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { activeDriversCount: activeDriverIds.size, sentCount: sent };
  }
}
