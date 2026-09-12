import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatController } from './chat.controller';
import { RideContactController } from './ride-contact.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ChatController, RideContactController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
