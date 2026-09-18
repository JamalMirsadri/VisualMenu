import { apiClient } from './apiClient';
import { buildApiUrl } from '../config';

export type GameMode = 'PRIVATE' | 'RANDOM';
export type GameStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';

export interface BoardConnection {
  from: number;
  to: number;
}

export interface GameConfigDto {
  enabled: boolean;
  modes: GameMode[];
  minPlayers: number;
  maxPlayers: number;
  turnTimeoutSeconds: number;
  ladders: BoardConnection[];
  snakes: BoardConnection[];
}

export interface GamePlayerDto {
  id: string;
  alias: string;
  position: number;
  seatOrder: number;
  isHost: boolean;
}

export interface GameSessionDto {
  id: string;
  gameType: string;
  mode: GameMode;
  status: GameStatus;
  tableId: string | null;
  turnNumber: number;
  eventVersion: number;
  currentTurnPlayerId: string | null;
  winnerPlayerId: string | null;
  maxPlayers: number;
  startedAt: string | null;
  endedAt: string | null;
  lastTurnAt: string | null;
  players: GamePlayerDto[];
}

export interface JoinResult {
  session: GameSessionDto;
  player: GamePlayerDto;
  token: string;
  started?: boolean;
}

export const customerGameService = {
  getConfig(restaurantId: string): Promise<GameConfigDto> {
    return apiClient.get(`/restaurants/${restaurantId}/games/availability`);
  },

  getTableGame(restaurantId: string, tableId: string): Promise<{ game: GameSessionDto | null }> {
    return apiClient.get(`/restaurants/${restaurantId}/games/table/${tableId}`);
  },

  createPrivate(
    restaurantId: string,
    data: { tableId: string; alias: string; playerKey?: string; customerId?: string }
  ): Promise<JoinResult> {
    return apiClient.post(`/restaurants/${restaurantId}/games/private`, data);
  },

  joinPrivate(
    restaurantId: string,
    gameSessionId: string,
    data: { tableId: string; alias: string; playerKey?: string; customerId?: string }
  ): Promise<JoinResult> {
    return apiClient.post(`/restaurants/${restaurantId}/games/${gameSessionId}/join`, data);
  },

  joinRandom(
    restaurantId: string,
    data: { alias: string; playerKey?: string; customerId?: string }
  ): Promise<JoinResult> {
    return apiClient.post(`/restaurants/${restaurantId}/games/random`, data);
  },

  start(restaurantId: string, gameSessionId: string, token: string): Promise<{ game: GameSessionDto }> {
    return apiClient.post(`/restaurants/${restaurantId}/games/${gameSessionId}/start`, undefined, {
      Authorization: `Bearer ${token}`,
    });
  },

  cancel(restaurantId: string, gameSessionId: string, token: string): Promise<{ game: GameSessionDto }> {
    return apiClient.post(`/restaurants/${restaurantId}/games/${gameSessionId}/cancel`, undefined, {
      Authorization: `Bearer ${token}`,
    });
  },

  leave(restaurantId: string, gameSessionId: string, token: string): Promise<{ game: GameSessionDto | null }> {
    return apiClient.post(`/restaurants/${restaurantId}/games/${gameSessionId}/leave`, undefined, {
      Authorization: `Bearer ${token}`,
    });
  },

  roll(restaurantId: string, gameSessionId: string, token: string): Promise<any> {
    return apiClient.post(`/restaurants/${restaurantId}/games/${gameSessionId}/roll`, undefined, {
      Authorization: `Bearer ${token}`,
    });
  },

  // SSE endpoint URLs (EventSource-compatible; game token passed via query).
  tableEventsUrl(restaurantId: string, tableId: string): string {
    return buildApiUrl(`/restaurants/${restaurantId}/games/table/${tableId}/events`);
  },

  gameEventsUrl(restaurantId: string, gameSessionId: string, token: string): string {
    return buildApiUrl(
      `/restaurants/${restaurantId}/games/${gameSessionId}/events?token=${encodeURIComponent(token)}`
    );
  },
};
