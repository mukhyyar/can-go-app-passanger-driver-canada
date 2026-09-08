import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationStoreService } from './location-store.service';
import { TrackingService } from './tracking.service';
import { TrackingGateway } from './tracking.gateway';
import { TrackingController } from './tracking.controller';

@Module({
  imports: [AuthModule],
  controllers: [TrackingController],
  providers: [LocationStoreService, TrackingService, TrackingGateway],
  exports: [TrackingService, TrackingGateway, LocationStoreService],
})
export class TrackingModule {}
