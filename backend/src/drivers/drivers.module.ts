import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriversService } from './drivers.service';
import { KycOpsService } from './kyc-ops.service';
import { DriversController } from './drivers.controller';
import { AdminKycController } from './admin-kyc.controller';

@Module({
  imports: [AuthModule, StorageModule, NotificationsModule],
  controllers: [DriversController, AdminKycController],
  providers: [DriversService, KycOpsService],
  exports: [DriversService, KycOpsService],
})
export class DriversModule {}
