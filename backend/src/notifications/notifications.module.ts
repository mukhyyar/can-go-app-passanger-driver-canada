import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { AnnouncementsController } from './announcements.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController, AnnouncementsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
