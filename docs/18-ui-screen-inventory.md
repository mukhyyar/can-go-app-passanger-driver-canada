# 18 — UI Screen Inventory

Screen specs use the standard template. IDs are stable for QA traceability.  
Counts are estimates for TransferMarket (**RECOMMENDED**), not a clone of GetTransfer UI.

### Template fields

Screen ID · Name · App · Role · Purpose · Entry · Components · Primary CTA · Secondary CTA · Fields · Validation · Loading · Empty · Error · Offline · Permissions · APIs · Analytics · Next

---

## A. Passenger App (selected core screens)

| ID | Name | Purpose | Primary CTA |
|----|------|---------|-------------|
| P-01 | Splash | Init | — |
| P-02 | Language/Country | Locale | Continue |
| P-03 | Onboarding | Explain tender model | Get started |
| P-04 | Login | Auth | Log in |
| P-05 | Sign up | Register | Create account |
| P-06 | OTP | Verify phone | Verify |
| P-07 | Home | Start booking | Book transfer |
| P-08 | Service type | Choose product | Continue |
| P-09 | Pickup map | Set pickup | Confirm pickup |
| P-10 | Destination map | Set dropoff | Confirm |
| P-11 | Date/time | Schedule | Continue |
| P-12 | Passengers/luggage | Capacity | Continue |
| P-13 | Options | Flight, seats, notes | Continue |
| P-14 | Request review | Confirm submit | Submit request |
| P-15 | Waiting for offers | Live offers | View offers |
| P-16 | Offer list | Compare | Select |
| P-17 | Offer detail | Deep compare | Select offer |
| P-18 | Payment | Pay | Pay now |
| P-19 | Booking confirmed | Success | View booking |
| P-20 | Bookings list | Tabs upcoming/active/past | Open |
| P-21 | Booking detail | Manage | Contact / Cancel |
| P-22 | Live trip | Track | Chat |
| P-23 | Chat | Message driver | Send |
| P-24 | Notifications | Inbox | Open |
| P-25 | Profile | Settings hub | — |
| P-26 | Payment methods | Cards | Add |
| P-27 | Addresses | Saved places | Add |
| P-28 | Rate trip | Review | Submit |
| P-29 | Support | Help/ticket | Contact |
| P-30 | Legal | Terms/privacy | Accept |
| P-31 | Account delete | GDPR | Request deletion |

**MVP passenger unique screens ≈ 45–55** including variants (airport/hourly/return forms, empty/error states as reusable components).

### Example full spec — P-16 Offer list

- **Entry:** P-15 or push  
- **Components:** sort chips, offer cards (photo, price, rating, vehicle), pull-to-refresh  
- **Primary CTA:** Select on card  
- **Empty:** “Drivers are reviewing…” + tips  
- **Error:** Retry  
- **Offline:** Cached list + banner  
- **APIs:** `GET /offers?request_id=` + WS `request:{id}`  
- **Analytics:** `offer_list_viewed`, `offer_selected`  
- **Next:** P-17 or P-18  

---

## B. Driver App (core)

| ID | Name | Primary CTA |
|----|------|-------------|
| D-01 Splash | — |
| D-02 Login/Register/OTP | Continue |
| D-03 Onboarding profile | Save |
| D-04 Document upload | Submit |
| D-05 Pending approval | Contact support |
| D-06 Requests feed | Open request |
| D-07 Request detail | Make offer |
| D-08 Create offer | Submit offer |
| D-09 My offers | Manage |
| D-10 Bookings list | Open |
| D-11 Booking detail | Start navigation / status |
| D-12 Active trip | Status actions |
| D-13 Navigation handoff | Open Maps |
| D-14 Chat | Send |
| D-15 Earnings dashboard | Withdraw |
| D-16 Wallet ledger | — |
| D-17 Payout methods | Save |
| D-18 Vehicles list | Add vehicle |
| D-19 Vehicle editor | Save |
| D-20 Vehicle photos | Upload |
| D-21 Availability | Save |
| D-22 Service area map | Save |
| D-23 Online/offline explainer | Go online |
| D-24 Profile/settings | — |
| D-25 Notifications | Open |

**MVP driver ≈ 40–50 screens.**

---

## C. Admin Portal (pages)

| ID | Page |
|----|------|
| A-01 Dashboard |
| A-02 Customers list/detail |
| A-03 Drivers list/detail/verify |
| A-04 Vehicles verify |
| A-05 Requests |
| A-06 Offers |
| A-07 Bookings detail/timeline |
| A-08 Live trips map |
| A-09 Payments |
| A-10 Payouts |
| A-11 Refunds |
| A-12 Disputes |
| A-13 Support tickets |
| A-14 Promotions |
| A-15 Reviews |
| A-16 Locations/zones |
| A-17 Categories |
| A-18 Reports |
| A-19 Notification templates |
| A-20 CMS FAQ |
| A-21 Settings |
| A-22 Audit logs |
| A-23 Roles |

**MVP admin ≈ 35–45 pages.**

---

## D. Navigation summary

**Passenger tabs:** Home · Bookings · Messages · Inbox · Profile  
**Driver tabs:** Requests · Bookings · Earnings · Messages · Profile (+ Online toggle)  
**Admin:** Sidebar IA in [05-admin-portal-requirements.md](./05-admin-portal-requirements.md)

Wireframes are Phase 0 deliverables (Figma) — not included as code.
