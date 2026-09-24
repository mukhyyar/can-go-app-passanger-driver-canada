import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DriverApprovalStatus,
  DriverPayoutStatus,
  Prisma,
  RideStatus,
  WalletDirection,
  WalletEntryStatus,
  WalletEntryType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PAYOUT_PROVIDER,
  type PayoutProvider,
} from '../providers/payout/payout-provider.interface';
import {
  d,
  moneyGte,
  moneyIsNegative,
  moneyLt,
  moneyToProviderNumber,
  moneyToString,
  moneyZero,
  normalizeMoney,
} from './money.util';

export type WalletErrorCode =
  | 'PAYOUT_METHOD_REQUIRED'
  | 'PAYOUT_METHOD_NOT_VERIFIED'
  | 'INSUFFICIENT_FUNDS'
  | 'BELOW_MINIMUM_WITHDRAWAL'
  | 'ABOVE_MAXIMUM_WITHDRAWAL'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'DRIVER_NOT_ELIGIBLE'
  | 'PAYOUT_ALREADY_PROCESSING'
  | 'CURRENCY_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_AMOUNT'
  | 'IDEMPOTENCY_KEY_REQUIRED';

type Tx = Prisma.TransactionClient;

type PayoutSettings = {
  billingPeriod?: string;
  outpaymentCurrency?: string;
  bankCountry?: string;
  payoutMethod?: string;
  accountHolderName?: string;
  accountMask?: string;
  status?: string;
  stripeAccountId?: string;
  beneficiaryId?: string;
};

@Injectable()
export class DriverWalletService {
  private readonly logger = new Logger(DriverWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @Inject(PAYOUT_PROVIDER) private readonly payoutProvider: PayoutProvider,
  ) {}

  walletCurrency(): string {
    return (this.config.get<string>('wallet.currency') ?? 'CAD').toUpperCase();
  }

  minWithdrawal(): Decimal {
    return normalizeMoney(
      this.config.get<string>('wallet.minWithdrawalCad') ?? '10',
      this.walletCurrency(),
    );
  }

  maxWithdrawal(): Decimal {
    return normalizeMoney(
      this.config.get<string>('wallet.maxWithdrawalCad') ?? '5000',
      this.walletCurrency(),
    );
  }

  holdDays(): number {
    const n = this.config.get<number>('wallet.holdDays') ?? 3;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
  }

  dailyLimit(): Decimal | null {
    const raw = this.config.get<string>('wallet.dailyWithdrawalLimitCad') ?? '';
    if (!raw.trim()) return null;
    return normalizeMoney(raw, this.walletCurrency());
  }

  private walletError(code: WalletErrorCode, message: string): never {
    throw new BadRequestException({ code, message });
  }

  private parsePayout(json: unknown): PayoutSettings {
    if (!json || typeof json !== 'object') return {};
    return json as PayoutSettings;
  }

