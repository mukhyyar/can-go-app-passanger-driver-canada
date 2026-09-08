import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { MarketplaceService } from './marketplace.service';
import { PricingService } from './pricing.service';
import {
  CreateOfferDto,
  CreatePaymentIntentDto,
  CreateRideDto,
  PricingQuoteDto,
  SelectOfferDto,
} from './dto/marketplace.dto';

@Controller()
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly pricing: PricingService,
  ) {}

  @Post('pricing/quote')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  quote(@Body() dto: PricingQuoteDto) {
    return this.pricing.quote(dto);
  }

  @Post('rides')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  createRide(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRideDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.createRide(
      user.id,
      dto,
      idempotencyKey,
      req.ip,
    );
  }

  @Get('rides')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  listRides(@CurrentUser() user: AuthUser) {
    return this.marketplace.listPassengerRides(user.id);
  }

  @Get('rides/:id')
  @UseGuards(JwtAuthGuard)
  getRide(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketplace.getRideForActor(user.id, id);
  }

  @Post('rides/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.cancelRide(user.id, id, req.ip);
  }

  @Post('rides/:id/select-offer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  selectOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SelectOfferDto,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.selectOffer(user.id, id, body.offerId, req.ip);
  }

  @Get('driver/requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  driverRequests(@CurrentUser() user: AuthUser) {
    return this.marketplace.listOpenRequests(user.id);
  }

  @Post('rides/:id/offers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  createOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateOfferDto,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.createOffer(user.id, id, dto, req.ip);
  }

  @Post('payments/intents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  createIntent(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentIntentDto,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.createPaymentIntent(user.id, dto, req.ip);
  }

  @Post('payments/webhooks/:provider')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  webhook(
    @Param('provider') provider: string,
    @Req()
    req: {
      headers: Record<string, string | string[] | undefined>;
      body: unknown;
      rawBody?: Buffer;
    },
  ) {
    const raw =
      req.rawBody ??
      Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    return this.marketplace.handlePaymentWebhook(provider, req.headers, raw);
  }
}
