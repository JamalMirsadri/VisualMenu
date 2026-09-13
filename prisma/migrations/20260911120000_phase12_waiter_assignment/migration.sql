-- Phase 12: Add waiter assignment to orders
-- AlterTable: Add assigned_waiter_user_restaurant_id column to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_waiter_user_restaurant_id" UUID;

-- AddForeignKey: orders.assigned_waiter_user_restaurant_id -> user_restaurants.id
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_assigned_waiter_user_restaurant_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_waiter_user_restaurant_id_fkey" FOREIGN KEY ("assigned_waiter_user_restaurant_id") REFERENCES "user_restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: orders(restaurant_id, assigned_waiter_user_restaurant_id)
CREATE INDEX IF NOT EXISTS "orders_restaurant_id_assigned_waiter_user_restaurant_id_idx" ON "orders"("restaurant_id", "assigned_waiter_user_restaurant_id");
