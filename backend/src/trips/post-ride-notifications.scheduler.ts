import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PostRideNotificationService } from './post-ride-notifications.service';

/**
 * Periodically processes delayed post-ride driver tipping reminders.
 * Runs in accordance with the approved delay (e.g. 60 minutes post-completion).
 */
@Injectable()
export class PostRideNotificationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostRideNotificationScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly postRideNotifications: PostRideNotificationService,
  ) {}

  onModuleInit() {
    // Check every 60 seconds
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
      const result = await this.postRideNotifications.processDueTippingReminders();
      if (result.sent > 0) {
        this.logger.log(`Tipping reminder sweep: sent=${result.sent} skipped=${result.skipped}`);
      }
    } catch (err) {
      this.logger.warn(
        `Tipping reminder sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
