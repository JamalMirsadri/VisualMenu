import { apiClient } from './apiClient';
import { buildApiUrl, getAuthToken } from '../config';

export interface QrPrintTemplate {
  id: string;
  name: string;
  description?: string | null;
  backgroundUrl?: string | null;
  layout: 'A4' | 'CARD';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const qrTemplateService = {
  list(): Promise<QrPrintTemplate[]> {
    return apiClient.get<QrPrintTemplate[]>('/platform/qr-templates');
  },

  listActive(): Promise<QrPrintTemplate[]> {
    return apiClient.get<QrPrintTemplate[]>('/qr-templates/active');
  },

  create(data: Partial<QrPrintTemplate>): Promise<QrPrintTemplate> {
    return apiClient.post<QrPrintTemplate>('/platform/qr-templates', data);
  },

  update(id: string, data: Partial<QrPrintTemplate>): Promise<QrPrintTemplate> {
    return apiClient.patch<QrPrintTemplate>(`/platform/qr-templates/${id}`, data);
  },

  toggle(id: string): Promise<QrPrintTemplate> {
    return apiClient.patch<QrPrintTemplate>(`/platform/qr-templates/${id}/toggle`);
  },

  remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/platform/qr-templates/${id}`);
  },

  uploadBackground(file: File): Promise<{ url: string; key: string; size: number; mimeType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', buildApiUrl('/platform/qr-templates/upload'));
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && json.success) {
            resolve(json.data);
          } else {
            reject(new Error(json.message || `Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.send(formData);
    });
  },
};
