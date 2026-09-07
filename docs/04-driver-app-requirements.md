# 04 — Driver App Requirements

**Application:** Driver / Carrier Mobile (iOS + Android via Flutter)  
**Evidence:** **CONFIRMED** items from public driver App Store + carrier pages + KYC policy; remainder **ASSUMPTION / RECOMMENDED**.

---

## 1. Goals

- Onboard and get verified.
- Discover eligible ride requests.
- Submit/edit/withdraw offers.
- Fulfill bookings with clear status machine.
- Track earnings, wallet, payouts.
- Communicate safely with passengers.

---

## 2. Navigation (recommended)

| Tab | Purpose |
|-----|---------|
| **Requests** | Marketplace feed + filters |
| **Bookings** | Upcoming / active / history |
| **Earnings** | Wallet, payouts, reports |
| **Messages** | Chats |
| **Profile** | Vehicles, docs, availability, settings |

**Online/Offline** control always visible (app bar / floating).

**CONFIRMED:** Drivers receive requests and offer prices; set working area; notified of requests; opportunistic near drop-off (**carrier marketing**).

---

## 3. Onboarding

| Step | Fields / actions |
|------|------------------|
| Register | Email, phone, password/OTP |
| Profile | Name, photo, address, country, language |
| Service area | Polygon or radius + center |
| Documents | Licence, ID, proof of address, insurance, permits |
| Vehicles | Add ≥1 vehicle + photos + docs |
| Wait for approval | Status screen until admin approves |

### Verification statuses

`draft` → `submitted` → `under_review` → `approved` | `rejected` | `suspended`

**CONFIRMED:** Platform may request ID, licences, vehicle docs, residence proofs (KYC policy).  
**ASSUMPTION / RECOMMENDED:** Marketplace bidding locked until `approved` + ≥1 `approved` vehicle.

---

## 4. Document management

| Document | Track expiry |
|----------|--------------|
| Driving licence | Yes |
| Identity document | Yes |
| Proof of address | Optional expiry |
| Insurance | Yes |
| Vehicle registration | Yes |
| Commercial / operator licence | Per country |
| Background check attestation | Per country |

Statuses: `pending`, `approved`, `rejected`, `expired`.  
Jobs remind before expiry; auto-restrict if expired.

---

## 5. Vehicle management

Drivers may manage **multiple vehicles**.

### Fields

Manufacturer, model, year, color, plate, VIN (if legal), category, passenger capacity, luggage capacity, features, accessibility, photos, registration/insurance/inspection docs.

### Vehicle statuses

`draft` → `pending_verification` → `approved` | `rejected` | `suspended` | `expired_documents`

**Rule:** Offers only with eligible `approved` vehicles.

---

## 6. Availability

| Control | Notes |
|---------|-------|
| Online / offline | Gates urgent + optionally advance feed |
| Working hours | Weekly schedule |
| Blocked dates | Vacations |
| Working radius / polygons | PostGIS |
| Calendar capacity | Max concurrent future bookings (**RECOMMENDED**) |

**CONFIRMED:** Working area + notifications; check requests near scheduled drop-off.

**ASSUMPTION / RECOMMENDED:** Ranking boost for requests near current location or upcoming destination (“anti-deadhead”).

---

## 7. Request marketplace feed

### Eligibility filters (backend)

Service zone, approval, vehicle class/capacity, availability, docs valid, no booking conflicts, country rules, distance.

### Request card (limited PII)

| Show | Hide until booked |
|------|-------------------|
| Pickup area (geohash/area name) | Exact door + full address detail if sensitive |
| Destination city/area | Exact unit if needed post-book |
| Distance / duration estimate | Passenger phone |
| Date/time | Full name optional until confirm |
| Passengers / luggage | Payment details |
| Vehicle requirement | |
| Special requests (sanitized) | |
| Time remaining to bid | |

Driver opens detail → select vehicle → price → conditions → **Submit offer**.

---

## 8. Offer management

Driver can:

- Submit offer  
- Edit offer while `pending` and before passenger accept (**RECOMMENDED**)  
- Withdraw offer  
- See status: pending / accepted / rejected / expired / withdrawn  

Constraints: min/max price, one active offer per request per driver (or per vehicle — decide), rate limits.

---

## 9. Urgent / immediate requests

**ASSUMPTION / RECOMMENDED** requirements:

- Driver online  
- Live location sharing on  
- Approved vehicle  
- Inside radius  
- Faster offer TTL  
- Strong push  

State machine: see [16-state-machines.md](./16-state-machines.md).

---

## 10. Booking workflow (driver)

```text
Upcoming → Preparing → HeadingToPickup → Arrived → Waiting
  → PassengerOnboard → TripStarted → AtDestination → Completed
```

Also: PassengerNoShow, DriverNoShow, cancellations, support intervention, emergency.

Who can trigger each state: [16-state-machines.md](./16-state-machines.md).

---

## 11. Live trip (driver)

- Turn-by-turn navigation (external Maps deep link MVP; in-app Phase 2)  
- Pickup instructions / flight / notes  
- Passenger display name + chat  
- Status action buttons  
- Offline queue for status updates  

Background location **CONFIRMED** as capability on reference driver app listing — implement with clear consent and battery disclosure.

---

## 12. Earnings & wallet

Dashboard:

- Available balance  
- Pending balance  
- Total earnings  
- Completed trips  
- Commission total  
- Adjustments / refunds / bonuses  
- Withdrawals + history  
- Per-trip breakdown (gross, commission, net)

Payout states: `pending`, `processing`, `paid`, `failed`, `on_hold`, `disputed`, `reversed`.

---

## 13. Chat & calling

- Booking-scoped chat after confirmation  
- Masked calling Phase 2 (Twilio or similar)  
- No raw passenger phone in MVP UI unless policy requires  

---

## 14. Ratings

Driver may rate passenger if product policy allows (**open question**).  
Passenger rates driver (**MVP**).

---

## 15. Profile & settings

- Personal data  
- Language  
- Notification prefs  
- Vehicles & documents  
- Payout methods (bank / PSP Connect)  
- Tax info as required by country  
- Delete/deactivate account request  

---

## 16. Permissions

| Permission | Required for |
|------------|--------------|
| Location (foreground/background) | Feed ranking, urgent, live trip |
| Notifications | Request/offer/booking events |
| Camera | Document + vehicle photos |
| Microphone | VoIP calling Phase 2 |

Denied location: advanced scheduled bidding may remain; urgent mode disabled.

---

## 17. Driver analytics (in-app)

Views, offers sent, win rate, completion rate, cancellation rate, average rating — Phase 2 dashboard widgets.
