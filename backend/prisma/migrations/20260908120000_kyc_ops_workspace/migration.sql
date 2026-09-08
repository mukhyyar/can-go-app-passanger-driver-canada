-- KYC operations workspace: queue statuses, assignment, notes, resubmission.

ALTER TYPE "DriverApprovalStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE "DriverApprovalStatus" ADD VALUE IF NOT EXISTS 'ACTION_REQUIRED';
ALTER TYPE "DocumentReviewStatus" ADD VALUE IF NOT EXISTS 'NEEDS_RESUBMISSION';

ALTER TABLE "DriverProfile"
  ADD COLUMN IF NOT EXISTS "kycAssignedToId" TEXT,
  ADD COLUMN IF NOT EXISTS "kycAssignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycSubmittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycDecidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kycDecisionNote" TEXT,
  ADD COLUMN IF NOT EXISTS "kycDecisionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "kycCustomerMessage" TEXT;

CREATE INDEX IF NOT EXISTS "DriverProfile_approvalStatus_updatedAt_idx"
  ON "DriverProfile"("approvalStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "DriverProfile_kycAssignedToId_idx"
  ON "DriverProfile"("kycAssignedToId");
CREATE INDEX IF NOT EXISTS "DriverProfile_kycSubmittedAt_idx"
  ON "DriverProfile"("kycSubmittedAt");

ALTER TABLE "DriverDocument"
  ADD COLUMN IF NOT EXISTS "resubmissionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "customerMessage" TEXT;

CREATE INDEX IF NOT EXISTS "DriverDocument_driverId_docType_createdAt_idx"
  ON "DriverDocument"("driverId", "docType", "createdAt");
CREATE INDEX IF NOT EXISTS "DriverDocument_status_idx"
  ON "DriverDocument"("status");

CREATE TABLE IF NOT EXISTS "KycReviewNote" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "customerFacing" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KycReviewNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KycReviewNote_driverId_createdAt_idx"
  ON "KycReviewNote"("driverId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DriverProfile_kycAssignedToId_fkey'
  ) THEN
    ALTER TABLE "DriverProfile"
      ADD CONSTRAINT "DriverProfile_kycAssignedToId_fkey"
      FOREIGN KEY ("kycAssignedToId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KycReviewNote_driverId_fkey'
  ) THEN
    ALTER TABLE "KycReviewNote"
      ADD CONSTRAINT "KycReviewNote_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KycReviewNote_authorId_fkey'
  ) THEN
    ALTER TABLE "KycReviewNote"
      ADD CONSTRAINT "KycReviewNote_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
