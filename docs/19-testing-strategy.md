# 19 — Testing Strategy

## 1. Test pyramid

| Layer | Focus | Tools (recommended) |
|-------|-------|---------------------|
| Unit | Domain services, state transitions, commission/cancel math | Jest/Vitest |
| Integration | Modules + DB (testcontainers) | Jest + Postgres |
| API | Contract + authz | Supertest / Pact optional |
| Mobile | Widget/golden + integration | Flutter test / integration_test |
| Admin | Critical flows | Playwright |
| E2E | Marketplace happy path + cancels | Playwright + device farm |
| Load | Offers fan-out, WS, GPS ingest | k6 |
| Security | OWASP ZAP, dependency scan | CI |
| Payment | PSP test mode + webhook fixtures | Stripe test clocks |

---

## 2. Critical E2E scenarios

1. **Happy path:** Request → Offer → Accept → Pay → Heading → Arrived → Start → Complete → Wallet credit → Review  
2. **No offers:** Request expires; passenger recreates  
3. **Payment fail then retry:** Same idempotency; eventual confirm  
4. **Duplicate webhook:** Single confirm  
5. **Passenger late cancel:** Fee + refund math  
6. **Driver cancel after confirm:** Refund + penalty  
7. **Concurrent accept:** One winner  
8. **Expired docs block trip start**  
9. **Urgent mode eligibility**  
10. **Admin refund + audit log**  

---

## 3. State machine tests

Table-driven tests for every legal/illegal transition in [16-state-machines.md](./16-state-machines.md).

---

## 4. Geolocation testing

- Fake GPS fixtures  
- Accuracy filters  
- Geofence soft hints  
- Offline flush  

---

## 5. Regression

- Smoke suite on every PR  
- Full E2E on staging nightly  
- Store release checklist  

---

## 6. Acceptance criteria pattern

Each story: Given/When/Then + analytics event + permission + failure mode.
