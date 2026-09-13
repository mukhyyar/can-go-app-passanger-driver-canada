-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN IF NOT EXISTS "drivingEnabled" BOOLEAN NOT NULL DEFAULT false;
