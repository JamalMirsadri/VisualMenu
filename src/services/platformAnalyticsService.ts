import { apiClient } from './apiClient';
import { API_BASE_URL, getAuthToken } from '../config';

export type PlatformAnalyticsPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface PlatformAnalyticsQuery {
  period: PlatformAnalyticsPeriod;
  date?: string;
  startDate?: string;
  endDate?: string;
  restaurantId?: string;
}

function buildQuery(query: PlatformAnalyticsQuery): string {
  const qs = new URLSearchParams();
  qs.append('period', query.period);
  if (query.date) qs.append('date', query.date);
  if (query.startDate) qs.append('startDate', query.startDate);
  if (query.endDate) qs.append('endDate', query.endDate);
  if (query.restaurantId) qs.append('restaurantId', query.restaurantId);
  return qs.toString();
}

async function downloadExport(endpoint: string, fallbackFilename: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: `Export failed with status ${response.status}` }));
    const err = new Error(data.message || `Export failed with status ${response.status}`) as Error & { errorCode?: string; status?: number };
    err.errorCode = data.errorCode;
    err.status = response.status;
    throw err;
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] || fallbackFilename;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const platformAnalyticsService = {
  async getAnalytics(query: PlatformAnalyticsQuery): Promise<any> {
    return apiClient.get(`/platform/analytics?${buildQuery(query)}`);
  },

  async exportAnalytics(query: PlatformAnalyticsQuery, format: 'csv' | 'xlsx', report: string): Promise<void> {
    const params = new URLSearchParams({ format, report });
    return downloadExport(`/platform/analytics/export?${buildQuery(query)}&${params.toString()}`, `platform-analytics_${report}.${format}`);
  },

  async getInsights(query: PlatformAnalyticsQuery): Promise<any> {
    return apiClient.get(`/platform/ai-insights?${buildQuery(query)}`);
  },

  async exportInsights(query: PlatformAnalyticsQuery, format: 'csv' | 'xlsx'): Promise<void> {
    return downloadExport(`/platform/ai-insights/export?${buildQuery(query)}&format=${format}`, `platform-ai-insights.${format}`);
  },
};
