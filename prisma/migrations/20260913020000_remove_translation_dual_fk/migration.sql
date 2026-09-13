-- Fix the "dual-FK schema trap" on translations.entity_id.
--
-- translations.entity_id is a polymorphic reference: the target table is
-- disambiguated by the entity_type column, NOT by a foreign key. The initial
-- migration incorrectly declared entity_id as a foreign key to BOTH categories
-- and food_items, which made it impossible to insert a translation unless the
-- same UUID existed in both tables, and caused incorrect cascade deletes.
--
-- This migration only drops those two erroneous constraints; it does not
-- touch any existing data.

-- DropForeignKey
ALTER TABLE "translations" DROP CONSTRAINT IF EXISTS "fk_translation_category";

-- DropForeignKey
ALTER TABLE "translations" DROP CONSTRAINT IF EXISTS "fk_translation_food";
