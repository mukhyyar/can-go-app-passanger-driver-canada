-- KYC enterprise: document versioning, lifecycle, identity fields, flags

CREATE TYPE "DocumentLifecycleStatus" AS ENUM ('CURRENT', 'SUPERSEDED', 'ARCHIVED', 'SOFT_DELETED');
CREATE TYPE "KycFlagType" AS ENUM (
  'FRAUD_CONCERN',
  'IDENTITY_MISMATCH',
  'DUPLICATE_ACCOUNT',
  'DOCUMENT_CONCERN',
  'HIGH_RISK',
  'MANUAL_REVIEW',
  'VIP_ESCALATION',
  'OTHER'
);

ALTER TABLE "DriverProfile"
  ADD COLUMN IF NOT EXISTS "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "addressLine1" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "province" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "licenceNumber" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "licenceJurisdiction" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "licenceIssueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "licenceExpiryDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycReviewStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycOverrideUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "kycOverrideReason" TEXT,
  ADD COLUMN IF NOT EXISTS "kycOverrideAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycOverrideById" TEXT,
  ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);

ALTER TABLE "DriverDocument"
  ADD COLUMN IF NOT EXISTS "documentGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "customLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lifecycleStatus" "DocumentLifecycleStatus" NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN IF NOT EXISTS "previousVersionId" TEXT,
  ADD COLUMN IF NOT EXISTS "originalFilename" TEXT,
  ADD COLUMN IF NOT EXISTS "checksumSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "documentNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "issuingJurisdiction" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadSource" TEXT NOT NULL DEFAULT 'DRIVER_APP',
  ADD COLUMN IF NOT EXISTS "sourceReference" TEXT,
  ADD COLUMN IF NOT EXISTS "adminNote" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedById" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedByType" TEXT NOT NULL DEFAULT 'DRIVER',
  ADD COLUMN IF NOT EXISTS "softDeletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "softDeletedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT;

-- Backfill document groups + version numbers (preserve history; never destroy files)
WITH ordered AS (
  SELECT
    id,
    "driverId",
    "docType",
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "driverId", "docType"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY "driverId", "docType") AS cnt,
    FIRST_VALUE(id) OVER (
      PARTITION BY "driverId", "docType"
      ORDER BY "createdAt" ASC, id ASC
    ) AS group_id,
    LAG(id) OVER (
      PARTITION BY "driverId", "docType"
      ORDER BY "createdAt" ASC, id ASC
    ) AS prev_id
  FROM "DriverDocument"
)
UPDATE "DriverDocument" d
SET
  "documentGroupId" = ordered.group_id,
  "versionNumber" = ordered.rn,
  "previousVersionId" = ordered.prev_id,
  "lifecycleStatus" = CASE
    WHEN ordered.rn = ordered.cnt THEN 'CURRENT'::"DocumentLifecycleStatus"
    ELSE 'SUPERSEDED'::"DocumentLifecycleStatus"
  END,
  "uploadSource" = COALESCE(d."uploadSource", 'DRIVER_APP'),
  "uploadedByType" = COALESCE(d."uploadedByType", 'DRIVER')
FROM ordered
WHERE d.id = ordered.id;

-- Any remaining null groups (shouldn't happen) get self-id
UPDATE "DriverDocument"
SET "documentGroupId" = id
WHERE "documentGroupId" IS NULL;

ALTER TABLE "DriverDocument"
  ALTER COLUMN "documentGroupId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DriverDocument_previousVersionId_fkey'
  ) THEN
    ALTER TABLE "DriverDocument"
      ADD CONSTRAINT "DriverDocument_previousVersionId_fkey"
      FOREIGN KEY ("previousVersionId") REFERENCES "DriverDocument"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DriverDocument_driverId_documentGroupId_versionNumber_idx"
  ON "DriverDocument"("driverId", "documentGroupId", "versionNumber");
CREATE INDEX IF NOT EXISTS "DriverDocument_driverId_docType_lifecycleStatus_idx"
  ON "DriverDocument"("driverId", "docType", "lifecycleStatus");
CREATE INDEX IF NOT EXISTS "DriverDocument_lifecycleStatus_idx"
  ON "DriverDocument"("lifecycleStatus");

CREATE TABLE IF NOT EXISTS "KycFlag" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "flagType" "KycFlagType" NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "clearedAt" TIMESTAMP(3),
  "clearedById" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KycFlag_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KycFlag_driverId_fkey'
  ) THEN
    ALTER TABLE "KycFlag"
      ADD CONSTRAINT "KycFlag_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "KycFlag_driverId_clearedAt_idx" ON "KycFlag"("driverId", "clearedAt");
