import { apiClient } from './apiClient';

export interface QrCodeData {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  targetType: 'RESTAURANT_MENU' | 'TABLE_MENU';
  targetValue: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const qrService = {
  getByRestaurant(restaurantId: string): Promise<QrCodeData[]> {
    return apiClient.get<QrCodeData[]>(`/restaurants/${restaurantId}/qr`);
  },

  create(restaurantId: string, data: Partial<QrCodeData>): Promise<QrCodeData> {
    return apiClient.post<QrCodeData>(`/restaurants/${restaurantId}/qr`, data);
  },

  delete(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/qr/${id}`);
  },
};
