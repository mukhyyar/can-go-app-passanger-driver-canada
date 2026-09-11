import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
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
  PaymentQuoteDto,
  PricingQuoteDto,
  SelectOfferDto,
  UpdateOfferDto,
  ValidateBookDto,
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
    return this.marketplace.createRide(user.id, dto, idempotencyKey, req.ip);
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

  @Post('rides/:id/view')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  recordView(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketplace.recordRideView(user.id, id);
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

  @Post('rides/:id/validate-book')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  validateBook(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ValidateBookDto,
  ) {
    return this.marketplace.validateBook(user.id, id, body.offerId);
  }

  @Get('rides/:id/offers/:offerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  getOfferDetail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
  ) {
    return this.marketplace.getOfferDetail(user.id, id, offerId);
  }

  @Get('rides/:id/payment-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  paymentStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketplace.getPaymentStatus(user.id, id);
  }

  @Get('driver/requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  driverRequests(@CurrentUser() user: AuthUser) {
    return this.marketplace.listOpenRequests(user.id);
  }

  @Get('driver/schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  driverSchedule(@CurrentUser() user: AuthUser) {
    return this.marketplace.listDriverRides(user.id);
  }

  @Get('driver/requests/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  driverRequestDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketplace.getDriverRequest(user.id, id);
  }

  @Post('driver/requests/:id/skip')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  skipRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.skipRequest(user.id, id, req.ip);
  }

  @Post('rides/:id/offers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  createOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateOfferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.createOffer(
      user.id,
      id,
      {
        ...dto,
        idempotencyKey: dto.idempotencyKey ?? idempotencyKey,
      },
      req.ip,
    );
  }

  @Patch('rides/:id/offers/:offerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  updateOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateOfferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.updateOffer(
      user.id,
      id,
      offerId,
      {
        ...dto,
        idempotencyKey: dto.idempotencyKey ?? idempotencyKey,
      },
      req.ip,
    );
  }

  @Post('offers/:offerId/withdraw')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  withdrawOffer(
    @CurrentUser() user: AuthUser,
    @Param('offerId') offerId: string,
    @Req() req: { ip?: string },
  ) {
    return this.marketplace.withdrawOffer(user.id, offerId, req.ip);
  }

  @Get('offers/:offerId/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  listOfferReviews(
    @CurrentUser() user: AuthUser,
    @Param('offerId') offerId: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.marketplace.listOfferReviews(user.id, offerId, {
      cursor,
      take: take != null ? Number(take) : undefined,
    });
  }

  @Post('payments/quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  paymentQuote(
    @CurrentUser() user: AuthUser,
    @Body() dto: PaymentQuoteDto,
  ) {
    return this.marketplace.getPaymentQuote(user.id, dto);
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
      req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    return this.marketplace.handlePaymentWebhook(provider, req.headers, raw);
  }
}
