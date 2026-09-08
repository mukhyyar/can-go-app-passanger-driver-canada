# Phase 1c — Marketplace (through BOOKED)

## Flow

```
POST /rides → WAITING_FOR_OFFERS
POST /rides/:id/offers (driver) → OFFER_SELECTION
POST /rides/:id/select-offer → PAYMENT_PENDING
POST /payments/intents (DevPayment succeeds) → BOOKED
```

Also: passenger cancel, request/offer/pay TTL → `EXPIRED` (30s in-process sweeper).

## Pricing (server-authoritative)

| Endpoint | Auth | Notes |
|----------|------|-------|
| `POST /api/pricing/quote` | JWT | Guidance + min/max bid band |

- Haversine distance (RIDE) or hours (PER_HOUR)
- Rules in `FareRule` (seeded for `RIDE`/`PER_HOUR`, sedan/van/`*`)
- Offer bids validated; select freezes snapshot (`passengerTotal`, `driverEarning`, fees)

Phase 1 service types only: **RIDE**, **PER_HOUR**.

## Rides / offers / payments

| Method | Path | Role |
|--------|------|------|
| POST | `/rides` | PASSENGER (+ optional `Idempotency-Key`) |
| GET | `/rides` | PASSENGER |
| GET | `/rides/:id` | Passenger / assigned or bidding driver / admin |
| POST | `/rides/:id/cancel` | PASSENGER |
| POST | `/rides/:id/select-offer` | PASSENGER `{ offerId }` |
| GET | `/driver/requests` | DRIVER (activated; PostGIS zone match) |
| POST | `/rides/:id/offers` | DRIVER `{ bidAmount }` |
| POST | `/payments/intents` | PASSENGER `{ rideId }` |
| POST | `/payments/webhooks/:provider` | public (Dev parses JSON body) |

## Matching

Activated + `APPROVED` drivers only. Open rides whose pickup point is inside an `OperatingZone.geom` (`ST_Contains`). If driver has no zones with geom, falls back to open rides (local/dev).

## Config TTLs

| Window | Default |
|--------|---------|
| Request | 30 min |
| Offer | 15 min |
| Payment | 15 min |

## Out of scope (Phase 1d+)

Post-BOOKED trip states, live GPS, FCM fan-out, Flutter wire (1e).
