-- AlterEnum
ALTER TYPE "DriverPayoutStatus" ADD VALUE IF NOT EXISTS 'HELD';

-- AlterTable DriverProfile
ALTER TABLE "DriverProfile" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT;
ALTER TABLE "DriverProfile" ADD COLUMN IF NOT EXISTS "stripeAccountStatus" TEXT DEFAULT 'UNLINKED';
ALTER TABLE "DriverProfile" ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DriverProfile" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'DriverProfile_stripeAccountId_key'
    ) THEN
        CREATE UNIQUE INDEX "DriverProfile_stripeAccountId_key" ON "DriverProfile"("stripeAccountId");
    END IF;
END $$;

-- CreateTable RideFinancial
CREATE TABLE IF NOT EXISTS "RideFinancial" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "rideFare" DECIMAL(12,2) NOT NULL,
    "marketplaceFee" DECIMAL(12,2) NOT NULL,
    "passengerTotalCharged" DECIMAL(12,2) NOT NULL,
    "driverCommission" DECIMAL(12,2) NOT NULL,
    "driverCommissionRate" DECIMAL(6,4) NOT NULL DEFAULT 0.2000,
    "driverNetEarning" DECIMAL(12,2) NOT NULL,
    "stripeProcessingFee" DECIMAL(12,2),
    "taxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "taxJurisdiction" TEXT DEFAULT 'CA',
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "canRideGrossRevenue" DECIMAL(12,2) NOT NULL,
    "canRideNetRevenue" DECIMAL(12,2),
    "driverPayoutStatus" "DriverPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "payoutReleasedAt" TIMESTAMP(3),
    "stripeTransferId" TEXT,
    "stripeTransferGroup" TEXT,
    "stripePaymentIntentId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideFinancial_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'RideFinancial_rideId_key'
    ) THEN
        CREATE UNIQUE INDEX "RideFinancial_rideId_key" ON "RideFinancial"("rideId");
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'RideFinancial_driverPayoutStatus_createdAt_idx'
    ) THEN
        CREATE INDEX "RideFinancial_driverPayoutStatus_createdAt_idx" ON "RideFinancial"("driverPayoutStatus", "createdAt");
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'RideFinancial_rideId_idx'
    ) THEN
        CREATE INDEX "RideFinancial_rideId_idx" ON "RideFinancial"("rideId");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RideFinancial_rideId_fkey'
    ) THEN
        ALTER TABLE "RideFinancial" ADD CONSTRAINT "RideFinancial_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
