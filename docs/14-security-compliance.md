# 14 — Security & Compliance

## 1. Goals

Protect PII, payments, documents, and marketplace integrity. Align with OWASP ASVS / Mobile Top 10 / API Top 10 practices. Legal counsel must validate GDPR/UK GDPR/local transport regs per country.

---

## 2. Authentication & sessions

| Control | Recommendation |
|---------|----------------|
| Access tokens | Short-lived JWT (15–30m) |
| Refresh tokens | Rotating, server-side revoke list |
| Device sessions | Tracked; user can revoke |
| OTP | 6-digit; 5 min TTL; attempt + rate limits |
| Login throttle | Progressive delay / lockout |
| Admin MFA | Mandatory TOTP/WebAuthn |
| Password | Argon2id/bcrypt; breach checks optional |

---

## 3. Authorization

- RBAC for staff ([15-roles-permissions.md](./15-roles-permissions.md))  
- Resource ownership checks for passenger/driver  
- Policy layer on bookings/offers/docs  
- Least privilege admin roles  

---

## 4. Data protection

| Data | Control |
|------|---------|
| PII | Encrypt sensitive columns if required; minimize collection |
| Documents | Private bucket; short-lived signed URLs; virus scan |
| Cards | PSP only; no PAN/CVV storage |
| Location | Retention limits; purpose limitation |
| Chat | Access-controlled; export for legal |
| Secrets | KMS/Secrets Manager; rotated |
| At rest | Disk encryption (cloud default) |
| In transit | TLS 1.2+ only |

---

## 5. API security

- Rate limiting (IP + user + endpoint class)  
- Input validation / output encoding  
- CORS allowlist  
- Helmet security headers (web)  
- Idempotency on money APIs  
- Webhook signature verification  
- No stack traces to clients  
- File upload type/size allowlists  

---

## 6. Fraud

| Signal | Action |
|--------|--------|
| Self-dealing (same user both sides) | Block — **CONFIRMED** concern in reference KYC |
| Shared device graphs | Review |
| Excessive cancels | Soft ban |
| Impossible travel / overlap bookings | Reject |
| Promo abuse | Limits |
| Card testing | Velocity limits + PSP Radar |

---

## 7. Audit & monitoring

- Audit logs for admin sensitive actions  
- Auth anomaly alerts  
- Payment webhook log immutability  
- SIEM or cloud logging sinks  

---

## 8. Account deletion & retention

- User can request deletion  
- Anonymize PII after cooling period  
- Retain financial/booking records as legally required  
- Document retention schedule in policy  

---

## 9. Mobile hardening

- Cert pinning optional (tradeoffs)  
- Secure storage for tokens (Keychain/Keystore)  
- Root/jailbreak detection soft warning  
- Obfuscation release builds  
- No secrets in app binaries  

---

## 10. Backups & DR

- Daily Postgres backups + PITR  
- Encrypted backups  
- Documented RPO/RTO  
- Restore tested quarterly  

---

## 11. Compliance checklist (launch)

- [ ] Privacy policy & terms  
- [ ] Cookie/consent (web)  
- [ ] DPA with processors (PSP, SMS, email, maps)  
- [ ] KYC policy published  
- [ ] Transport intermediary legal review  
- [ ] App Store privacy nutrition labels accurate  
