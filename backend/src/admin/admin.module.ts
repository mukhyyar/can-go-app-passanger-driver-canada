import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminOpsService } from './admin.service';
import { AdminRbacService } from './rbac.service';
import { AdminOpsController } from './admin.controller';
import { AdminAnalyticsService } from './analytics.service';
import { AdminAnalyticsController } from './analytics.controller';

@Module({
  imports: [AuthModule, NotificationsModule, StorageModule, WalletModule],
  controllers: [AdminOpsController, AdminAnalyticsController],
  providers: [AdminOpsService, AdminRbacService, AdminAnalyticsService],
  exports: [AdminOpsService, AdminRbacService, AdminAnalyticsService],
})
export class AdminModule {}
