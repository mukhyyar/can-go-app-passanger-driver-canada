import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BeneficiaryRef,
  PayoutBatchItem,
  PayoutProvider,
  PayoutResult,
} from './payout-provider.interface';

@Injectable()
export class DevPayoutProvider implements PayoutProvider {
  readonly name = 'dev';
  private readonly logger = new Logger(DevPayoutProvider.name);

  async ensureBeneficiary(
    driverId: string,
    _prefs: Record<string, unknown>,
  ): Promise<BeneficiaryRef> {
    return { provider: this.name, beneficiaryId: `dev_ben_${driverId}` };
  }

  async createPayout(items: PayoutBatchItem[]): Promise<PayoutResult> {
    const batchId = `dev_po_${randomUUID()}`;
    this.logger.log(`DevPayout batch=${batchId} items=${items.length}`);
    return { provider: this.name, batchId, status: 'succeeded' };
  }

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ) {
    const body =
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
    return {
      provider: this.name,
      eventId: String(parsed.eventId ?? randomUUID()),
      type: String(parsed.type ?? 'payout.succeeded'),
      raw: parsed,
    };
  }
}
