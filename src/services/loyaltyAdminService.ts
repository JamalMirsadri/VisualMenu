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
  code: string | null;
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
    restaurantName: string | null;
    loyaltyCode: string | null;
    registrationDate: string | null;
    lastActivityAt: string | null;
    totalOrders: number;
    totalSpend: number;
    rewardsRedeemed: number;
    qrUrl: string | null;
  };
  identity: CustomerIdentityDto | null;
  ledger: LedgerEntryDto[];
  redemptions: CustomerRedemptionDto[];
}

export interface LoyaltyCustomerListItemDto {
  customerId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  loyaltyCode: string;
  balance: number;
  restaurantName: string | null;
  registrationDate: string | null;
  lastActivityAt: string | null;
  totalOrders: number;
  totalSpend: number;
  rewardsRedeemed: number;
  identityStatus: 'ACTIVE' | 'REVOKED';
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

  listCustomers(
    restaurantId: string,
    params: { search?: string; status?: string; sort?: string; page?: number; limit?: number } = {}
  ): Promise<{ customers: LoyaltyCustomerListItemDto[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);
    if (params.sort) query.append('sort', params.sort);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    return apiClient.get(`/restaurants/${restaurantId}/loyalty/customers?${query.toString()}`);
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
