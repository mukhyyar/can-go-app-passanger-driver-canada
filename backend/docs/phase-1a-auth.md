# Phase 1a — Authentication

## Endpoints (`/api/auth`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/oauth/config` | — | Google/Apple availability + local mock flags |
| POST | `/oauth/google` | — | Google ID token (or local mock email) |
| POST | `/oauth/apple` | — | Apple identity token (or local mock email) |
| POST | `/oauth/link-phone` | — | Attach phone after social signup; returns OTP |
| POST | `/register` | — | PASSENGER/DRIVER; returns OTP challenge |
| POST | `/otp/verify` | — | Completes phone verify; issues tokens |
| POST | `/otp/send` | — | Rate-limited OTP resend |
| POST | `/login` | — | Requires verified phone for passenger/driver |
| POST | `/refresh` | — | Rotating refresh; reuse revokes family |
| POST | `/logout` | JWT | Optional refresh body |
| POST | `/logout-all` | JWT | All sessions + refresh tokens |
| GET | `/me` | JWT | Profile + driver approval status |
| GET | `/sessions` | JWT | Active sessions |
| DELETE | `/sessions/:id` | JWT | Revoke one session |
| POST | `/password-reset/request` | — | OTP to phone |
| POST | `/password-reset/confirm` | — | Sets new password; revokes sessions |
| POST | `/admin/2fa/setup` | Admin JWT | Stores TOTP secret (2FA-ready) |
| POST | `/admin/2fa/enable` | Admin JWT | Enforces TOTP on admin login |
| POST | `/admin/2fa/disable` | Admin JWT | Password + TOTP |

## Security

- Passwords: **Argon2id**
- Access JWT (short) + hashed refresh tokens in DB
- Suspension blocks login/JWT validation
- Driver register → `DriverProfile.approvalStatus=PENDING_KYC`
- Throttling on auth/OTP routes
- Audit log rows for register/login/logout/reset/2fa

## Providers

- `OTP_PROVIDER=prisma` (persisted challenges) + `SMS_PROVIDER=mock` (logs codes locally)
- Production launch gate still requires real SMS before prod

## Prerequisite

```bash
docker compose up -d
cd backend
npx prisma db push
npm run start:dev
```

(`db push` syncs the full Prisma schema including auth tables. Formal migrate history will be added once Docker PostGIS is available on the host.)

Register smoke (local):

```bash
curl -X POST http://127.0.0.1:4000/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"p1@example.com\",\"password\":\"password123\",\"phoneE164\":\"+14165550100\",\"role\":\"PASSENGER\",\"fullName\":\"Test User\"}"
# Use debugCode from response when NODE_ENV=local
curl -X POST http://127.0.0.1:4000/api/auth/otp/verify -H "Content-Type: application/json" -d "{\"challengeId\":\"...\",\"code\":\"......\"}"
```
