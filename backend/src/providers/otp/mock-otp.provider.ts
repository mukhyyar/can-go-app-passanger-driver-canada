import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { OtpProvider, OtpPurpose } from './otp-provider.interface';
import { SMS_PROVIDER } from '../sms/sms-provider.interface';
import type { SmsProvider } from '../sms/sms-provider.interface';

type Challenge = {
  phoneE164: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
};

/** In-memory OTP for Phase 0; Phase 1 persists to OtpChallenge table. */
@Injectable()
export class MockOtpProvider implements OtpProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockOtpProvider.name);
  private readonly challenges = new Map<string, Challenge>();

  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  async issue(phoneE164: string, purpose: OtpPurpose) {
    const code = '111111';
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    this.challenges.set(challengeId, {
      phoneE164,
      purpose,
      codeHash: hash(code),
      expiresAt,
      attempts: 0,
    });
    await this.sms.sendSms(
      phoneE164,
      `CAN-GO verification code: ${code}. Expires in 5 minutes.`,
    );
    this.logger.debug(`Mock OTP issued challenge=${challengeId}`);
    return { challengeId, expiresAt, debugCode: code };
  }

  async verify(challengeId: string, code: string) {
    const c = this.challenges.get(challengeId);
    if (!c) return { ok: false };
    if (c.expiresAt.getTime() < Date.now()) {
      this.challenges.delete(challengeId);
      return { ok: false };
    }
    c.attempts += 1;
    if (c.attempts > 5) {
      this.challenges.delete(challengeId);
      return { ok: false };
    }
    if (c.codeHash !== hash(code)) return { ok: false };
    this.challenges.delete(challengeId);
    return { ok: true, phoneE164: c.phoneE164, purpose: c.purpose };
  }
}

function hash(code: string) {
  return createHash('sha256').update(code).digest('hex');
}
