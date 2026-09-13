-- Phase 14: Schema consistency reconciliation + one-subscription-per-restaurant constraint.

-- Reconcile pre-existing schema drift: these columns/attributes exist in the
-- live database and in schema.prisma but were never captured in a versioned
-- migration. `IF NOT EXISTS` keeps this idempotent for already-migrated databases.

-- AlterTable media: add source_type
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "source_type" TEXT NOT NULL DEFAULT 'EXTERNAL_URL';

-- AlterTable orders: add priority and normalize public_token default
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "orders" ALTER COLUMN "public_token" DROP DEFAULT;

-- AlterTable permissions: updated_at is application-managed (@updatedAt)
ALTER TABLE "permissions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable platform_message_recipients: id is application-managed (@default(uuid()))
ALTER TABLE "platform_message_recipients" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable platform_message_revisions: id is application-managed
ALTER TABLE "platform_message_revisions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable platform_messages
ALTER TABLE "platform_messages" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "platform_messages" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable platform_settings
ALTER TABLE "platform_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable restaurant_settings: align enum defaults with schema.prisma
ALTER TABLE "restaurant_settings" ALTER COLUMN "theme" SET DEFAULT 'DARK_LUXURY';
ALTER TABLE "restaurant_settings" ALTER COLUMN "presentation_mode" SET DEFAULT 'INDIVIDUAL_VIDEO';

-- AlterTable staff_invitations
ALTER TABLE "staff_invitations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable subscription_requests
ALTER TABLE "subscription_requests" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "subscription_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable user_restaurant_permissions
ALTER TABLE "user_restaurant_permissions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- Enforce one subscription per restaurant while preserving historical billing
-- records. If duplicates exist, reassign their payments/invoices/events/requests
-- to the surviving (most recent, preferably ACTIVE) subscription before deletion.
DO $$
DECLARE
  r RECORD;
  keeper_id UUID;
BEGIN
  FOR r IN
    SELECT restaurant_id
    FROM subscriptions
    GROUP BY restaurant_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM subscriptions
    WHERE restaurant_id = r.restaurant_id
    ORDER BY
      CASE WHEN status IN ('ACTIVE', 'GRACE_PERIOD', 'PENDING') THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1;

    UPDATE subscription_payments
      SET subscription_id = keeper_id
      WHERE subscription_id IN (
        SELECT id FROM subscriptions
        WHERE restaurant_id = r.restaurant_id AND id <> keeper_id
      );

    UPDATE subscription_invoices
      SET subscription_id = keeper_id
      WHERE subscription_id IN (
        SELECT id FROM subscriptions
        WHERE restaurant_id = r.restaurant_id AND id <> keeper_id
      );

    UPDATE subscription_events
      SET subscription_id = keeper_id
      WHERE subscription_id IN (
        SELECT id FROM subscriptions
        WHERE restaurant_id = r.restaurant_id AND id <> keeper_id
      );

    -- Reminder logs are non-billing dedup markers; drop those belonging to duplicate rows.
    DELETE FROM subscription_reminder_logs
      WHERE subscription_id IN (
        SELECT id FROM subscriptions
        WHERE restaurant_id = r.restaurant_id AND id <> keeper_id
      );

    UPDATE subscription_requests
      SET subscription_id = keeper_id
      WHERE subscription_id IN (
        SELECT id FROM subscriptions
        WHERE restaurant_id = r.restaurant_id AND id <> keeper_id
      );

    DELETE FROM subscriptions
      WHERE restaurant_id = r.restaurant_id AND id <> keeper_id;
  END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_restaurant_id_key" ON "subscriptions"("restaurant_id");
