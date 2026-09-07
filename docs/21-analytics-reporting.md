# 21 — Analytics & Reporting

## 1. Principles

- Product analytics (Amplitude/Mixpanel/PostHog) for funnels  
- Warehouse events for finance (bookings, payments immutable facts)  
- Admin reports for ops — not a substitute for ledger  

---

## 2. Passenger funnel

| Step | Metric |
|------|--------|
| Search/home → request start | CTR |
| Request start → submit | Completion |
| Submit → first offer | Time-to-first-offer; % with ≥1 offer |
| Offer view → accept | Offer conversion |
| Accept → pay success | Payment success rate |
| Booking → complete | Completion rate |
| Complete → review | Review rate |
| Repeat booking 30d | Retention |

---

## 3. Driver funnel

| Metric |
|--------|
| Registration → approved |
| Request views → offer rate |
| Offer → win rate |
| Avg offer vs suggestion |
| Completion / cancel rates |
| Utilization (booked hours / online hours) |
| Earnings / payout success |

---

## 4. Revenue

| Metric | Definition |
|--------|------------|
| GMV | Sum passenger_total |
| Net revenue | Commission + fees − refunds − chargebacks − PSP fees |
| Take rate | Net revenue / GMV |
| Refund rate | Refunded amount / GMV |
| Payout liability | Available + pending balances |
| By country / service / vehicle class | Slices |

---

## 5. Quality & trust

Avg rating, complaint rate, dispute rate, no-show rates, verification backlog SLA.

---

## 6. Admin reports (MVP)

- Daily GMV & bookings  
- Offer coverage  
- Cancellation reasons  
- Payout ledger export  
- KYC queue aging  

Phase 2: cohorts, LTV, geographic heatmaps.
