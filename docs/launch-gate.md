# Production launch gate

Hard stop before `NODE_ENV=production`. Enforced in `LaunchGateService.assertBootAllowed()`.

## Requirements (all must pass)

1. **Payment** — non-Dev (`PAYMENT_PROVIDER=stripe`) + `STRIPE_SECRET_KEY`
2. **Payout** — non-Dev (`PAYOUT_PROVIDER=stripe`) + same Stripe key / connected accounts
3. **SMS/OTP** — non-Mock SMS (`SMS_PROVIDER=twilio`) + `OTP_PROVIDER=prisma` + Twilio creds
4. **Staging E2E sign-off** — `STAGING_E2E_PASSED=true` after green marketplace→trip→rating on staging with those providers
5. **Admin 2FA** — `ADMIN_TOTP_ENFORCE=true`

Emergency overrides (logged as errors; do not use for normal deploys):

- `ALLOW_DEV_PAYMENT_IN_PRODUCTION`
- `ALLOW_MOCK_SMS_IN_PRODUCTION`
- `ALLOW_PROD_WITHOUT_STAGING_E2E`

## Operator flow

```bash
# 1. Configure staging secrets (see backend/.env.staging.example)
# 2. Point API at staging DB/Redis/S3 + Stripe test + Twilio
# 3. Run suite
cd backend && npm run test:phase1f

# 4. Inspect gate
npm run launch-gate:check
npm run launch-gate:check -- --require-ready

# 5. After green E2E, set STAGING_E2E_PASSED=true in staging/prod secrets
# 6. Deploy production — boot fails if gate not satisfied
```

`GET /api/providers/status` returns `productionReady`, `stagingE2ePassed`, `canBootProduction`, and `blockedReasons` (no secrets).

## Local

Dev/Mock providers remain allowed when `NODE_ENV=local|development`. Gate only hard-fails on `production`.
