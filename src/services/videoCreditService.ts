import { apiClient } from './apiClient';

export interface VideoCreditPack {
  id: string;
  name: string;
  credits: number;
  price: string | number;
  currency: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantCreditBalance {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  balance: number;
  allowance: number;
  granted: number;
  purchased: number;
  used: number;
  refunded: number;
}

export const videoCreditService = {
  listPacks(): Promise<VideoCreditPack[]> {
    return apiClient.get<VideoCreditPack[]>('/platform/video-credit-packs');
  },

  createPack(data: Partial<VideoCreditPack>): Promise<VideoCreditPack> {
    return apiClient.post<VideoCreditPack>('/platform/video-credit-packs', data);
  },

  updatePack(id: string, data: Partial<VideoCreditPack>): Promise<VideoCreditPack> {
    return apiClient.patch<VideoCreditPack>(`/platform/video-credit-packs/${id}`, data);
  },

  removePack(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/platform/video-credit-packs/${id}`);
  },

  listRestaurants(): Promise<RestaurantCreditBalance[]> {
    return apiClient.get<RestaurantCreditBalance[]>('/platform/video-credits/restaurants');
  },

  getRestaurant(id: string): Promise<any> {
    return apiClient.get<any>(`/platform/video-credits/restaurants/${id}`);
  },

  grantCredits(restaurantId: string, amount: number, reference?: string): Promise<{ balance: number; ledgerId: string }> {
    return apiClient.post<{ balance: number; ledgerId: string }>(`/platform/video-credits/restaurants/${restaurantId}/grants`, { amount, reference });
  },

  purchasePack(restaurantId: string, packId: string): Promise<{ purchase: any; balance: number }> {
    return apiClient.post<{ purchase: any; balance: number }>(`/platform/video-credits/restaurants/${restaurantId}/purchases`, { packId });
  },
};
