import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DriverWalletService } from './driver-wallet.service';

/** Periodic wallet repair: missing earnings, maturity notifications, integrity. */
@Injectable()
export class DriverWalletScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverWalletScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly wallet: DriverWalletService) {}

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
  }
}
