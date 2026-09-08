import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { AdminRatingsController } from './admin-ratings.controller';

@Module({
  imports: [AuthModule],
  controllers: [RatingsController, AdminRatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
