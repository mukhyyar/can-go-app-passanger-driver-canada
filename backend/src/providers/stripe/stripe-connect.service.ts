import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly stripe: Stripe | null = null;
  private readonly secretKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('stripe.secretKey');
    if (this.secretKey) {
      this.stripe = new Stripe(this.secretKey, {
        apiVersion: '2025-02-24.acacia' as any,
        appInfo: {
          name: 'CAN-RIDE Marketplace',
          version: '1.0.0',
        },
      });
    }
  }

  isConfigured(): boolean {
    return !!this.stripe;
  }

  private getClient(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('STRIPE_SECRET_KEY is not configured');
    }
    return this.stripe;
  }

  /**
   * Creates an Express Connected Account for a Canadian driver/transport provider.
   */
  async createDriverExpressAccount(
    driverId: string,
    email: string,
    opts?: { isIndividual?: boolean },
  ): Promise<string> {
    const stripe = this.getClient();
    const businessType =
      opts?.isIndividual === false ? 'company' : 'individual';
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'CA',
      email: email || undefined,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: businessType,
      metadata: {
        driverId,
        platform: 'CAN_RIDE',
      },
      settings: {
        payouts: {
          schedule: {
            // Connected Express account pays out transferred funds to the driver's bank;
            // CAN-RIDE platform controls hold timing before executing the Stripe Transfer.
            interval: 'daily',
          },
        },
      },
    });
    this.logger.log(`Created Stripe Express account ${account.id} for driver ${driverId} (${businessType})`);
    return account.id;
  }

  /**
   * Generates a hosted onboarding link for the driver.
   */
  async createAccountOnboardingLink(
    accountId: string,
    returnUrl?: string,
    refreshUrl?: string,
  ): Promise<string> {
    const stripe = this.getClient();
    const appBase =
      (this.config.get<string>('admin.passengerWebBase') || 'https://www.can-rides.ca').replace(/\/+$/, '');
    const defaultReturn =
      this.config.get<string>('stripe.connectReturnUrl') ||
      `${appBase}/stripe/return?accountId=${encodeURIComponent(accountId)}`;
    const defaultRefresh =
      this.config.get<string>('stripe.connectRefreshUrl') ||
      `${appBase}/stripe/refresh?accountId=${encodeURIComponent(accountId)}`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl || defaultRefresh,
      return_url: returnUrl || defaultReturn,
      type: 'account_onboarding',
    });
    return link.url;
  }

  /**
   * Generates a single-use login link to the Stripe Express Dashboard.
   */
  async createDashboardLoginLink(accountId: string): Promise<string> {
    const stripe = this.getClient();
    const link = await stripe.accounts.createLoginLink(accountId);
    return link.url;
  }

  /**
   * Fetches latest account verification, payout, and charge status from Stripe.
   */
  async getAccountStatus(accountId: string) {
    const stripe = this.getClient();
    const account = await stripe.accounts.retrieve(accountId);
    return {
      id: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: {
        currentlyDue: account.requirements?.currently_due ?? [],
        eventuallyDue: account.requirements?.eventually_due ?? [],
        pastDue: account.requirements?.past_due ?? [],
        disabledReason: account.requirements?.disabled_reason ?? null,
      },
    };
  }

  /**
   * Separate Charges & Transfers:
   * Transfers the net driver earnings from the platform to the driver's Express account
   * after ride completion and post-ride hold/verification checks.
   */
  async transferToDriver(params: {
    amount: number;
    currency: string;
    destinationAccountId: string;
    transferGroup: string;
    rideId: string;
    driverId?: string;
    sourceTransaction?: string;
    idempotencyKey?: string;
  }): Promise<{ transferId: string; amountCents: number }> {
    const stripe = this.getClient();
    const amountCents = Math.round(params.amount * 100);
    if (amountCents <= 0) {
      throw new Error(`Invalid transfer amount: ${params.amount}`);
    }

    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: params.currency.toLowerCase(),
        destination: params.destinationAccountId,
        transfer_group: params.transferGroup,
        ...(params.sourceTransaction
          ? { source_transaction: params.sourceTransaction }
          : {}),
        metadata: {
          rideId: params.rideId,
          driverId: params.driverId ?? '',
          payoutType: 'trip_completion',
        },
      },
      params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined,
    );

    this.logger.log(
      `Transferred ${amountCents} ${params.currency} to ${params.destinationAccountId} for ride ${params.rideId} (tr: ${transfer.id})`,
    );

    return {
      transferId: transfer.id,
      amountCents,
    };
  }

  /**
   * Reverses a previously created transfer to a connected driver account
   * (e.g. when a full/partial refund or chargeback occurs after a transfer).
   */
  async reverseTransfer(params: {
    transferId: string;
    amount?: number;
    rideId?: string;
    reason?: string;
  }): Promise<{ reversalId: string; amountCents: number }> {
    const stripe = this.getClient();
    const opts: Stripe.TransferCreateReversalParams = {
      metadata: {
        ...(params.rideId ? { rideId: params.rideId } : {}),
        ...(params.reason ? { reason: params.reason } : {}),
      },
    };
    if (params.amount != null && params.amount > 0) {
      opts.amount = Math.round(params.amount * 100);
    }
    const reversal = await stripe.transfers.createReversal(
      params.transferId,
      opts,
    );
    this.logger.log(
      `Reversed transfer ${params.transferId} (reversal: ${reversal.id}, amountCents: ${reversal.amount})`,
    );
    return {
      reversalId: reversal.id,
      amountCents: reversal.amount,
    };
  }

  /**
   * Issues refund to passenger from the platform.
   */
  async issueRefund(params: {
    paymentIntentId: string;
    amount?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  }): Promise<{ refundId: string; status: string }> {
    const stripe = this.getClient();
    const opts: Stripe.RefundCreateParams = {
      payment_intent: params.paymentIntentId,
    };
    if (params.amount != null) {
      opts.amount = Math.round(params.amount * 100);
    }
    if (params.reason) {
      opts.reason = params.reason;
    }
    const refund = await stripe.refunds.create(opts);
    return {
      refundId: refund.id,
      status: refund.status || 'succeeded',
    };
  }
}
