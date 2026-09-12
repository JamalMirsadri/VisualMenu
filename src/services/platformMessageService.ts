import { apiClient } from './apiClient';
import type { NotificationPriority } from './notificationService';

export type PlatformMessageTargetType = 'RESTAURANT' | 'MULTIPLE_RESTAURANTS' | 'ALL_RESTAURANTS';
export type PlatformMessageStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'EXPIRED';

export interface PlatformMessageRecipient {
  id: string;
  messageId: string;
  restaurantId: string;
  deliveredAt: string;
  readAt?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedByUserId?: string | null;
  restaurant?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface PlatformMessageRevision {
  id: string;
  messageId: string;
  title: string;
  body: string;
  editedByUserId: string;
  editedAt: string;
}

export interface PlatformMessageItem {
  id: string;
  title: string;
  body: string;
  targetType: PlatformMessageTargetType;
  targetRestaurantIds?: string[];
  filterStatus?: string[];
  filterActiveOnly: boolean;
  priority: NotificationPriority;
  pinned: boolean;
  requiresAcknowledgement: boolean;
  status: PlatformMessageStatus;
  scheduledAt?: string | null;
  sentAt?: string | null;
  expiresAt?: string | null;
  cancelledAt?: string | null;
  cancelledByUserId?: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  stats?: {
    deliveryCount: number;
    readCount: number;
    readPercentage: number;
    acknowledgedCount: number;
    acknowledgedPercentage: number;
  };
  recipients?: PlatformMessageRecipient[];
  revisions?: PlatformMessageRevision[];
}

export interface PlatformMessageListResult {
  items: PlatformMessageItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreatePlatformMessagePayload {
  title: string;
  body: string;
  targetType: PlatformMessageTargetType;
  targetRestaurantIds?: string[];
  filterStatus?: string[];
  filterActiveOnly?: boolean;
  priority?: NotificationPriority;
  pinned?: boolean;
  requiresAcknowledgement?: boolean;
  scheduledAt?: string;
  expiresAt?: string;
  confirmAll?: boolean;
  isDraft?: boolean;
}

class PlatformMessageService {
  async getMessages(params: {
    status?: PlatformMessageStatus;
    targetType?: PlatformMessageTargetType;
    priority?: NotificationPriority;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PlatformMessageListResult> {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.targetType) q.set('targetType', params.targetType);
    if (params.priority) q.set('priority', params.priority);
    if (params.search) q.set('search', params.search);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));

    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get<PlatformMessageListResult>(`/platform/messages${qs}`);
  }

  async getMessageDetails(id: string): Promise<PlatformMessageItem> {
    return apiClient.get<PlatformMessageItem>(`/platform/messages/${id}`);
  }

  async createMessage(payload: CreatePlatformMessagePayload): Promise<PlatformMessageItem> {
    return apiClient.post<PlatformMessageItem>('/platform/messages', payload);
  }

  async cancelScheduledMessage(id: string): Promise<PlatformMessageItem> {
    return apiClient.post<PlatformMessageItem>(`/platform/messages/${id}/cancel`);
  }

  async editMessage(id: string, payload: { title?: string; body?: string }): Promise<PlatformMessageItem> {
    return apiClient.patch<PlatformMessageItem>(`/platform/messages/${id}`, payload);
  }
}

export const platformMessageService = new PlatformMessageService();
