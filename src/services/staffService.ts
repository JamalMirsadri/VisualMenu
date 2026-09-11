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

export const staffService = {
  /**
   * Retrieves the permission catalog and role templates
   */
  async getPermissionsCatalog(restaurantId: string): Promise<CatalogResponse> {
    const res = await apiClient.get<{ success: boolean; data: CatalogResponse }>(
      `/restaurants/${restaurantId}/staff-permissions-catalog`
    );
    return res.data;
  },

  /**
   * Lists all staff and pending invitations for a restaurant
   */
  async listStaff(restaurantId: string): Promise<ListStaffResponse> {
    const res = await apiClient.get<{
      success: boolean;
      data: StaffMember[];
      invitations: StaffInvitationItem[];
    }>(`/restaurants/${restaurantId}/staff`);

    return {
      data: res.data || [],
      invitations: res.invitations || [],
    };
  },

  /**
   * Retrieves details and explicit permissions for a staff member
   */
  async getStaffDetails(restaurantId: string, userId: string): Promise<StaffMember> {
    const res = await apiClient.get<{ success: boolean; data: StaffMember }>(
      `/restaurants/${restaurantId}/staff/${userId}`
    );
    return res.data;
  },

  /**
   * Creates a staff member directly or issues an invitation
   */
  async createOrInviteStaff(
    restaurantId: string,
    data: CreateStaffData
  ): Promise<{
    member?: StaffMember;
    invitation?: {
      id: string;
      rawToken: string;
      expiresAt: string;
      onboardingUrl: string;
    };
  }> {
    const res = await apiClient.post<{
      success: boolean;
      data: {
        member?: StaffMember;
        invitation?: {
          id: string;
          rawToken: string;
          expiresAt: string;
          onboardingUrl: string;
        };
      };
    }>(`/restaurants/${restaurantId}/staff`, data);
    return res.data;
  },

  /**
   * Updates an employee's permissions and template
   */
  async updateStaffPermissions(
    restaurantId: string,
    userId: string,
    permissions: string[],
    jobTemplate?: string
  ): Promise<{ success: boolean; permissions: string[]; jobTemplate?: string }> {
    const res = await apiClient.put<{
      success: boolean;
      data: { permissions: string[]; jobTemplate?: string };
    }>(`/restaurants/${restaurantId}/staff/${userId}/permissions`, {
      permissions,
      jobTemplate,
    });
    return {
      success: true,
      permissions: res.data.permissions,
      jobTemplate: res.data.jobTemplate,
    };
  },

  /**
   * Enables or disables staff access to this restaurant
   */
  async updateStaffStatus(
    restaurantId: string,
    userId: string,
    status: 'ACTIVE' | 'DISABLED'
  ): Promise<{ success: boolean; status: 'ACTIVE' | 'DISABLED' }> {
    const res = await apiClient.patch<{
      success: boolean;
      data: { status: 'ACTIVE' | 'DISABLED' };
    }>(`/restaurants/${restaurantId}/staff/${userId}/status`, { status });
    return {
      success: true,
      status: res.data.status,
    };
  },

  /**
   * Removes staff from this restaurant tenant
   */
  async removeStaff(restaurantId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete<{ success: boolean; message: string }>(
      `/restaurants/${restaurantId}/staff/${userId}`
    );
    return res;
  },

  /**
   * Resends invitation, revoking older token
   */
  async resendStaffInvitation(
    restaurantId: string,
    invitationId: string
  ): Promise<{
    invitation: {
      id: string;
      rawToken: string;
      expiresAt: string;
      onboardingUrl: string;
    };
  }> {
    const res = await apiClient.post<{
      success: boolean;
      data: {
        invitation: {
          id: string;
          rawToken: string;
          expiresAt: string;
          onboardingUrl: string;
        };
      };
    }>(`/restaurants/${restaurantId}/staff/invitations/${invitationId}/resend`);
    return res.data;
  },

  /**
   * Revokes an active pending invitation
   */
  async revokeStaffInvitation(
    restaurantId: string,
    invitationId: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete<{ success: boolean; message: string }>(
      `/restaurants/${restaurantId}/staff/invitations/${invitationId}`
    );
    return res;
  },

  /**
   * Public onboarding: validates token
   */
  async validateStaffInvitation(token: string): Promise<StaffInvitationValidateResult> {
    const res = await apiClient.get<{
      success: boolean;
      data: StaffInvitationValidateResult;
    }>(`/staff/invitations/${token}`);
    return res.data;
  },

  /**
   * Public onboarding: accepts invitation and sets password
   */
  async acceptStaffInvitation(
    token: string,
    data: { password: string; name?: string }
  ): Promise<{
    user: { id: string; email: string; name: string };
    token: string;
    restaurants: any[];
  }> {
    const res = await apiClient.post<{
      success: boolean;
      data: {
        user: { id: string; email: string; name: string };
        token: string;
        restaurants: any[];
      };
    }>(`/staff/invitations/${token}/accept`, data);

    if (res.data.token && typeof window !== 'undefined') {
      localStorage.setItem('aura_admin_token', res.data.token);
      localStorage.setItem('aura_admin_user', JSON.stringify(res.data.user));
    }

    return res.data;
  },
};
