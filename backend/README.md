# CAN-GO Backend (NestJS)

Phase 0 foundations for the CAN-GO marketplace platform.

## Quick start

```bash
cp .env.example .env
# Install Docker Desktop, then from repo root:
# docker compose up -d
npx prisma generate
# after Postgres is up:
# npx prisma migrate dev --name phase0_init
npm run start:dev
```

API base: `http://127.0.0.1:4000/api`

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `GET /health/ready` | DB / Redis / Firebase / providers |
| `GET /providers/status` | Launch-gate checklist |
| `POST /notifications/device-tokens` | FCM token registration stub |

See [docs/phase-0.md](../docs/phase-0.md) for Firebase setup and launch-gate rules.

**Do not commit** `.env` or `secrets/*-adminsdk.json`.
