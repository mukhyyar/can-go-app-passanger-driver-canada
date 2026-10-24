-- AlterTable DriverProfile
ALTER TABLE "DriverProfile" ADD COLUMN IF NOT EXISTS "warningCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Ride
-- driverCancellation is 1:1 with Ride via rideId on DriverCancellationRecord

-- CreateTable ProviderCancellationReason
CREATE TABLE IF NOT EXISTS "ProviderCancellationReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isJustified" BOOLEAN NOT NULL DEFAULT false,
    "requiresDetails" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCancellationReason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderCancellationReason_code_key" ON "ProviderCancellationReason"("code");
CREATE INDEX IF NOT EXISTS "ProviderCancellationReason_isActive_sortOrder_idx" ON "ProviderCancellationReason"("isActive", "sortOrder");

-- CreateTable DriverCancellationRecord
CREATE TABLE IF NOT EXISTS "DriverCancellationRecord" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "reasonDetails" TEXT,
    "isJustified" BOOLEAN NOT NULL,
    "rideStatusAtCancel" "RideStatus" NOT NULL,
    "driverLat" DOUBLE PRECISION,
    "driverLng" DOUBLE PRECISION,
    "adminReviewed" BOOLEAN NOT NULL DEFAULT false,
    "adminOverriddenJustified" BOOLEAN,
    "adminReviewNotes" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverCancellationRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriverCancellationRecord_rideId_key" ON "DriverCancellationRecord"("rideId");
CREATE INDEX IF NOT EXISTS "DriverCancellationRecord_driverId_createdAt_idx" ON "DriverCancellationRecord"("driverId", "createdAt");
CREATE INDEX IF NOT EXISTS "DriverCancellationRecord_reasonCode_createdAt_idx" ON "DriverCancellationRecord"("reasonCode", "createdAt");
CREATE INDEX IF NOT EXISTS "DriverCancellationRecord_isJustified_createdAt_idx" ON "DriverCancellationRecord"("isJustified", "createdAt");
CREATE INDEX IF NOT EXISTS "DriverCancellationRecord_adminReviewed_idx" ON "DriverCancellationRecord"("adminReviewed");

-- CreateTable DriverWarning
CREATE TABLE IF NOT EXISTS "DriverWarning" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "issuedByAdminId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CANCELLATIONS',
    "warningNumber" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverWarning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DriverWarning_driverId_createdAt_idx" ON "DriverWarning"("driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "DriverCancellationRecord" ADD CONSTRAINT "DriverCancellationRecord_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverCancellationRecord" ADD CONSTRAINT "DriverCancellationRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverCancellationRecord" ADD CONSTRAINT "DriverCancellationRecord_reasonCode_fkey" FOREIGN KEY ("reasonCode") REFERENCES "ProviderCancellationReason"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverCancellationRecord" ADD CONSTRAINT "DriverCancellationRecord_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverWarning" ADD CONSTRAINT "DriverWarning_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverWarning" ADD CONSTRAINT "DriverWarning_issuedByAdminId_fkey" FOREIGN KEY ("issuedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
