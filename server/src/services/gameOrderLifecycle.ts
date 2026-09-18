import { GameMode, GameStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { broadcastGameEvent } from './gameRealtime';

/**
 * Order/table lifecycle integration (Phase 9A).
 *
 * When an order reaches a terminal state, any active private (same-table) game
 * for that restaurant + table is ended. Random games have no table and are never
 * matched. Idempotent: only WAITING/IN_PROGRESS games are considered, so a
 * repeated call (or a second completed order) is a no-op.
 *
 * This does not touch loyalty: a FINISHED game without a winner awards nothing
 * by the existing `awardGameWin` rules, and a CANCELLED game awards nothing.
 */
export async function terminatePrivateGameByTable(
  restaurantId: string,
  tableId: string | null | undefined,
  targetStatus: 'FINISHED' | 'CANCELLED'
): Promise<void> {
  if (!tableId) return;

  const session = await prisma.gameSession.findFirst({
    where: {
      restaurantId,
      tableId,
      mode: GameMode.PRIVATE,
      status: { in: [GameStatus.WAITING, GameStatus.IN_PROGRESS] },
    },
  });

  if (!session) return;

  const updated = await prisma.gameSession.update({
    where: { id: session.id },
    data: {
      status: targetStatus === 'FINISHED' ? GameStatus.FINISHED : GameStatus.CANCELLED,
      endedAt: new Date(),
      eventVersion: { increment: 1 },
    },
  });

  // Propagate the final state to the customer game UI via the existing SSE flow.
  if (targetStatus === 'FINISHED') {
    broadcastGameEvent(updated.id, 'GAME_FINISHED', {
      gameSessionId: updated.id,
      version: updated.eventVersion,
      winnerPlayerId: updated.winnerPlayerId ?? null,
    });
  } else {
    broadcastGameEvent(updated.id, 'GAME_CANCELLED', {
      gameSessionId: updated.id,
      version: updated.eventVersion,
    });
  }
}
