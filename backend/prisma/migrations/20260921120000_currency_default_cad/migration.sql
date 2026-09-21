-- Platform default currency: USD → CAD (column defaults only; existing row values unchanged).
ALTER TABLE "PassengerProfile" ALTER COLUMN "currency" SET DEFAULT 'CAD';
ALTER TABLE "Ride" ALTER COLUMN "currency" SET DEFAULT 'CAD';
ALTER TABLE "FareRule" ALTER COLUMN "currency" SET DEFAULT 'CAD';
ALTER TABLE "PromoCode" ALTER COLUMN "currency" SET DEFAULT 'CAD';
ALTER TABLE "ReferralRedemption" ALTER COLUMN "currency" SET DEFAULT 'CAD';
ALTER TABLE "CatalogItem" ALTER COLUMN "currency" SET DEFAULT 'CAD';
