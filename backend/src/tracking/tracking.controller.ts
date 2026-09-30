import {
  Body,
  Controller,
  Delete,
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

  @Get('rides/:id/tracking')
  @UseGuards(JwtAuthGuard)
  rideTracking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tracking.getRideTracking(user.id, id);
  }

  /** Generate or retrieve trip share link (Passenger only) */
  @Post('rides/:id/share-link')
  @UseGuards(JwtAuthGuard)
  createShareLink(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tracking.createOrGetShareLink(user.id, id);
  }

  /** Revoke active trip share link (Passenger only) */
  @Delete('rides/:id/share-link')
  @UseGuards(JwtAuthGuard)
  revokeShareLink(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tracking.revokeShareLink(user.id, id);
  }

  /** Public endpoint: Follow live trip using secure share token (No auth required) */
  @Get('rides/shared/:token')
  publicSharedTrip(@Param('token') token: string) {
    return this.tracking.getPublicSharedTrip(token);
  }
}
