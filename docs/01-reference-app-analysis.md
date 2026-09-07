# 01 — Reference App Analysis (GetTransfer)

## Purpose

Analyze **publicly available** information about GetTransfer passenger and driver products to inform TransferMarket design. This is **not** a reverse-engineering exercise and does **not** claim access to proprietary internals.

### Sources used

| Source | Type |
|--------|------|
| [Passenger App Store (CA)](https://apps.apple.com/ca/app/gettransfer-transfers-rides/id1150570978) | Public listing |
| [Driver App Store (CA)](https://apps.apple.com/ca/app/gettransfer-driver-service/id1458099338) | Public listing |
| [GetTransfer FAQ](https://gettransfer.com/en/faq) | Public product Q&A |
| [For Drivers / Carrier](https://gettransfer.com/en/carrier/new) | Public marketing |
| [KYC Policy](https://gettransfer.com/en/kyc) | Public policy |
| Third-party articles / interviews citing marketplace mechanics | Secondary; treat cautiously |

---

## 1. Confirmed reference functionality

### 1.1 Platform identity

| Fact | Evidence | Label |
|------|----------|-------|
| Worldwide online marketplace connecting passengers and drivers for private transfers | FAQ | **CONFIRMED** |
| Platform is a booking intermediary; transport provided by independent suppliers | FAQ disclaimer | **CONFIRMED** |
| Users can request transfers **and delivery services** | FAQ / App Store passenger description | **CONFIRMED** |
| Services include transfers, long-distance trips, cab rides, hourly chauffeur-driven rentals, delivery | Passenger App Store | **CONFIRMED** |
| Offers include actual vehicle photos, vehicle rating, hospitality ratings, completed rides **before payment** | FAQ / App Store | **CONFIRMED** |
| Drivers register, receive passenger requests, and **offer their own price** | Driver App Store / carrier page | **CONFIRMED** |
| Separate passenger and driver iOS apps; both free; Travel vs Business categories | App Store | **CONFIRMED** |
| Seller: KG GLOBAL LIMITED; copyright GETTRANSFER LTD | App Store | **CONFIRMED** |
| Broad localization (English + ~30 languages listed) | App Store | **CONFIRMED** |
| Apps include messaging/chat and user-generated content | Age rating notes | **CONFIRMED** |
| Driver app may use location even when not open | App Store location note | **CONFIRMED** |
| Recent update mentions cash payment option in some countries | App Store “What’s New” | **CONFIRMED** |
| Driver price includes free waiting: 60 min airports/ports, 30 min rail, 15 min other; gasoline and road tolls if any | FAQ | **CONFIRMED** |
| Booking flow (FAQ): pickup/destination (or hourly start/end) → transport type, passengers, extras → contact details → receive carrier offers | FAQ | **CONFIRMED** |
| Hourly chauffeur supported; comment field for stops/preferences | FAQ | **CONFIRMED** |
| If cannot contact driver, contact support; driver contacts in ride details | FAQ | **CONFIRMED** |
| Airport free wait 60 min; longer delays → support | FAQ | **CONFIRMED** |
| Carrier marketing: set working area; get notified of requests; check requests near scheduled drop-off | Carrier page | **CONFIRMED** |
| KYC may require ID, licenses, vehicle docs, residence, payment docs; anti-fraud examples (cancel patterns, passenger accepting own offer as carrier) | KYC Policy | **CONFIRMED** |
| Public interview claims ~5% commission on urgent rides (driver keeps 95%) | Secondary interview | **CONFIRMED as public claim** (not independently audited) |

### 1.2 Confirmed product model (marketplace tender)

```text
Passenger request → Drivers submit priced offers → Passenger compares → Pays → Booking → Trip → Review
```

This matches App Store + FAQ language. Instant auto-dispatch of nearest driver is **not** the marketed primary model.

---

## 2. Inferred functionality

| Inference | Basis | Label |
|-----------|-------|-------|
| Multi-country geo coverage with country/city specific supply | “Worldwide”, multi-language | **INFERRED** |
| Push notifications for new offers / requests | Standard marketplace + “receive offers” | **INFERRED** |
| Driver document verification before full marketplace access | KYC policy capabilities | **INFERRED** (policy allows requests; exact gate timing not public) |
| Offer list sortable/filterable by price/rating | Competitive marketplace UX | **INFERRED** |
| In-app chat between passenger and driver after booking | Age rating mentions messaging | **INFERRED** timing (pre vs post payment unclear) |
| Background location for live tracking on active trips | Driver continuous location note | **INFERRED** |
| Admin/ops tooling exists behind the scenes | Marketplace scale requires it | **INFERRED** |
| Promo/discount mechanisms exist | Marketing claims of discounts/benefits | **INFERRED** |
| Flight number / airport-specific UX | Airport transfer positioning + wait rules | **INFERRED** (common pattern; exact fields not fully public) |
| Driver wallet / payout mechanism | Marketplace with commissions | **INFERRED** (existence certain; UX details not public) |
| Ratings after completed verified trips | Blog/marketing: reviews tied to completed trips | **INFERRED** / secondary **CONFIRMED** via blog |

---

## 3. Not confirmed (unknowns)

Do **not** treat as GetTransfer facts:

- Exact commission schedule by country/service
- Exact offer/request TTL and ranking algorithm
- Whether payment is authorize-then-capture vs immediate charge
- Precise cancellation fee matrix in-app
- Internal matching radius formulas
- Whether phone numbers are masked
- Exact admin portal feature set
- Database/tech stack
- Fraud scoring models beyond KYC policy examples

All of the above for TransferMarket are **ASSUMPTION / RECOMMENDED IMPLEMENTATION** in later docs.

---

## 4. Passenger app — public capability map

| Capability | Status |
|------------|--------|
| Private transfers | **CONFIRMED** |
| Long-distance / city-to-city | **CONFIRMED** (App Store) |
| Hourly chauffeur | **CONFIRMED** |
| Delivery | **CONFIRMED** |
| Cab / on-demand style rides | **CONFIRMED** named; mechanics **INFERRED** as urgent requests |
| Compare offers before pay | **CONFIRMED** |
| Vehicle photos & ratings before pay | **CONFIRMED** |
| Cash in some countries | **CONFIRMED** (recent release notes) |
| Chat / messaging | **CONFIRMED** presence; depth **INFERRED** |
| Multi-language | **CONFIRMED** |

---

## 5. Driver app — public capability map

| Capability | Status |
|------------|--------|
| Register as driver/carrier | **CONFIRMED** |
| Receive passenger requests | **CONFIRMED** |
| Submit own price offers | **CONFIRMED** |
| Working area configuration | **CONFIRMED** (carrier marketing) |
| Notifications of new requests | **CONFIRMED** |
| Opportunistic requests near drop-off | **CONFIRMED** (marketing) |
| Background location | **CONFIRMED** (App Store) |
| Cash option (some countries) | **CONFIRMED** (release notes) |
| Document/KYC submission | **INFERRED** + policy **CONFIRMED** capability |

---

## 6. Business / legal posture (confirmed)

- Intermediary booking platform; not the transport provider (FAQ disclaimer).
- KYC / AML-style rights to request documents and investigate suspicious patterns (KYC policy).
- Fraud patterns called out: excessive cancellations; passenger and carrier role abuse (same user both sides).

**ASSUMPTION / RECOMMENDED:** TransferMarket should adopt similar intermediary terms, KYC gates, and self-dealing prevention.

---

## 7. UX / product lessons (for our product)

### Strengths to emulate (conceptually, not visually)

1. **Transparency before payment** — vehicle photos, ratings, trip history.
2. **Driver pricing power** — competitive tender.
3. **Advance booking fit** — transfers planned hours/days ahead.
4. **Service breadth** — transfer + hourly + long-distance (+ delivery later).
5. **Deadhead reduction** — notify drivers near upcoming drop-offs.

### Weaknesses / market complaints to avoid copying

| Observed theme (secondary sources / common marketplace feedback) | Our response |
|------------------------------------------------------------------|--------------|
| Uncertainty while waiting for bids | Show expected time-to-first-offer; allow request refresh; recommended price |
| Cancellation / refund ambiguity | Explicit policy engine shown on offer and booking |
| Payout delays / opacity (driver community reports — not official) | Ledger, statuses, reconciliation, SLAs |
| Quality variance | Verification, photo authenticity checks, review moderation |
| Support friction when driver unreachable | Escalation paths, SLA, optional masked call |

---

## 8. Mapping reference → TransferMarket

| Reference concept | TransferMarket module |
|-------------------|------------------------|
| Ride request | `RideRequest` |
| Carrier offer | `DriverOffer` |
| Booking after payment | `Booking` + `Payment` |
| Free waiting by location type | `WaitingPolicy` (configurable) |
| Working area | `DriverServiceArea` (PostGIS) |
| Vehicle photos before pay | `VehiclePhoto` on offer payload |
| Delivery | Phase 2+ `service_type=delivery` |
| Cash (some countries) | `PaymentMethod` gated by country config |
| KYC | `DriverDocument` + admin verification |

---

## 9. Screenshot / deep UX note

Interactive deep dive of private app screens was **not** performed as a proprietary UI clone exercise. Screen inventory in this docs set is **ASSUMPTION / RECOMMENDED IMPLEMENTATION** based on confirmed flows + marketplace best practice, not pixel specs of GetTransfer.

---

## 10. Summary verdict

GetTransfer is a **global transfer tender marketplace** with separate passenger and driver apps, offer comparison before payment, driver-set pricing, multi-service catalog, and intermediary legal posture. TransferMarket should implement the **same marketplace mechanics** with stronger **operations, payments transparency, policy clarity, and safety** — without copying branding or UI.
