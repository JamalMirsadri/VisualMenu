import { apiClient } from './apiClient';
import { API_BASE_URL, getAuthToken } from '../config';

export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface AnalyticsQuery {
  period: AnalyticsPeriod;
  date?: string;
  startDate?: string;
  endDate?: string;
}

export interface AnalyticsExportOptions {
  format: 'csv' | 'xlsx';
  report: 'summary' | 'products' | 'categories' | 'payments' | 'combinations';
}

function buildQuery(query: AnalyticsQuery): string {
  const qs = new URLSearchParams();
  qs.append('period', query.period);
  if (query.date) qs.append('date', query.date);
  if (query.startDate) qs.append('startDate', query.startDate);
  if (query.endDate) qs.append('endDate', query.endDate);
  return qs.toString();
}

async function downloadExport(endpoint: string, fallbackFilename: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: `Export failed with status ${response.status}` }));
    const err = new Error(data.message || `Export failed with status ${response.status}`) as Error & {
      errorCode?: string;
      status?: number;
    };
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

export const analyticsService = {
  async getAnalytics(restaurantId: string, query: AnalyticsQuery): Promise<any> {
    return apiClient.get(`/restaurants/${restaurantId}/analytics?${buildQuery(query)}`);
  },

  async exportAnalytics(restaurantId: string, query: AnalyticsQuery, options: AnalyticsExportOptions): Promise<void> {
    const params = new URLSearchParams({ format: options.format, report: options.report });
    const endpoint = `/restaurants/${restaurantId}/analytics/export?${buildQuery(query)}&${params.toString()}`;
    return downloadExport(endpoint, `analytics_${options.report}.${options.format}`);
  },
};
