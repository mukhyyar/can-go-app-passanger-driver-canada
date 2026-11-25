import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriverWalletService } from './driver-wallet.service';
import { DriverWalletScheduler } from './driver-wallet.scheduler';
import { DriverWalletController } from './driver-wallet.controller';
import { DriverFinancialSummaryService } from './driver-financial-summary.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [DriverWalletController],
  providers: [
    DriverWalletService,
    DriverWalletScheduler,
    DriverFinancialSummaryService,
  ],
  exports: [DriverWalletService, DriverFinancialSummaryService],
})
export class WalletModule {}
