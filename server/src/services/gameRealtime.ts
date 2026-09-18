import { realtimeService } from './realtimeService';

/**
 * Realtime channel + event helpers for the Games bounded context.
 * Reuses the existing in-memory SSE RealtimeService (no new transport).
 */

export const GAME_CHANNEL = (gameSessionId: string): string => `game:${gameSessionId}`;
export const TABLE_CHANNEL = (tableId: string): string => `table:${tableId}`;

export function broadcastGameEvent(gameSessionId: string, event: string, data: any): void {
  realtimeService.broadcast(GAME_CHANNEL(gameSessionId), event as any, data);
}

export function broadcastTableEvent(tableId: string, event: string, data: any): void {
  realtimeService.broadcast(TABLE_CHANNEL(tableId), event as any, data);
}
