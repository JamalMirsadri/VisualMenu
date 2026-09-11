import { apiClient } from './apiClient';

export const settingsService = {
  getByRestaurant(restaurantId: string): Promise<any> {
    return apiClient.get(`/restaurants/${restaurantId}/settings`);
  },

  update(restaurantId: string, data: any): Promise<any> {
    return apiClient.put(`/restaurants/${restaurantId}/settings`, data);
  },
};
