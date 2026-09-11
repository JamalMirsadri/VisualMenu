-- Phase 7: Product UX, Restaurant Branding, Menu Customization & Media Experience

-- 1. Alter restaurants table
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "favicon" TEXT;

-- 2. Alter media table
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "desktop_url" TEXT;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "mobile_url" TEXT;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "poster_url" TEXT;

-- 3. Alter restaurant_settings table
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "accent_color" TEXT NOT NULL DEFAULT '#f59e0b';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "text_style" TEXT NOT NULL DEFAULT 'SERIF';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "button_style" TEXT NOT NULL DEFAULT 'PILL';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "background_style" TEXT NOT NULL DEFAULT 'DARK_BLUR';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "card_style" TEXT NOT NULL DEFAULT 'GLASSMORPHISM';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "animation_style" TEXT NOT NULL DEFAULT 'CINEMATIC';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "category_style" TEXT NOT NULL DEFAULT 'PILLS';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "food_info_position" TEXT NOT NULL DEFAULT 'BOTTOM_OVERLAY';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "progress_indicator_style" TEXT NOT NULL DEFAULT 'BAR';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "environment_background" TEXT NOT NULL DEFAULT 'DARK_STUDIO';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "table_surface" TEXT NOT NULL DEFAULT 'DARK_MARBLE';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "lighting_preset" TEXT NOT NULL DEFAULT 'WARM';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "food_entrance_animation" TEXT NOT NULL DEFAULT 'SCALE';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "food_exit_animation" TEXT NOT NULL DEFAULT 'FADE';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "camera_motion" TEXT NOT NULL DEFAULT 'SUBTLE_ZOOM';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "overlay_style" TEXT NOT NULL DEFAULT 'GRADIENT_BOTTOM';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "show_allergens" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "show_ingredients" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "show_favorite_button" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "show_details_button" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "show_order_button" BOOLEAN NOT NULL DEFAULT true;

-- 4. Normalize theme & presentation mode values for existing rows
UPDATE "restaurant_settings" SET "theme" = 'DARK_LUXURY' WHERE "theme" = 'dark-luxury';
UPDATE "restaurant_settings" SET "presentation_mode" = 'INDIVIDUAL_VIDEO' WHERE "presentation_mode" IN ('reels', 'individual');
