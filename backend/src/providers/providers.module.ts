import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment/payment-provider.interface';
import { DevPaymentProvider } from './payment/dev-payment.provider';
import { StripePaymentProvider } from './payment/stripe-payment.provider';
import { PAYOUT_PROVIDER } from './payout/payout-provider.interface';
import { DevPayoutProvider } from './payout/dev-payout.provider';
import { StripePayoutProvider } from './payout/stripe-payout.provider';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import { MockSmsProvider } from './sms/mock-sms.provider';
import { TwilioSmsProvider } from './sms/twilio-sms.provider';
import { OTP_PROVIDER } from './otp/otp-provider.interface';
import { MockOtpProvider } from './otp/mock-otp.provider';
import { PrismaOtpProvider } from './otp/prisma-otp.provider';
import { LaunchGateService } from './launch-gate.service';
import { ProvidersController } from './providers.controller';

@Global()
@Module({
  controllers: [ProvidersController],
  providers: [
    DevPaymentProvider,
    StripePaymentProvider,
    DevPayoutProvider,
    StripePayoutProvider,
    MockSmsProvider,
    TwilioSmsProvider,
    MockOtpProvider,
    PrismaOtpProvider,
    LaunchGateService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        dev: DevPaymentProvider,
        stripe: StripePaymentProvider,
      ) => {
        const name = (config.get<string>('providers.payment') ?? 'dev').toLowerCase();
        if (name === 'stripe') return stripe;
        return dev;
      },
      inject: [ConfigService, DevPaymentProvider, StripePaymentProvider],
    },
    {
      provide: PAYOUT_PROVIDER,
      useFactory: (
        config: ConfigService,
        dev: DevPayoutProvider,
        stripe: StripePayoutProvider,
      ) => {
        const name = (config.get<string>('providers.payout') ?? 'dev').toLowerCase();
        if (name === 'stripe') return stripe;
        return dev;
      },
      inject: [ConfigService, DevPayoutProvider, StripePayoutProvider],
    },
    {
      provide: SMS_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockSmsProvider,
        twilio: TwilioSmsProvider,
      ) => {
        const name = (config.get<string>('providers.sms') ?? 'mock').toLowerCase();
        if (name === 'twilio') return twilio;
        return mock;
      },
      inject: [ConfigService, MockSmsProvider, TwilioSmsProvider],
    },
    {
      provide: OTP_PROVIDER,
      useFactory: (
        config: ConfigService,
        prismaOtp: PrismaOtpProvider,
        mockOtp: MockOtpProvider,
      ) => {
        const name = (config.get<string>('providers.otp') ?? 'prisma').toLowerCase();
        if (name === 'mock') return mockOtp;
        return prismaOtp;
      },
      inject: [ConfigService, PrismaOtpProvider, MockOtpProvider],
    },
  ],
  exports: [
    PAYMENT_PROVIDER,
    PAYOUT_PROVIDER,
    SMS_PROVIDER,
    OTP_PROVIDER,
    LaunchGateService,
  ],
})
export class ProvidersModule implements OnModuleInit {
  private readonly logger = new Logger(ProvidersModule.name);

  constructor(private readonly launchGate: LaunchGateService) {}

  onModuleInit() {
    this.launchGate.assertBootAllowed();
    this.logger.log(
      `Providers ready: payment=${this.launchGate.paymentName} payout=${this.launchGate.payoutName} sms=${this.launchGate.smsName} otp=${this.launchGate.otpName}`,
    );
  }
}
