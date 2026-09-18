-- AlterTable
ALTER TABLE "game_configs" ADD COLUMN "turn_timeout_seconds" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN "last_turn_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "game_players" ADD COLUMN "player_key" TEXT;

-- CreateIndex
CREATE INDEX "game_players_player_key_idx" ON "game_players"("player_key");

-- DropIndex
DROP INDEX "game_moves_game_session_id_turn_number_idx";

-- CreateIndex
CREATE UNIQUE INDEX "game_moves_game_session_id_turn_number_key" ON "game_moves"("game_session_id", "turn_number");
