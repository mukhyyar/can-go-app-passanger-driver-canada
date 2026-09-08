export type LaunchGateProviderNames = {
  payment: string;
  payout: string;
  sms: string;
  otp: string;
};

export type LaunchGateFlags = {
  nodeEnv: string;
  stagingE2ePassed: boolean;
  stripeCredentialsPresent: boolean;
  twilioCredentialsPresent: boolean;
  adminTotpEnforce: boolean;
  allowDevPaymentInProduction?: boolean;
  allowMockSmsInProduction?: boolean;
  allowProdWithoutStagingE2e?: boolean;
};

export type LaunchGateStatus = {
  nodeEnv: string;
  isProduction: boolean;
  productionReady: boolean;
  stagingE2ePassed: boolean;
  canBootProduction: boolean;
  blockedReasons: string[];
  checks: {
    paymentProviderReal: boolean;
    payoutProviderReal: boolean;
    smsProviderReal: boolean;
    otpProviderReal: boolean;
    stripeCredentialsPresent: boolean;
    twilioCredentialsPresent: boolean;
    stagingE2eRequired: boolean;
    stagingE2ePassed: boolean;
    adminTotpEnforce: boolean;
  };
  active: LaunchGateProviderNames;
};

export function evaluateLaunchGate(
  providers: LaunchGateProviderNames,
  flags: LaunchGateFlags,
): LaunchGateStatus {
  const isProd = flags.nodeEnv === 'production';
  const paymentOk = providers.payment !== 'dev';
  const payoutOk = providers.payout !== 'dev';
  const smsOk = providers.sms !== 'mock';
  const otpOk = providers.otp !== 'mock';

  const blockedReasons: string[] = [];
  if (!paymentOk) blockedReasons.push('PAYMENT_PROVIDER must not be dev');
  if (!payoutOk) blockedReasons.push('PAYOUT_PROVIDER must not be dev');
  if (!smsOk) blockedReasons.push('SMS_PROVIDER must not be mock');
  if (!otpOk) blockedReasons.push('OTP_PROVIDER must not be mock');
  if (!flags.stagingE2ePassed) {
    blockedReasons.push(
      'STAGING_E2E_PASSED=true required after green staging E2E with real providers',
    );
  }
  if (
    (providers.payment === 'stripe' || providers.payout === 'stripe') &&
    !flags.stripeCredentialsPresent
  ) {
    blockedReasons.push('STRIPE_SECRET_KEY required for stripe providers');
  }
  if (providers.sms === 'twilio' && !flags.twilioCredentialsPresent) {
    blockedReasons.push(
      'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER required',
    );
  }
  if (isProd && !flags.adminTotpEnforce) {
    blockedReasons.push(
      'ADMIN_TOTP_ENFORCE=true recommended/required for production ops',
    );
  }

  const productionReady = paymentOk && payoutOk && smsOk && otpOk;
  const bootBlockers = blockedReasons.filter(
    (r) => !r.includes('ADMIN_TOTP_ENFORCE'),
  );
  const canBootProduction = bootBlockers.length === 0;

  return {
    nodeEnv: flags.nodeEnv,
    isProduction: isProd,
    productionReady,
    stagingE2ePassed: flags.stagingE2ePassed,
    canBootProduction,
    blockedReasons,
    checks: {
      paymentProviderReal: paymentOk,
      payoutProviderReal: payoutOk,
      smsProviderReal: smsOk,
      otpProviderReal: otpOk,
      stripeCredentialsPresent: flags.stripeCredentialsPresent,
      twilioCredentialsPresent: flags.twilioCredentialsPresent,
      stagingE2eRequired: true,
      stagingE2ePassed: flags.stagingE2ePassed,
      adminTotpEnforce: flags.adminTotpEnforce,
    },
    active: { ...providers },
  };
}

/** Hard-fail reasons for production boot (honours emergency overrides). */
export function productionBootFailures(
  providers: LaunchGateProviderNames,
  flags: LaunchGateFlags,
): string[] {
  const failures: string[] = [];
  if (providers.payment === 'dev' && !flags.allowDevPaymentInProduction) {
    failures.push(
      'PAYMENT_PROVIDER=dev is forbidden in production after launch gate',
    );
  }
  if (providers.payout === 'dev' && !flags.allowDevPaymentInProduction) {
    failures.push(
      'PAYOUT_PROVIDER=dev is forbidden in production after launch gate',
    );
  }
  if (
    (providers.sms === 'mock' || providers.otp === 'mock') &&
    !flags.allowMockSmsInProduction
  ) {
    failures.push(
      'SMS_PROVIDER/OTP_PROVIDER=mock is forbidden in production after launch gate',
    );
  }
  if (!flags.stagingE2ePassed && !flags.allowProdWithoutStagingE2e) {
    failures.push(
      'STAGING_E2E_PASSED=true required (sign off after staging marketplace→trip→rating E2E with real providers)',
    );
  }
  if (
    (providers.payment === 'stripe' || providers.payout === 'stripe') &&
    !flags.stripeCredentialsPresent
  ) {
    failures.push('STRIPE_SECRET_KEY missing while using stripe providers');
  }
  if (providers.sms === 'twilio' && !flags.twilioCredentialsPresent) {
    failures.push('Twilio credentials missing while SMS_PROVIDER=twilio');
  }
  if (!flags.adminTotpEnforce) {
    failures.push('ADMIN_TOTP_ENFORCE=true is required in production');
  }
  return failures;
}
