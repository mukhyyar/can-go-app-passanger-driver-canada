# Phase 1f — E2E + security/chaos

Automated verification that Phase 1a–1e APIs work together with Dev/Mock providers.

## Commands

```bash
cd backend
npm test -- --testPathPattern=pricing.service.spec   # unit: haversine + freezeBid
npm run test:phase1f                                 # live HTTP suite (API must be up)
```

Requires: Compose (Postgres/Redis/MinIO), Nest `:4000`, PostGIS zone/location SQL applied, `NODE_ENV=local` (OTP `debugCode`).

## Primary path (must pass)

Passenger register → OTP → driver register → OTP → KYC upload → admin approve/activate → zone → ride → zone-matched offer → select → Dev pay → **BOOKED** → en-route → arrived → start → location samples → **COMPLETED** → 2 ratings → assert `driverEarning` / `passengerTotal`.

## Security / chaos covered

| Case | Expectation |
|------|-------------|
| IDOR ride read | Other passenger → 403/404 |
| Idempotent `POST /rides` | Same `Idempotency-Key` → same ride id |
| Passenger cancel | `PASSENGER_CANCELLED` from waiting |
| No-show | After ARRIVED → `NO_SHOW` |
| Duplicate payment webhook | Second call `{ duplicate: true }` |
| Admin RBAC | Driver cannot `GET /admin/drivers/kyc` |

## Not automated here (manual / Phase 2)

- FCM foreground/background device delivery
- Playwright Admin/Web UI
- Flutter integration against staging
- Real Payment/Payout/SMS providers (launch gate)

## Related fix

`GET /auth/me` now includes `driver.id` (profile id) for KYC/admin client flows.
