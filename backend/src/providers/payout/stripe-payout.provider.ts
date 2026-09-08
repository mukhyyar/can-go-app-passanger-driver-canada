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

/**
 * Stripe Connect-style payouts (Phase 2).
 * Uses Transfers API when STRIPE_SECRET_KEY is set; beneficiaryId = connected account id.
 */
@Injectable()
export class StripePayoutProvider implements PayoutProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripePayoutProvider.name);
  private readonly secret: string | undefined;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('stripe.secretKey');
  }

  private assertConfigured() {
    if (!this.secret) {
      throw new ServiceUnavailableException(
        'STRIPE_SECRET_KEY is required when PAYOUT_PROVIDER=stripe',
      );
    }
  }

  async ensureBeneficiary(
    driverId: string,
    prefs: Record<string, unknown>,
  ): Promise<BeneficiaryRef> {
    const connected =
      (prefs.stripeAccountId as string) ||
      (prefs.beneficiaryId as string) ||
      `acct_pending_${driverId}`;
    return { provider: this.name, beneficiaryId: connected };
  }

  async createPayout(items: PayoutBatchItem[]): Promise<PayoutResult> {
    this.assertConfigured();
    const batchId = `po_batch_${randomUUID()}`;
    for (const item of items) {
      const body = new URLSearchParams();
      body.set('amount', String(Math.round(item.amount * 100)));
      body.set('currency', item.currency.toLowerCase());
      body.set('destination', item.reference);
      body.set('metadata[driverId]', item.driverId);
      const res = await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!res.ok) {
        const data = await res.json();
        this.logger.error(`Stripe transfer failed: ${JSON.stringify(data)}`);
        throw new ServiceUnavailableException('Stripe payout transfer failed');
      }
    }
    return { provider: this.name, batchId, status: 'submitted' };
  }

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ) {
    const raw = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const parsed = JSON.parse(raw) as { id?: string; type?: string };
    return {
      provider: this.name,
      eventId: String(parsed.id ?? randomUUID()),
      type: String(parsed.type ?? 'payout.unknown'),
      raw: parsed,
    };
  }
}
