import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
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
import { DriverWalletService } from './driver-wallet.service';
import { DriverFinancialSummaryService } from './driver-financial-summary.service';
import { WithdrawWalletDto } from './dto/wallet.dto';
import { RequestFinancialSummaryDto } from './dto/financial-summary.dto';
import {
  PAYOUT_PROVIDER,
  type PayoutProvider,
} from '../providers/payout/payout-provider.interface';

@Controller()
export class DriverWalletController {
  constructor(
    private readonly wallet: DriverWalletService,
    private readonly financialSummary: DriverFinancialSummaryService,
    @Inject(PAYOUT_PROVIDER) private readonly payoutProvider: PayoutProvider,
  ) {}

  @Get('driver/me/wallet')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getWallet(@CurrentUser() user: AuthUser) {
    return this.wallet.getWalletForUser(user.id);
  }

  @Get('driver/me/wallet/entries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  listEntries(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.wallet.listEntriesForUser(user.id, {
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      type,
      status,
      dateFrom,
      dateTo,
    });
  }

  @Post('driver/me/wallet/withdraw')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  withdraw(
    @CurrentUser() user: AuthUser,
    @Body() dto: WithdrawWalletDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { ip?: string },
  ) {
    return this.wallet.withdrawForUser(
      user.id,
      { amount: dto.amount, currency: dto.currency },
      idempotencyKey,
      req.ip,
    );
  }

  @Get('driver/me/wallet/financial-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  getFinancialSummary(
    @CurrentUser() user: AuthUser,
    @Query() dto: RequestFinancialSummaryDto,
  ) {
    return this.financialSummary.generateSummaryForUser(user.id, dto);
  }

  @Post('driver/me/wallet/financial-summary/email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  emailFinancialSummary(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestFinancialSummaryDto,
  ) {
    return this.financialSummary.sendSummaryEmailForUser(user.id, dto);
  }

  @Post('admin/drivers/:driverId/financial-summary/email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  adminEmailFinancialSummary(
    @Param('driverId') driverId: string,
    @Body() dto: RequestFinancialSummaryDto,
  ) {
    return this.financialSummary.sendSummaryEmail(driverId, dto);
  }

  /** Async payout provider webhooks (mirrors payments webhook pattern). */
  @Post('payouts/webhooks/:provider')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async payoutWebhook(
    @Param('provider') provider: string,
    @Req()
    req: {
      headers: Record<string, string | string[] | undefined>;
      body: unknown;
      rawBody?: Buffer;
    },
  ) {
    if (provider !== this.payoutProvider.name && provider !== 'dev') {
      return { ok: false, reason: 'unknown_provider' };
    }
    const raw =
      req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    const event = await this.payoutProvider.parseWebhook(req.headers, raw);
    const rawObj =
      event.raw && typeof event.raw === 'object'
        ? (event.raw as Record<string, unknown>)
        : {};
    const nestedObj =
      rawObj.data &&
      typeof rawObj.data === 'object' &&
      (rawObj.data as Record<string, unknown>).object &&
      typeof (rawObj.data as Record<string, unknown>).object === 'object'
        ? ((rawObj.data as Record<string, unknown>).object as Record<
            string,
            unknown
          >)
        : null;
    const providerPayoutId = String(
      rawObj.providerPayoutId ??
        rawObj.transferId ??
        nestedObj?.id ??
        rawObj.batchId ??
        rawObj.id ??
        '',
    );
    const nestedMeta =
      nestedObj?.metadata && typeof nestedObj.metadata === 'object'
        ? (nestedObj.metadata as Record<string, unknown>)
        : null;
    const payoutId = rawObj.payoutId
      ? String(rawObj.payoutId)
      : nestedMeta?.payoutId
        ? String(nestedMeta.payoutId)
        : undefined;
    return this.wallet.reconcilePayoutEvent({
      provider: event.provider,
      eventId: event.eventId,
      type: event.type,
      providerPayoutId: providerPayoutId || undefined,
      payoutId,
      raw: event.raw,
    });
  }
}
