import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpansionController } from './expansion.controller';
import { ExpansionService } from './expansion.service';

@Module({
  imports: [AuthModule],
  controllers: [ExpansionController],
  providers: [ExpansionService],
  exports: [ExpansionService],
})
export class ExpansionModule {}
