-- CreateEnum
CREATE TYPE "CancellationActorType" AS ENUM ('CUSTOMER', 'STAFF');

-- AlterTable (orders): cancellation attribution
ALTER TABLE "orders" ADD COLUMN "cancelled_by_actor_type" "CancellationActorType";
ALTER TABLE "orders" ADD COLUMN "cancelled_by_user_id" UUID;
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT;

-- AlterTable (payments): cancellation attribution
ALTER TABLE "payments" ADD COLUMN "cancelled_by_actor_type" "CancellationActorType";
ALTER TABLE "payments" ADD COLUMN "cancelled_by_user_id" UUID;
ALTER TABLE "payments" ADD COLUMN "cancellation_reason" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
