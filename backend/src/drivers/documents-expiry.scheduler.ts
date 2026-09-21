import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DocumentsExpiryService } from './documents-expiry.service';

@Injectable()
export class DocumentsExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentsExpiryScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly expiryService: DocumentsExpiryService) {}

  onModuleInit() {
    // Run initial tick after 5 seconds, then sweep every 5 minutes
    setTimeout(() => {
      void this.tick();
    }, 5000);

    this.timer = setInterval(() => {
      void this.tick();
    }, 5 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const enforced = await this.expiryService.enforceExpiredDocuments();
      if (enforced.deactivatedDrivers > 0) {
        this.logger.warn(
          `Document expiry sweep: deactivated ${enforced.deactivatedDrivers} driver(s) across ${enforced.expiredDocs} expired document(s)`,
        );
      }
      const notified = await this.expiryService.notifyExpiringSoon();
      if (notified.notifiedCount > 0) {
        this.logger.log(
          `Document expiry reminder sweep: notified ${notified.notifiedCount} driver(s)`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Documents expiry sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
