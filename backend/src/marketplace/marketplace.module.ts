import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CmsModule } from '../cms/cms.module';
import { PricingService } from './pricing.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceScheduler } from './marketplace.scheduler';

@Module({
  imports: [AuthModule, NotificationsModule, CmsModule],
  controllers: [MarketplaceController],
  providers: [PricingService, MarketplaceService, MarketplaceScheduler],
  exports: [MarketplaceService, PricingService],
})
export class MarketplaceModule {}
