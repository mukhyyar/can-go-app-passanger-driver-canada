import {
  evaluateLaunchGate,
  productionBootFailures,
} from './launch-gate.logic';

describe('launch-gate.logic', () => {
  const real = {
    payment: 'stripe',
    payout: 'stripe',
    sms: 'twilio',
    otp: 'prisma',
  };

  it('local with dev providers is not productionReady', () => {
    const status = evaluateLaunchGate(
      { payment: 'dev', payout: 'dev', sms: 'mock', otp: 'prisma' },
      {
        nodeEnv: 'local',
        stagingE2ePassed: false,
        stripeCredentialsPresent: false,
        twilioCredentialsPresent: false,
        adminTotpEnforce: false,
      },
    );
    expect(status.productionReady).toBe(false);
    expect(status.canBootProduction).toBe(false);
  });

  it('productionReady when all providers real + e2e + creds', () => {
    const status = evaluateLaunchGate(real, {
      nodeEnv: 'staging',
      stagingE2ePassed: true,
      stripeCredentialsPresent: true,
      twilioCredentialsPresent: true,
      adminTotpEnforce: true,
    });
    expect(status.productionReady).toBe(true);
    expect(status.canBootProduction).toBe(true);
  });

  it('blocks production boot without STAGING_E2E_PASSED', () => {
    const failures = productionBootFailures(real, {
      nodeEnv: 'production',
      stagingE2ePassed: false,
      stripeCredentialsPresent: true,
      twilioCredentialsPresent: true,
      adminTotpEnforce: true,
    });
    expect(failures.some((f) => f.includes('STAGING_E2E_PASSED'))).toBe(true);
  });

  it('blocks production boot when stripe key missing', () => {
    const failures = productionBootFailures(real, {
      nodeEnv: 'production',
      stagingE2ePassed: true,
      stripeCredentialsPresent: false,
      twilioCredentialsPresent: true,
      adminTotpEnforce: true,
    });
    expect(failures.some((f) => f.includes('STRIPE_SECRET_KEY'))).toBe(true);
  });

  it('allows production boot when fully signed off', () => {
    const failures = productionBootFailures(real, {
      nodeEnv: 'production',
      stagingE2ePassed: true,
      stripeCredentialsPresent: true,
      twilioCredentialsPresent: true,
      adminTotpEnforce: true,
    });
    expect(failures).toEqual([]);
  });
});
