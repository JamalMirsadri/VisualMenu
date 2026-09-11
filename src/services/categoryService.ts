import { apiClient } from './apiClient';
import type { Category } from '../types';

export const categoryService = {
  getByRestaurant(restaurantId: string): Promise<Category[]> {
    return apiClient.get<Category[]>(`/restaurants/${restaurantId}/categories`);
  },

  create(restaurantId: string, data: Omit<Category, 'id'>): Promise<Category> {
    return apiClient.post<Category>(`/restaurants/${restaurantId}/categories`, data);
  },

  update(id: string, data: Partial<Category>): Promise<Category> {
    return apiClient.put<Category>(`/categories/${id}`, data);
  },

  delete(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/categories/${id}`);
  },

  reorder(restaurantId: string, categoryIds: string[]): Promise<{ message: string }> {
    return apiClient.patch<{ message: string }>('/categories/reorder', {
      restaurantId,
      categoryIds,
    });
  },
};
