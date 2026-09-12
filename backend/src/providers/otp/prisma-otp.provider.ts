import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import type { OtpProvider, OtpPurpose } from './otp-provider.interface';
import { SMS_PROVIDER } from '../sms/sms-provider.interface';
import type { SmsProvider } from '../sms/sms-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';

/** Persists OTP challenges in Postgres; sends via SmsProvider. */
@Injectable()
export class PrismaOtpProvider implements OtpProvider {
  readonly name = 'prisma';
  private readonly logger = new Logger(PrismaOtpProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async issue(phoneE164: string, purpose: OtpPurpose) {
    // Mock SMS: fixed code for local/staging test without reading server logs.
    const code =
      this.sms.name === 'mock'
        ? '111111'
        : String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Invalidate prior open challenges for same phone+purpose
    await this.prisma.otpChallenge.updateMany({
      where: {
        phoneE164,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });

    const row = await this.prisma.otpChallenge.create({
      data: {
        phoneE164,
        purpose,
        codeHash: hash(code),
        expiresAt,
      },
    });

    await this.sms.sendSms(
      phoneE164,
      `CAN-RIDE verification code: ${code}. Expires in 5 minutes.`,
    );

    const debugCode =
      process.env.NODE_ENV === 'local' || process.env.NODE_ENV === 'development'
        ? code
        : undefined;

    this.logger.debug(`OTP issued challenge=${row.id} purpose=${purpose}`);
    return { challengeId: row.id, expiresAt, debugCode };
  }

  async verify(challengeId: string, code: string) {
    const row = await this.prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    });
    if (!row || row.consumedAt) return { ok: false };
    if (row.expiresAt.getTime() < Date.now()) return { ok: false };
    if (row.attempts >= 5) return { ok: false };

    await this.prisma.otpChallenge.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });

    if (row.codeHash !== hash(code)) return { ok: false };

    await this.prisma.otpChallenge.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    return {
      ok: true,
      phoneE164: row.phoneE164,
      purpose: row.purpose as OtpPurpose,
    };
  }
}

function hash(code: string) {
  return createHash('sha256').update(code).digest('hex');
}
