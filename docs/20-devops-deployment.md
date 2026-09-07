# 20 — DevOps & Deployment

## 1. Environments

| Env | Purpose |
|-----|---------|
| local | Docker compose: API, Postgres+PostGIS, Redis, mailhog |
| dev | Shared integration |
| staging | Prod-like; PSP test mode |
| production | HA |

---

## 2. Recommended cloud shape (MVP)

- Containerized NestJS API + workers  
- Managed PostgreSQL (PostGIS)  
- Managed Redis  
- Object storage  
- CDN for web  
- Secrets Manager  
- Optional Kubernetes later; **ECS/Cloud Run/Fly** fine for MVP  

---

## 3. CI/CD

```text
PR → lint → unit → integration → build → staging deploy → smoke
main/tag → prod deploy (manual approval) → migrate → smoke
```

Mobile: Codemagic/GitHub Actions → TestFlight/Play internal tracks.

---

## 4. Migrations

- Versioned SQL/ORM migrations  
- Expand/contract for zero-downtime  
- Never destructive without backup  

---

## 5. Observability

| Signal | Tooling examples |
|--------|------------------|
| Logs | Structured JSON → cloud logs |
| Traces | OpenTelemetry |
| Metrics | RED + queue depth + WS connections |
| Errors | Sentry (API + Flutter) |
| Uptime | External checks on `/health` |
| Dashboards | Grafana / cloud |

---

## 6. Health endpoints

`/health/live`, `/health/ready` (DB + Redis).

---

## 7. Backup & DR

- Automated DB backups + PITR  
- Bucket versioning for docs  
- Documented restore runbook  

---

## 8. Security ops

- Dependency scanning  
- Image scanning  
- Least-privilege IAM  
- Admin IP allowlist optional  
- Rotate keys  

---

## 9. Cost control

- Maps API budgets + caching  
- GPS write throttling  
- Log retention tiers  
- Autoscale workers on queue lag  
