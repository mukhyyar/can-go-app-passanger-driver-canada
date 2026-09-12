# Phase 3 — Expansion

## Service types

Pricing (`POST /api/pricing/quote`) and ride create (`POST /api/rides`) accept:

| `serviceType` | Dropoff | Duration fields | Notes |
|---------------|---------|-----------------|-------|
| `RIDE` | required | — | Existing point-to-point |
| `PER_HOUR` | optional | `hours` | Hourly charter |
| `DELIVERY` | required | — | Same distance model as RIDE |
| `CAR_RENTAL` | optional | `days` (or derive from `hours`) | Optional `catalogItemId` |
| `EXPERIENCES` | optional | — | Prefer `catalogItemId` for fixed packages |

VIP passengers (`PassengerProfile.isVip`) get a **1.15×** guidance multiplier on quotes.

Seeded catalog: `GET /api/catalog?serviceType=EXPERIENCES|CAR_RENTAL`.

## VIP

- `POST /api/passenger/vip/request` — passenger marks interest (`vipRequestedAt`)
- `GET /api/passenger/vip` — `{ isVip, status: ACTIVE|PENDING|NONE }`
- `POST /api/admin/passengers/:profileId/vip` — `{ isVip }` (admin)

## Referrals

- `POST /api/passenger/referral/ensure` — allocates passenger referral code
- `POST /api/referrals/redeem` — `{ code }` (driver or passenger); stores `ReferralRedemption` + `Driver.referredByCode` when applicable

## Driver day-off

- `GET/POST /api/driver/day-offs` — `{ date: YYYY-MM-DD, note? }`
- `DELETE /api/driver/day-offs/:id`
- Open-request listing **hides** rides whose pickup calendar day is on the driver's day-off list

## Maps provider

| Env | Default | Notes |
|-----|---------|-------|
| `MAPS_PROVIDER` | `google` | Google Maps only |
| `GOOGLE_MAPS_API_KEY` | empty | Server key — Geocoding, Directions, Places API (New) |
| `GOOGLE_MAPS_BROWSER_API_KEY` | falls back to server key | Browser Maps JS / Embed (HTTP referrers). Exposed as `GET /api/maps/browser-config` |

Endpoints: `GET /api/maps/provider`, `/api/maps/browser-config`, `/api/maps/geocode`, `/api/maps/places`, `/api/maps/reverse`, `POST /api/maps/route` (includes overview polyline when available).

All map UIs (Flutter, Next.js admin/passenger) use Google Maps. Browser keys need HTTP referrers allowing local ports (`http://127.0.0.1:3001/*`, `:3002/*`, `:5050/*`, etc.).

## Schema notes

After `prisma db push`, re-apply PostGIS SQL (`phase1b_operating_zone_geom.sql`, `phase1d_locations_geom.sql`) and resync circle zone geoms — push drops unmanaged `geom` columns.
