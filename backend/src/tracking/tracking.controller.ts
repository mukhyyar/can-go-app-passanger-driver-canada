import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { TrackingService } from './tracking.service';

class LocationUpdateDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heading?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speedMps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracyM?: number;

  @IsOptional()
  @IsString()
  rideId?: string;

  @IsOptional()
  @IsString()
  recordedAt?: string;
}

@Controller()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** HTTPS fallback when Socket.IO unavailable */
  @Post('tracking/location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  updateLocation(@CurrentUser() user: AuthUser, @Body() dto: LocationUpdateDto) {
    return this.tracking.ingest(user.id, dto);
  }

  @Get('rides/:id/location')
  @UseGuards(JwtAuthGuard)
  rideLocation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tracking.getRideLocation(user.id, id);
  }
}
