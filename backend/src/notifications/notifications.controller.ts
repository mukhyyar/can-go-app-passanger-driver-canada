import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

enum AppRoleDto {
  PASSENGER = 'PASSENGER',
  DRIVER = 'DRIVER',
  PASSENGER_WEB = 'PASSENGER_WEB',
}

class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  platform!: string;

  @IsEnum(AppRoleDto)
  appRole!: AppRoleDto;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('device-tokens')
  @UseGuards(JwtAuthGuard)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceTokenDto) {
    return this.notifications.registerDeviceToken({
      ...dto,
      userId: user.id,
    });
  }
}
