# Phase 3 — Expansion

See [`backend/docs/phase-3-expansion.md`](../backend/docs/phase-3-expansion.md).

DELIVERY / CAR_RENTAL / EXPERIENCES pricing + booking, VIP request/admin, referrals, driver calendar day-off (filters open requests), optional Google Maps geocode/route via `MAPS_PROVIDER`.

## Client wire (Flutter UI kept)

- Passenger Book maps all five service types; car rental `days` from return date when set
- Menu **Request VIP** → `POST /passenger/vip/request`
- Driver **Add day off** → `POST /driver/day-offs`
- Driver onboarding referral field → `POST /referrals/redeem` (non-blocking)
- Catalog list available via `gt_api` (`GET /catalog`)
