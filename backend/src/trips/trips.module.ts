import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { TripService } from './trip.service';
import { DriverTripController, TripsController } from './trips.controller';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    forwardRef(() => TrackingModule),
  ],
  controllers: [TripsController, DriverTripController],
  providers: [TripService],
  exports: [TripService],
})
export class TripsModule {}