  /** DB authoritative UTC now for financial maturity checks. */
  async dbNow(tx?: Tx): Promise<Date> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`;
    return rows[0]?.now ?? new Date();
  }

  private async lockDriver(tx: Tx, driverId: string) {
    await tx.$queryRaw`SELECT id FROM "DriverProfile" WHERE id = ${driverId} FOR UPDATE`;
  }

  /**
   * Credit earning from immutable ride priceSnapshot inside an existing TX
   * (or opens one). Idempotent via @@unique([driverId, rideId, type]).
   */
  async creditEarningForCompletedRide(
    rideId: string,
    opts?: { tx?: Tx; actorId?: string },
  ): Promise<{ created: boolean; entryId?: string; skippedReason?: string }> {
    const run = async (tx: Tx) => {
      const ride = await tx.ride.findUnique({ where: { id: rideId } });
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== RideStatus.COMPLETED) {
        return { created: false, skippedReason: 'not_completed' };
      }
      if (!ride.assignedDriverId) {
        return { created: false, skippedReason: 'no_assigned_driver' };
      }

      const currency = (ride.currency || '').toUpperCase();
      const walletCurrency = this.walletCurrency();
      if (currency !== walletCurrency) {
        await this.audit(
          opts?.actorId,
          'WALLET_EARNING_CURRENCY_MISMATCH',
          'Ride',
          rideId,
          {
            rideCurrency: currency,
            walletCurrency,
            driverId: ride.assignedDriverId,
          },
        );
        return { created: false, skippedReason: 'currency_mismatch' };
      }

      const snap =
        ride.priceSnapshot && typeof ride.priceSnapshot === 'object'
          ? (ride.priceSnapshot as Record<string, unknown>)
          : {};
      const rawEarning =
        snap.bidAmount ?? snap.driverEarning ?? snap.subtotal;
      if (rawEarning === null || rawEarning === undefined) {
        await this.audit(
          opts?.actorId,
          'WALLET_EARNING_MISSING_SNAPSHOT',
          'Ride',
          rideId,
          { driverId: ride.assignedDriverId },
        );
        return { created: false, skippedReason: 'missing_driver_earning' };
      }

      let amount: Decimal;
      try {
        amount = normalizeMoney(rawEarning, currency);
      } catch (err) {
        await this.audit(
          opts?.actorId,
          'WALLET_EARNING_INVALID_AMOUNT',
          'Ride',
          rideId,
          {
            driverId: ride.assignedDriverId,
            rawEarning,
            error: err instanceof Error ? err.message : String(err),
          },
        );
        return { created: false, skippedReason: 'invalid_amount' };
      }

      const existing = await tx.driverWalletEntry.findFirst({
        where: {
          driverId: ride.assignedDriverId,
          rideId: ride.id,
          type: WalletEntryType.EARNING,
        },
      });
      if (existing) {
        return { created: false, entryId: existing.id, skippedReason: 'already_credited' };
      }

      const now = await this.dbNow(tx);
      const hold = this.holdDays();
      const availableAt =
        hold <= 0 ? null : new Date(now.getTime() + hold * 24 * 60 * 60 * 1000);

      try {
        const entry = await tx.driverWalletEntry.create({
          data: {
            driverId: ride.assignedDriverId,
            type: WalletEntryType.EARNING,
            direction: WalletDirection.CREDIT,
            amount,
            currency,
            status: availableAt && availableAt > now ? WalletEntryStatus.PENDING : WalletEntryStatus.POSTED,
            rideId: ride.id,
            availableAt,
            description: `Trip earning · ${ride.fromLabel}${ride.toLabel ? ` → ${ride.toLabel}` : ''}`,
            metaJson: {
              bookingRef: ride.id,
              fromLabel: ride.fromLabel,
              toLabel: ride.toLabel ?? null,
              completedAt: now.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        await this.audit(
          opts?.actorId,
          'WALLET_EARNING_CREATED',
          'DriverWalletEntry',
          entry.id,
          {
            rideId: ride.id,
            driverId: ride.assignedDriverId,
            amount: moneyToString(amount, currency),
            currency,
            availableAt: availableAt?.toISOString() ?? null,
          },
          tx,
        );

        return { created: true, entryId: entry.id };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const again = await tx.driverWalletEntry.findFirst({
            where: {
              driverId: ride.assignedDriverId,
              rideId: ride.id,
              type: WalletEntryType.EARNING,
            },
          });
          return {
            created: false,
            entryId: again?.id,
            skippedReason: 'already_credited',
          };
        }
        throw err;
      }
    };

    if (opts?.tx) return run(opts.tx);
    return this.prisma.$transaction((tx) => run(tx));
  }

  async computeBalances(
    driverId: string,
    currency: string,
    tx?: Tx,
    now?: Date,
  ) {
    const client = tx ?? this.prisma;
    const at = now ?? (await this.dbNow(tx));
    const entries = await client.driverWalletEntry.findMany({
      where: {
        driverId,
        currency,
        status: {
          in: [
            WalletEntryStatus.PENDING,
            WalletEntryStatus.POSTED,
            WalletEntryStatus.FAILED,
            WalletEntryStatus.REVERSED,
          ],
        },
      },
      select: {
        id: true,
        type: true,
        direction: true,
        amount: true,
        status: true,
        availableAt: true,
        payoutId: true,
      },
    });

    let lifetimeEarned = moneyZero();
    let pending = moneyZero();
    let maturedCredits = moneyZero();
    let lockingDebits = moneyZero();
    let lifetimePaidOut = moneyZero();
    let processingPayouts = moneyZero();
    let nextAvailableAt: Date | null = null;

    for (const e of entries) {
      const amt = d(e.amount);
      const isActive =
        e.status === WalletEntryStatus.PENDING ||
        e.status === WalletEntryStatus.POSTED;

      if (
        e.type === WalletEntryType.EARNING &&
        e.direction === WalletDirection.CREDIT &&
        isActive
      ) {
        lifetimeEarned = lifetimeEarned.plus(amt);
        const matured = !e.availableAt || e.availableAt <= at;
        if (matured) {
          maturedCredits = maturedCredits.plus(amt);
        } else {
          pending = pending.plus(amt);
          if (!nextAvailableAt || e.availableAt! < nextAvailableAt) {
            nextAvailableAt = e.availableAt!;
          }
        }
      }

      // Adjustments / earning reversals affect net lifetime + spendable credits
      if (e.type === WalletEntryType.ADJUSTMENT && isActive) {
        if (e.direction === WalletDirection.DEBIT) {
          lifetimeEarned = lifetimeEarned.minus(amt);
          maturedCredits = maturedCredits.minus(amt);
        } else {
          lifetimeEarned = lifetimeEarned.plus(amt);
          maturedCredits = maturedCredits.plus(amt);
        }
      }
      if (e.type === WalletEntryType.REVERSAL && isActive) {
        if (e.direction === WalletDirection.DEBIT) {
          // Earning clawback
          lifetimeEarned = lifetimeEarned.minus(amt);
          maturedCredits = maturedCredits.minus(amt);
        } else if (e.payoutId) {
          // Audit-only for payout reverse when original debit is marked REVERSED
          // (funds return via unlocking the debit, not a second credit).
        } else {
          lifetimeEarned = lifetimeEarned.plus(amt);
          maturedCredits = maturedCredits.plus(amt);
        }
      }

      if (
        e.type === WalletEntryType.PAYOUT &&
        e.direction === WalletDirection.DEBIT &&
        isActive
      ) {
        lockingDebits = lockingDebits.plus(amt);
      }
    }

    const payouts = await client.driverPayout.findMany({
      where: { driverId, currency },
      select: { id: true, amount: true, status: true },
    });
    for (const p of payouts) {
      const amt = d(p.amount);
      if (p.status === DriverPayoutStatus.SUCCEEDED) {
        lifetimePaidOut = lifetimePaidOut.plus(amt);
      }
      if (p.status === DriverPayoutStatus.PROCESSING || p.status === DriverPayoutStatus.REQUESTED) {
        processingPayouts = processingPayouts.plus(amt);
      }
    }

    // Available = matured credits − active locking payout debits
    // (FAILED/REVERSED entries excluded via isActive)
    const available = maturedCredits.minus(lockingDebits);
    if (moneyIsNegative(available)) {
      this.logger.error(
        `Negative available computed for driver=${driverId} currency=${currency} available=${available.toFixed(2)}`,
      );
    }

    return {
      available,
      pending,
      processingPayouts,
      lifetimeEarned,
      lifetimePaidOut,
      nextAvailableAt,
      at,
    };
  }

  async getWalletForUser(userId: string) {
    const driver = await this.requireDriver(userId);
    const currency = this.walletCurrency();
    const balances = await this.computeBalances(driver.id, currency);
    const eligibility = await this.evaluateWithdrawEligibility(driver, balances.available);

    const recent = await this.prisma.driverWalletEntry.findMany({
      where: { driverId: driver.id, currency },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        ride: {
          select: {
            id: true,
            fromLabel: true,
            toLabel: true,
            updatedAt: true,
            status: true,
          },
        },
      },
    });

    return {
      currency,
      available: moneyToString(balances.available, currency),
      pending: moneyToString(balances.pending, currency),
      balance: moneyToString(
        balances.available.plus(balances.pending),
        currency,
      ),
      processingPayouts: moneyToString(balances.processingPayouts, currency),
      lifetimeEarned: moneyToString(balances.lifetimeEarned, currency),
      lifetimePaidOut: moneyToString(balances.lifetimePaidOut, currency),
      minimumWithdrawal: moneyToString(this.minWithdrawal(), currency),
      maximumWithdrawal: moneyToString(this.maxWithdrawal(), currency),
      canWithdraw: eligibility.ok,
      cannotWithdrawReason: eligibility.ok ? null : eligibility.code,
      payoutMethodConfigured: eligibility.payoutMethodConfigured,
      payoutMethodVerified: eligibility.payoutMethodVerified,
      nextAvailableAt: balances.nextAvailableAt?.toISOString() ?? null,
      recentEntries: recent.map((e) => this.serializeEntry(e)),
    };
  }

  async listEntriesForUser(
    userId: string,
    query: {
      cursor?: string;
      limit?: number;
      type?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const driver = await this.requireDriver(userId);
    const currency = this.walletCurrency();
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const where: Prisma.DriverWalletEntryWhereInput = {
      driverId: driver.id,
      currency,
    };
    if (query.type && Object.values(WalletEntryType).includes(query.type as WalletEntryType)) {
      where.type = query.type as WalletEntryType;
    }
    if (
      query.status &&
      Object.values(WalletEntryStatus).includes(query.status as WalletEntryStatus)
    ) {
      where.status = query.status as WalletEntryStatus;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
    if (query.cursor) {
      where.id = { lt: query.cursor };
    }

    const rows = await this.prisma.driverWalletEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        ride: {
          select: {
            id: true,
            fromLabel: true,
            toLabel: true,
            updatedAt: true,
            status: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map((e) => this.serializeEntry(e)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async withdrawForUser(
    userId: string,
    body: { amount: unknown; currency?: string },
    idempotencyKey: string | undefined,
    ip?: string,
  ) {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      this.walletError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    }
    const key = idempotencyKey.trim();
    const driver = await this.requireDriver(userId);
    const walletCurrency = this.walletCurrency();
    const reqCurrency = (body.currency ?? walletCurrency).toUpperCase();
    if (reqCurrency !== walletCurrency) {
      this.walletError('CURRENCY_MISMATCH', `Wallet currency is ${walletCurrency}`);
    }

    const amount = normalizeMoney(body.amount, walletCurrency);

    // Idempotent replay / conflict (outside lock first for fast path)
    const existing = await this.prisma.driverPayout.findUnique({
      where: {
        driverId_idempotencyKey: { driverId: driver.id, idempotencyKey: key },
      },
    });
    if (existing) {
      if (
        existing.currency !== walletCurrency ||
        !d(existing.amount).eq(amount)
      ) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Idempotency key was reused with a different amount or currency',
        });
      }
      return this.serializePayout(existing);
    }

    // TX1: lock, validate, reserve
    let payoutId: string;
    try {
      payoutId = await this.prisma.$transaction(async (tx) => {
        await this.lockDriver(tx, driver.id);
        const now = await this.dbNow(tx);

        const again = await tx.driverPayout.findUnique({
          where: {
            driverId_idempotencyKey: { driverId: driver.id, idempotencyKey: key },
          },
        });
        if (again) {
          if (
            again.currency !== walletCurrency ||
            !d(again.amount).eq(amount)
          ) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'Idempotency key was reused with a different amount or currency',
            });
          }
          return again.id;
        }

        const balances = await this.computeBalances(
          driver.id,
          walletCurrency,
          tx,
          now,
        );
        const eligibility = await this.evaluateWithdrawEligibility(
          driver,
          balances.available,
          amount,
          tx,
          now,
        );
        if (!eligibility.ok) {
          this.walletError(eligibility.code!, eligibility.message!);
        }

        const processingCount = await tx.driverPayout.count({
          where: {
            driverId: driver.id,
            status: {
              in: [DriverPayoutStatus.REQUESTED, DriverPayoutStatus.PROCESSING],
            },
          },
        });
        // Allow concurrent only if enough available after locks; still block stacked processing if desired
        if (processingCount > 0 && moneyLt(balances.available, amount)) {
          this.walletError(
            'PAYOUT_ALREADY_PROCESSING',
            'A payout is already processing',
          );
        }

        const payout = await tx.driverPayout.create({
          data: {
            driverId: driver.id,
            amount,
            currency: walletCurrency,
            status: DriverPayoutStatus.PROCESSING,
            idempotencyKey: key,
            provider: this.payoutProvider.name,
            requestedAt: now,
          },
        });

        const debit = await tx.driverWalletEntry.create({
          data: {
            driverId: driver.id,
            type: WalletEntryType.PAYOUT,
            direction: WalletDirection.DEBIT,
            amount,
            currency: walletCurrency,
            status: WalletEntryStatus.PENDING,
            payoutId: payout.id,
            description: 'Withdrawal reserved',
            availableAt: null,
          },
        });

        await tx.driverPayout.update({
          where: { id: payout.id },
          data: { ledgerEntryId: debit.id },
        });

        await this.audit(
          userId,
          'WALLET_PAYOUT_REQUESTED',
          'DriverPayout',
          payout.id,
          {
            amount: moneyToString(amount, walletCurrency),
            currency: walletCurrency,
            ledgerEntryId: debit.id,
            ip,
          },
          tx,
        );
        await this.audit(
          userId,
          'WALLET_PAYOUT_PROCESSING',
          'DriverPayout',
          payout.id,
          { ledgerEntryId: debit.id },
          tx,
        );

        return payout.id;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.prisma.driverPayout.findUnique({
          where: {
            driverId_idempotencyKey: { driverId: driver.id, idempotencyKey: key },
          },
        });
        if (raced) {
          if (
            raced.currency !== walletCurrency ||
            !d(raced.amount).eq(amount)
          ) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_CONFLICT',
              message:
                'Idempotency key was reused with a different amount or currency',
            });
          }
          return this.serializePayout(raced);
        }
      }
      throw err;
    }

    const payout = await this.prisma.driverPayout.findUniqueOrThrow({
      where: { id: payoutId },
    });

    // If we returned an existing payout from inside TX, skip provider if already terminal
    if (
      payout.status === DriverPayoutStatus.SUCCEEDED ||
      payout.status === DriverPayoutStatus.FAILED ||
      payout.status === DriverPayoutStatus.REVERSED
    ) {
      return this.serializePayout(payout);
    }

    // Notify requested (best-effort)
    void this.notifications.sendToUser({
      userId,
      title: 'Withdrawal requested',
      body: `${moneyToString(d(payout.amount), payout.currency)} ${payout.currency} withdrawal is processing`,
      templateKey: 'wallet.payout_requested',
      eventId: `wallet.payout.requested.${payout.id}`,
      data: {
        type: 'wallet.payout',
        payoutId: payout.id,
        status: payout.status,
        deepLink: '/wallet',
      },
    });

    // Provider call OUTSIDE DB transaction
    await this.executeProviderPayout(payout.id);

    const final = await this.prisma.driverPayout.findUniqueOrThrow({
      where: { id: payoutId },
    });
    return this.serializePayout(final);
  }

  /**
   * Call payout provider. On confirmed failure → release. On timeout/unknown → keep PROCESSING.
   */
  async executeProviderPayout(payoutId: string) {
    const payout = await this.prisma.driverPayout.findUnique({
      where: { id: payoutId },
      include: { driver: true },
    });
    if (!payout || payout.status !== DriverPayoutStatus.PROCESSING) return;

    const prefs = this.parsePayout(payout.driver.payoutSettingsJson);
    try {
      const beneficiary = await this.payoutProvider.ensureBeneficiary(
        payout.driverId,
        prefs as Record<string, unknown>,
      );
      const result = await this.payoutProvider.createPayout([
        {
          driverId: payout.driverId,
          amount: moneyToProviderNumber(d(payout.amount), payout.currency),
          currency: payout.currency,
          reference: beneficiary.beneficiaryId,
        },
      ]);

      const status = (result.status || '').toLowerCase();
      if (status === 'failed' || status === 'error') {
        await this.markPayoutFailed(
          payout.id,
          'PROVIDER_FAILED',
          `Provider returned ${result.status}`,
          result.batchId,
        );
        return;
      }

      // Dev provider returns succeeded; Stripe returns submitted — treat both as success for sync path,
      // webhook may still refine. "submitted"/"succeeded"/"ok" finalize; unknown keeps PROCESSING.
      if (
        status === 'succeeded' ||
        status === 'submitted' ||
        status === 'ok' ||
        status === 'paid'
      ) {
        await this.markPayoutSucceeded(payout.id, {
          providerBatchId: result.batchId,
          providerPayoutId: result.batchId,
          providerStatus: result.status,
        });
        return;
      }

      // Uncertain status — keep locked
      await this.prisma.driverPayout.update({
        where: { id: payout.id },
        data: {
          providerBatchId: result.batchId,
          providerStatus: result.status,
          correlationRef: result.batchId,
        },
      });
      this.logger.warn(
        `Payout ${payout.id} left PROCESSING with uncertain provider status=${result.status}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout =
        /timeout|ETIMEDOUT|ECONNRESET|network|aborted/i.test(msg) ||
        (err as { name?: string })?.name === 'AbortError';

