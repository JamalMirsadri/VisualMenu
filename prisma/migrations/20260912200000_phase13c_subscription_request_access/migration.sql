-- Phase 13C: Subscription Request, Payment Activation, Manual Platform Assign/Revoke & Strict No-Subscription Access Migration

-- AlterEnum ProvisioningStatus
ALTER TYPE "ProvisioningStatus" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PENDING';

-- CreateEnum SubscriptionRequestStatus
DO $$ BEGIN
    CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('PENDING', 'PAYMENT_REQUIRED', 'PAID', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum SubscriptionAssignmentType
DO $$ BEGIN
    CREATE TYPE "SubscriptionAssignmentType" AS ENUM ('PAID', 'MANUAL', 'COMPLIMENTARY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterEnum NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAYMENT_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAYMENT_SUCCESS';

-- AlterEnum AuditAction
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAYMENT_REQUIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_MANUALLY_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REVOKED';

-- AlterTable subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "assignment_type" "SubscriptionAssignmentType" NOT NULL DEFAULT 'PAID';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "assignment_reason" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "assigned_by_user_id" UUID;

-- AddForeignKey to subscriptions
DO $$ BEGIN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "subscriptions_assignment_type_idx" ON "subscriptions"("assignment_type");

-- CreateTable subscription_requests
CREATE TABLE IF NOT EXISTS "subscription_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "requested_plan_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "billing_interval" "BillingInterval",
    "reviewed_by_user_id" UUID,
    "subscription_id" UUID,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
);

-- Indexes for subscription_requests
CREATE INDEX IF NOT EXISTS "subscription_requests_restaurant_id_idx" ON "subscription_requests"("restaurant_id");
CREATE INDEX IF NOT EXISTS "subscription_requests_status_idx" ON "subscription_requests"("status");
CREATE INDEX IF NOT EXISTS "subscription_requests_requested_at_idx" ON "subscription_requests"("requested_at");
CREATE INDEX IF NOT EXISTS "subscription_requests_subscription_id_idx" ON "subscription_requests"("subscription_id");

-- Foreign keys for subscription_requests
DO $$ BEGIN
    ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_requested_plan_id_fkey" FOREIGN KEY ("requested_plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
