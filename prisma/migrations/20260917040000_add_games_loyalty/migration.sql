-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('SNAKES_LADDERS');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('PRIVATE', 'RANDOM');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PointsTransactionType" AS ENUM ('GAME_WIN', 'REWARD_REDEEM', 'ADMIN_ADJUST', 'EXPIRY', 'REFUND');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "game_configs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "modes" "GameMode"[] DEFAULT ARRAY[]::"GameMode"[],
    "min_players" INTEGER NOT NULL DEFAULT 2,
    "max_players" INTEGER NOT NULL DEFAULT 6,
    "point_rules" JSONB,
    "daily_points_limit" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "game_type" "GameType" NOT NULL DEFAULT 'SNAKES_LADDERS',
    "mode" "GameMode" NOT NULL,
    "table_id" UUID,
    "status" "GameStatus" NOT NULL DEFAULT 'WAITING',
    "host_player_id" UUID,
    "current_turn_player_id" UUID,
    "winner_player_id" UUID,
    "board_state" JSONB,
    "turn_number" INTEGER NOT NULL DEFAULT 0,
    "max_players" INTEGER NOT NULL DEFAULT 6,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" UUID NOT NULL,
    "game_session_id" UUID NOT NULL,
    "customer_id" UUID,
    "alias" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "seat_order" INTEGER NOT NULL DEFAULT 0,
    "is_host" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_moves" (
    "id" UUID NOT NULL,
    "game_session_id" UUID NOT NULL,
    "game_player_id" UUID NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "dice_roll" INTEGER NOT NULL,
    "from_position" INTEGER NOT NULL,
    "to_position" INTEGER NOT NULL,
    "moved_by_ladder" BOOLEAN NOT NULL DEFAULT false,
    "moved_by_snake" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_points_ledger" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "PointsTransactionType" NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "idempotency_key" TEXT,
    "balance_after" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points_cost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "unlimited_stock" BOOLEAN NOT NULL DEFAULT true,
    "stock" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_configs_restaurant_id_key" ON "game_configs"("restaurant_id");

-- CreateIndex
CREATE INDEX "game_sessions_restaurant_id_idx" ON "game_sessions"("restaurant_id");

-- CreateIndex
CREATE INDEX "game_sessions_restaurant_id_status_idx" ON "game_sessions"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "game_sessions_table_id_idx" ON "game_sessions"("table_id");

-- CreateIndex
CREATE INDEX "game_sessions_mode_idx" ON "game_sessions"("mode");

-- CreateIndex
CREATE INDEX "game_sessions_created_at_idx" ON "game_sessions"("created_at");

-- CreateIndex
CREATE INDEX "game_players_game_session_id_idx" ON "game_players"("game_session_id");

-- CreateIndex
CREATE INDEX "game_players_customer_id_idx" ON "game_players"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_game_session_id_seat_order_key" ON "game_players"("game_session_id", "seat_order");

-- CreateIndex
CREATE INDEX "game_moves_game_session_id_idx" ON "game_moves"("game_session_id");

-- CreateIndex
CREATE INDEX "game_moves_game_session_id_turn_number_idx" ON "game_moves"("game_session_id", "turn_number");

-- CreateIndex
CREATE INDEX "game_moves_game_player_id_idx" ON "game_moves"("game_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_points_ledger_idempotency_key_key" ON "customer_points_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "customer_points_ledger_customer_id_idx" ON "customer_points_ledger"("customer_id");

-- CreateIndex
CREATE INDEX "customer_points_ledger_restaurant_id_idx" ON "customer_points_ledger"("restaurant_id");

-- CreateIndex
CREATE INDEX "customer_points_ledger_customer_id_created_at_idx" ON "customer_points_ledger"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_points_ledger_type_idx" ON "customer_points_ledger"("type");

-- CreateIndex
CREATE INDEX "rewards_restaurant_id_idx" ON "rewards"("restaurant_id");

-- CreateIndex
CREATE INDEX "rewards_restaurant_id_active_idx" ON "rewards"("restaurant_id", "active");

-- CreateIndex
CREATE INDEX "reward_redemptions_customer_id_idx" ON "reward_redemptions"("customer_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_restaurant_id_idx" ON "reward_redemptions"("restaurant_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_reward_id_idx" ON "reward_redemptions"("reward_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_status_idx" ON "reward_redemptions"("status");

-- AddForeignKey
ALTER TABLE "game_configs" ADD CONSTRAINT "game_configs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_session_id_fkey" FOREIGN KEY ("game_session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_game_session_id_fkey" FOREIGN KEY ("game_session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_game_player_id_fkey" FOREIGN KEY ("game_player_id") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_points_ledger" ADD CONSTRAINT "customer_points_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_points_ledger" ADD CONSTRAINT "customer_points_ledger_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
