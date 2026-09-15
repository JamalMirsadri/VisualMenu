-- Feature Entitlements for subscription plans.
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
