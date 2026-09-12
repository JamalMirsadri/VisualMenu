import { apiClient } from './apiClient';
import type {
  PlatformMetrics,
  PlatformRestaurantItem,
  PlatformUser,
  PlatformAuditItem,
  PlatformSettingsData,
  PlatformRole,
  UpdatePlatformRestaurantInput,
} from '../types';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function unwrapResponse<T>(res: any): T {
  if (res && typeof res === 'object' && 'data' in res && res.data !== undefined) {
    return res.data as T;
  }
  return res as T;
}

export function normalizePaginatedResult<T>(res: any): PaginatedResult<T> {
  const unwrapped = unwrapResponse<any>(res);
  if (!unwrapped || typeof unwrapped !== 'object') {
    return {
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
  }

  const items = Array.isArray(unwrapped.items)
    ? unwrapped.items
    : Array.isArray(unwrapped)
      ? unwrapped
      : [];

  const limit = typeof unwrapped.limit === 'number' && unwrapped.limit > 0 ? unwrapped.limit : 10;
  const total = typeof unwrapped.total === 'number' ? unwrapped.total : items.length;
  const page = typeof unwrapped.page === 'number' && unwrapped.page > 0 ? unwrapped.page : 1;
  const totalPages =
    typeof unwrapped.totalPages === 'number' && unwrapped.totalPages > 0
      ? unwrapped.totalPages
      : Math.ceil(total / limit) || 1;

  return {
    items,
    total,
    page,
    limit,
    totalPages,
  };
}

export const platformService = {
  async getMetrics(): Promise<PlatformMetrics> {
    const res = await apiClient.get<any>('/platform/metrics');
    return unwrapResponse<PlatformMetrics>(res);
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
    const res = await apiClient.get<any>(url);
    return normalizePaginatedResult<PlatformRestaurantItem>(res);
  },

  async getRestaurantDetails(restaurantId: string): Promise<any> {
    const res = await apiClient.get<any>(`/platform/restaurants/${restaurantId}`);
    return unwrapResponse<any>(res);
  },

  async updateRestaurant(restaurantId: string, data: UpdatePlatformRestaurantInput): Promise<any> {
    const res = await apiClient.patch<any>(`/platform/restaurants/${restaurantId}`, data);
    return unwrapResponse<any>(res);
  },

  async uploadRestaurantAsset(restaurantId: string, file: File): Promise<{ url: string; key?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<any>(`/platform/restaurants/${restaurantId}/upload`, formData);
    return unwrapResponse<{ url: string; key?: string }>(res);
  },

  async activateRestaurant(restaurantId: string, reason?: string): Promise<any> {
    const res = await apiClient.post<any>(
      `/platform/restaurants/${restaurantId}/activate`,
      { reason }
    );
    return unwrapResponse<any>(res);
  },

  async deactivateRestaurant(restaurantId: string, reason?: string): Promise<any> {
    const res = await apiClient.post<any>(
      `/platform/restaurants/${restaurantId}/deactivate`,
      { reason }
    );
    return unwrapResponse<any>(res);
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
    const res = await apiClient.get<any>(url);
    return normalizePaginatedResult<PlatformUser>(res);
  },

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    platformRole: PlatformRole;
  }): Promise<PlatformUser> {
    const res = await apiClient.post<any>('/platform/users', data);
    return unwrapResponse<PlatformUser>(res);
  },

  async updateUser(
    id: string,
    data: { platformRole?: PlatformRole; active?: boolean; name?: string }
  ): Promise<PlatformUser> {
    const res = await apiClient.patch<any>(`/platform/users/${id}`, data);
    return unwrapResponse<PlatformUser>(res);
  },

  async deactivateUser(id: string): Promise<any> {
    const res = await apiClient.delete<any>(`/platform/users/${id}`);
    return unwrapResponse<any>(res);
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
    const res = await apiClient.get<any>(url);
    return normalizePaginatedResult<PlatformAuditItem>(res);
  },

  async getSettings(): Promise<PlatformSettingsData> {
    const res = await apiClient.get<any>('/platform/settings');
    return unwrapResponse<PlatformSettingsData>(res);
  },

  async updateSettings(data: Partial<PlatformSettingsData>): Promise<PlatformSettingsData> {
    const res = await apiClient.patch<any>('/platform/settings', data);
    return unwrapResponse<PlatformSettingsData>(res);
  },

  async provisionRestaurant(data: any): Promise<any> {
    const res = await apiClient.post<any>('/platform/restaurants', data);
    return unwrapResponse<any>(res);
  },

  async getProvisioningDetails(restaurantId: string): Promise<any> {
    const res = await apiClient.get<any>(
      `/platform/restaurants/${restaurantId}/provisioning`
    );
    return unwrapResponse<any>(res);
  },

  async resendInvitation(restaurantId: string): Promise<any> {
    const res = await apiClient.post<any>(
      `/platform/restaurants/${restaurantId}/invitation/resend`
    );
    return unwrapResponse<any>(res);
  },

  async revokeInvitation(restaurantId: string): Promise<any> {
    const res = await apiClient.post<any>(
      `/platform/restaurants/${restaurantId}/invitation/revoke`
    );
    return unwrapResponse<any>(res);
  },
};

export const ownerInvitationService = {
  async getInvitation(token: string): Promise<any> {
    const res = await apiClient.get<any>(`/owner/invitations/${token}`);
    const data = unwrapResponse<any>(res);
    return { data, ...(data && typeof data === 'object' ? data : {}) };
  },

  async acceptInvitation(token: string, data: { password: string; name?: string }): Promise<any> {
    const res = await apiClient.post<any>(`/owner/invitations/${token}/accept`, data);
    const dataResult = unwrapResponse<any>(res);
    return { data: dataResult, ...(dataResult && typeof dataResult === 'object' ? dataResult : {}) };
  },
};

