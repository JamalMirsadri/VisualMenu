-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "food_name_snapshot" DROP DEFAULT,
ALTER COLUMN "line_total" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "public_token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ALTER COLUMN "order_number" DROP DEFAULT,
ALTER COLUMN "subtotal" DROP DEFAULT,
ALTER COLUMN "total" DROP DEFAULT;

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "kds_urgent_minutes" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "kds_warning_minutes" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "restaurant_tables" ALTER COLUMN "number" DROP DEFAULT;

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "changed_by_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_created_at_idx" ON "order_status_history"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_public_token_key" ON "orders"("public_token");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_public_token_idx" ON "orders"("public_token");

-- CreateIndex
CREATE INDEX "orders_idempotency_key_idx" ON "orders"("idempotency_key");

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
