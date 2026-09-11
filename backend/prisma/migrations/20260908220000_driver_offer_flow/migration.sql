/* Driver offer flow: round-trip rides, rich offers, skip dismissals, offer history. */

/* OfferStatus (missing from phase0; create then extend for older DBs) */
DO $$ BEGIN
  CREATE TYPE "OfferStatus" AS ENUM (
    'ACTIVE',
    'SELECTED',
    'EXPIRED',
    'WITHDRAWN',
    'SUPERSEDED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE';

-- Vehicle eligibility
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Ride round-trip + required options
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "returnAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "isRoundTrip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "pickupWaitMin" INTEGER;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "returnWaitMin" INTEGER;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "requiredOptions" JSONB NOT NULL DEFAULT '[]';

-- Offer enrichment
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "vehicleId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "outboundPrice" DECIMAL(12,2);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "returnPrice" DECIMAL(12,2);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "selectedOptions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "validForSeconds" INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "supersedesOfferId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);

-- Backfill outboundPrice / validForSeconds for existing rows
UPDATE "Offer"
SET "outboundPrice" = "bidAmount"
WHERE "outboundPrice" IS NULL;

UPDATE "Offer"
SET "validForSeconds" = GREATEST(60, EXTRACT(EPOCH FROM ("expiresAt" - "createdAt"))::INTEGER)
WHERE "validForSeconds" IS NULL;

ALTER TABLE "Offer" ALTER COLUMN "outboundPrice" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "validForSeconds" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Offer_idempotencyKey_key" ON "Offer"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Offer_vehicleId_idx" ON "Offer"("vehicleId");
CREATE INDEX IF NOT EXISTS "Offer_rideId_driverId_status_idx" ON "Offer"("rideId", "driverId", "status");

DO $$ BEGIN
  ALTER TABLE "Offer"
    ADD CONSTRAINT "Offer_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Offer"
    ADD CONSTRAINT "Offer_supersedesOfferId_fkey"
    FOREIGN KEY ("supersedesOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OfferHistory" (
  "id" TEXT NOT NULL,
  "offerId" TEXT,
  "rideId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OfferHistory_rideId_createdAt_idx" ON "OfferHistory"("rideId", "createdAt");
CREATE INDEX IF NOT EXISTS "OfferHistory_driverId_createdAt_idx" ON "OfferHistory"("driverId", "createdAt");
CREATE INDEX IF NOT EXISTS "OfferHistory_offerId_createdAt_idx" ON "OfferHistory"("offerId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "OfferHistory"
    ADD CONSTRAINT "OfferHistory_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OfferHistory"
    ADD CONSTRAINT "OfferHistory_rideId_fkey"
    FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RequestDismissal" (
  "id" TEXT NOT NULL,
  "rideId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequestDismissal_rideId_driverId_key" ON "RequestDismissal"("rideId", "driverId");
CREATE INDEX IF NOT EXISTS "RequestDismissal_driverId_createdAt_idx" ON "RequestDismissal"("driverId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "RequestDismissal"
    ADD CONSTRAINT "RequestDismissal_rideId_fkey"
    FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RequestDismissal"
    ADD CONSTRAINT "RequestDismissal_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
