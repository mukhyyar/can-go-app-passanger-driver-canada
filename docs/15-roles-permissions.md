# 15 — Roles & Permissions

## 1. Role catalog

| Role | Domain |
|------|--------|
| Super Admin | Full access |
| Admin | Broad ops except destructive system |
| Operations Manager | Bookings, live trips, escalations |
| Operations Agent | Bookings support actions (limited refunds) |
| Finance Manager | Payouts, refunds, reconciliation, rules |
| Finance Agent | Refunds/payouts within limits |
| Driver Verification Officer | KYC, vehicles, docs |
| Customer Support Manager | Tickets, SLAs, macros |
| Customer Support Agent | Tickets, view bookings |
| Marketing Manager | Promotions, CMS |
| Analyst | Read-only reports |
| Driver | Driver app APIs |
| Passenger | Passenger app APIs |

---

## 2. Permission matrix (staff)

Legend: F = full, L = limited, R = read, — = none

| Permission | Super | Admin | Ops Mgr | Ops Agt | Fin Mgr | Fin Agt | KYC Off | CS Mgr | CS Agt | Mkt | Analyst |
|------------|:-----:|:-----:|:-------:|:-------:|:-------:|:-------:|:-------:|:------:|:------:|:---:|:-------:|
| users.read | F | F | F | F | F | R | F | F | R | R | R |
| users.suspend | F | F | L | — | — | — | L | L | — | — | — |
| drivers.verify | F | F | L | — | — | — | F | — | — | — | — |
| vehicles.verify | F | F | L | — | — | — | F | — | — | — | — |
| bookings.read | F | F | F | F | F | R | R | F | F | R | R |
| bookings.cancel | F | F | F | L | — | — | — | L | — | — | — |
| bookings.refund | F | F | L | L | F | L | — | — | — | — | — |
| payouts.manage | F | F | — | — | F | L | — | — | — | — | — |
| commission.manage | F | F | — | — | F | — | — | — | — | — | — |
| disputes.manage | F | F | F | L | L | — | — | F | L | — | — |
| support.manage | F | F | L | L | — | — | — | F | L | — | — |
| promotions.manage | F | F | — | — | — | — | — | — | — | F | — |
| geo.config | F | F | L | — | — | — | — | — | — | — | — |
| roles.manage | F | L | — | — | — | — | — | — | — | — | — |
| audit.read | F | F | L | — | F | L | L | L | — | — | R |
| reports.export | F | F | L | — | F | L | — | — | — | L | R |

**L** = constrained by amount caps, own assignments, or non-destructive only.

---

## 3. Marketplace actor permissions

### Passenger
- CRUD own profile (with verify on contact change)  
- Create/cancel own requests  
- View offers for own requests  
- Accept offer / pay  
- Manage own bookings (cancel per policy)  
- Chat on own bookings  
- Rate completed bookings  

### Driver
- Manage own driver profile, docs, vehicles, availability  
- View eligible marketplace requests  
- Submit/edit/withdraw own offers  
- Transition trip statuses on own bookings  
- View own wallet/payouts  
- Chat on own bookings  

---

## 4. Enforcement

- JWT claims include `roles[]`  
- Guards on every admin route  
- UI hides unauthorized actions **and** API enforces  
- Dual-control (**RECOMMENDED**) for refunds/payouts above threshold  

---

## 5. Audit

Any permission marked sensitive writes `audit_logs` with before/after.
