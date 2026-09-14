import { apiClient } from './apiClient';

export interface AdminActivityCounts {
  liveOrders: number;
  notifications: number;
  payments: number;
  kitchen: number;
  staffInvitations: number;
  tables: number;
}

export const activityService = {
  async getBadges(restaurantId: string): Promise<AdminActivityCounts> {
    return apiClient.get<AdminActivityCounts>(`/restaurants/${restaurantId}/activity-badges`);
  },
};
