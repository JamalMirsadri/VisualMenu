-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_VIEWER');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACTIVATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DEACTIVATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTEXT_ENTER';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTEXT_EXIT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "platform_role" "PlatformRole";
CREATE INDEX IF NOT EXISTS "users_platform_role_idx" ON "users"("platform_role");

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_platform_role" "PlatformRole",
ADD COLUMN IF NOT EXISTS "ip_address" TEXT;

-- AlterTable (Indexes for Restaurant)
CREATE INDEX IF NOT EXISTS "restaurants_name_idx" ON "restaurants"("name");
CREATE INDEX IF NOT EXISTS "restaurants_active_idx" ON "restaurants"("active");
CREATE INDEX IF NOT EXISTS "restaurants_created_at_idx" ON "restaurants"("created_at");

-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id" UUID NOT NULL,
    "platform_name" TEXT NOT NULL DEFAULT 'Aura SaaS',
    "support_email" TEXT NOT NULL DEFAULT 'support@auramenu.com',
    "default_currency" TEXT NOT NULL DEFAULT 'EUR',
    "default_language" TEXT NOT NULL DEFAULT 'en',
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "allow_registration" BOOLEAN NOT NULL DEFAULT true,
    "system_notice" TEXT,
    "feature_flags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
