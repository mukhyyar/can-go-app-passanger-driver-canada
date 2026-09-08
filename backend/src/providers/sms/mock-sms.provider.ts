import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SmsProvider } from './sms-provider.interface';

/** Logs SMS to server logs — local/CI only. Blocked in production by launch gate. */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockSmsProvider.name);

  async sendSms(toE164: string, body: string) {
    const providerMessageId = `mock_sms_${randomUUID()}`;
    this.logger.log(`[MockSMS] to=${toE164} id=${providerMessageId} body=${body}`);
    return { providerMessageId };
  }
}
