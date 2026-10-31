import {
  Body,
  Controller,
  Get,
  Header,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { RideStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { TripService } from './trip.service';
import { PostRideNotificationService } from './post-ride-notifications.service';
import { DriverCancellationService } from '../marketplace/driver-cancellation.service';


class TripTransitionDto {
  @IsString()
  @IsIn([
    'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED',
    'TRIP_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'NO_SHOW',
    'PASSENGER_CANCELLED',
    'DRIVER_CANCELLED',
    'ADMIN_CANCELLED',
  ])
  status!: RideStatus;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsOptional()
  @IsString()
  reasonDetails?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  contactMethod?: string;

  @IsOptional()
  @IsBoolean()
  forceEarlyDropoff?: boolean;

  @IsOptional()
  @IsString()
  earlyDropoffReason?: string;
}

@Controller('rides')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(
    private readonly trips: TripService,
    private readonly postRideNotifications: PostRideNotificationService,
    @Optional() private readonly driverCancellation?: DriverCancellationService,
  ) {}

  @Post(':id/transitions')
  transition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TripTransitionDto,
    @Req() req: { ip?: string },
  ) {
    if (
      dto.status === RideStatus.DRIVER_CANCELLED &&
      this.driverCancellation &&
      dto.reasonCode
    ) {
      return this.driverCancellation.cancelByDriver({
        userId: user.id,
        rideId: id,
        reasonCode: dto.reasonCode,
        reasonDetails: dto.reasonDetails,
        lat: dto.lat,
        lng: dto.lng,
        ip: req.ip,
      });
    }

    return this.trips.transition(
      user.id,
      id,
      dto.status,
      req.ip,
      dto.pin,
      {
        reasonCode: dto.reasonCode,
        reasonDetails: dto.reasonDetails ?? dto.earlyDropoffReason,
        lat: dto.lat,
        lng: dto.lng,
        contactMethod: dto.contactMethod,
        forceEarlyDropoff: dto.forceEarlyDropoff,
      },
    );
  }

  @Get(':id/invoice')
  @Header('Content-Type', 'text/html')
  getInvoice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.postRideNotifications.getPrintableInvoiceHtml(
      user.id,
      id,
      user.role as UserRole,
    );
  }
}


/** Convenience aliases for drivers */
@Controller('driver/rides')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriverTripController {
  constructor(
    private readonly trips: TripService,
    @Optional() private readonly driverCancellation?: DriverCancellationService,
  ) {}

  @Get('cancellation-reasons')
  cancellationReasons() {
    return this.driverCancellation
      ? this.driverCancellation.getActiveReasons()
      : [];
  }

  @Post(':id/en-route')
  enRoute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(
      user.id,
      id,
      RideStatus.DRIVER_EN_ROUTE,
      req.ip,
    );
  }

  @Post(':id/arrived')
  arrived(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { lat?: number; lng?: number },
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(
      user.id,
      id,
      RideStatus.DRIVER_ARRIVED,
      req.ip,
      undefined,
      {
        lat: body?.lat,
        lng: body?.lng,
      },
    );
  }

  @Post(':id/start')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { pin?: string; lat?: number; lng?: number },
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(
      user.id,
      id,
      RideStatus.TRIP_STARTED,
      req.ip,
      body?.pin,
      {
        lat: body?.lat,
        lng: body?.lng,
      },
    );
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      lat?: number;
      lng?: number;
      forceEarlyDropoff?: boolean;
      earlyDropoffReason?: string;
    },
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(
      user.id,
      id,
      RideStatus.COMPLETED,
      req.ip,
      undefined,
      {
        lat: body?.lat,
        lng: body?.lng,
        forceEarlyDropoff: body?.forceEarlyDropoff,
        reasonDetails: body?.earlyDropoffReason,
      },
    );
  }

  @Post(':id/no-show')
  noShow(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      lat?: number;
      lng?: number;
      contactMethod?: 'CHAT' | 'CALL';
    },
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(
      user.id,
      id,
      RideStatus.NO_SHOW,
      req.ip,
      undefined,
      {
        lat: body?.lat,
        lng: body?.lng,
        contactMethod: body?.contactMethod,
      },
    );
  }

  @Post(':id/contact-attempt')
  contactAttempt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { method?: 'CALL' | 'CHAT'; note?: string },
  ) {
    return this.trips.recordContactAttempt(
      user.id,
      id,
      body?.method ?? 'CALL',
      body?.note,
    );
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      reasonCode: string;
      reasonDetails?: string;
      lat?: number;
      lng?: number;
    },
    @Req() req: { ip?: string },
  ) {
    if (this.driverCancellation) {
      return this.driverCancellation.cancelByDriver({
        userId: user.id,
        rideId: id,
        reasonCode: body.reasonCode,
        reasonDetails: body.reasonDetails,
        lat: body.lat,
        lng: body.lng,
        ip: req.ip,
      });
    }

    return this.trips.transition(
      user.id,
      id,
      RideStatus.DRIVER_CANCELLED,
      req.ip,
      undefined,
      {
        reasonCode: body.reasonCode,
        reasonDetails: body.reasonDetails,
        lat: body.lat,
        lng: body.lng,
      },
    );
  }
}

