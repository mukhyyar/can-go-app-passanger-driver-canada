# Phase 1e — Client wire

Wire existing Flutter UIs and scaffold Passenger Web + Admin Ops against Nest `:4000`.

## Flutter

Shared package: `mobile/packages/gt_api` (`CanGoSession`, auth, marketplace, driver KYC/trips).

| App | API base | Auth gate | Wired |
|-----|----------|-----------|--------|
| Passenger | `http://127.0.0.1:4000/api` (`CANGO_API_BASE`) | `/auth` | Register/OTP/login, create ride + quote, poll offers, select + Dev pay, rides list |
| Driver | same | `/auth` | Register/OTP/login, KYC multipart uploads, operating zones POST, open requests + bids; **no demo activation toggle** |

Still local/prototype for Phase 1e: FCM token register from clients, Socket.IO live map UI binding, full native geolocator push loop (HTTP `/tracking/location` exists for later).

## Web

| App | Port | Scope |
|-----|------|--------|
| `apps/web-passenger` | **3002** | Auth + `/me` + rides list (book/pay remain Flutter for now) |
| `apps/admin` | **3001** | Admin login, KYC queue, document review, activate |

```bash
cd apps/web-passenger && npm install && npm run dev
cd apps/admin && npm install && npm run dev
```

API: `NEXT_PUBLIC_CANGO_API_BASE` (default `http://127.0.0.1:4000/api`).

## Flutter preview

Use `flutter run -d web-server --web-port=5050 --web-hostname=127.0.0.1` only (Cursor IDE browser). Never Chrome/Edge flags.
