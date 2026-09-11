import { apiClient } from './apiClient';
import type { Table } from '../types';

export interface CreateTablePayload {
  number: string;
  name: string;
  capacity?: number;
  location?: string;
  active?: boolean;
}

export const tableService = {
  async getTables(restaurantId: string): Promise<Table[]> {
    return apiClient.get<Table[]>(`/restaurants/${restaurantId}/tables`);
  },

  async getTableById(restaurantId: string, tableId: string): Promise<Table> {
    return apiClient.get<Table>(`/restaurants/${restaurantId}/tables/${tableId}`);
  },

  async createTable(restaurantId: string, payload: CreateTablePayload): Promise<Table> {
    return apiClient.post<Table>(`/restaurants/${restaurantId}/tables`, payload);
  },

  async updateTable(
    restaurantId: string,
    tableId: string,
    payload: Partial<CreateTablePayload>
  ): Promise<Table> {
    return apiClient.put<Table>(`/restaurants/${restaurantId}/tables/${tableId}`, payload);
  },

  async deleteTable(restaurantId: string, tableId: string): Promise<void> {
    return apiClient.delete<void>(`/restaurants/${restaurantId}/tables/${tableId}`);
  },
};
