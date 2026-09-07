# 11 — API Specification

**Base:** `https://api.{env}.transfermarket.example/api/v1`  
**Auth:** Bearer JWT access token (unless noted).  
**Idempotency:** Header `Idempotency-Key` required on payment/booking accept/refund/payout.  
**Errors:** RFC7807-style `{ "type", "title", "status", "detail", "code", "errors"? }`.

This document defines **TransferMarket** contracts (**RECOMMENDED**). Not reverse-engineered from GetTransfer.

---

## 1. Cross-cutting

| Concern | Rule |
|---------|------|
| Pagination | `?page=&per_page=` → `{ data, meta }` |
| Sorting | `?sort=price_asc` |
| Localization | `Accept-Language` |
| Currency display | Server amounts minor units |
| Rate limits | Per user/IP; stricter on OTP |
| Versioning | URL `/v1` |

### Common error codes
`UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE`, `RATE_LIMITED`, `PAYMENT_FAILED`, `IDEMPOTENCY_REPLAY`.

---

## 2. Auth — `/auth`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Password login |
| POST | `/auth/otp/request` | No | Send OTP |
| POST | `/auth/otp/verify` | No | Verify OTP → tokens |
| POST | `/auth/token/refresh` | Refresh | New access token |
| POST | `/auth/logout` | Yes | Revoke session |
| POST | `/auth/password/forgot` | No | Reset start |
| POST | `/auth/password/reset` | No | Reset complete |
| DELETE | `/auth/account` | Yes | Deletion request |

**Side effects:** SMS/email jobs; audit login failures.  
**Events:** `UserRegistered`, `UserVerified`.

---

## 3. Passenger — `/passenger`

| Method | URL | Purpose |
|--------|-----|---------|
| GET/PATCH | `/passenger/me` | Profile |
| GET/POST/DELETE | `/passenger/addresses` | Saved places |
| GET | `/passenger/payment-methods` | PSP list |
| POST | `/passenger/payment-methods/setup` | SetupIntent client secret |

Permissions: role passenger + verified phone.

---

## 4. Driver — `/driver`

| Method | URL | Purpose |
|--------|-----|---------|
| GET/PATCH | `/driver/me` | Profile |
| POST | `/driver/online` | `{ online: bool }` requires location if urgent |
| CRUD | `/driver/documents` | Upload meta + signed URL |
| CRUD | `/driver/vehicles` | Vehicles |
| POST | `/driver/vehicles/:id/photos` | Photos |
| GET/PUT | `/driver/service-areas` | Areas |
| GET/PUT | `/driver/availability` | Schedule |
| POST | `/driver/location` | Throttled GPS upsert |

Marketplace access requires `verification_status=approved`.

---

## 5. Requests — `/requests`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| POST | `/requests` | Passenger | Create request |
| GET | `/requests/mine` | Passenger | List |
| GET | `/requests/:id` | Owner/Admin | Detail |
| POST | `/requests/:id/cancel` | Owner | Cancel open request |
| GET | `/requests/marketplace` | Driver | Eligible feed |
| GET | `/requests/marketplace/:id` | Driver | Detail (redacted) |

### POST `/requests` validation (sample)

```json
{
  "service_type": "airport",
  "pickup": { "lat": 41.29, "lng": 2.07, "address": "BCN Airport T1" },
  "dropoff": { "lat": 41.38, "lng": 2.17, "address": "Barcelona center" },
  "scheduled_at": "2026-09-01T10:30:00+02:00",
  "passenger_count": 2,
  "luggage_count": 2,
  "flight_number": "VY1234",
  "meet_and_greet": true,
  "currency": "EUR"
}
```

**Events:** `RideRequestCreated` → matching.  
**Errors:** zone unsupported, invalid time, rate limit.

---

## 6. Offers — `/offers`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| POST | `/offers` | Driver | Submit |
| PATCH | `/offers/:id` | Driver | Edit pending |
| POST | `/offers/:id/withdraw` | Driver | Withdraw |
| GET | `/offers` | Passenger | List for request `?request_id=` |
| GET | `/offers/:id` | Party/Admin | Detail |
| POST | `/offers/:id/accept` | Passenger | Start payment+booking **Idempotent** |

### Accept side effects

Lock offer → booking `pending_payment` → PSP intent → on webhook confirm.  
**Events:** `OfferAccepted` (after pay), `BookingConfirmed`.  
**Errors:** expired, not pending, vehicle suspended, conflict.

---

## 7. Bookings — `/bookings`

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/bookings` | Role-scoped list |
| GET | `/bookings/:id` | Detail + timeline |
| POST | `/bookings/:id/cancel` | Policy engine |

---

## 8. Trips — `/trips`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| POST | `/trips/:bookingId/status` | Driver | Transition |
| GET | `/trips/:bookingId` | Parties | Live detail |
| POST | `/trips/:bookingId/locations` | Driver | Batch GPS |

Status body: `{ "status": "arrived", "at": "ISO-8601" }`  
**Errors:** `INVALID_STATE`.  
**Events:** `DriverArrived`, `TripStarted`, `TripCompleted`, …

---

## 9. Payments — `/payments`

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/payments/:id` | Status poll |
| POST | `/payments/:id/refund` | Admin/finance |

Webhooks: `POST /webhooks/stripe` (raw body signature).

---

## 10. Wallet — `/wallet`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| GET | `/wallet` | Driver | Balances |
| GET | `/wallet/transactions` | Driver | Ledger |
| POST | `/wallet/payouts` | Driver | Request payout |
| GET | `/wallet/payouts` | Driver | History |

---

## 11. Chat — `/chat`

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/chat/conversations` | List |
| GET | `/chat/conversations/:id/messages` | Page |
| POST | `/chat/conversations/:id/messages` | Send |

Also mirrored on WebSocket.

---

## 12. Notifications — `/notifications`

GET list, POST mark read, POST register device token.

---

## 13. Support — `/support`

Tickets CRUD, messages, categories. Admin assignment endpoints under `/admin/support`.

---

## 14. Locations / catalog — `/locations`, `/catalog`

Places proxy (server-side Maps key), reverse geocode, countries, vehicle categories, airports search.

**Note:** Prefer server-proxied Places to protect API keys.

---

## 15. Admin — `/admin/*`

Mirror ops requirements: users, drivers verify, vehicles, bookings timeline, refunds, payouts, disputes, commission rules, geo config, audit logs.  
Each mutating route: permission + audit log.

---

## 16. Endpoint documentation template

For implementation tickets, each route must specify:

1. Method + URL  
2. Authentication + permissions  
3. Request schema + validation  
4. Response schema  
5. Error cases  
6. Side effects  
7. Events emitted  
8. Idempotency requirements  

OpenAPI YAML to be generated in Phase 0/1 engineering — this Markdown is the product contract source.
