import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { ModerateRatingDto } from './dto/ratings.dto';
import { RatingsService } from './ratings.service';

@Controller('admin/ratings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminRatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Get()
  @RequirePermission('ratings.view')
  queue(@Query('status') status?: string) {
    return this.ratings.adminQueue(status);
  }

  @Post(':id/moderate')
  @RequirePermission('ratings.moderate')
  moderate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ModerateRatingDto,
  ) {
    return this.ratings.moderate(user.id, id, dto);
  }
}
