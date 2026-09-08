import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  CmsAdminController,
  CmsPublicController,
  PromoAdminController,
} from './cms.controller';
import { CmsService, PromoService } from './cms.service';

@Module({
  imports: [AuthModule],
  controllers: [CmsPublicController, CmsAdminController, PromoAdminController],
  providers: [CmsService, PromoService],
  exports: [CmsService, PromoService],
})
export class CmsModule {}
