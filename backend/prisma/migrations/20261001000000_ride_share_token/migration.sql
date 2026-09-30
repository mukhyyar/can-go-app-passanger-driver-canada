-- AlterTable
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "shareExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Ride_shareToken_key" ON "Ride"("shareToken");
CREATE INDEX IF NOT EXISTS "Ride_shareToken_idx" ON "Ride"("shareToken");
