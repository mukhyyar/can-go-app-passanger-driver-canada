import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { RideStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { TripService } from './trip.service';

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
}

@Controller('rides')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly trips: TripService) {}

  @Post(':id/transitions')
  transition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TripTransitionDto,
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(user.id, id, dto.status, req.ip);
  }
}

/** Convenience aliases for drivers */
@Controller('driver/rides')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriverTripController {
  constructor(private readonly trips: TripService) {}

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
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(
      user.id,
      id,
      RideStatus.DRIVER_ARRIVED,
      req.ip,
    );
  }

  @Post(':id/start')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(user.id, id, RideStatus.TRIP_STARTED, req.ip);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(user.id, id, RideStatus.COMPLETED, req.ip);
  }

  @Post(':id/no-show')
  noShow(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.trips.transition(user.id, id, RideStatus.NO_SHOW, req.ip);
  }
}
