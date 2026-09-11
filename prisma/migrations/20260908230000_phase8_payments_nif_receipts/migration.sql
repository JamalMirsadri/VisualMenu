-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MBWAY', 'MULTIBANCO', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('SALE', 'AUTHORIZATION', 'CAPTURE', 'REFUND', 'PARTIAL_REFUND', 'VOID', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FiscalDocumentType" AS ENUM ('RECEIPT', 'INVOICE', 'SIMPLIFIED_INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketing_consent_at" TIMESTAMP(3),
ADD COLUMN     "preferred_language" TEXT DEFAULT 'en',
ADD COLUMN     "restaurant_id" UUID,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "customer_tax_country" TEXT DEFAULT 'PT',
ADD COLUMN     "customer_tax_id" TEXT;

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "card_payment_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cash_payment_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enabled_payment_methods" TEXT[] DEFAULT ARRAY['CASH', 'CARD', 'MBWAY']::TEXT[],
ADD COLUMN     "mbway_payment_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "multibanco_payment_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "customer_fiscal_profiles" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "tax_id" TEXT NOT NULL,
    "tax_country" TEXT NOT NULL DEFAULT 'PT',
    "billing_name" TEXT,
    "billing_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_fiscal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "metadata" JSONB,
    "received_by_user_id" UUID,
    "amount_received" DECIMAL(10,2),
    "change_given" DECIMAL(10,2),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" "PaymentTransactionType" NOT NULL,
    "provider_transaction_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID,
    "document_number" TEXT NOT NULL,
    "series" TEXT NOT NULL DEFAULT '2026',
    "sequence_number" INTEGER NOT NULL,
    "document_type" "FiscalDocumentType" NOT NULL DEFAULT 'RECEIPT',
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "service_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "total" DECIMAL(10,2) NOT NULL,
    "customer_name" TEXT,
    "customer_tax_id" TEXT,
    "customer_tax_country" TEXT DEFAULT 'PT',
    "customer_email" TEXT,
    "customer_address" TEXT,
    "items_snapshot" JSONB,
    "metadata" JSONB,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_fiscal_profiles_customer_id_idx" ON "customer_fiscal_profiles"("customer_id");

-- CreateIndex
CREATE INDEX "customer_fiscal_profiles_tax_id_idx" ON "customer_fiscal_profiles"("tax_id");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_idx" ON "payments"("restaurant_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE INDEX "payments_provider_payment_id_idx" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_status_idx" ON "payments"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_id_idx" ON "payment_transactions"("payment_id");

-- CreateIndex
CREATE INDEX "payment_transactions_created_at_idx" ON "payment_transactions"("created_at");

-- CreateIndex
CREATE INDEX "payment_webhook_events_processed_idx" ON "payment_webhook_events"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_restaurant_id_idx" ON "fiscal_documents"("restaurant_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_order_id_idx" ON "fiscal_documents"("order_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_payment_id_idx" ON "fiscal_documents"("payment_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_document_number_idx" ON "fiscal_documents"("document_number");

-- CreateIndex
CREATE INDEX "fiscal_documents_customer_tax_id_idx" ON "fiscal_documents"("customer_tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_restaurant_id_series_sequence_number_key" ON "fiscal_documents"("restaurant_id", "series", "sequence_number");

-- CreateIndex
CREATE INDEX "customers_restaurant_id_idx" ON "customers"("restaurant_id");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_fiscal_profiles" ADD CONSTRAINT "customer_fiscal_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
