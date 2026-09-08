# CAN-GO Phase 0 — Foundations

## What was delivered

- `backend/` NestJS API scaffold (`/api/health`, `/api/health/ready`, `/api/providers/status`, `/api/notifications/device-tokens`)
- `docker-compose.yml` — PostGIS, Redis, MinIO, Mailhog
- Prisma schema with ride lifecycle, device tokens, OTP, ratings, audit, webhooks
- Provider abstractions: `PaymentProvider`, `PayoutProvider`, `SmsProvider`, `OtpProvider` (+ Dev/Mock implementations)
- Production **launch gate** (blocks Dev/Mock providers when `NODE_ENV=production`)
- Dedicated Firebase project **`can-go-platform`** (CAN-GO) — unrelated projects untouched
- Firebase apps registered (Passenger/Driver Android + prototype package IDs, iOS, Passenger Web)
- Android `google-services.json` placed under both Flutter apps + Google Services Gradle plugin wired
- iOS `GoogleService-Info.plist` staged under `mobile/apps/*/firebase/` (copy into `ios/Runner/` when iOS is generated)
- Secrets directory pattern (`secrets/` gitignored except README); Admin SDK JSON + client config backups under `secrets/`

## Firebase apps (`can-go-platform`)

| App | Platform | ID / package |
|-----|----------|----------------|
| CAN-GO Passenger | Android | `com.gettransfer.passenger` |
| CAN-GO Driver | Android | `com.gettransfer.driver` |
| CAN-GO Passenger Prototype | Android | `com.gettransfer.passenger.prototype` |
| CAN-GO Driver Prototype | Android | `com.gettransfer.driver.prototype` |
| CAN-GO Passenger iOS | iOS | `com.gettransfer.passenger` |
| CAN-GO Driver iOS | iOS | `com.gettransfer.driver` |
| CAN-GO Passenger Web | Web | web app |

Console: https://console.firebase.google.com/project/can-go-platform/overview

### Client config locations

| App | Android | iOS (staged until `ios/` exists) |
|-----|---------|----------------------------------|
| Passenger | `mobile/apps/passenger/android/app/google-services.json` | `mobile/apps/passenger/firebase/GoogleService-Info.plist` |
| Driver | `mobile/apps/driver/android/app/google-services.json` | `mobile/apps/driver/firebase/GoogleService-Info.plist` |

Current Flutter `applicationId` values use the **`.prototype`** package IDs; the Google Services plugin selects the matching client entry from the JSON.

### Enable FCM + Admin SDK (manual once)

1. Open Project settings → Cloud Messaging — ensure Cloud Messaging API is enabled.
2. Project settings → Service accounts → Generate new private key.
3. Save JSON to `secrets/can-go-platform-firebase-adminsdk.json` (never commit).
4. Set `FIREBASE_SERVICE_ACCOUNT_PATH` (and `FIREBASE_CLIENT_EMAIL`) in `backend/.env`.
5. Refresh client configs if apps change:

```bash
firebase apps:sdkconfig ANDROID <appId> --project can-go-platform -o google-services.json
firebase apps:sdkconfig IOS <appId> --project can-go-platform -o GoogleService-Info.plist
```

**Status:** Admin SDK file + `.env` path/email are configured. Client Android configs + Gradle plugin are in place. iOS plists staged. **FCM API (V1) confirmed Enabled** in Console (Sender ID `440385851908`). Legacy API stays Disabled (expected). APNs keys + Web Push certs are deferred until real iOS/Web push testing.

Do **not** modify Midtown Mosque / PWSLLC projects.

## Local run

1. Docker Desktop installed at `D:\Docker\Docker` (WSL data: `D:\Docker\wsl`). **Reboot once** if Windows prompted after WSL feature enable, then start Docker Desktop.
2. `docker compose up -d` (from repo root). Postgres is published on host **5433** (avoids clash with local Postgres on 5432).
3. `cd backend && cp .env.example .env` (already present locally; `DATABASE_URL` uses port **5433**)
4. `npx prisma migrate dev --name phase0_init` (after Postgres is up) — or `npx prisma db push` on first bring-up if PostGIS init extensions cause drift
5. `npm run start:dev` (default **PORT=4000** — 3000 often taken by XAMPP)
6. Check `GET http://127.0.0.1:4000/api/health` and `/api/health/ready`

## Explicitly out of Phase 0

- Auth/OTP HTTP APIs (interfaces + mock OTP ready; routes in Phase 1)
- Flutter UI changes / `firebase_messaging` wiring (Phase 1e)
- Real Payment/Payout/SMS production providers (launch gate enforces staging E2E first)
- Admin / Passenger Web apps (scaffolded in later phases)
