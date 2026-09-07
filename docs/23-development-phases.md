# 23 — Development Phases & Estimation

**Note:** Sizes are relative effort (S/M/L/XL), **not** calendar dates.

| Size | Meaning |
|------|---------|
| S | Days |
| M | ~1–2 weeks for a small team slice |
| L | Multi-week module |
| XL | Major cross-cutting program |

---

## Phase 0 — Product definition

Deliverables: this `/docs` set, Figma wireframes, OpenAPI draft, ERD finalized, open questions answered.  
**Depends on:** business decisions in [24-assumptions-open-questions.md](./24-assumptions-open-questions.md).

---

## Phase 1 — Foundation

Auth, users, driver KYC, vehicles, geo catalog, admin base, storage signed URLs.  
**Complexity:** L–XL  
**Deps:** Phase 0 approvals  

---

## Phase 2 — Marketplace

Requests, matching, driver feed, offers, comparison UI.  
**Complexity:** XL  
**Deps:** Phase 1 approvals + vehicles  

---

## Phase 3 — Booking

Accept flow shell (pre-payment), booking lists, notifications core.  
**Complexity:** L  
**Deps:** Phase 2  

---

## Phase 4 — Payments

Stripe, refunds, commission, wallet, payouts, finance admin.  
**Complexity:** XL  
**Deps:** Phase 3  

---

## Phase 5 — Live trips

GPS, WS, trip state machine, chat MVP.  
**Complexity:** L  
**Deps:** Phase 4 (or parallel after booking confirmed with fake pay in staging)  

---

## Phase 6 — Operations

Disputes, support, promos, analytics.  
**Complexity:** L  
**Deps:** Phase 4–5  

---

## Phase 7 — Hardening

Security review, load tests, monitoring, store compliance, soft launch city.  
**Complexity:** M–L  
**Deps:** Phases 1–6 MVP scope  

---

## Module estimate matrix

| Module | Complexity | Depends on |
|--------|------------|------------|
| Passenger App | XL | API domains passenger/requests/offers/bookings |
| Driver App | XL | driver/vehicles/offers/trips/wallet |
| Admin | L | Most domains |
| Authentication | M | — |
| Marketplace requests | L | Auth, geo |
| Matching | L | Drivers, PostGIS |
| Bidding | XL | Requests, vehicles |
| Payments | XL | Bookings |
| Wallet/Payouts | L | Payments |
| Maps | L | Provider keys |
| Live tracking | L | WS, trips |
| Chat | M | Bookings |
| Notifications | M | Events |
| Support | M | Users/bookings |
| Analytics | M | Event pipeline |
| DevOps | M | Continuous |

---

## Recommended implementation order

1. Monorepo + CI + env  
2. Auth + RBAC  
3. Catalog/geo  
4. Driver KYC + vehicles + admin verify  
5. Ride requests + matching  
6. Offers + passenger compare  
7. Payments + booking confirm  
8. Trip statuses + location  
9. Wallet/payouts  
10. Notifications polish  
11. Chat  
12. Support/disputes  
13. Hardening + launch  

---

## Parallelization tips

- Flutter apps can stub APIs early with contract tests.  
- Admin verification UI parallel to driver onboarding.  
- Payment integration spike early (risk reduction) even if full wallet later.
