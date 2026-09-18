import { apiClient } from './apiClient';

export interface EnrollResult {
  token: string | null;
  loyaltyUrl: string | null;
  alreadyEnrolled: boolean;
  name: string | null;
  balance: number;
}

export interface CustomerRewardDto {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  unlimitedStock: boolean;
  stock: number | null;
  sortOrder: number;
}

export interface CustomerLedgerEntryDto {
  type: string;
  amount: number;
  balanceAfter: number;
  referenceType: string | null;
  createdAt: string;
}

export interface CustomerLedgerDto {
  balance: number;
  entries: CustomerLedgerEntryDto[];
}

export interface CustomerRedemptionDto {
  id: string;
  rewardName: string | null;
  pointsSpent: number;
  status: string;
  redeemedAt: string | null;
  createdAt: string;
}

export interface RedeemResult {
  redemptionId: string;
  pointsSpent: number;
  status: string;
  balance: number;
}

export const customerLoyaltyService = {
  enroll(restaurantId: string, data: { name?: string; email?: string; phone?: string }): Promise<EnrollResult> {
    return apiClient.post(`/restaurants/${restaurantId}/loyalty/enroll`, data);
  },

  getQr(restaurantId: string, token: string): Promise<{ loyaltyUrl: string }> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/qr?token=${encodeURIComponent(token)}`);
  },

  getMe(restaurantId: string, token: string): Promise<{ name: string | null; balance: number }> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/me?token=${encodeURIComponent(token)}`);
  },

  getLedger(restaurantId: string, token: string): Promise<CustomerLedgerDto> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/ledger?token=${encodeURIComponent(token)}`);
  },

  getRewards(restaurantId: string): Promise<{ rewards: CustomerRewardDto[] }> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/rewards/available`);
  },

  redeem(restaurantId: string, token: string, rewardId: string, idempotencyKey: string): Promise<RedeemResult> {
    return apiClient.post(`/restaurants/${restaurantId}/loyalty/redeem`, { token, rewardId, idempotencyKey });
  },

  getRedemptions(restaurantId: string, token: string): Promise<{ redemptions: CustomerRedemptionDto[] }> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/redemptions/me?token=${encodeURIComponent(token)}`);
  },
};
