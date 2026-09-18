-- CreateEnum
CREATE TYPE "LoyaltyIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "loyalty_identities" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "LoyaltyIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_identities_token_hash_key" ON "loyalty_identities"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_identities_restaurant_id_customer_id_key" ON "loyalty_identities"("restaurant_id", "customer_id");

-- CreateIndex
CREATE INDEX "loyalty_identities_customer_id_idx" ON "loyalty_identities"("customer_id");

-- CreateIndex
CREATE INDEX "loyalty_identities_restaurant_id_idx" ON "loyalty_identities"("restaurant_id");

-- CreateIndex
CREATE INDEX "loyalty_identities_status_idx" ON "loyalty_identities"("status");

-- AddForeignKey
ALTER TABLE "loyalty_identities" ADD CONSTRAINT "loyalty_identities_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_identities" ADD CONSTRAINT "loyalty_identities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
