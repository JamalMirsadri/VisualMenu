/*
  Warnings:

  - You are about to drop the column `restaurant_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'STAFF');

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_restaurant_id_fkey";

-- DropIndex
DROP INDEX "users_restaurant_id_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "restaurant_id",
DROP COLUMN "role";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "user_restaurants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_restaurants_user_id_idx" ON "user_restaurants"("user_id");

-- CreateIndex
CREATE INDEX "user_restaurants_restaurant_id_idx" ON "user_restaurants"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_restaurants_user_id_restaurant_id_key" ON "user_restaurants"("user_id", "restaurant_id");

-- AddForeignKey
ALTER TABLE "user_restaurants" ADD CONSTRAINT "user_restaurants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restaurants" ADD CONSTRAINT "user_restaurants_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
