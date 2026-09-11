-- CreateIndex
CREATE INDEX IF NOT EXISTS "food_items_restaurant_id_available_deleted_at_idx" ON "food_items"("restaurant_id", "available", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "food_items_restaurant_id_category_id_display_order_idx" ON "food_items"("restaurant_id", "category_id", "display_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_restaurant_id_status_idx" ON "orders"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_restaurant_id_created_at_idx" ON "orders"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_restaurant_id_table_id_idx" ON "orders"("restaurant_id", "table_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_restaurant_id_created_at_idx" ON "audit_logs"("restaurant_id", "created_at");
