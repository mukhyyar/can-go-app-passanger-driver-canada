import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

/** Lightweight TTL worker for Phase 1c (BullMQ can replace later). */
@Injectable()
export class MarketplaceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketplaceScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly marketplace: MarketplaceService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const result = await this.marketplace.expireDueEntities();
      if (result.expiredRequests || result.expiredPayments) {
        this.logger.log(
          `TTL sweep requests=${result.expiredRequests} payments=${result.expiredPayments}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `TTL sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
