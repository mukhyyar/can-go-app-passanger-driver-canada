import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentIntentInput,
  PaymentIntentResult,
  PaymentProvider,
  RefundResult,
  VerifiedWebhookEvent,
} from './payment-provider.interface';
import { createHash, randomUUID } from 'crypto';

/** Local/dev only — never allowed in production without launch-gate override. */
@Injectable()
export class DevPaymentProvider implements PaymentProvider {
  readonly name = 'dev';
  private readonly logger = new Logger(DevPaymentProvider.name);

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const intentId = `dev_pi_${randomUUID()}`;
    this.logger.log(
      `DevPayment createIntent ride=${input.rideId} amount=${input.amount} ${input.currency}`,
    );
    return {
      provider: this.name,
      intentId,
      clientSecret: `dev_secret_${intentId}`,
      status: 'succeeded',
    };
  }

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ): Promise<VerifiedWebhookEvent> {
    const body =
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const eventId = createHash('sha256').update(body).digest('hex').slice(0, 32);
    const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
    return {
      provider: this.name,
      eventId: String(parsed.eventId ?? eventId),
      type: String(parsed.type ?? 'payment.succeeded'),
      paymentRef: parsed.paymentRef ? String(parsed.paymentRef) : undefined,
      status: String(parsed.status ?? 'succeeded'),
      raw: parsed,
    };
  }

  async refund(paymentId: string, amount?: number): Promise<RefundResult> {
    return {
      refundId: `dev_re_${randomUUID()}`,
      status: 'succeeded',
    };
  }
}
