-- CreateEnum
CREATE TYPE "ProvisioningStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESTAURANT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESTAURANT_PROVISION_START';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESTAURANT_PROVISION_SUCCESS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESTAURANT_PROVISION_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OWNER_INVITATION_CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OWNER_INVITATION_RESEND';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OWNER_INVITATION_REVOKE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OWNER_INVITATION_ACCEPT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESTAURANT_ACTIVATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESTAURANT_DEACTIVATE';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN "provisioning_status" "ProvisioningStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "restaurants" ADD COLUMN "created_by_platform_user_id" UUID;
ALTER TABLE "restaurants" ADD COLUMN "provisioned_at" TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN "activated_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "restaurants_provisioning_status_idx" ON "restaurants"("provisioning_status");

-- CreateTable
CREATE TABLE "owner_invitations" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "invited_email" TEXT NOT NULL,
    "invited_name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_invitations_token_hash_key" ON "owner_invitations"("token_hash");
CREATE INDEX "owner_invitations_restaurant_id_idx" ON "owner_invitations"("restaurant_id");
CREATE INDEX "owner_invitations_invited_email_idx" ON "owner_invitations"("invited_email");
CREATE INDEX "owner_invitations_token_hash_idx" ON "owner_invitations"("token_hash");
CREATE INDEX "owner_invitations_expires_at_idx" ON "owner_invitations"("expires_at");

-- AddForeignKey
ALTER TABLE "owner_invitations" ADD CONSTRAINT "owner_invitations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_invitations" ADD CONSTRAINT "owner_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
