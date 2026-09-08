# Phase 2 — Providers & polish

## Provider adapters

| Env | Values | Notes |
|-----|--------|-------|
| `PAYMENT_PROVIDER` | `dev` (local) / `stripe` | Stripe PaymentIntents via REST; needs `STRIPE_SECRET_KEY` |
| `PAYOUT_PROVIDER` | `dev` / `stripe` | Stripe Transfers; destination = connected account id |
| `SMS_PROVIDER` | `mock` / `twilio` | Twilio Messages API |
| `OTP_PROVIDER` | `prisma` (recommended) / `mock` | Prisma + active SMS provider |

Webhook: `POST /api/payments/webhooks/stripe` (signature verified when `STRIPE_WEBHOOK_SECRET` set).

Local stays on Dev/Mock. Staging flips to stripe+twilio+prisma and re-runs E2E before prod.

## Ratings moderation

- Comments → `PENDING_REVIEW`; stars-only → `VISIBLE`
- Ride participants always see all ratings on that ride; admin moderation queue controls public/profile visibility later
- `GET /api/admin/ratings?status=`
- `POST /api/admin/ratings/:id/moderate` `{ status, note? }`

## Admin 2FA enforce

`ADMIN_TOTP_ENFORCE=true` → admin login blocked with `TOTP_SETUP_REQUIRED` until 2FA enabled (`/auth/admin/2fa/*`).

## Chat hardening

`GET/POST /api/rides/:rideId/chat` — participants only after BOOKED; HTML stripped; 2k max; throttle 30/min; soft-delete + flag.

## Promo / CMS / legal

- `POST /api/admin/promos` — create codes; validated on ride create
- `GET /api/cms/pages`, `GET /api/cms/pages/:slug` — terms/privacy/support seeded
- `PUT /api/admin/cms/pages` — admin upsert

## Production launch gate checklist

See [`docs/launch-gate.md`](../../docs/launch-gate.md).

Before `NODE_ENV=production`:

1. [ ] `PAYMENT_PROVIDER=stripe` + live/test keys; webhook registered
2. [ ] `PAYOUT_PROVIDER=stripe` + connected accounts mapped for drivers
3. [ ] `SMS_PROVIDER=twilio` + `OTP_PROVIDER=prisma`
4. [ ] Staging E2E green (`npm run test:phase1f`) against those providers
5. [ ] `STAGING_E2E_PASSED=true` in secrets
6. [ ] `ALLOW_DEV_PAYMENT_IN_PRODUCTION=false` and `ALLOW_MOCK_SMS_IN_PRODUCTION=false`
7. [ ] `ADMIN_TOTP_ENFORCE=true`
8. [ ] `npm run launch-gate:check -- --require-prod-boot` green against staging API
9. [ ] Legal CMS pages reviewed by counsel

`GET /api/providers/status` → `canBootProduction: true` when providers, credentials, staging sign-off, and admin 2FA enforce are satisfied.
