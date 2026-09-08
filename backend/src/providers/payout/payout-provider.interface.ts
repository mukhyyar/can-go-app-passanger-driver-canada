export type BeneficiaryRef = { provider: string; beneficiaryId: string };

export type PayoutBatchItem = {
  driverId: string;
  amount: number;
  currency: string;
  reference: string;
};

export type PayoutResult = {
  provider: string;
  batchId: string;
  status: string;
};

export interface PayoutProvider {
  readonly name: string;
  ensureBeneficiary(
    driverId: string,
    prefs: Record<string, unknown>,
  ): Promise<BeneficiaryRef>;
  createPayout(items: PayoutBatchItem[]): Promise<PayoutResult>;
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ): Promise<{ provider: string; eventId: string; type: string; raw: unknown }>;
}

export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');
