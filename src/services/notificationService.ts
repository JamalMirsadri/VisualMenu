import { apiClient } from './apiClient';

export type NotificationSource = 'SYSTEM' | 'PLATFORM' | 'SECURITY' | 'SUBSCRIPTION';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface NotificationItem {
  id: string;
  restaurantId: string;
  userId?: string | null;
  type: string;
  source: NotificationSource;
  priority: NotificationPriority;
  title: string;
  message: string;
  severity: NotificationSeverity;
  pinned: boolean;
  expiresAt?: string | null;
  readAt?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedByUserId?: string | null;
  platformMessageId?: string | null;
  createdAt: string;
  metadata?: any;
}

export interface NotificationListResult {
  items: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NotificationQueryOptions {
  page?: number;
  limit?: number;
  type?: string;
  source?: NotificationSource;
  priority?: NotificationPriority;
  unreadOnly?: boolean;
  search?: string;
  pinnedOnly?: boolean;
  unacknowledgedOnly?: boolean;
}

class NotificationService {
  async getNotifications(
    restaurantId: string,
    options: NotificationQueryOptions = {}
  ): Promise<NotificationListResult> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    if (options.type) params.set('type', options.type);
    if (options.source) params.set('source', options.source);
    if (options.priority) params.set('priority', options.priority);
    if (options.unreadOnly) params.set('unreadOnly', 'true');
    if (options.search) params.set('search', options.search);
    if (options.pinnedOnly) params.set('pinnedOnly', 'true');
    if (options.unacknowledgedOnly) params.set('unacknowledgedOnly', 'true');

    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<NotificationListResult>(`/notifications/restaurant/${restaurantId}${qs}`);
  }

  async getUnreadCount(restaurantId: string): Promise<number> {
    const result = await apiClient.get<{ count: number }>(`/notifications/restaurant/${restaurantId}/unread-count`);
    return result.count;
  }

  async markRead(notificationId: string): Promise<NotificationItem> {
    return apiClient.post<NotificationItem>(`/notifications/${notificationId}/read`);
  }

  async markUnread(notificationId: string): Promise<NotificationItem> {
    return apiClient.post<NotificationItem>(`/notifications/${notificationId}/unread`);
  }

  async acknowledge(notificationId: string): Promise<NotificationItem> {
    return apiClient.post<NotificationItem>(`/notifications/${notificationId}/acknowledge`);
  }

  async markAllRead(restaurantId: string): Promise<{ count: number }> {
    return apiClient.post<{ count: number }>(`/notifications/restaurant/${restaurantId}/read-all`);
  }
}

export const notificationService = new NotificationService();
