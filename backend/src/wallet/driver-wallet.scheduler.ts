import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DriverWalletService } from './driver-wallet.service';
import { DriverFinancialSummaryService } from './driver-financial-summary.service';

/** Periodic wallet repair: missing earnings, maturity notifications, integrity, and automated monthly financial statements. */
@Injectable()
export class DriverWalletScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverWalletScheduler.name);
  private timer?: NodeJS.Timeout;
  private readonly processedSummaryKeys = new Set<string>();

  constructor(
    private readonly wallet: DriverWalletService,
    private readonly financialSummary: DriverFinancialSummaryService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const result = await this.wallet.runReconciliation();
      if (result.credited || result.matured || result.anomalies) {
        this.logger.log(
          `Wallet reconcile credited=${result.credited} matured=${result.matured} anomalies=${result.anomalies}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Wallet reconcile failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await this.checkAndDispatchAutomatedSummaries();
    } catch (err) {
      this.logger.warn(
        `Automated financial summaries check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * On the 1st of every month (UTC), dispatches the previous month's statement to all active drivers.
   * On January 1st (UTC), dispatches the previous year's annual statement.
   */
  async checkAndDispatchAutomatedSummaries(testDate?: Date) {
    const now = testDate ?? new Date();
    const day = now.getUTCDate();
    const hour = now.getUTCHours();

    // Trigger on day 1 of any month at or after 01:00 UTC
    if (day === 1 && hour >= 1) {
      const currentYear = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth() + 1; // 1-12

      // Previous month calculation
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;

      const monthlyKey = `monthly_${prevYear}_${prevMonth}`;
      if (!this.processedSummaryKeys.has(monthlyKey)) {
        this.processedSummaryKeys.add(monthlyKey);
        this.logger.log(
          `Starting automated monthly financial summaries dispatch for ${prevYear}-${prevMonth}`,
        );
        const res =
          await this.financialSummary.dispatchMonthlySummariesForActiveDrivers(
            prevYear,
            prevMonth,
          );
        this.logger.log(
          `Completed automated monthly statements for ${prevYear}-${prevMonth}: ${res.sentCount} sent out of ${res.activeDriversCount} active drivers`,
        );
      }

      // If January 1st, also send the previous year's annual statement
      if (currentMonth === 1) {
        const annualYear = currentYear - 1;
        const annualKey = `annual_${annualYear}`;
        if (!this.processedSummaryKeys.has(annualKey)) {
          this.processedSummaryKeys.add(annualKey);
          this.logger.log(
            `Starting automated annual financial summaries dispatch for year ${annualYear}`,
          );
          const res =
            await this.financialSummary.dispatchAnnualSummariesForActiveDrivers(
              annualYear,
            );
          this.logger.log(
            `Completed automated annual statements for ${annualYear}: ${res.sentCount} sent out of ${res.activeDriversCount} active drivers`,
          );
        }
      }
    }
  }
}
