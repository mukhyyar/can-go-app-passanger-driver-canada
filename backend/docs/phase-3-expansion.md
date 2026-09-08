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
| `MAPS_PROVIDER` | `photon` | Photon geocode + OSRM route |
| `GOOGLE_MAPS_API_KEY` | empty | Required when `MAPS_PROVIDER=google` |

Endpoints: `GET /api/maps/provider`, `/api/maps/geocode`, `/api/maps/reverse`, `/api/maps/route`.

Flutter map UI remains Leaflet/OSRM; backend abstraction is ready for a client swap later.

## Schema notes

After `prisma db push`, re-apply PostGIS SQL (`phase1b_operating_zone_geom.sql`, `phase1d_locations_geom.sql`) and resync circle zone geoms — push drops unmanaged `geom` columns.
