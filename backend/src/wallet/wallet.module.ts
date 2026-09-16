import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriverWalletService } from './driver-wallet.service';
import { DriverWalletScheduler } from './driver-wallet.scheduler';
import { DriverWalletController } from './driver-wallet.controller';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [DriverWalletController],
  providers: [DriverWalletService, DriverWalletScheduler],
  exports: [DriverWalletService],
})
export class WalletModule {}
