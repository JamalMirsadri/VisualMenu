import { apiClient } from './apiClient';

export interface LoyaltyOverviewDto {
  totalLoyaltyCustomers: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  activeRewards: number;
  recentRedemptions: RedemptionDto[];
}

export interface RewardDto {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  active: boolean;
  unlimitedStock: boolean;
  stock: number | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RewardPayload {
  name: string;
  description: string | null;
  pointsCost: number;
  unlimitedStock: boolean;
  stock: number | null;
  sortOrder: number;
}

export interface LedgerEntryDto {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface CustomerRedemptionDto {
  id: string;
  reward: { id: string; name: string; pointsCost?: number } | null;
  pointsSpent: number;
  status: string;
  redeemedAt: string | null;
  createdAt: string;
}

export interface CustomerIdentityDto {
  active: boolean;
  status: string;
  issuedAt: string | null;
  revokedAt: string | null;
}

export interface CustomerLoyaltyProfileDto {
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    balance: number;
  };
  identity: CustomerIdentityDto | null;
  ledger: LedgerEntryDto[];
  redemptions: CustomerRedemptionDto[];
}

export interface RedemptionDto {
  id: string;
  customer: { id: string; name: string | null } | null;
  reward: { id: string; name: string } | null;
  pointsSpent: number;
  status: string;
  redeemedAt: string | null;
  createdAt: string;
}

export const loyaltyAdminService = {
  getOverview(restaurantId: string): Promise<LoyaltyOverviewDto> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/overview`);
  },

  listRewards(restaurantId: string): Promise<{ rewards: RewardDto[] }> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/rewards`);
  },

  createReward(restaurantId: string, data: RewardPayload): Promise<{ reward: RewardDto }> {
    return apiClient.post(`/restaurants/${restaurantId}/loyalty/rewards`, data);
  },

  updateReward(restaurantId: string, rewardId: string, data: RewardPayload): Promise<{ reward: RewardDto }> {
    return apiClient.put(`/restaurants/${restaurantId}/loyalty/rewards/${rewardId}`, data);
  },

  setRewardStatus(restaurantId: string, rewardId: string, active: boolean): Promise<{ reward: RewardDto }> {
    return apiClient.patch(`/restaurants/${restaurantId}/loyalty/rewards/${rewardId}/status`, { active });
  },

  deleteReward(restaurantId: string, rewardId: string): Promise<{ deleted: boolean }> {
    return apiClient.delete(`/restaurants/${restaurantId}/loyalty/rewards/${rewardId}`);
  },

  lookupCustomer(restaurantId: string, taxId: string): Promise<CustomerLoyaltyProfileDto> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/customers/lookup?taxId=${encodeURIComponent(taxId)}`);
  },

  getCustomer(restaurantId: string, customerId: string): Promise<CustomerLoyaltyProfileDto> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/customers/${customerId}`);
  },

  adjustPoints(
    restaurantId: string,
    customerId: string,
    data: { amount: number; reason: string }
  ): Promise<{ balance: number }> {
    return apiClient.post(`/restaurants/${restaurantId}/loyalty/customers/${customerId}/adjust`, data);
  },

  revokeIdentity(restaurantId: string, customerId: string): Promise<{ identity: CustomerIdentityDto }> {
    return apiClient.post(`/restaurants/${restaurantId}/loyalty/customers/${customerId}/token/revoke`);
  },

  listRedemptions(restaurantId: string): Promise<{ redemptions: RedemptionDto[] }> {
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/redemptions`);
  },

  refundRedemption(restaurantId: string, redemptionId: string): Promise<{ redemption: RedemptionDto }> {
    return apiClient.post(`/restaurants/${restaurantId}/loyalty/redemptions/${redemptionId}/refund`);
  },
};
