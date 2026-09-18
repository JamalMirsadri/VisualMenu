import { apiClient } from './apiClient';

export interface GameConfigDto {
  id: string;
  enabled: boolean;
  modes: string[];
  minPlayers: number;
  maxPlayers: number;
  turnTimeoutSeconds: number;
  dailyPointsLimit: number;
  pointRules: { winPoints?: number } | null;
}

export interface GameConfigPayload {
  enabled: boolean;
  modes: string[];
  minPlayers: number;
  maxPlayers: number;
  turnTimeoutSeconds: number;
  dailyPointsLimit: number;
  pointRules: { winPoints: number };
}

export const gameAdminService = {
  getConfig(restaurantId: string): Promise<{ config: GameConfigDto | null }> {
    return apiClient.get(`/restaurants/${restaurantId}/games/config`);
  },

  updateConfig(restaurantId: string, data: GameConfigPayload): Promise<{ config: GameConfigDto }> {
    return apiClient.put(`/restaurants/${restaurantId}/games/config`, data);
  },
};
