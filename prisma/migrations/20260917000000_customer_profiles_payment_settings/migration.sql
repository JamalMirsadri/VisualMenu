-- Customer Profiles (persistent, NIF-keyed) + Restaurant Payment Settings.

-- Customer: NIF / GDPR consent / loyalty / metadata
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_id" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_country" TEXT DEFAULT 'PT';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gdpr_consent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gdpr_consent_at" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "loyalty_points" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_restaurant_id_tax_id_key" ON "customers"("restaurant_id", "tax_id");

-- Restaurant Settings: Stripe / MB WAY provider configuration (secrets encrypted)
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "stripe_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "stripe_account_id" TEXT;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "stripe_secret_key_enc" TEXT;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "stripe_publishable_key" TEXT;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "mbway_api_key_enc" TEXT;
