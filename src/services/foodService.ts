import { apiClient } from './apiClient';
import type { FoodItem } from '../types';

export const foodService = {
  getByRestaurant(
    restaurantId: string,
    options?: { categoryId?: string; availableOnly?: boolean; includeDeleted?: boolean }
  ): Promise<FoodItem[]> {
    const params = new URLSearchParams();
    if (options?.categoryId) params.append('categoryId', options.categoryId);
    if (options?.availableOnly) params.append('availableOnly', 'true');
    if (options?.includeDeleted) params.append('includeDeleted', 'true');

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<FoodItem[]>(`/restaurants/${restaurantId}/foods${query}`);
  },

  getById(id: string): Promise<FoodItem> {
    return apiClient.get<FoodItem>(`/foods/${id}`);
  },

  create(restaurantId: string, data: Omit<FoodItem, 'id'>): Promise<FoodItem> {
    return apiClient.post<FoodItem>(`/restaurants/${restaurantId}/foods`, data);
  },

  update(id: string, data: Partial<FoodItem>): Promise<FoodItem> {
    return apiClient.put<FoodItem>(`/foods/${id}`, data);
  },

  updatePrice(id: string, price: number): Promise<{ id: string; price: number }> {
    return apiClient.patch<{ id: string; price: number }>(`/foods/${id}/price`, { price });
  },

  updateAvailability(id: string, available: boolean): Promise<{ id: string; available: boolean }> {
    return apiClient.patch<{ id: string; available: boolean }>(`/foods/${id}/availability`, { available });
  },

  delete(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/foods/${id}`);
  },

  duplicate(id: string): Promise<FoodItem> {
    return apiClient.post<FoodItem>(`/foods/${id}/duplicate`);
  },

  reorder(restaurantId: string, foodIds: string[]): Promise<{ message: string }> {
    return apiClient.patch<{ message: string }>('/foods/reorder', {
      restaurantId,
      foodIds,
    });
  },
};
