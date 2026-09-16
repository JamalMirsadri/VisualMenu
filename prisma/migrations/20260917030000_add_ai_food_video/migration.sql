-- AI Food Video Studio
-- Adds the isolated AI video generation schema: platform-owned templates +
-- prompt variants, restaurant-owned generation jobs, an auditable credit
-- ledger, configurable credit packs, purchases, and the subscription plan's
-- included video credit allowance.

-- CreateEnum
CREATE TYPE "VideoContentType" AS ENUM ('FOOD', 'SALAD', 'DRINK', 'DESSERT', 'OTHER');

-- CreateEnum
CREATE TYPE "VideoJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VideoCreditTransactionType" AS ENUM ('PLAN_GRANT', 'PURCHASE', 'MANUAL_GRANT', 'USAGE', 'REFUND', 'EXPIRY');

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "included_video_credits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "video_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contentType" "VideoContentType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "duration" INTEGER,
    "provider" TEXT DEFAULT 'VEO',
    "model" TEXT,
    "background_asset" TEXT,
    "style_config" JSONB,
    "camera_config" JSONB,
    "lighting_config" JSONB,
    "motion_config" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_template_prompt_variants" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prompt_template" TEXT NOT NULL,
    "negative_prompt" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_template_prompt_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_generation_jobs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "template_id" UUID,
    "prompt_variant_id" UUID,
    "source_media_id" UUID,
    "provider_job_id" TEXT,
    "status" "VideoJobStatus" NOT NULL DEFAULT 'QUEUED',
    "output_media_id" UUID,
    "error" TEXT,
    "credit_tx_id" UUID,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_credit_ledger" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "subscription_id" UUID,
    "amount" INTEGER NOT NULL,
    "type" "VideoCreditTransactionType" NOT NULL,
    "reference" TEXT,
    "metadata" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_credit_packs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_credit_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_credit_purchases" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "pack_id" UUID,
    "credits" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_templates_contentType_idx" ON "video_templates"("contentType");

-- CreateIndex
CREATE INDEX "video_templates_active_idx" ON "video_templates"("active");

-- CreateIndex
CREATE INDEX "video_template_prompt_variants_template_id_idx" ON "video_template_prompt_variants"("template_id");

-- CreateIndex
CREATE INDEX "video_template_prompt_variants_active_idx" ON "video_template_prompt_variants"("active");

-- CreateIndex
CREATE INDEX "video_generation_jobs_restaurant_id_idx" ON "video_generation_jobs"("restaurant_id");

-- CreateIndex
CREATE INDEX "video_generation_jobs_status_idx" ON "video_generation_jobs"("status");

-- CreateIndex
CREATE INDEX "video_generation_jobs_created_at_idx" ON "video_generation_jobs"("created_at");

-- CreateIndex
CREATE INDEX "video_credit_ledger_restaurant_id_idx" ON "video_credit_ledger"("restaurant_id");

-- CreateIndex
CREATE INDEX "video_credit_ledger_type_idx" ON "video_credit_ledger"("type");

-- CreateIndex
CREATE INDEX "video_credit_ledger_created_at_idx" ON "video_credit_ledger"("created_at");

-- CreateIndex
CREATE INDEX "video_credit_ledger_reference_idx" ON "video_credit_ledger"("reference");

-- CreateIndex
CREATE INDEX "video_credit_packs_active_idx" ON "video_credit_packs"("active");

-- CreateIndex
CREATE INDEX "video_credit_purchases_restaurant_id_idx" ON "video_credit_purchases"("restaurant_id");

-- CreateIndex
CREATE INDEX "video_credit_purchases_created_at_idx" ON "video_credit_purchases"("created_at");

-- AddForeignKey
ALTER TABLE "video_template_prompt_variants" ADD CONSTRAINT "video_template_prompt_variants_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "video_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_generation_jobs" ADD CONSTRAINT "video_generation_jobs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_generation_jobs" ADD CONSTRAINT "video_generation_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "video_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_generation_jobs" ADD CONSTRAINT "video_generation_jobs_prompt_variant_id_fkey" FOREIGN KEY ("prompt_variant_id") REFERENCES "video_template_prompt_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_generation_jobs" ADD CONSTRAINT "video_generation_jobs_source_media_id_fkey" FOREIGN KEY ("source_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_generation_jobs" ADD CONSTRAINT "video_generation_jobs_output_media_id_fkey" FOREIGN KEY ("output_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_credit_ledger" ADD CONSTRAINT "video_credit_ledger_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_credit_ledger" ADD CONSTRAINT "video_credit_ledger_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_credit_purchases" ADD CONSTRAINT "video_credit_purchases_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_credit_purchases" ADD CONSTRAINT "video_credit_purchases_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "video_credit_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
