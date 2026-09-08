export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'local',
  port: parseInt(process.env.PORT ?? '3000', 10),
  appName: process.env.APP_NAME ?? 'can-go-api',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  providers: {
    payment: process.env.PAYMENT_PROVIDER ?? 'dev',
    payout: process.env.PAYOUT_PROVIDER ?? 'dev',
    sms: process.env.SMS_PROVIDER ?? 'mock',
    otp: process.env.OTP_PROVIDER ?? 'mock',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },
  admin: {
    totpEnforce: process.env.ADMIN_TOTP_ENFORCE === 'true',
    passengerWebBase:
      process.env.PASSENGER_WEB_BASE ?? 'http://127.0.0.1:3002',
    adminWebBase: process.env.ADMIN_WEB_BASE ?? 'http://127.0.0.1:3001',
    impersonationTtlMinutes: parseInt(
      process.env.IMPERSONATION_TTL_MINUTES ?? '12',
      10,
    ),
  },
  maps: {
    provider: process.env.MAPS_PROVIDER ?? 'photon',
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
  },
  launchGate: {
    allowDevPaymentInProduction:
      process.env.ALLOW_DEV_PAYMENT_IN_PRODUCTION === 'true',
    allowMockSmsInProduction: process.env.ALLOW_MOCK_SMS_IN_PRODUCTION === 'true',
    /** Set true only after staging E2E green with real Payment/Payout/SMS. */
    stagingE2ePassed: process.env.STAGING_E2E_PASSED === 'true',
    /** Emergency only — bypasses STAGING_E2E_PASSED (still logged loudly). */
    allowProdWithoutStagingE2e:
      process.env.ALLOW_PROD_WITHOUT_STAGING_E2E === 'true',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'can-go-platform',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    documentsBucket: process.env.S3_BUCKET_DOCUMENTS ?? 'cango-documents',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
});
