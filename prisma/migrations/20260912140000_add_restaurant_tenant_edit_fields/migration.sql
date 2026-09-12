-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "legal_name" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'UTC';
