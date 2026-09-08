import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider } from './sms-provider.interface';

/** Twilio Programmable SMS adapter (Phase 2). */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly accountSid: string | undefined;
  private readonly authToken: string | undefined;
  private readonly from: string | undefined;

  constructor(config: ConfigService) {
    this.accountSid = config.get<string>('twilio.accountSid');
    this.authToken = config.get<string>('twilio.authToken');
    this.from = config.get<string>('twilio.fromNumber');
  }

  async sendSms(toE164: string, body: string) {
    if (!this.accountSid || !this.authToken || !this.from) {
      throw new ServiceUnavailableException(
        'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER required when SMS_PROVIDER=twilio',
      );
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const form = new URLSearchParams();
    form.set('To', toE164);
    form.set('From', this.from);
    form.set('Body', body);
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      'base64',
    );
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      this.logger.error(`Twilio SMS failed: ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException(data.message ?? 'Twilio SMS failed');
    }
    return { providerMessageId: String(data.sid) };
  }
}