      if (isTimeout) {
        // Keep PROCESSING + funds locked; reconcile later
        await this.prisma.driverPayout.update({
          where: { id: payout.id },
          data: {
            providerStatus: 'uncertain_timeout',
            failureReason: msg.slice(0, 500),
          },
        });
        await this.audit(undefined, 'WALLET_PAYOUT_UNCERTAIN', 'DriverPayout', payout.id, {
          reason: msg.slice(0, 500),
        });
        this.logger.error(
          `Payout ${payout.id} provider timeout/uncertain — funds remain locked`,
        );
        return;
      }

      // Confirmed provider failure (e.g. Stripe returned error body)
      await this.markPayoutFailed(payout.id, 'PROVIDER_ERROR', msg.slice(0, 500));
    }
  }

  async markPayoutSucceeded(
    payoutId: string,
    refs?: {
      providerBatchId?: string;
      providerPayoutId?: string;
      providerStatus?: string;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const payout = await tx.driverPayout.findUnique({ where: { id: payoutId } });
      if (!payout) return;
      if (payout.status === DriverPayoutStatus.SUCCEEDED) return;
      this.assertPayoutTransition(payout.status, DriverPayoutStatus.SUCCEEDED);

      const now = await this.dbNow(tx);
      await tx.driverPayout.update({
        where: { id: payoutId },
        data: {
          status: DriverPayoutStatus.SUCCEEDED,
          processedAt: now,
          providerBatchId: refs?.providerBatchId ?? payout.providerBatchId,
          providerPayoutId: refs?.providerPayoutId ?? payout.providerPayoutId,
          providerStatus: refs?.providerStatus ?? payout.providerStatus,
        },
      });
      if (payout.ledgerEntryId) {
        await tx.driverWalletEntry.update({
          where: { id: payout.ledgerEntryId },
          data: {
            status: WalletEntryStatus.POSTED,
            description: 'Withdrawal completed',
          },
        });
      }
      await this.audit(undefined, 'WALLET_PAYOUT_SUCCEEDED', 'DriverPayout', payoutId, {
        amount: moneyToString(d(payout.amount), payout.currency),
      }, tx);
    });

    const payout = await this.prisma.driverPayout.findUnique({
      where: { id: payoutId },
      include: { driver: true },
    });
    if (payout?.driver?.userId) {
      void this.notifications.sendToUser({
        userId: payout.driver.userId,
        title: 'Withdrawal succeeded',
        body: `${moneyToString(d(payout.amount), payout.currency)} ${payout.currency} paid out`,
        templateKey: 'wallet.payout_succeeded',
        eventId: `wallet.payout.succeeded.${payout.id}`,
        data: {
          type: 'wallet.payout',
          payoutId: payout.id,
          status: 'SUCCEEDED',
          deepLink: '/wallet',
        },
      });
    }
  }

  async markPayoutFailed(
    payoutId: string,
    failureCode: string,
    failureReason: string,
    providerBatchId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const payout = await tx.driverPayout.findUnique({ where: { id: payoutId } });
      if (!payout) return;
      if (payout.status === DriverPayoutStatus.FAILED) return;
      if (payout.status === DriverPayoutStatus.SUCCEEDED) {
        throw new BadRequestException('Cannot fail a succeeded payout without reverse');
      }
      this.assertPayoutTransition(payout.status, DriverPayoutStatus.FAILED);

      const now = await this.dbNow(tx);
      await tx.driverPayout.update({
        where: { id: payoutId },
        data: {
          status: DriverPayoutStatus.FAILED,
          processedAt: now,
          failureCode,
          failureReason,
          providerBatchId: providerBatchId ?? payout.providerBatchId,
          providerStatus: 'failed',
        },
      });

      if (payout.ledgerEntryId) {
        const debit = await tx.driverWalletEntry.findUnique({
          where: { id: payout.ledgerEntryId },
        });
        if (debit && debit.status !== WalletEntryStatus.FAILED) {
          // Mark reservation failed so it no longer locks funds (do not add a credit —
          // that would double-release). Amount row stays immutable.
          await tx.driverWalletEntry.update({
            where: { id: debit.id },
            data: {
              status: WalletEntryStatus.FAILED,
              description: 'Withdrawal failed — funds released',
            },
          });
        }
      }

      await this.audit(undefined, 'WALLET_PAYOUT_FAILED', 'DriverPayout', payoutId, {
        failureCode,
        failureReason,
      }, tx);
    });

    const payout = await this.prisma.driverPayout.findUnique({
      where: { id: payoutId },
      include: { driver: true },
    });
    if (payout?.driver?.userId) {
      void this.notifications.sendToUser({
        userId: payout.driver.userId,
        title: 'Withdrawal failed',
        body: 'Your withdrawal could not be completed. Funds are available again.',
        templateKey: 'wallet.payout_failed',
        eventId: `wallet.payout.failed.${payout.id}`,
        data: {
          type: 'wallet.payout',
          payoutId: payout.id,
          status: 'FAILED',
          deepLink: '/wallet',
        },
      });
    }
  }

  async markPayoutReversed(payoutId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const payout = await tx.driverPayout.findUnique({ where: { id: payoutId } });
      if (!payout) return;
      if (payout.status === DriverPayoutStatus.REVERSED) return;
      this.assertPayoutTransition(payout.status, DriverPayoutStatus.REVERSED);

      await tx.driverPayout.update({
        where: { id: payoutId },
        data: {
          status: DriverPayoutStatus.REVERSED,
          failureReason: reason,
          providerStatus: 'reversed',
        },
      });

      if (payout.ledgerEntryId) {
        const debit = await tx.driverWalletEntry.findUnique({
          where: { id: payout.ledgerEntryId },
        });
        if (debit) {
          // Stop locking the original debit, then add audit CREDIT for restore
          await tx.driverWalletEntry.update({
            where: { id: debit.id },
            data: { status: WalletEntryStatus.REVERSED },
          });
          await tx.driverWalletEntry.create({
            data: {
              driverId: payout.driverId,
              type: WalletEntryType.REVERSAL,
              direction: WalletDirection.CREDIT,
              amount: debit.amount,
              currency: debit.currency,
              status: WalletEntryStatus.POSTED,
              payoutId: payout.id,
              relatedEntryId: debit.id,
              description: 'Payout reversed',
              availableAt: null,
            },
          });
        }
      }

      await this.audit(undefined, 'WALLET_PAYOUT_REVERSED', 'DriverPayout', payoutId, {
        reason,
      }, tx);
    });
  }

  private assertPayoutTransition(from: DriverPayoutStatus, to: DriverPayoutStatus) {
    const allowed: Record<DriverPayoutStatus, DriverPayoutStatus[]> = {
      [DriverPayoutStatus.REQUESTED]: [
        DriverPayoutStatus.PROCESSING,
        DriverPayoutStatus.FAILED,
        DriverPayoutStatus.HELD,
      ],
      [DriverPayoutStatus.HELD]: [
        DriverPayoutStatus.PROCESSING,
        DriverPayoutStatus.REQUESTED,
        DriverPayoutStatus.FAILED,
      ],
      [DriverPayoutStatus.PROCESSING]: [
        DriverPayoutStatus.SUCCEEDED,
        DriverPayoutStatus.FAILED,
      ],
      [DriverPayoutStatus.SUCCEEDED]: [DriverPayoutStatus.REVERSED],
      [DriverPayoutStatus.FAILED]: [],
      [DriverPayoutStatus.REVERSED]: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Illegal payout transition ${from} → ${to}`);
    }
  }

  /** Idempotent webhook/event reconciliation. */
  async reconcilePayoutEvent(input: {
    provider: string;
    eventId: string;
    type: string;
    providerPayoutId?: string;
    payoutId?: string;
    raw: unknown;
  }) {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: {
        provider_eventId: {
          provider: input.provider,
          eventId: input.eventId,
        },
      },
    });
    if (existing?.processedAt) {
      return { ok: true, duplicate: true };
    }

    await this.prisma.webhookEvent.upsert({
      where: {
        provider_eventId: {
          provider: input.provider,
          eventId: input.eventId,
        },
      },
      create: {
        provider: input.provider,
        eventId: input.eventId,
        payload: input.raw as Prisma.InputJsonValue,
      },
      update: {},
    });

    const payout =
      (input.payoutId
        ? await this.prisma.driverPayout.findUnique({ where: { id: input.payoutId } })
        : null) ??
      (input.providerPayoutId
        ? await this.prisma.driverPayout.findFirst({
            where: {
              OR: [
                { providerPayoutId: input.providerPayoutId },
                { providerBatchId: input.providerPayoutId },
                { correlationRef: input.providerPayoutId },
              ],
            },
          })
        : null);

    if (!payout) {
      await this.prisma.webhookEvent.update({
        where: {
          provider_eventId: {
            provider: input.provider,
            eventId: input.eventId,
          },
        },
        data: { processedAt: new Date() },
      });
      return { ok: false, reason: 'payout_not_found' };
    }

    const t = input.type.toLowerCase();
    if (t.includes('succeed') || t.includes('paid') || t.includes('transfer.created')) {
      await this.markPayoutSucceeded(payout.id, {
        providerPayoutId: input.providerPayoutId,
        providerStatus: input.type,
      });
    } else if (t.includes('fail') || t.includes('cancel')) {
      await this.markPayoutFailed(
        payout.id,
        'PROVIDER_WEBHOOK_FAILED',
        input.type,
      );
    } else if (t.includes('revers')) {
      await this.markPayoutReversed(payout.id, input.type);
    }

    await this.prisma.webhookEvent.update({
      where: {
        provider_eventId: {
          provider: input.provider,
          eventId: input.eventId,
        },
      },
      data: { processedAt: new Date() },
    });

    return { ok: true, payoutId: payout.id };
  }

  /** Repair job: missing earnings + integrity anomalies + stuck PROCESSING. */
  async runReconciliation() {
    const currency = this.walletCurrency();
    const completed = await this.prisma.ride.findMany({
      where: {
        status: RideStatus.COMPLETED,
        assignedDriverId: { not: null },
        currency,
      },
      select: { id: true },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });

    let credited = 0;
    for (const r of completed) {
      const result = await this.creditEarningForCompletedRide(r.id);
      if (result.created) credited += 1;
    }

    // Notify newly matured earnings (PENDING → conceptually available)
    const now = await this.dbNow();
    const matured = await this.prisma.driverWalletEntry.findMany({
      where: {
        type: WalletEntryType.EARNING,
        status: WalletEntryStatus.PENDING,
        availableAt: { lte: now },
      },
      take: 100,
      include: { driver: true },
    });
    for (const e of matured) {
      await this.prisma.driverWalletEntry.update({
        where: { id: e.id },
        data: { status: WalletEntryStatus.POSTED },
      });
      if (e.driver.userId) {
        void this.notifications.sendToUser({
          userId: e.driver.userId,
          title: 'Earnings available',
          body: `${moneyToString(d(e.amount), e.currency)} ${e.currency} is now available to withdraw`,
          templateKey: 'wallet.earning_available',
          eventId: `wallet.earning.available.${e.id}`,
          data: {
            type: 'wallet.earning',
            entryId: e.id,
            deepLink: '/wallet',
          },
        });
      }
    }

    const drivers = await this.prisma.driverProfile.findMany({
      where: { payouts: { some: {} } },
      select: { id: true },
      take: 100,
    });
    let anomalies = 0;
    for (const dr of drivers) {
      const report = await this.assertWalletIntegrity(dr.id);
      if (!report.ok) {
        anomalies += 1;
        await this.audit(undefined, 'WALLET_INTEGRITY_ANOMALY', 'DriverProfile', dr.id, {
          issues: report.issues,
        });
      }
    }

    return { credited, matured: matured.length, anomalies };
  }

  /** Admin: list wallet ledger entries with filters. */
  async adminListEntries(query: {
    status?: string;
    type?: string;
    driverId?: string;
    holdOnly?: boolean;
    cursor?: string;
    limit?: number;
  }) {
    const currency = this.walletCurrency();
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const now = await this.dbNow();
    const where: Prisma.DriverWalletEntryWhereInput = { currency };

    if (query.driverId) where.driverId = query.driverId;
    if (
      query.type &&
      Object.values(WalletEntryType).includes(query.type as WalletEntryType)
    ) {
      where.type = query.type as WalletEntryType;
    }
    if (
      query.status &&
      Object.values(WalletEntryStatus).includes(query.status as WalletEntryStatus)
    ) {
      where.status = query.status as WalletEntryStatus;
    }
    if (query.holdOnly) {
      where.type = WalletEntryType.EARNING;
      where.direction = WalletDirection.CREDIT;
      where.status = {
        in: [WalletEntryStatus.PENDING, WalletEntryStatus.POSTED],
      };
      where.availableAt = { gt: now };
    }
    if (query.cursor) {
      where.id = { lt: query.cursor };
    }

    const rows = await this.prisma.driverWalletEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        driver: {
          select: {
            id: true,
            fullName: true,
            userId: true,
            user: { select: { email: true, phoneE164: true } },
          },
        },
        ride: {
          select: {
            id: true,
            fromLabel: true,
            toLabel: true,
            updatedAt: true,
            status: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map((e) => ({
        ...this.serializeEntry(e),
        reason: e.reason,
        adminUserId: e.adminUserId,
        driver: {
          id: e.driver.id,
          userId: e.driver.userId,
          fullName: e.driver.fullName,
          email: e.driver.user.email,
          phoneE164: e.driver.user.phoneE164,
        },
        onHold:
          e.type === WalletEntryType.EARNING &&
          e.direction === WalletDirection.CREDIT &&
          (e.status === WalletEntryStatus.PENDING ||
            e.status === WalletEntryStatus.POSTED) &&
          !!e.availableAt &&
          e.availableAt > now,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  /** Admin: wallet summary + recent entries for a driver profile id. */
  async adminGetDriverWallet(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: {
        user: { select: { id: true, email: true, phoneE164: true } },
      },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const currency = this.walletCurrency();
    const balances = await this.computeBalances(driver.id, currency);
    const entries = await this.adminListEntries({
      driverId: driver.id,
      limit: 50,
    });

    return {
      driver: {
        id: driver.id,
        userId: driver.userId,
        fullName: driver.fullName,
        email: driver.user.email,
        phoneE164: driver.user.phoneE164,
        approvalStatus: driver.approvalStatus,
        isActivated: driver.isActivated,
      },
      currency,
      available: moneyToString(balances.available, currency),
      pending: moneyToString(balances.pending, currency),
      balance: moneyToString(
        balances.available.plus(balances.pending),
        currency,
      ),
      processingPayouts: moneyToString(balances.processingPayouts, currency),
      lifetimeEarned: moneyToString(balances.lifetimeEarned, currency),
      lifetimePaidOut: moneyToString(balances.lifetimePaidOut, currency),
      nextAvailableAt: balances.nextAvailableAt?.toISOString() ?? null,
      entries: entries.items,
      nextCursor: entries.nextCursor,
    };
  }

  /**
   * Admin Release Now: make a held earning immediately available.
   * Idempotent if already matured.
   */
  async adminReleaseEntry(
    entryId: string,
    adminUserId: string,
    reason: string,
  ) {
    const reasonTrim = reason.trim();
    if (reasonTrim.length < 3) {
      throw new BadRequestException('Reason is required');
    }

    const entry = await this.prisma.driverWalletEntry.findUnique({
      where: { id: entryId },
      include: { driver: true },
    });
    if (!entry) throw new NotFoundException('Wallet entry not found');

    if (
      entry.type !== WalletEntryType.EARNING ||
      entry.direction !== WalletDirection.CREDIT
    ) {
      throw new BadRequestException('Only earning credits can be released');
    }
    if (
      entry.status === WalletEntryStatus.FAILED ||
      entry.status === WalletEntryStatus.REVERSED
    ) {
      throw new BadRequestException('Cannot release a failed or reversed entry');
    }

    const now = await this.dbNow();
    const alreadyAvailable =
      !entry.availableAt || entry.availableAt <= now;

    if (alreadyAvailable && entry.status === WalletEntryStatus.POSTED) {
      return {
        ok: true,
        released: false,
        entry: this.serializeEntry(entry),
        message: 'Already available',
      };
    }

    const previousAvailableAt = entry.availableAt;
    const updated = await this.prisma.driverWalletEntry.update({
      where: { id: entry.id },
      data: {
        availableAt: now,
        status: WalletEntryStatus.POSTED,
        reason: reasonTrim,
        adminUserId,
        metaJson: {
          ...(entry.metaJson && typeof entry.metaJson === 'object'
            ? (entry.metaJson as Record<string, unknown>)
            : {}),
          holdReleasedAt: now.toISOString(),
          holdReleasedBy: adminUserId,
          previousAvailableAt: previousAvailableAt?.toISOString() ?? null,
          releaseReason: reasonTrim,
        } as Prisma.InputJsonValue,
      },
      include: {
        ride: {
          select: {
            id: true,
            fromLabel: true,
            toLabel: true,
            updatedAt: true,
            status: true,
          },
        },
      },
    });

    await this.audit(adminUserId, 'WALLET_HOLD_RELEASED', 'DriverWalletEntry', entry.id, {
      driverId: entry.driverId,
      amount: moneyToString(d(entry.amount), entry.currency),
      currency: entry.currency,
      previousAvailableAt: previousAvailableAt?.toISOString() ?? null,
      reason: reasonTrim,
    });

    void this.notifications.sendToUser({
      userId: entry.driver.userId,
      title: 'Earnings available',
      body: `${moneyToString(d(entry.amount), entry.currency)} ${entry.currency} is now available to withdraw`,
      templateKey: 'wallet.earning_available',
      eventId: `wallet.earning.admin_release.${entry.id}.${now.getTime()}`,
      data: {
        type: 'wallet.earning',
        entryId: entry.id,
        deepLink: '/wallet',
      },
    });

    return {
      ok: true,
      released: true,
      entry: this.serializeEntry(updated),
    };
  }

  async adminReleaseEntries(
    entryIds: string[],
    adminUserId: string,
    reason: string,
  ) {
    const results: Array<{ entryId: string; ok: boolean; released?: boolean; error?: string }> =
      [];
    for (const id of entryIds) {
      try {
        const r = await this.adminReleaseEntry(id, adminUserId, reason);
        results.push({ entryId: id, ok: true, released: r.released });
      } catch (err) {
        results.push({
          entryId: id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      released: results.filter((r) => r.ok && r.released).length,
      skipped: results.filter((r) => r.ok && !r.released).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async adminReleaseAllPendingForDriver(
    driverId: string,
    adminUserId: string,
    reason: string,
  ) {
    const now = await this.dbNow();
    const held = await this.prisma.driverWalletEntry.findMany({
      where: {
        driverId,
        type: WalletEntryType.EARNING,
        direction: WalletDirection.CREDIT,
        status: {
          in: [WalletEntryStatus.PENDING, WalletEntryStatus.POSTED],
        },
        availableAt: { gt: now },
      },
      select: { id: true },
      take: 200,
    });
    return this.adminReleaseEntries(
      held.map((e) => e.id),
      adminUserId,
      reason,
    );
  }

  /** Admin manual credit/debit adjustment. */
  async adminAdjustBalance(
    driverId: string,
    adminUserId: string,
    body: { amount: string; direction: 'CREDIT' | 'DEBIT'; reason: string; currency?: string },
  ) {
    const reasonTrim = body.reason.trim();
    if (reasonTrim.length < 3) {
      throw new BadRequestException('Reason is required');
    }

    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const currency = (body.currency ?? this.walletCurrency()).toUpperCase();
    if (currency !== this.walletCurrency()) {
      throw new BadRequestException('Currency mismatch');
    }

    let amount: Decimal;
    try {
      amount = normalizeMoney(body.amount, currency);
    } catch {
      throw new BadRequestException('Invalid amount');
    }
    if (moneyLt(amount, normalizeMoney('0.01', currency))) {
      throw new BadRequestException('Amount must be at least 0.01');
    }

    const direction =
      body.direction === 'DEBIT'
        ? WalletDirection.DEBIT
        : WalletDirection.CREDIT;

    if (direction === WalletDirection.DEBIT) {
      const balances = await this.computeBalances(driver.id, currency);
      if (moneyLt(balances.available, amount)) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient available balance for debit adjustment',
        });
      }
    }

    const entry = await this.prisma.driverWalletEntry.create({
      data: {
        driverId: driver.id,
        type: WalletEntryType.ADJUSTMENT,
        direction,
        amount,
        currency,
        status: WalletEntryStatus.POSTED,
        availableAt: null,
        description: `Admin adjustment · ${reasonTrim}`,
        reason: reasonTrim,
        adminUserId,
        metaJson: {
          adjustedBy: adminUserId,
          adjustedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    await this.audit(adminUserId, 'WALLET_ADJUSTMENT', 'DriverWalletEntry', entry.id, {
      driverId: driver.id,
      direction,
      amount: moneyToString(amount, currency),
      currency,
      reason: reasonTrim,
    });

    void this.notifications.sendToUser({
      userId: driver.userId,
      title: 'Wallet updated',
      body:
        direction === WalletDirection.CREDIT
          ? `${moneyToString(amount, currency)} ${currency} credited to your wallet`
          : `${moneyToString(amount, currency)} ${currency} deducted from your wallet`,
      templateKey: 'wallet.adjustment',
      eventId: `wallet.adjustment.${entry.id}`,
      data: {
        type: 'wallet.adjustment',
        entryId: entry.id,
        deepLink: '/wallet',
      },
    });

    const summary = await this.adminGetDriverWallet(driver.id);
    return {
      ok: true,
      entry: this.serializeEntry(entry),
      wallet: summary,
    };
  }

  async assertWalletIntegrity(driverId: string) {
    const currency = this.walletCurrency();
    const issues: string[] = [];
    const balances = await this.computeBalances(driverId, currency);
    if (moneyIsNegative(balances.available)) {
      issues.push(`available_negative:${balances.available.toFixed(2)}`);
    }

    const payouts = await this.prisma.driverPayout.findMany({
      where: { driverId, currency },
      include: { ledgerEntry: true },
    });
    for (const p of payouts) {
      if (!p.ledgerEntryId || !p.ledgerEntry) {
        issues.push(`payout_missing_ledger:${p.id}`);
      }
      if (p.currency !== currency) {
        issues.push(`payout_currency_mismatch:${p.id}`);
      }
      if (p.status === DriverPayoutStatus.SUCCEEDED) {
        if (p.ledgerEntry?.status !== WalletEntryStatus.POSTED) {
          issues.push(`succeeded_debit_not_posted:${p.id}`);
        }
      }
      if (p.status === DriverPayoutStatus.FAILED) {
        if (
          p.ledgerEntry &&
          (p.ledgerEntry.status === WalletEntryStatus.PENDING ||
            p.ledgerEntry.status === WalletEntryStatus.POSTED)
        ) {
          // Failed should not keep locking — PENDING/POSTED debit still locks
          issues.push(`failed_still_locking:${p.id}`);
        }
      }
      if (p.status === DriverPayoutStatus.REVERSED) {
        const rev = await this.prisma.driverWalletEntry.findFirst({
          where: {
            payoutId: p.id,
            type: WalletEntryType.REVERSAL,
            direction: WalletDirection.CREDIT,
          },
        });
        if (!rev) issues.push(`reversed_missing_credit:${p.id}`);
      }
      if (d(p.amount).lte(0)) {
        issues.push(`payout_non_positive:${p.id}`);
      }
    }

    const earnings = await this.prisma.driverWalletEntry.groupBy({
      by: ['rideId'],
      where: {
        driverId,
        type: WalletEntryType.EARNING,
        rideId: { not: null },
      },
      _count: true,
    });
    for (const g of earnings) {
      if (g._count > 1) {
        issues.push(`duplicate_earning_ride:${g.rideId}`);
      }
    }

    const entries = await this.prisma.driverWalletEntry.findMany({
      where: { driverId },
      select: { id: true, amount: true, currency: true, direction: true },
    });
    for (const e of entries) {
      if (d(e.amount).lte(0)) issues.push(`entry_non_positive:${e.id}`);
      if (e.currency !== currency && e.currency) {
        // multi-currency ready: only flag if mixing into CAD wallet ops
      }
    }

    return { ok: issues.length === 0, issues };
  }

  private async evaluateWithdrawEligibility(
    driver: {
      id: string;
      approvalStatus: DriverApprovalStatus;
      isActivated: boolean;
      payoutSettingsJson: unknown;
      userId: string;
    },
    available: Decimal,
    amount?: Decimal,
    tx?: Tx,
    now?: Date,
  ): Promise<{
    ok: boolean;
    code?: WalletErrorCode;
    message?: string;
    payoutMethodConfigured: boolean;
    payoutMethodVerified: boolean;
  }> {
    const user = await (tx ?? this.prisma).user.findUnique({
      where: { id: driver.userId },
      select: { isSuspended: true },
    });
    if (user?.isSuspended) {
      return {
        ok: false,
        code: 'DRIVER_NOT_ELIGIBLE',
        message: 'Driver account is suspended',
        payoutMethodConfigured: false,
        payoutMethodVerified: false,
      };
    }
    if (
      !driver.isActivated ||
      driver.approvalStatus === DriverApprovalStatus.SUSPENDED ||
      driver.approvalStatus === DriverApprovalStatus.REJECTED ||
      driver.approvalStatus === DriverApprovalStatus.PENDING_KYC
    ) {
      return {
        ok: false,
        code: 'DRIVER_NOT_ELIGIBLE',
        message: 'Driver is not eligible for payouts',
        payoutMethodConfigured: false,
        payoutMethodVerified: false,
      };
    }

    const payout = this.parsePayout(driver.payoutSettingsJson);
    const configured = !!(
      payout.payoutMethod &&
      payout.outpaymentCurrency &&
      payout.bankCountry
    );
    const verified =
      payout.status === 'CONFIGURED' ||
      payout.status === 'VERIFIED' ||
      (configured && payout.status !== 'NOT_CONFIGURED');

    // After save, status is PENDING — treat configured+PENDING as not verified for withdraw
    const payoutMethodVerified =
      payout.status === 'CONFIGURED' || payout.status === 'VERIFIED';
    const payoutMethodConfigured = configured;

    if (!payoutMethodConfigured) {
      return {
        ok: false,
        code: 'PAYOUT_METHOD_REQUIRED',
        message: 'Configure payout method before withdrawing',
        payoutMethodConfigured,
        payoutMethodVerified: false,
      };
    }
    if (!payoutMethodVerified) {
      return {
        ok: false,
        code: 'PAYOUT_METHOD_NOT_VERIFIED',
        message: 'Payout method is not verified',
        payoutMethodConfigured,
        payoutMethodVerified: false,
      };
    }

    if (amount) {
      const min = this.minWithdrawal();
      const max = this.maxWithdrawal();
      if (moneyLt(amount, min)) {
        return {
          ok: false,
          code: 'BELOW_MINIMUM_WITHDRAWAL',
          message: `Minimum withdrawal is ${moneyToString(min, this.walletCurrency())}`,
          payoutMethodConfigured,
          payoutMethodVerified,
        };
      }
      if (d(amount).gt(max)) {
        return {
          ok: false,
          code: 'ABOVE_MAXIMUM_WITHDRAWAL',
          message: `Maximum withdrawal is ${moneyToString(max, this.walletCurrency())}`,
          payoutMethodConfigured,
          payoutMethodVerified,
        };
      }
      if (moneyLt(available, amount)) {
        return {
          ok: false,
          code: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient available balance',
          payoutMethodConfigured,
          payoutMethodVerified,
        };
      }

      const daily = this.dailyLimit();
      if (daily) {
        const at = now ?? (await this.dbNow(tx));
        const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
        const daySum = await (tx ?? this.prisma).driverPayout.aggregate({
          where: {
            driverId: driver.id,
            requestedAt: { gte: start },
            status: {
              in: [
                DriverPayoutStatus.REQUESTED,
                DriverPayoutStatus.PROCESSING,
                DriverPayoutStatus.SUCCEEDED,
              ],
            },
          },
          _sum: { amount: true },
        });
        const used = d(daySum._sum.amount ?? 0);
        if (moneyLt(daily, used.plus(amount))) {
          return {
            ok: false,
            code: 'DAILY_LIMIT_EXCEEDED',
            message: 'Daily withdrawal limit exceeded',
            payoutMethodConfigured,
            payoutMethodVerified,
          };
        }
      }
    } else {
      // Summary canWithdraw: need available >= min
      if (moneyLt(available, this.minWithdrawal())) {
        return {
          ok: false,
          code: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient available balance',
          payoutMethodConfigured,
          payoutMethodVerified,
        };
      }
    }

    return {
      ok: true,
      payoutMethodConfigured,
      payoutMethodVerified,
    };
  }

  private serializeEntry(e: {
    id: string;
    type: WalletEntryType;
    direction: WalletDirection;
    amount: Prisma.Decimal;
    currency: string;
    status: WalletEntryStatus;
    description: string;
    rideId: string | null;
    payoutId: string | null;
    availableAt: Date | null;
    createdAt: Date;
    ride?: {
      id: string;
      fromLabel: string;
      toLabel: string | null;
      updatedAt: Date;
      status: RideStatus;
    } | null;
  }) {
    return {
      id: e.id,
      type: e.type,
      direction: e.direction,
      amount: moneyToString(d(e.amount), e.currency),
      currency: e.currency,
      status: e.status,
      description: e.description,
      rideId: e.rideId,
      payoutId: e.payoutId,
      availableAt: e.availableAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      ride: e.ride
        ? {
            bookingRef: e.ride.id,
            completedAt: e.ride.updatedAt.toISOString(),
            pickupSummary: e.ride.fromLabel,
            dropoffSummary: e.ride.toLabel,
          }
        : null,
    };
  }

  private serializePayout(p: {
    id: string;
    amount: Prisma.Decimal;
    currency: string;
    status: DriverPayoutStatus;
    idempotencyKey: string;
    requestedAt: Date;
    processedAt: Date | null;
    provider: string;
    providerBatchId: string | null;
    providerPayoutId: string | null;
    providerStatus: string | null;
    failureCode: string | null;
    failureReason: string | null;
    ledgerEntryId: string | null;
  }) {
    return {
      id: p.id,
      amount: moneyToString(d(p.amount), p.currency),
      currency: p.currency,
      status: p.status,
      idempotencyKey: p.idempotencyKey,
      requestedAt: p.requestedAt.toISOString(),
      processedAt: p.processedAt?.toISOString() ?? null,
      provider: p.provider,
      providerBatchId: p.providerBatchId,
      providerPayoutId: p.providerPayoutId,
      providerStatus: p.providerStatus,
      failureCode: p.failureCode,
      failureReason: p.failureReason,
      ledgerEntryId: p.ledgerEntryId,
    };
  }

  private async requireDriver(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!driver) throw new ForbiddenException('Driver profile required');
    return driver;
  }

  private async audit(
    actorId: string | undefined,
    action: string,
    resource: string,
    resourceId: string,
    meta: Record<string, unknown>,
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action,
        resource,
        resourceId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
