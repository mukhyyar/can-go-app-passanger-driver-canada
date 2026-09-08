-- Social login identity links (Google / Apple)
CREATE TABLE IF NOT EXISTS "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_providerSubject_key"
  ON "OAuthAccount"("provider", "providerSubject");

CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OAuthAccount_userId_fkey'
  ) THEN
    ALTER TABLE "OAuthAccount"
      ADD CONSTRAINT "OAuthAccount_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
