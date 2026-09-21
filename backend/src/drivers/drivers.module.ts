import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriversService } from './drivers.service';
import { KycOpsService } from './kyc-ops.service';
import { KycDocumentsService } from './kyc-documents.service';
import { DriversController } from './drivers.controller';
import { AdminKycController } from './admin-kyc.controller';

import { DocumentsExpiryService } from './documents-expiry.service';
import { DocumentsExpiryScheduler } from './documents-expiry.scheduler';

@Module({
  imports: [AuthModule, StorageModule, NotificationsModule],
  controllers: [DriversController, AdminKycController],
  providers: [
    DriversService,
    KycOpsService,
    KycDocumentsService,
    DocumentsExpiryService,
    DocumentsExpiryScheduler,
  ],
  exports: [
    DriversService,
    KycOpsService,
    KycDocumentsService,
    DocumentsExpiryService,
  ],
})
export class DriversModule {}
