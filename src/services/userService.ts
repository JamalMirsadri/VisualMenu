import { apiClient } from './apiClient';
import type { RestaurantMember, UserRole } from '../types';

export interface AddMemberPayload {
  email: string;
  name: string;
  role: UserRole;
  password?: string;
}

export interface UpdateRolePayload {
  role: UserRole;
}

export interface ResetPasswordPayload {
  newPassword?: string;
}

export const userService = {
  /**
   * Get all members assigned to the restaurant
   */
  async getMembers(restaurantId: string): Promise<RestaurantMember[]> {
    return apiClient.get<RestaurantMember[]>(`/restaurants/${restaurantId}/users`);
  },

  /**
   * Add or invite a user into this restaurant tenant
   */
  async addMember(restaurantId: string, payload: AddMemberPayload): Promise<RestaurantMember> {
    return apiClient.post<RestaurantMember>(`/restaurants/${restaurantId}/users`, payload);
  },

  /**
   * Update a member's role in this restaurant
   */
  async updateMemberRole(
    restaurantId: string,
    userId: string,
    payload: UpdateRolePayload
  ): Promise<RestaurantMember> {
    return apiClient.patch<RestaurantMember>(
      `/restaurants/${restaurantId}/users/${userId}/role`,
      payload
    );
  },

  /**
   * Remove member from restaurant tenant
   */
  async removeMember(restaurantId: string, userId: string): Promise<void> {
    return apiClient.delete<void>(`/restaurants/${restaurantId}/users/${userId}`);
  },

  /**
   * Reset a user's password
   */
  async resetPassword(
    restaurantId: string,
    userId: string,
    payload?: ResetPasswordPayload
  ): Promise<{ temporaryPassword?: string }> {
    return apiClient.post<{ temporaryPassword?: string }>(
      `/restaurants/${restaurantId}/users/${userId}/reset-password`,
      payload || {}
    );
  },
};
