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
  private readonly messagingServiceSid: string | undefined;

  constructor(config: ConfigService) {
    this.accountSid = config.get<string>('twilio.accountSid')?.trim();
    this.authToken = config.get<string>('twilio.authToken')?.trim();
    this.from = config.get<string>('twilio.fromNumber')?.replace(/\s+/g, '');
    this.messagingServiceSid = config
      .get<string>('twilio.messagingServiceSid')
      ?.trim();
  }

  async sendSms(toE164: string, body: string) {
    if (
      !this.accountSid ||
      !this.authToken ||
      (!this.from && !this.messagingServiceSid)
    ) {
      throw new ServiceUnavailableException(
        'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID required when SMS_PROVIDER=twilio',
      );
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const form = new URLSearchParams();

    // Clean to strict E.164 digits with leading +
    const digits = toE164.trim().replace(/\D/g, '');
    const cleanedTo = `+${digits}`;

    form.set('To', cleanedTo);
    if (this.messagingServiceSid) {
      form.set('MessagingServiceSid', this.messagingServiceSid);
    } else if (this.from) {
      form.set('From', this.from);
    }
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
    const data = (await res.json()) as {
      sid?: string;
      message?: string;
      code?: number;
    };
    if (!res.ok) {
      this.logger.error(
        `Twilio SMS failed (status ${res.status}, code ${data.code ?? 'none'}): ${data.message ?? JSON.stringify(data)}`,
      );
      throw new ServiceUnavailableException(data.message ?? 'Twilio SMS failed');
    }
    this.logger.log(`Twilio SMS dispatched: sid=${data.sid} to=${cleanedTo}`);
    return { providerMessageId: String(data.sid) };
  }
}
