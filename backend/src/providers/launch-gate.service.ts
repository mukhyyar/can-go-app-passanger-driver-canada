import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment/payment-provider.interface';
import type { PaymentProvider } from './payment/payment-provider.interface';
import { PAYOUT_PROVIDER } from './payout/payout-provider.interface';
import type { PayoutProvider } from './payout/payout-provider.interface';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import type { SmsProvider } from './sms/sms-provider.interface';
import { OTP_PROVIDER } from './otp/otp-provider.interface';
import type { OtpProvider } from './otp/otp-provider.interface';
import {
  evaluateLaunchGate,
  productionBootFailures,
  type LaunchGateFlags,
  type LaunchGateStatus,
} from './launch-gate.logic';

export type { LaunchGateStatus };

/**
 * Production launch gate: real Payment/Payout/SMS/OTP + staging E2E sign-off
 * required before production boot. Dev/mock allowed only local/CI.
 */
@Injectable()
export class LaunchGateService {
  private readonly logger = new Logger(LaunchGateService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly payment: PaymentProvider,
    @Inject(PAYOUT_PROVIDER) private readonly payout: PayoutProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
  ) {}

  get paymentName() {
    return this.payment.name;
  }
  get payoutName() {
    return this.payout.name;
  }
  get smsName() {
    return this.sms.name;
  }
  get otpName() {
    return this.otp.name;
  }

  private flags(nodeEnv?: string): LaunchGateFlags {
    return {
      nodeEnv: nodeEnv ?? this.config.get<string>('nodeEnv') ?? 'local',
      stagingE2ePassed:
        this.config.get<boolean>('launchGate.stagingE2ePassed') === true,
      stripeCredentialsPresent: !!(
        this.config.get<string>('stripe.secretKey') || ''
      ).trim(),
      twilioCredentialsPresent:
        !!(this.config.get<string>('twilio.accountSid') || '').trim() &&
        !!(this.config.get<string>('twilio.authToken') || '').trim() &&
        !!(this.config.get<string>('twilio.fromNumber') || '').trim(),
      adminTotpEnforce:
        this.config.get<boolean>('admin.totpEnforce') === true,
      allowDevPaymentInProduction:
        this.config.get<boolean>('launchGate.allowDevPaymentInProduction') ===
        true,
      allowMockSmsInProduction:
        this.config.get<boolean>('launchGate.allowMockSmsInProduction') ===
        true,
      allowProdWithoutStagingE2e:
        this.config.get<boolean>('launchGate.allowProdWithoutStagingE2e') ===
        true,
    };
  }

  private providers() {
    return {
      payment: this.payment.name,
      payout: this.payout.name,
      sms: this.sms.name,
      otp: this.otp.name,
    };
  }

  evaluate(nodeEnv?: string): LaunchGateStatus {
    return evaluateLaunchGate(this.providers(), this.flags(nodeEnv));
  }

  get status(): LaunchGateStatus {
    return this.evaluate();
  }

  assertBootAllowed() {
    const nodeEnv = this.config.get<string>('nodeEnv') ?? 'local';
    if (nodeEnv !== 'production') return;

    const flags = this.flags(nodeEnv);
    const failures = productionBootFailures(this.providers(), flags);
    if (failures.length) {
      throw new Error(
        `Launch gate blocked production boot:\n- ${failures.join('\n- ')}`,
      );
    }

    if (
      flags.allowDevPaymentInProduction ||
      flags.allowMockSmsInProduction ||
      flags.allowProdWithoutStagingE2e
    ) {
      this.logger.error(
        'Production boot with EMERGENCY launch-gate overrides — investigate immediately.',
      );
    } else {
      this.logger.log(
        'Launch gate passed: real providers + STAGING_E2E_PASSED + credentials + admin 2FA enforce.',
      );
    }
  }
}
