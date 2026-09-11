-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_DISABLE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_ENABLE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_REMOVE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_INVITATION_CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_INVITATION_RESEND';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_INVITATION_REVOKE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_INVITATION_ACCEPT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_PERMISSION_GRANT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_PERMISSION_REVOKE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STAFF_ROLE_CHANGE';

-- AlterTable
ALTER TABLE "user_restaurants" ADD COLUMN IF NOT EXISTS "job_template" TEXT;
ALTER TABLE "user_restaurants" ADD COLUMN IF NOT EXISTS "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_restaurants_status_idx" ON "user_restaurants"("status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_key_key" ON "permissions"("key");
CREATE INDEX IF NOT EXISTS "permissions_group_idx" ON "permissions"("group");
CREATE INDEX IF NOT EXISTS "permissions_active_idx" ON "permissions"("active");

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_restaurant_permissions" (
    "id" UUID NOT NULL,
    "user_restaurant_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_restaurant_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_restaurant_permissions_user_restaurant_id_permission_i_key" ON "user_restaurant_permissions"("user_restaurant_id", "permission_id");
CREATE INDEX IF NOT EXISTS "user_restaurant_permissions_user_restaurant_id_idx" ON "user_restaurant_permissions"("user_restaurant_id");
CREATE INDEX IF NOT EXISTS "user_restaurant_permissions_permission_id_idx" ON "user_restaurant_permissions"("permission_id");

-- AddForeignKey
ALTER TABLE "user_restaurant_permissions" ADD CONSTRAINT "user_restaurant_permissions_user_restaurant_id_fkey" FOREIGN KEY ("user_restaurant_id") REFERENCES "user_restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restaurant_permissions" ADD CONSTRAINT "user_restaurant_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_invitations" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID,
    "invited_email" TEXT NOT NULL,
    "invited_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "job_template" TEXT,
    "staged_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "staff_invitations_restaurant_id_idx" ON "staff_invitations"("restaurant_id");
CREATE INDEX IF NOT EXISTS "staff_invitations_invited_email_idx" ON "staff_invitations"("invited_email");
CREATE INDEX IF NOT EXISTS "staff_invitations_token_hash_idx" ON "staff_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "staff_invitations_expires_at_idx" ON "staff_invitations"("expires_at");

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
