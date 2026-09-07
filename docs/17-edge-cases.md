# 17 — Edge Cases

Each case lists detection, system behavior, and UX. All are **RECOMMENDED** handling for TransferMarket.

---

## Connectivity

| Case | Behavior |
|------|----------|
| Passenger loses internet during offer accept | Client retries with same Idempotency-Key; poll payment/booking |
| Driver loses internet mid-trip | Queue status + GPS; show “reconnecting”; passenger sees last known |
| Chat unavailable | REST fallback; banner |

## Location

| Case | Behavior |
|------|----------|
| Driver GPS disabled | Disable urgent; warn on active trip; allow non-live bookings management |
| GPS permission revoked | Same; deep link to settings |
| GPS drift / wrong location | Soft geofence only; passenger “I can’t find driver” → support + chat |
| Driver arrives wrong place | Chat + update pin; ops tools |

## Marketplace races

| Case | Behavior |
|------|----------|
| Duplicate offer submit | UNIQUE constraint; return existing |
| Two accept actions simultaneous | Row lock; loser `CONFLICT` |
| All offers expire / no offers | Passenger empty state + extend request CTA + support |
| Vehicle suspended after booking | Notify both; ops reassign or cancel+refund |
| Docs expire before future booking | Block driver start; force re-verify; notify early |

## Payments

| Case | Behavior |
|------|----------|
| Payment OK, webhook delayed | Client poll; reconcile job; don’t double-confirm |
| Webhook duplicated | Idempotent by provider event id |
| Refund PSP failure | `refund_failed`; finance queue |
| Currency display change | Store booking currency immutable |

## Cancellations

| Case | Behavior |
|------|----------|
| Passenger cancels while driver arriving | Policy fee; notify driver; stop navigation session |
| Driver cancels after payment | Full refund path; penalty; optional auto rematch |

## Flights

| Case | Behavior |
|------|----------|
| Flight delayed | Phase 2 sync; extend wait; notify driver |
| Flight cancelled | Support workflow; policy cancel |

## Payouts

| Case | Behavior |
|------|----------|
| Payout failure | Status failed; driver notified; retry with corrected KYC/bank |

## Push

| Case | Behavior |
|------|----------|
| Push failure | Retry; email for critical; in-app inbox |

## Safety

| Case | Behavior |
|------|----------|
| Emergency | In-app emergency CTA → local emergency number + notify support (Phase 2 SOS) |
