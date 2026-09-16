import { apiClient } from './apiClient';
import type { VideoTemplate } from './videoTemplateService';

export interface VideoCreditBalance {
  balance: number;
  allowance: number;
  granted: number;
  purchased: number;
  used: number;
  refunded: number;
}

export interface VideoGenerationJob {
  id: string;
  restaurantId: string;
  templateId?: string | null;
  promptVariantId?: string | null;
  sourceMediaId?: string | null;
  providerJobId?: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  outputMediaId?: string | null;
  error?: string | null;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  template?: VideoTemplate | null;
  promptVariant?: any;
  outputMedia?: any;
}

export const aiVideoService = {
  listTemplates(restaurantId: string, contentType?: string): Promise<VideoTemplate[]> {
    const qs = contentType ? `?contentType=${contentType}` : '';
    return apiClient.get<VideoTemplate[]>(`/restaurants/${restaurantId}/ai-video/templates${qs}`);
  },

  getBalance(restaurantId: string): Promise<VideoCreditBalance> {
    return apiClient.get<VideoCreditBalance>(`/restaurants/${restaurantId}/ai-video/balance`);
  },

  listCredits(restaurantId: string): Promise<any[]> {
    return apiClient.get<any[]>(`/restaurants/${restaurantId}/ai-video/credits`);
  },

  listJobs(restaurantId: string): Promise<VideoGenerationJob[]> {
    return apiClient.get<VideoGenerationJob[]>(`/restaurants/${restaurantId}/ai-video/jobs`);
  },

  getJob(restaurantId: string, jobId: string): Promise<VideoGenerationJob> {
    return apiClient.get<VideoGenerationJob>(`/restaurants/${restaurantId}/ai-video/jobs/${jobId}`);
  },

  generate(restaurantId: string, payload: {
    templateId: string;
    promptVariantId: string;
    sourceMediaId?: string;
    foodItemId?: string;
    productName?: string;
    contentType?: string;
  }): Promise<VideoGenerationJob> {
    return apiClient.post<VideoGenerationJob>(`/restaurants/${restaurantId}/ai-video/generate`, payload);
  },

  cancel(restaurantId: string, jobId: string): Promise<VideoGenerationJob> {
    return apiClient.post<VideoGenerationJob>(`/restaurants/${restaurantId}/ai-video/jobs/${jobId}/cancel`);
  },
};
