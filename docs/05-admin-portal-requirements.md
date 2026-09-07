# 05 — Admin Portal Requirements

**Application:** Web Admin / Operations Portal (Next.js recommended)  
**Status:** Entire admin surface is **ASSUMPTION / RECOMMENDED IMPLEMENTATION** (reference admin UI is not public).

---

## 1. Goals

- Verify drivers and vehicles.
- Operate bookings end-to-end.
- Manage payments, refunds, payouts.
- Handle support and disputes with audit trails.
- Configure multi-country marketplace rules.
- Observe health of supply, demand, and finance.

---

## 2. Information architecture (sidebar)

1. Dashboard  
2. Customers  
3. Drivers  
4. Vehicles  
5. Ride Requests  
6. Offers  
7. Bookings  
8. Live Trips  
9. Payments  
10. Driver Payouts  
11. Refunds  
12. Disputes  
13. Support  
14. Promotions  
15. Reviews  
16. Locations (countries, cities, airports, zones)  
17. Vehicle Categories  
18. Reports  
19. Notifications (templates)  
20. CMS (help/FAQ)  
21. Settings  
22. Audit Logs  
23. Roles & Permissions  

---

## 3. Dashboard KPIs

| KPI |
|-----|
| Total users / new users |
| Drivers: total, approved, pending |
| Active requests / open offers |
| Confirmed bookings / active rides |
| Completed / cancelled |
| GMV / platform revenue |
| Driver payouts outstanding |
| Refunds / disputes open |
| Offer coverage: % requests with ≥1 offer |

Filters: date range, country, city.

---

## 4. Customer management

Search, profile, booking history, payment history, complaints, verify email/phone, suspend/block/reactivate, internal notes, audit log.

---

## 5. Driver management

| Action | Audit? |
|--------|--------|
| Review registration / KYC / documents | Yes |
| Approve / reject / request more docs | Yes |
| Suspend / reactivate | Yes |
| Track document expiry | Yes |
| View trips, earnings, payouts, ratings, complaints | Yes |

---

## 6. Vehicle management

Approve/reject photos & docs; suspend; category mapping; capacity overrides if needed (rare).

---

## 7. Booking operations

Search booking → timeline → passenger/driver/vehicle → offers → payment → chat/system events → cancel / reassign (strict rules) → refund → adjustment → internal note → escalate dispute.

**Reassignment:** Only if policy allows (driver cancel / no-show); otherwise create new request flow.

---

## 8. Finance

- Payment list + webhook logs  
- Refund tooling (full/partial) with reason codes  
- Payout batches + reconciliation  
- Commission rule CRUD  
- Manual adjustments (credited/debited) with dual-control for large amounts (**RECOMMENDED**)  

---

## 9. Disputes

### Categories

Payment, driver no-show, passenger no-show, vehicle mismatch, driver behavior, passenger behavior, overcharging, damage, lost item, safety, refund, other.

### Statuses

`open` → `assigned` → `waiting_customer` / `waiting_driver` → `under_investigation` → `resolved` / `rejected` / `refunded` → `closed`

Evidence store + full history.

---

## 10. Support tickets

Help desk: categories, priority, SLA timers, assignment, booking link, attachments, internal notes, macros.

---

## 11. Promotions

Promo codes, referrals, first-ride, geo-targeted, % or fixed, limits, min GMV, expiry, user-specific.

---

## 12. Catalog & geo config

Countries, regions, cities, airports, service zones (GeoJSON), currencies, tax rules, waiting policies, cancellation policies, payment methods enabled, required driver documents per country.

---

## 13. Reviews moderation

Hide/remove abusive content; optionally recalculate visible rating aggregates.

---

## 14. Notifications / CMS

Template editor for push/email/SMS with variables; FAQ/help articles per language.

---

## 15. Security requirements

- SSO or strong password + 2FA for admins (**RECOMMENDED** MFA mandatory)  
- RBAC enforcement on every endpoint  
- Audit log for sensitive actions  
- IP allowlist optional for production admin  
- Session timeout  

---

## 16. Non-functional

- Server-side pagination, saved filters  
- Export CSV for finance (access-controlled)  
- Soft delete where needed; never hard-delete financial rows  
- Responsive desktop-first; tablet acceptable  
