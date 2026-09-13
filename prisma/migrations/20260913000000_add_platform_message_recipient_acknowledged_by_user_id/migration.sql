-- AlterTable platform_message_recipients: add acknowledged_by_user_id
ALTER TABLE "platform_message_recipients" ADD COLUMN IF NOT EXISTS "acknowledged_by_user_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "platform_message_recipients_acknowledged_by_user_id_idx" ON "platform_message_recipients"("acknowledged_by_user_id");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "platform_message_recipients" ADD CONSTRAINT "platform_message_recipients_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
