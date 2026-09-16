import { apiClient } from './apiClient';
import type {
  StaffMember,
  StaffInvitationItem,
  PermissionDefinition,
  RoleTemplate,
  StaffInvitationValidateResult,
} from '../types';

export interface CatalogResponse {
  permissions: PermissionDefinition[];
  templates: Record<RoleTemplate, string[]>;
}

export interface ListStaffResponse {
  data: StaffMember[];
  invitations: StaffInvitationItem[];
}

export interface CreateStaffData {
  email: string;
  name: string;
  phone?: string;
  role: string;
  jobTemplate?: string;
  permissions?: string[];
  password?: string;
}

export interface StaffInvitationResult {
  id: string;
  rawToken: string;
  expiresAt: string;
  onboardingUrl: string;
}

export const staffService = {
  /**
   * Retrieves the permission catalog and role templates.
   * `apiClient` already unwraps the top-level `data` envelope.
   */
  async getPermissionsCatalog(restaurantId: string): Promise<CatalogResponse> {
    return await apiClient.get<CatalogResponse>(
      `/restaurants/${restaurantId}/staff-permissions-catalog`
    );
  },

  /**
   * Lists all staff and pending invitations for a restaurant.
   * Backend returns `data: { members, invitations }`.
   */
  async listStaff(restaurantId: string): Promise<ListStaffResponse> {
    const res = await apiClient.get<{
      members: StaffMember[];
      invitations: StaffInvitationItem[];
    }>(`/restaurants/${restaurantId}/staff`);

    return {
      data: res.members || [],
      invitations: res.invitations || [],
    };
  },

  /**
   * Retrieves details and explicit permissions for a staff member.
   */
  async getStaffDetails(restaurantId: string, userId: string): Promise<StaffMember> {
    return await apiClient.get<StaffMember>(`/restaurants/${restaurantId}/staff/${userId}`);
  },

  /**
   * Creates a staff member directly or issues an invitation.
   * Backend returns `data: { member?, invitation? }`.
   */
  async createOrInviteStaff(
    restaurantId: string,
    data: CreateStaffData
  ): Promise<{
    member?: StaffMember;
    invitation?: StaffInvitationResult;
  }> {
    return await apiClient.post<{
      member?: StaffMember;
      invitation?: StaffInvitationResult;
    }>(`/restaurants/${restaurantId}/staff`, data);
  },

  /**
   * Updates an employee's permissions and template.
   */
  async updateStaffPermissions(
    restaurantId: string,
    userId: string,
    permissions: string[],
    jobTemplate?: string
  ): Promise<{ success: boolean; permissions: string[]; jobTemplate?: string | null }> {
    return await apiClient.put<{
      success: boolean;
      permissions: string[];
      jobTemplate?: string | null;
    }>(`/restaurants/${restaurantId}/staff/${userId}/permissions`, {
      permissions,
      jobTemplate,
    });
  },

  /**
   * Enables or disables staff access to this restaurant.
   */
  async updateStaffStatus(
    restaurantId: string,
    userId: string,
    status: 'ACTIVE' | 'DISABLED'
  ): Promise<{ success: boolean; status: 'ACTIVE' | 'DISABLED' }> {
    return await apiClient.patch<{ success: boolean; status: 'ACTIVE' | 'DISABLED' }>(
      `/restaurants/${restaurantId}/staff/${userId}/status`,
      { status }
    );
  },

  /**
   * Removes staff from this restaurant tenant. Backend has no `data` envelope.
   */
  async removeStaff(restaurantId: string, userId: string): Promise<void> {
    await apiClient.delete<{ success: boolean; message: string }>(
      `/restaurants/${restaurantId}/staff/${userId}`
    );
  },

  /**
   * Resends invitation, revoking older token.
   * Backend returns `data: { invitation }`.
   */
  async resendStaffInvitation(
    restaurantId: string,
    invitationId: string
  ): Promise<{ invitation: StaffInvitationResult }> {
    return await apiClient.post<{ invitation: StaffInvitationResult }>(
      `/restaurants/${restaurantId}/staff/invitations/${invitationId}/resend`
    );
  },

  /**
   * Revokes an active pending invitation. Backend has no `data` envelope.
   */
  async revokeStaffInvitation(restaurantId: string, invitationId: string): Promise<void> {
    await apiClient.delete<{ success: boolean; message: string }>(
      `/restaurants/${restaurantId}/staff/invitations/${invitationId}`
    );
  },

  /**
   * Public onboarding: validates token.
   */
  async validateStaffInvitation(token: string): Promise<StaffInvitationValidateResult> {
    return await apiClient.get<StaffInvitationValidateResult>(`/staff/invitations/${token}`);
  },

  /**
   * Public onboarding: accepts invitation and sets password.
   * Backend returns `data: { success, token, user, restaurant }`.
   */
  async acceptStaffInvitation(
    token: string,
    data: { password: string; name?: string }
  ): Promise<{
    success: boolean;
    token: string;
    user: { id: string; email: string; name: string };
    restaurant: { id: string; name: string; slug: string };
  }> {
    const res = await apiClient.post<{
      success: boolean;
      token: string;
      user: { id: string; email: string; name: string };
      restaurant: { id: string; name: string; slug: string };
    }>(`/staff/invitations/${token}/accept`, data);

    if (res.token && typeof window !== 'undefined') {
      localStorage.setItem('aura_admin_token', res.token);
      localStorage.setItem('aura_admin_user', JSON.stringify(res.user));
    }

    return res;
  },
};
