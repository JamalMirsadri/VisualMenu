-- Phase 13B: Notification Center, Platform-to-Restaurant Messaging & Subscription Communication Migration

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "NotificationSource" AS ENUM ('SYSTEM', 'PLATFORM', 'SECURITY', 'SUBSCRIPTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PlatformMessageTargetType" AS ENUM ('RESTAURANT', 'MULTIPLE_RESTAURANTS', 'ALL_RESTAURANTS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PlatformMessageStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PLATFORM_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_ALERT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SECURITY_ALERT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GENERAL_ANNOUNCEMENT';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_MESSAGE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_MESSAGE_SCHEDULED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_MESSAGE_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_MESSAGE_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_MESSAGE_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLATFORM_MESSAGE_EDITED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NOTIFICATION_READ';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NOTIFICATION_ACKNOWLEDGED';

-- CreateTable PlatformMessage
CREATE TABLE IF NOT EXISTS "platform_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sender_user_id" UUID,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "target_type" "PlatformMessageTargetType" NOT NULL,
    "status" "PlatformMessageStatus" NOT NULL DEFAULT 'SENT',
    "scheduled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlatformMessageRecipient
CREATE TABLE IF NOT EXISTS "platform_message_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlatformMessageRevision
CREATE TABLE IF NOT EXISTS "platform_message_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "edited_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_message_revisions_pkey" PRIMARY KEY ("id")
);

-- AlterTable Notification
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source" "NotificationSource" NOT NULL DEFAULT 'SYSTEM';
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "acknowledged_by_user_id" UUID;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "platform_message_id" UUID;

-- Indexes & Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "platform_message_recipients_message_id_restaurant_id_key" ON "platform_message_recipients"("message_id", "restaurant_id");
CREATE INDEX IF NOT EXISTS "platform_messages_status_idx" ON "platform_messages"("status");
CREATE INDEX IF NOT EXISTS "platform_messages_priority_idx" ON "platform_messages"("priority");
CREATE INDEX IF NOT EXISTS "platform_messages_scheduled_at_idx" ON "platform_messages"("scheduled_at");
CREATE INDEX IF NOT EXISTS "platform_messages_created_at_idx" ON "platform_messages"("created_at");

CREATE INDEX IF NOT EXISTS "platform_message_recipients_restaurant_id_idx" ON "platform_message_recipients"("restaurant_id");
CREATE INDEX IF NOT EXISTS "platform_message_recipients_message_id_idx" ON "platform_message_recipients"("message_id");

CREATE INDEX IF NOT EXISTS "platform_message_revisions_message_id_idx" ON "platform_message_revisions"("message_id");

CREATE INDEX IF NOT EXISTS "notifications_source_idx" ON "notifications"("source");
CREATE INDEX IF NOT EXISTS "notifications_priority_idx" ON "notifications"("priority");
CREATE INDEX IF NOT EXISTS "notifications_platform_message_id_idx" ON "notifications"("platform_message_id");

-- Foreign Keys
DO $$ BEGIN
    ALTER TABLE "platform_messages" ADD CONSTRAINT "platform_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "platform_message_recipients" ADD CONSTRAINT "platform_message_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "platform_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "platform_message_recipients" ADD CONSTRAINT "platform_message_recipients_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "platform_message_revisions" ADD CONSTRAINT "platform_message_revisions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "platform_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "platform_message_revisions" ADD CONSTRAINT "platform_message_revisions_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_platform_message_id_fkey" FOREIGN KEY ("platform_message_id") REFERENCES "platform_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
