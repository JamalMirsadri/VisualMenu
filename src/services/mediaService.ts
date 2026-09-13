import { apiClient } from './apiClient';
import { buildApiUrl, getAuthToken } from '../config';
import type { MediaItem } from '../types';

export const mediaService = {
  getByRestaurant(restaurantId: string, type?: 'image' | 'video'): Promise<MediaItem[]> {
    const query = type ? `?type=${type.toUpperCase()}` : '';
    return apiClient.get<MediaItem[]>(`/restaurants/${restaurantId}/media${query}`);
  },

  create(restaurantId: string, data: Partial<MediaItem>): Promise<MediaItem> {
    return apiClient.post<MediaItem>(`/restaurants/${restaurantId}/media`, data);
  },

  replace(id: string, data: Partial<MediaItem>): Promise<MediaItem> {
    return apiClient.put<MediaItem>(`/media/${id}/replace`, data);
  },

  uploadFile(
    restaurantId: string,
    file: File,
    extra?: {
      foodItemId?: string;
      altText?: string;
      isPrimary?: boolean;
      onProgress?: (percent: number) => void;
    }
  ): Promise<MediaItem> {
    const formData = new FormData();
    formData.append('file', file);
    if (extra?.foodItemId) formData.append('foodItemId', extra.foodItemId);
    if (extra?.altText) formData.append('altText', extra.altText);
    if (extra?.isPrimary !== undefined) formData.append('isPrimary', String(extra.isPrimary));

    const token = getAuthToken();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', buildApiUrl(`/restaurants/${restaurantId}/media/upload`));
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      if (xhr.upload && extra?.onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            extra.onProgress!(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && json.success) {
            resolve(json.data);
          } else {
            reject(new Error(json.message || `Upload failed with status ${xhr.status}`));
          }
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during media upload.'));
      xhr.send(formData);
    });
  },

  delete(id: string, force?: boolean): Promise<{ message: string }> {
    const query = force ? '?force=true' : '';
    return apiClient.delete<{ message: string }>(`/media/${id}${query}`);
  },
};
