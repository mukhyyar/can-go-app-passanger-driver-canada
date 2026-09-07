# 22 — MVP vs Phase 2 vs Advanced

## MVP — required to operate

| Area | Include |
|------|---------|
| Auth | Email/phone, OTP, sessions |
| Passenger | One-way, airport basics, return as linked requests, offer compare, pay card, bookings, basic live status, rate driver |
| Driver | Onboarding, docs, vehicles, areas, feed, offers, booking statuses, basic GPS on active trip, wallet view, payout request |
| Admin | Verify drivers/vehicles, bookings timeline, refunds, basic dashboard, commission/cancel config, audit |
| Platform | NestJS monolith, Postgres/PostGIS, Redis jobs, Stripe, FCM, email, WS offers+trip |
| Geo | Single/multi-city config scaffold; English i18n framework |
| Support | FAQ + email/ticket basic |

## Phase 2 — important next

- In-app chat polish + images  
- Masked calling  
- Hourly chauffeur polish  
- Urgent mode  
- Promotions/referrals  
- Apple/Google Pay  
- Flight tracking sync  
- Driver→passenger ratings  
- Disputes full workflow  
- Advanced analytics  
- Trip sharing / SOS  
- Web booking portal parity  

## Advanced — differentiation

- Delivery/courier  
- Corporate accounts & API partners  
- Multi-PSP / Adyen  
- In-app navigation SDK  
- ML price suggestions / fraud scoring  
- Auto-rematch  
- Feature extraction to microservices  
- RTL language packs beyond EN  
- Dynamic featured driver placement (ethical/disclosed)  

---

## Explicitly not copying reference weaknesses

Prioritize payout transparency, cancellation clarity, dispute tracking, and safety even if that expands MVP slightly for finance ledger + policy display.
