import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { WalletModule } from '../wallet/wallet.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { TripService } from './trip.service';
import { DriverTripController, TripsController } from './trips.controller';
import { PostRideNotificationService } from './post-ride-notifications.service';
import { PostRideNotificationScheduler } from './post-ride-notifications.scheduler';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    forwardRef(() => TrackingModule),
    WalletModule,
    forwardRef(() => MarketplaceModule),
  ],
  controllers: [TripsController, DriverTripController],
  providers: [
    TripService,
    PostRideNotificationService,
    PostRideNotificationScheduler,
  ],
  exports: [TripService, PostRideNotificationService],
})
export class TripsModule {}

