-- AlterTable
ALTER TABLE "reward_redemptions" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_idempotency_key_key" ON "reward_redemptions"("idempotency_key");
