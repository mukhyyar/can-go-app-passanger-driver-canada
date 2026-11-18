import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  BeneficiaryRef,
  PayoutBatchItem,
  PayoutProvider,
  PayoutResult,
} from './payout-provider.interface';
import {
  header,
  verifyStripeSignature,
} from '../payment/stripe-payment.provider';

/**
 * Stripe Connect Express payouts (Separate Charges & Transfers).
 * Uses Transfers API when STRIPE_SECRET_KEY is set; beneficiaryId = connected Express account id (acct_...).
 */
@Injectable()
export class StripePayoutProvider implements PayoutProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripePayoutProvider.name);
  private readonly secret: string | undefined;
  private readonly webhookSecret: string | undefined;
  private readonly nodeEnv: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('stripe.secretKey');
    this.webhookSecret = config.get<string>('stripe.webhookSecret');
    this.nodeEnv = config.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'local';
  }

  private assertConfigured() {
    if (!this.secret) {
      throw new ServiceUnavailableException(
        'STRIPE_SECRET_KEY is required when PAYOUT_PROVIDER=stripe',
      );
    }
  }

  async ensureBeneficiary(
    _driverId: string,
    prefs: Record<string, unknown>,
  ): Promise<BeneficiaryRef> {
    const connected =
      (typeof prefs.stripeAccountId === 'string' && prefs.stripeAccountId.trim()) ||
      (typeof prefs.beneficiaryId === 'string' && prefs.beneficiaryId.trim()) ||
      '';
    if (!connected || connected.startsWith('acct_pending_')) {
      throw new ServiceUnavailableException(
        'Driver does not have a verified Stripe Connect account for payouts',
      );
    }
    return { provider: this.name, beneficiaryId: connected };
  }

  async createPayout(items: PayoutBatchItem[]): Promise<PayoutResult> {
    this.assertConfigured();
    let batchId = `po_batch_${randomUUID()}`;
    const transferIds: string[] = [];

    for (const item of items) {
      const amountCents = Math.round(item.amount * 100);
      const body = new URLSearchParams();
      body.set('amount', String(amountCents));
      body.set('currency', item.currency.toLowerCase());
      body.set('destination', item.reference);
      body.set('metadata[driverId]', item.driverId);
      body.set('metadata[payoutType]', 'wallet_withdrawal');
      const idempotencyKey = `payout_${item.driverId}_${item.reference}_${amountCents}_${batchId}`;
      const res = await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': idempotencyKey,
        },
        body,
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        this.logger.error(`Stripe transfer failed: ${JSON.stringify(data)}`);
        throw new ServiceUnavailableException(
          (data.error as { message?: string })?.message ??
            'Stripe payout transfer failed',
        );
      }
      if (data.id) {
        transferIds.push(String(data.id));
      }
    }

    if (transferIds.length === 1) {
      batchId = transferIds[0]!;
    }
    return { provider: this.name, batchId, status: 'submitted' };
  }

  async parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ) {
    const raw = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    if (this.nodeEnv === 'production' && !this.webhookSecret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET is required in production',
      );
    }
    if (this.webhookSecret) {
      const sigHeader = header(headers, 'stripe-signature');
      if (!sigHeader || !verifyStripeSignature(raw, sigHeader, this.webhookSecret)) {
        throw new ServiceUnavailableException('Invalid Stripe webhook signature');
      }
    }
    const parsed = JSON.parse(raw) as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    return {
      provider: this.name,
      eventId: String(parsed.id ?? randomUUID()),
      type: String(parsed.type ?? 'payout.unknown'),
      raw: parsed,
    };
  }
}
