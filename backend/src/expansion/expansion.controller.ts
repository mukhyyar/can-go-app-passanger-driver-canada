import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
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
import { ExpansionService } from './expansion.service';

class VipRequestDto {}

class RedeemReferralDto {
  @IsString()
  @MinLength(3)
  code!: string;
}

class DayOffDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}/)
  date!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

class AdminVipDto {
  @IsBoolean()
  isVip!: boolean;
}

@Controller()
export class ExpansionController {
  constructor(private readonly expansion: ExpansionService) {}

  @Get('catalog')
  catalog(@Query('serviceType') serviceType?: string) {
    return this.expansion.listCatalog(serviceType);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Get('passenger/vip')
  vipStatus(@CurrentUser() user: AuthUser) {
    return this.expansion.vipStatus(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Post('passenger/vip/request')
  requestVip(@CurrentUser() user: AuthUser, @Body() _dto: VipRequestDto) {
    return this.expansion.requestVip(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Post('passenger/referral/ensure')
  ensureCode(@CurrentUser() user: AuthUser) {
    return this.expansion.ensurePassengerReferralCode(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('referrals/redeem')
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemReferralDto) {
    const role =
      user.role === UserRole.DRIVER ? 'DRIVER' : 'PASSENGER';
    return this.expansion.redeemReferral(user.id, dto.code, role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Get('driver/day-offs')
  listDayOffs(@CurrentUser() user: AuthUser) {
    return this.expansion.listDayOffs(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Post('driver/day-offs')
  addDayOff(@CurrentUser() user: AuthUser, @Body() dto: DayOffDto) {
    return this.expansion.addDayOff(user.id, dto.date, dto.note);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Delete('driver/day-offs/:id')
  removeDayOff(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expansion.removeDayOff(user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequirePermission('users.vip')
  @Post('admin/passengers/:profileId/vip')
  adminVip(
    @CurrentUser() user: AuthUser,
    @Param('profileId') profileId: string,
    @Body() dto: AdminVipDto,
  ) {
    return this.expansion.adminSetVip(user.id, profileId, dto.isVip);
  }
}
