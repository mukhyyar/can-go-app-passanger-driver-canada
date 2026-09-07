# 13 — Notifications & Chat

## 1. Channels

| Channel | Provider (MVP) | Use |
|---------|----------------|-----|
| Push | FCM + APNs | Most events |
| Email | Transactional (SES/Postmark/Resend) | Receipts, confirms, payouts |
| SMS | Twilio/MessageBird | OTP + critical only |
| In-app | DB + WS | Notification center |

---

## 2. Event → notification matrix (core)

| Domain event | Push | Email | SMS | In-app |
|--------------|------|-------|-----|--------|
| RideRequestCreated | Driver | — | — | Driver |
| DriverOfferSubmitted | Passenger | — | — | Passenger |
| BookingConfirmed | Both | Both | Optional | Both |
| Upcoming reminder | Both | Optional | — | Both |
| DriverHeadingToPickup | Passenger | — | — | Passenger |
| DriverArrived | Passenger | — | Optional | Passenger |
| TripCompleted | Both | Receipt to pax | — | Both |
| PaymentFailed | Passenger | Passenger | — | Passenger |
| RefundIssued | Passenger | Passenger | — | Passenger |
| PayoutCompleted | Driver | Driver | — | Driver |
| DocumentExpiry | Driver | Driver | — | Driver |
| SupportReply | User | Optional | — | User |

Templates stored with i18n keys; variables escaped.

---

## 3. Push architecture

1. Domain event → queue `SendNotificationJob`.  
2. Resolve user devices + prefs.  
3. Render template.  
4. Send; store notification row.  
5. On WS connect, badge sync.

Respect OS permission; prefs for marketing vs transactional.

---

## 4. Chat

**Scope MVP:** booking-scoped thread after confirmation.  
**CONFIRMED:** Reference apps include messaging/chat capability.

### Features

| Feature | MVP | Phase 2 |
|---------|-----|---------|
| Text messages | Yes | |
| Timestamps | Yes | |
| System messages | Yes | |
| Read receipts | Optional | Yes |
| Image attachments | — | Yes |
| Translation | — | Yes |
| Support intervention | Admin joins | Yes |
| Retention window | Yes | |

### Security

- Authorize membership by booking parties (+ support).  
- Virus scan attachments.  
- Profanity filter optional.  
- Export for disputes.

Realtime: WS event `chat.message`; REST fallback.

---

## 5. Masked calling

**ASSUMPTION / RECOMMENDED Phase 2:** Twilio Proxy / similar.

- Numbers never revealed in UI.  
- Time-bound sessions per booking.  
- Record policy per jurisdiction (default off).  
- Fallback: in-app VoIP or chat-only.

---

## 6. Failure handling

| Failure | Mitigation |
|---------|------------|
| Push failure | Retry; rely on email for critical |
| SMS OTP failure | Retry + voice OTP optional; rate limit |
| Chat WS down | REST send + poll |
| User disabled notifs | In-app only; still email legal/receipts |
