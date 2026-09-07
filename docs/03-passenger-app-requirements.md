# 03 — Passenger App Requirements

**Application:** Passenger Mobile (iOS + Android via Flutter) + Public Web Booking Portal (shared flows)  
**Evidence:** Flows marked **CONFIRMED** where derived from public GetTransfer materials; otherwise **ASSUMPTION / RECOMMENDED IMPLEMENTATION**.

---

## 1. Goals

- Create transportation requests quickly and accurately.
- Receive and compare driver offers with transparency before payment.
- Manage bookings, payments, live trip awareness, chat/support.
- Multi-language / multi-currency ready.

---

## 2. Authentication & account

| Feature | Notes | Status |
|---------|-------|--------|
| Splash | Brand + init (config, session restore) | **RECOMMENDED** |
| Country / language selection | Persist; affects currency/phone formats | **RECOMMENDED** (multi-language **CONFIRMED** on reference) |
| Onboarding carousel | Explain tender model (request → offers → choose) | **RECOMMENDED** |
| Sign up | Email + phone required | **RECOMMENDED** |
| Login | Email/phone + password or OTP-first | **RECOMMENDED** |
| Phone OTP verification | SMS rate-limited | **RECOMMENDED** |
| Email verification | Link or code | **RECOMMENDED** |
| Forgot password | Email/SMS reset | **RECOMMENDED** |
| Social login (Apple/Google) | Optional convenience | Phase 2 **RECOMMENDED** |
| Terms + Privacy consent | Blocking gate | **RECOMMENDED** |
| Account deletion | GDPR-style request + retention rules | **RECOMMENDED** |

### Auth states

`anonymous` → `registered_unverified` → `verified` → `restricted` / `suspended` / `deleted_pending`

---

## 3. Navigation (recommended)

Bottom tabs (do **not** copy reference blindly):

| Tab | Purpose |
|-----|---------|
| **Home** | Create request; active request status |
| **Bookings** | Upcoming / active / past / cancelled |
| **Messages** | Booking chats + support threads |
| **Inbox** | Notifications |
| **Profile** | Account, payment methods, addresses, settings |

**ASSUMPTION / RECOMMENDED:** Keep offer-waiting state visible from Home (badge / banner) so users don’t “lose” open requests.

---

## 4. Home / booking entry

Service type selector:

1. One-way transfer  
2. Return transfer  
3. Airport transfer (pickup or drop-off helpers)  
4. Hourly chauffeur  
5. Long-distance (may be same form with distance hint)  
6. Delivery (Phase 2)

**CONFIRMED** service families on reference: transfers, long-distance, cab rides, hourly chauffeur, delivery.

---

## 5. One-way transfer flow

```text
Pickup → Destination → Date → Time → Passengers → Luggage → Vehicle prefs → Options → Review → Submit
```

### Fields

| Field | Validation |
|-------|------------|
| Pickup place / pin | Required; lat/lng + formatted address |
| Destination | Required (except pure hourly) |
| Stops | Optional list; order preserved |
| Date | ≥ today in pickup timezone (urgent may allow “now”) |
| Time | Required; timezone stored |
| Passenger count | ≥ 1; max by catalog |
| Child seats | Count + type optional |
| Luggage | Count or size class |
| Vehicle category preference | Optional (Any / Economy / Comfort / Van / …) |
| Accessibility | Optional flags |
| Notes | Max length; PII warning |
| Currency | From country/profile |

Submit creates `RideRequest` status `open` (or `matching`).

---

## 6. Return transfer

**ASSUMPTION / RECOMMENDED:**

- Create linked pair (`outbound_request_id`, `return_request_id`) **or** single request with `return_datetime`.
- Prefer linked requests so drivers can bid on one or both (product decision — see open questions).
- MVP: capture return date/time; create two requests with `group_id`.

---

## 7. Airport transfer

| Feature | MVP | Notes |
|---------|-----|-------|
| Airport pickup / drop-off detection | Yes | Places types / airport catalog |
| Flight number | Yes | Optional but encouraged |
| Airline | Yes | |
| Terminal | Optional | |
| Meet & greet / name board | Yes | Extra flag |
| Free waiting display | Yes | From policy (**CONFIRMED** tiers on reference) |
| Live flight tracking sync | Phase 2 | Background job |

