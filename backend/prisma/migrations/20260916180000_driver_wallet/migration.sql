-- Driver wallet ledger + payouts (immutable financial records; Restrict FKs)

CREATE TYPE "WalletEntryType" AS ENUM ('EARNING', 'PAYOUT', 'ADJUSTMENT', 'REVERSAL');
CREATE TYPE "WalletDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletEntryStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'REVERSED');
CREATE TYPE "DriverPayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REVERSED');

CREATE TABLE "DriverWalletEntry" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "direction" "WalletDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "WalletEntryStatus" NOT NULL DEFAULT 'PENDING',
    "rideId" TEXT,
    "payoutId" TEXT,
    "relatedEntryId" TEXT,
    "availableAt" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "reason" TEXT,
    "adminUserId" TEXT,
    "metaJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverWalletEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverPayout" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "DriverPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "provider" TEXT NOT NULL DEFAULT '',
    "providerBatchId" TEXT,
    "providerPayoutId" TEXT,
    "providerStatus" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "ledgerEntryId" TEXT,
    "correlationRef" TEXT,
    "metaJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriverWalletEntry_driverId_rideId_type_key" ON "DriverWalletEntry"("driverId", "rideId", "type");
CREATE INDEX "DriverWalletEntry_driverId_createdAt_idx" ON "DriverWalletEntry"("driverId", "createdAt");
CREATE INDEX "DriverWalletEntry_driverId_status_availableAt_idx" ON "DriverWalletEntry"("driverId", "status", "availableAt");
CREATE INDEX "DriverWalletEntry_driverId_currency_idx" ON "DriverWalletEntry"("driverId", "currency");
CREATE INDEX "DriverWalletEntry_payoutId_idx" ON "DriverWalletEntry"("payoutId");
CREATE INDEX "DriverWalletEntry_rideId_idx" ON "DriverWalletEntry"("rideId");

CREATE UNIQUE INDEX "DriverPayout_ledgerEntryId_key" ON "DriverPayout"("ledgerEntryId");
CREATE UNIQUE INDEX "DriverPayout_driverId_idempotencyKey_key" ON "DriverPayout"("driverId", "idempotencyKey");
CREATE INDEX "DriverPayout_driverId_createdAt_idx" ON "DriverPayout"("driverId", "createdAt");
CREATE INDEX "DriverPayout_driverId_status_idx" ON "DriverPayout"("driverId", "status");
CREATE INDEX "DriverPayout_providerPayoutId_idx" ON "DriverPayout"("providerPayoutId");
CREATE INDEX "DriverPayout_status_createdAt_idx" ON "DriverPayout"("status", "createdAt");

ALTER TABLE "DriverWalletEntry" ADD CONSTRAINT "DriverWalletEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverWalletEntry" ADD CONSTRAINT "DriverWalletEntry_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverWalletEntry" ADD CONSTRAINT "DriverWalletEntry_relatedEntryId_fkey" FOREIGN KEY ("relatedEntryId") REFERENCES "DriverWalletEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverPayout" ADD CONSTRAINT "DriverPayout_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayout" ADD CONSTRAINT "DriverPayout_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "DriverWalletEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverWalletEntry" ADD CONSTRAINT "DriverWalletEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "DriverPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
