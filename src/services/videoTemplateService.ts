import { apiClient } from './apiClient';
import { buildApiUrl, getAuthToken } from '../config';

export type VideoContentType = 'FOOD' | 'SALAD' | 'DRINK' | 'DESSERT' | 'OTHER';

export interface VideoTemplatePromptVariant {
  id: string;
  templateId: string;
  name: string;
  promptTemplate: string;
  negativePrompt?: string | null;
  active: boolean;
  version: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface VideoTemplate {
  id: string;
  name: string;
  description?: string | null;
  contentType: VideoContentType;
  active: boolean;
  version: number;
  aspectRatio: string;
  duration?: number | null;
  provider?: string | null;
  model?: string | null;
  backgroundAsset?: string | null;
  styleConfig?: any;
  cameraConfig?: any;
  lightingConfig?: any;
  motionConfig?: any;
  createdAt: string;
  updatedAt: string;
  variants?: VideoTemplatePromptVariant[];
}

export const videoTemplateService = {
  // Platform
  list(contentType?: VideoContentType): Promise<VideoTemplate[]> {
    const qs = contentType ? `?contentType=${contentType}` : '';
    return apiClient.get<VideoTemplate[]>(`/platform/video-templates${qs}`);
  },

  get(id: string): Promise<VideoTemplate> {
    return apiClient.get<VideoTemplate>(`/platform/video-templates/${id}`);
  },

  create(data: Partial<VideoTemplate> & { variants?: any[] }): Promise<VideoTemplate> {
    return apiClient.post<VideoTemplate>('/platform/video-templates', data);
  },

  update(id: string, data: Partial<VideoTemplate>): Promise<VideoTemplate> {
    return apiClient.patch<VideoTemplate>(`/platform/video-templates/${id}`, data);
  },

  toggle(id: string): Promise<VideoTemplate> {
    return apiClient.patch<VideoTemplate>(`/platform/video-templates/${id}/toggle`);
  },

  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/platform/video-templates/${id}`);
  },

  addVariant(templateId: string, data: Partial<VideoTemplatePromptVariant>): Promise<VideoTemplatePromptVariant> {
    return apiClient.post<VideoTemplatePromptVariant>(`/platform/video-templates/${templateId}/variants`, data);
  },

  updateVariant(templateId: string, variantId: string, data: Partial<VideoTemplatePromptVariant>): Promise<VideoTemplatePromptVariant> {
    return apiClient.patch<VideoTemplatePromptVariant>(`/platform/video-templates/${templateId}/variants/${variantId}`, data);
  },

  removeVariant(templateId: string, variantId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/platform/video-templates/${templateId}/variants/${variantId}`);
  },

  uploadBackground(file: File): Promise<{ url: string; key: string; size: number; mimeType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', buildApiUrl('/platform/video-templates/upload'));
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && json.success) resolve(json.data);
          else reject(new Error(json.message || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.send(formData);
    });
  },
};
