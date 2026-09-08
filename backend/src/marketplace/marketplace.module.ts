import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CmsModule } from '../cms/cms.module';
import { TrackingModule } from '../tracking/tracking.module';
import { StorageModule } from '../storage/storage.module';
import { PricingService } from './pricing.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceScheduler } from './marketplace.scheduler';
import { RideLifecycleService } from './ride-lifecycle.service';
import { OfferPresentationService } from './offer-presentation.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    CmsModule,
    TrackingModule,
    StorageModule,
  ],
  controllers: [MarketplaceController],
  providers: [
    PricingService,
    RideLifecycleService,
    OfferPresentationService,
    MarketplaceService,
    MarketplaceScheduler,
  ],
  exports: [MarketplaceService, PricingService, RideLifecycleService],
})
export class MarketplaceModule {}
