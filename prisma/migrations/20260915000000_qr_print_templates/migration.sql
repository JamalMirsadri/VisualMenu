-- QR Print Template System: platform-owned print templates.
-- Templates store only fixed background/design metadata; no restaurant data.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "QrPrintLayout" AS ENUM ('A4', 'CARD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "qr_print_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "background_url" TEXT,
    "layout" "QrPrintLayout" NOT NULL DEFAULT 'CARD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_print_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qr_print_templates_active_idx" ON "qr_print_templates"("active");
