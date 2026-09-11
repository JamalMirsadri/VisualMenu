import { apiClient } from './apiClient';
import type {
  PlatformMetrics,
  PlatformRestaurantItem,
  PlatformUser,
  PlatformAuditItem,
  PlatformSettingsData,
  PlatformRole,
} from '../types';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const platformService = {
  async getMetrics(): Promise<PlatformMetrics> {
    const res = await apiClient.get<{ success: boolean; data: PlatformMetrics }>('/platform/metrics');
    return res.data;
  },

  async listRestaurants(params: {
    search?: string;
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResult<PlatformRestaurantItem>> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('search', params.search);
    if (params.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const url = `/platform/restaurants${qs ? `?${qs}` : ''}`;
    const res = await apiClient.get<{ success: boolean; data: PaginatedResult<PlatformRestaurantItem> }>(url);
    return res.data;
  },

  async getRestaurantDetails(restaurantId: string): Promise<any> {
    const res = await apiClient.get<{ success: boolean; data: any }>(`/platform/restaurants/${restaurantId}`);
    return res.data;
  },

  async activateRestaurant(restaurantId: string, reason?: string): Promise<any> {
    const res = await apiClient.post<{ success: boolean; data: any }>(
      `/platform/restaurants/${restaurantId}/activate`,
      { reason }
    );
    return res.data;
  },

  async deactivateRestaurant(restaurantId: string, reason?: string): Promise<any> {
    const res = await apiClient.post<{ success: boolean; data: any }>(
      `/platform/restaurants/${restaurantId}/deactivate`,
      { reason }
    );
    return res.data;
  },

  async setRestaurantStatus(restaurantId: string, active: boolean, reason?: string): Promise<any> {
    if (active) {
      return this.activateRestaurant(restaurantId, reason);
    } else {
      return this.deactivateRestaurant(restaurantId, reason);
    }
  },

  async recordContextEnter(restaurantId: string): Promise<void> {
    try {
      await apiClient.post(`/platform/restaurants/${restaurantId}/context/enter`);
    } catch {
      // non-blocking
    }
  },

  async recordContextExit(restaurantId: string): Promise<void> {
    try {
      await apiClient.post(`/platform/restaurants/${restaurantId}/context/exit`);
    } catch {
      // non-blocking
    }
  },

  async listUsers(params: {
    search?: string;
    role?: PlatformRole;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResult<PlatformUser>> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('search', params.search);
    if (params.role) searchParams.set('role', params.role);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const url = `/platform/users${qs ? `?${qs}` : ''}`;
    const res = await apiClient.get<{ success: boolean; data: PaginatedResult<PlatformUser> }>(url);
    return res.data;
  },

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    platformRole: PlatformRole;
  }): Promise<PlatformUser> {
    const res = await apiClient.post<{ success: boolean; data: PlatformUser }>('/platform/users', data);
    return res.data;
  },

  async updateUser(
    id: string,
    data: { platformRole?: PlatformRole; active?: boolean; name?: string }
  ): Promise<PlatformUser> {
    const res = await apiClient.patch<{ success: boolean; data: PlatformUser }>(`/platform/users/${id}`, data);
    return res.data;
  },

  async deactivateUser(id: string): Promise<any> {
    const res = await apiClient.delete<{ success: boolean; data: any }>(`/platform/users/${id}`);
    return res.data;
  },

  async listAuditLogs(params: {
    action?: string;
    entityType?: string;
    restaurantId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResult<PlatformAuditItem>> {
    const searchParams = new URLSearchParams();
    if (params.action) searchParams.set('action', params.action);
    if (params.entityType) searchParams.set('entityType', params.entityType);
    if (params.restaurantId) searchParams.set('restaurantId', params.restaurantId);
    if (params.userId) searchParams.set('userId', params.userId);
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const url = `/platform/audit${qs ? `?${qs}` : ''}`;
    const res = await apiClient.get<{ success: boolean; data: PaginatedResult<PlatformAuditItem> }>(url);
    return res.data;
  },

  async getSettings(): Promise<PlatformSettingsData> {
    const res = await apiClient.get<{ success: boolean; data: PlatformSettingsData }>('/platform/settings');
    return res.data;
  },

  async updateSettings(data: Partial<PlatformSettingsData>): Promise<PlatformSettingsData> {
    const res = await apiClient.patch<{ success: boolean; data: PlatformSettingsData }>('/platform/settings', data);
    return res.data;
  },

  async provisionRestaurant(data: any): Promise<any> {
    const res = await apiClient.post<{ success: boolean; message: string; data: any }>(
      '/platform/restaurants',
      data
    );
    return res.data;
  },

  async getProvisioningDetails(restaurantId: string): Promise<any> {
    const res = await apiClient.get<{ success: boolean; data: any }>(
      `/platform/restaurants/${restaurantId}/provisioning`
    );
    return res.data;
  },

  async resendInvitation(restaurantId: string): Promise<any> {
    const res = await apiClient.post<{ success: boolean; message: string; data: any }>(
      `/platform/restaurants/${restaurantId}/invitation/resend`
    );
    return res.data;
  },

  async revokeInvitation(restaurantId: string): Promise<any> {
    const res = await apiClient.post<{ success: boolean; message: string; data: any }>(
      `/platform/restaurants/${restaurantId}/invitation/revoke`
    );
    return res.data;
  },
};

export const ownerInvitationService = {
  async getInvitation(token: string): Promise<any> {
    const res = await apiClient.get<{ success: boolean; data: any }>(`/owner/invitations/${token}`);
    return res.data;
  },

  async acceptInvitation(token: string, data: { password: string; name?: string }): Promise<any> {
    const res = await apiClient.post<{ success: boolean; message: string; data: any }>(
      `/owner/invitations/${token}/accept`,
      data
    );
    return res.data;
  },
};

