export type PaymentIntentInput = {
  amount: number;
  currency: string;
  rideId: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type PaymentIntentResult = {
  provider: string;
  intentId: string;
  clientSecret?: string;
  status: 'requires_payment' | 'succeeded' | 'failed';
};

export type VerifiedWebhookEvent = {
  provider: string;
  eventId: string;
  type: string;
  paymentRef?: string;
  status?: string;
  raw: unknown;
};

export type RefundResult = {
  refundId: string;
  status: string;
};

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ): Promise<VerifiedWebhookEvent>;
  refund(paymentId: string, amount?: number): Promise<RefundResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
