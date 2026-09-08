# Phase 1b — Driver KYC, documents, activation, zones

## Storage

- MinIO (local) / S3 (prod) via `StorageService`
- Private bucket `S3_BUCKET_DOCUMENTS` (default `cango-documents`)
- Access only via short-lived **signed GET URLs** (15 min)

## Driver endpoints (`/api/driver`, JWT + DRIVER)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/documents` | Checklist + metadata (no raw URLs) |
| GET | `/documents/:id` | Signed URL for own doc |
| POST | `/documents` | multipart `file` + `docType` (+ optional `vehicleId`, `expiresAt`) |
| POST | `/documents/:id/reupload` | Only when status=`REJECTED` |
| GET/POST | `/vehicles` | Create/list vehicles for doc linkage |
| GET/POST | `/operating-zones` | Circle or polygon GeoJSON |
| PUT/DELETE | `/operating-zones/:id` | Update/delete zone |

### Document types

| `docType` | Rules |
|-----------|--------|
| `selfie` | Required, one active |
| `license` | Required, one active |
| `vehicle_registration` | Required (VRC), one active |
| `vehicle_photo` | Max 6; ≥1 approved required for activation |

Validation: size ≤10MB; MIME jpeg/png/webp/pdf + magic-byte check.

## Admin endpoints (`/api/admin`, JWT + ADMIN/SUPER_ADMIN)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/drivers/kyc?status=` | Queue (default `PENDING_KYC`) |
| GET | `/drivers/:driverId/kyc` | Docs with signed URLs + checklist |
| POST | `/documents/:documentId/review` | `{ status: APPROVED\|REJECTED, rejectionReason? }` |
| POST | `/drivers/:driverId/activate` | Requires all required docs + ≥1 vehicle photo approved |
| POST | `/drivers/:driverId/deactivate` | Clears `isActivated` |
| POST | `/drivers/:driverId/reject-kyc` | Sets `REJECTED`, deactivates |

Activation sets `approvalStatus=APPROVED` and `isActivated=true` (server-side; replaces Flutter demo toggle).

## PostGIS zones

Apply once:

```bash
docker exec -i cango-postgres psql -U cango -d cango < backend/prisma/sql/phase1b_operating_zone_geom.sql
```

Circle zones store `center:[lng,lat]` + `radiusKm`; polygon zones store GeoJSON Polygon. `geom` column kept in sync for spatial queries (Phase 1c matching).

## Audit

Upload, review, activate/deactivate/reject-kyc, zone create/update/delete → `AuditLog`.

## Flutter

Phase 1e wires Documents/Photos/activation screens to these APIs. Backend is the source of truth for `isActivated`.
