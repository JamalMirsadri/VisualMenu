import { apiClient } from './apiClient';

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
export type PlatformRole = 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | 'PLATFORM_VIEWER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole?: PlatformRole | null;
}

export interface UserRestaurantAssignment {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  role: UserRole;
  status?: 'ACTIVE' | 'DISABLED';
  jobTemplate?: string | null;
  permissions?: string[];
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
  restaurants: UserRestaurantAssignment[];
}

export interface MeResponse {
  user: AuthUser;
  restaurants: UserRestaurantAssignment[];
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    if (data.token && typeof window !== 'undefined') {
      localStorage.setItem('aura_admin_token', data.token);
      localStorage.setItem('aura_admin_user', JSON.stringify(data.user));
    }
    return data;
  },

  async me(): Promise<MeResponse> {
    return await apiClient.get<MeResponse>('/auth/me');
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // ignore
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('aura_admin_token');
        localStorage.removeItem('aura_admin_user');
      }
    }
  },

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('aura_admin_token');
  },

  getStoredUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('aura_admin_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};
