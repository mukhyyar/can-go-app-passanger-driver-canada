import { createHmac, timingSafeEqual } from 'crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentIntentInput,
  PaymentIntentResult,
  PaymentProvider,
  RefundResult,
  VerifiedWebhookEvent,
} from './payment-provider.interface';

/**
 * Stripe PaymentIntents adapter (Phase 2).
 * Requires STRIPE_SECRET_KEY. Webhook signature verified when STRIPE_WEBHOOK_SECRET is set.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly secret: string | undefined;
  private readonly webhookSecret: string | undefined;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('stripe.secretKey');
    this.webhookSecret = config.get<string>('stripe.webhookSecret');
  }

  private assertConfigured() {
    if (!this.secret) {
      throw new ServiceUnavailableException(
        'STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe',
      );
    }
  }

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    this.assertConfigured();
    const amountCents = Math.round(input.amount * 100);
    if (amountCents < 50) {
      throw new ServiceUnavailableException('Amount below Stripe minimum');
    }
    const body = new URLSearchParams();
    body.set('amount', String(amountCents));
    body.set('currency', input.currency.toLowerCase());
    body.set('confirm', 'false');
    body.set('metadata[rideId]', input.rideId);
    body.set('metadata[idempotencyKey]', input.idempotencyKey);
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        body.set(`metadata[${k}]`, v);
      }
    }

    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': input.idempotencyKey,
      },
      body,
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.error(`Stripe createIntent failed: ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException(
        (data.error as { message?: string })?.message ?? 'Stripe error',
      );
    }
    const statusRaw = String(data.status ?? '');
    const status: PaymentIntentResult['status'] =
      statusRaw === 'succeeded'
        ? 'succeeded'
        : statusRaw === 'canceled'
          ? 'failed'
          : 'requires_payment';
    return {
      provider: this.name,
      intentId: String(data.id),
      clientSecret: data.client_secret ? String(data.client_secret) : undefined,
      status,
    };
  }

  async parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ): Promise<VerifiedWebhookEvent> {
    const raw = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    if (this.webhookSecret) {
      const sigHeader = header(headers, 'stripe-signature');
      if (!sigHeader || !verifyStripeSignature(raw, sigHeader, this.webhookSecret)) {
        throw new ServiceUnavailableException('Invalid Stripe webhook signature');
      }
    }
    const event = JSON.parse(raw) as {
      id: string;
      type: string;
      data?: { object?: Record<string, unknown> };
    };
    const obj = event.data?.object ?? {};
    let status: string | undefined;
    if (event.type === 'payment_intent.succeeded') status = 'succeeded';
    if (event.type === 'payment_intent.payment_failed') status = 'failed';
    return {
      provider: this.name,
      eventId: event.id,
      type: event.type,
      paymentRef: obj.id ? String(obj.id) : undefined,
      status,
      raw: event,
    };
  }

  async refund(paymentId: string, amount?: number): Promise<RefundResult> {
    this.assertConfigured();
    const body = new URLSearchParams();
    body.set('payment_intent', paymentId);
    if (amount != null) body.set('amount', String(Math.round(amount * 100)));
    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new ServiceUnavailableException('Stripe refund failed');
    }
    return { refundId: String(data.id), status: String(data.status) };
  }
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
) {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function verifyStripeSignature(
  payload: string,
  headerValue: string,
  secret: string,
) {
  const parts = Object.fromEntries(
    headerValue.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k.trim(), rest.join('=')];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (age > 300) return false;
  const expected = createHmac('sha256', secret)
    .update(`${t}.${payload}`)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}
