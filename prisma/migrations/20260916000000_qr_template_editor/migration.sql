-- QR Print Template Editor: add A5 layout and layout configuration (JSON).

-- AlterEnum: add A5 layout
ALTER TYPE "QrPrintLayout" ADD VALUE IF NOT EXISTS 'A5';

-- Add layout_config JSONB column
ALTER TABLE "qr_print_templates" ADD COLUMN IF NOT EXISTS "layout_config" JSONB;
