-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CancellationWindowType" AS ENUM ('HOURS_BEFORE_PICKUP', 'DRIVER_ARRIVED_WAITING_EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FeeTreatmentType" AS ENUM ('REFUND_TO_PASSENGER', 'RETAIN_BY_PLATFORM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AmountRuleType" AS ENUM ('PERCENTAGE', 'FLAT_AMOUNT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CancellationPolicyTier" (
    "id" TEXT NOT NULL,
    "tierKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "windowType" "CancellationWindowType" NOT NULL DEFAULT 'HOURS_BEFORE_PICKUP',
    "minHoursBeforePickup" DOUBLE PRECISION,
    "maxHoursBeforePickup" DOUBLE PRECISION,
    "passengerRefundType" "AmountRuleType" NOT NULL DEFAULT 'PERCENTAGE',
    "passengerRefundValue" DECIMAL(6,2) NOT NULL DEFAULT 100.0,
    "providerCompType" "AmountRuleType" NOT NULL DEFAULT 'PERCENTAGE',
    "providerCompValue" DECIMAL(6,2) NOT NULL DEFAULT 0.0,
    "feeTreatment" "FeeTreatmentType" NOT NULL DEFAULT 'REFUND_TO_PASSENGER',
    "passengerDisplayLabel" TEXT NOT NULL,
    "passengerDisplayTerms" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationPolicyTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CancellationPolicyTier_tierKey_key" ON "CancellationPolicyTier"("tierKey");
CREATE INDEX IF NOT EXISTS "CancellationPolicyTier_isActive_sortOrder_idx" ON "CancellationPolicyTier"("isActive", "sortOrder");
