-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'READY';

-- DropIndex
DROP INDEX IF EXISTS "restaurant_tables_restaurant_id_table_number_key";

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "notes",
DROP COLUMN IF EXISTS "subtotal",
ADD COLUMN IF NOT EXISTS "customer_note" TEXT,
ADD COLUMN IF NOT EXISTS "food_name_snapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "line_total" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN IF EXISTS "notes",
DROP COLUMN IF EXISTS "total_amount",
ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "customer_note" TEXT,
ADD COLUMN IF NOT EXISTS "discount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "order_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "service_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "tax" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "total" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN IF NOT EXISTS "table_id" UUID;

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "service_charge_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "service_charge_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "tax_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "restaurant_tables" DROP COLUMN IF EXISTS "table_number",
ADD COLUMN IF NOT EXISTS "location" TEXT,
ADD COLUMN IF NOT EXISTS "name" TEXT,
ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '1';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_table_id_idx" ON "orders"("table_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_order_number_idx" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qr_codes_table_id_idx" ON "qr_codes"("table_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "restaurant_tables_active_idx" ON "restaurant_tables"("active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_tables_restaurant_id_number_key" ON "restaurant_tables"("restaurant_id", "number");

-- AddForeignKey
ALTER TABLE "qr_codes" DROP CONSTRAINT IF EXISTS "qr_codes_table_id_fkey";
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
