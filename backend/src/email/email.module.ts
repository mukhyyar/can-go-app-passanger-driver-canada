import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailEventsService } from './email-events.service';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [EmailService, EmailEventsService],
  exports: [EmailService, EmailEventsService],
})
export class EmailModule {}
