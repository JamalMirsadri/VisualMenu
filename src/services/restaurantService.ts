import { apiClient } from './apiClient';
import type { Category, FoodItem, Restaurant } from '../types';

export interface PublicMenuPayload {
  restaurant: Restaurant;
  settings: any;
  categories: Category[];
  foods: FoodItem[];
  table?: any;
}

export const restaurantService = {
  getPublicMenu(slug: string, tableNumber?: string): Promise<PublicMenuPayload> {
    const path = tableNumber ? `/menu/${slug}/table/${tableNumber}` : `/menu/${slug}`;
    return apiClient.get<PublicMenuPayload>(path);
  },

  getAll(): Promise<Restaurant[]> {
    return apiClient.get<Restaurant[]>('/restaurants');
  },

  getById(id: string): Promise<Restaurant> {
    return apiClient.get<Restaurant>(`/restaurants/${id}`);
  },

  getBySlug(slug: string): Promise<Restaurant> {
    return apiClient.get<Restaurant>(`/restaurants/by-slug/${slug}`);
  },

  update(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    return apiClient.put<Restaurant>(`/restaurants/${id}`, data);
  },

  create(data: { name: string; slug: string; description?: string; themeColor?: string }): Promise<Restaurant> {
    return apiClient.post<Restaurant>('/restaurants', data);
  },

  updateStatus(id: string, active: boolean): Promise<Restaurant> {
    return apiClient.patch<Restaurant>(`/restaurants/${id}/status`, { active });
  },

  getDashboardMetrics(id: string): Promise<any> {
    return apiClient.get<any>(`/restaurants/${id}/dashboard-metrics`);
  },
};

