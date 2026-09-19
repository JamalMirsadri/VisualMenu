-- Add a safe, human-readable loyalty code (never the Customer.id, never the raw token).
ALTER TABLE "loyalty_identities" ADD COLUMN "code" TEXT;

-- Backfill existing rows with a deterministic unique code (safe placeholder).
UPDATE "loyalty_identities"
SET "code" = 'LC-' || upper(substr(md5(random()::text || "id"::text), 1, 12))
WHERE "code" IS NULL;

ALTER TABLE "loyalty_identities" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_identities_code_key" ON "loyalty_identities"("code");