---

## 8. Hourly chauffeur

| Field | Notes |
|-------|-------|
| Pickup | Required |
| Start datetime | Required |
| Hours | Min/max configurable |
| Vehicle class | Required or preferred |
| Passengers | Required |
| Route notes / stops | Free text + optional stops |

**CONFIRMED** on reference FAQ.

---

## 9. Delivery / courier (Phase 2)

Pickup, drop-off, package description, size, weight, recipient name/phone, delivery notes.  
**CONFIRMED** as reference service; **out of MVP** unless business prioritizes.

---

## 10. Location & map experience

See [12-realtime-location-architecture.md](./12-realtime-location-architecture.md).

Passenger must:

- Autocomplete places  
- Use current location (if permitted)  
- Adjust pickup pin  
- See route preview (distance/duration estimate)  
- Save Home / Work / recent  

**GPS denied:** manual search only; explain banner; do not block booking.

---

## 11. After request submitted

| State UI | Behavior |
|----------|----------|
| Waiting for offers | List grows in real time (WS/push); empty state education |
| Offers available | Comparison list + detail |
| Offer selected / paying | Payment sheet |
| Confirmed | Booking detail |
| Expired / cancelled | CTA to recreate |

---

## 12. Offer comparison

Each offer card (**RECOMMENDED** fields):

- Driver display name / carrier name  
- Rating + completed trips  
- Vehicle make/model/year/color/category  
- Photos (gallery)  
- Capacity passengers/luggage  
- Price breakdown: offer, fees, tax, **total**  
- Included services / extras  
- Cancellation summary  
- Waiting policy summary  
- Languages spoken (if collected)  
- CTA: **Select offer**

Sorting: Recommended | Lowest price | Highest rated | Best vehicle | Newest offer  

Detail: [07-driver-bidding-engine.md](./07-driver-bidding-engine.md).

---

## 13. Payment

- Saved cards via PSP tokenization  
- Apple Pay / Google Pay (Phase 2 if not MVP)  
- Cash where `country.allows_cash` (**CONFIRMED** exists on reference in some countries)  
- Promo code field (Phase 2)  
- Never show raw PAN  

Failure: retry; booking not confirmed without success (except cash holds — define carefully).

---

## 14. Booking management

| List | Filter |
|------|--------|
| Upcoming | Confirmed future |
| Active | In trip lifecycle |
| Completed | History |
| Cancelled | Cancelled / no-show |

### Booking detail

Booking number, driver, vehicle, route, datetime, passengers, flight, price, payment status, contact (chat / masked call), cancel, support, receipt.

---

## 15. Live trip (passenger)

- Driver/vehicle location on map  
- ETA  
- Status banners (heading / arrived / onboard / completed)  
- Contact actions  
- Share trip status (Phase 2)

---

## 16. Chat & support

- In-app chat per booking (after confirmation for MVP)  
- Help center / FAQ  
- Create ticket linked to booking  
- Account deletion & privacy requests in Profile  

---

## 17. Ratings

After completion: overall + optional category ratings + written review.  
**CONFIRMED** concept of post-trip reviews on reference marketing.

---

## 18. Profile

- Personal info, photo  
- Phone/email change with re-verify  
- Payment methods  
- Saved addresses  
- Language, currency, distance units  
- Notification preferences  
- Legal docs  
- Delete account  

---

## 19. Permissions

| Permission | When | If denied |
|------------|------|-----------|
| Location | Map / live trip | Manual address entry |
| Notifications | After login | In-app inbox only |
| Camera / photos | Chat attachments Phase 2 | Text-only |
| Contacts | Not required MVP | — |

---

## 20. Analytics events (passenger)

`auth_signup`, `request_started`, `request_submitted`, `offer_viewed`, `offer_selected`, `payment_succeeded`, `booking_cancelled`, `trip_completed_view`, `review_submitted`, …

---

## 21. Web booking portal

Parity for: request create, offer compare, pay, booking manage.  
Account optional for browse? **ASSUMPTION:** require account before submit for fraud control. Guest checkout is open question.
