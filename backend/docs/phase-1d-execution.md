# Phase 1d — Trip execution, live tracking, FCM, ratings

## Trip lifecycle (post-BOOKED)

```
BOOKED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → TRIP_STARTED → IN_PROGRESS → COMPLETED
```

`TRIP_STARTED` auto-advances to `IN_PROGRESS`. Every transition writes `RideEvent` + audit + FCM (when tokens exist) + Socket.IO `ride.event`.

| Method | Path | Actor |
|--------|------|-------|
| POST | `/rides/:id/transitions` `{ status }` | driver / passenger / admin (validated) |
| POST | `/driver/rides/:id/en-route` | DRIVER |
| POST | `/driver/rides/:id/arrived` | DRIVER |
| POST | `/driver/rides/:id/start` | DRIVER |
| POST | `/driver/rides/:id/complete` | DRIVER |
| POST | `/driver/rides/:id/no-show` | DRIVER |

Also: passenger cancel from BOOKED/EN_ROUTE/ARRIVED; driver cancel; admin `ADMIN_CANCELLED`.

## Live tracking

| Channel | Detail |
|---------|--------|
| Socket.IO | namespace `/tracking`, auth via `handshake.auth.token` |
| Events | `ride.subscribe`, `location.update` → emit `location` / `ride.event` |
| HTTPS fallback | `POST /tracking/location` (DRIVER) |
| Read | `GET /rides/:id/location` |
| Redis | `driver:{id}:loc`, `ride:{id}:driver_loc` TTL 5m |
| DB | `DriverLocationCurrent`, `TripLocationSample` (downsample ≥20s or ≥50m) |

PostGIS optional: `prisma/sql/phase1d_locations_geom.sql` (+ re-apply `phase1b_operating_zone_geom.sql` after `db push`).

## FCM + deep links

- `NotificationsService.sendToUser` / `notifyRideStatus`
- Payload data: `type`, `rideId`, `status`, `deepLink=/rides/{id}`
- Invalid token cleanup on FCM error codes
- `POST /notifications/device-tokens` now **JWT-required** (binds to current user)

## Ratings

| Method | Path |
|--------|------|
| POST | `/rides/:id/ratings` `{ stars:1-5, comment? }` |
| GET | `/rides/:id/ratings` |

Only after `COMPLETED`; one rating per user per ride. Moderation = Phase 2.

## Flutter (partial in 1d)

- Map pick **Done** no longer hardcodes `MockData.places[0|1]` — uses the displayed pin coords.
- Full API/FCM/native geo wiring remains **Phase 1e**.
