-- Product Analytics Type (reporting classification, independent of Category).
CREATE TYPE "AnalyticsType" AS ENUM ('FOOD', 'DRINK', 'DESSERT', 'OTHER');
ALTER TABLE "food_items" ADD COLUMN IF NOT EXISTS "analytics_type" "AnalyticsType";
