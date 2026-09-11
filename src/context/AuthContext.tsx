import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import { platformService } from '../services/platformService';
import type { AuthUser, UserRestaurantAssignment, UserRole, PlatformRole } from '../services/authService';

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  platformRole: PlatformRole | null;
  isPlatformAdmin: boolean;
  isPlatformUser: boolean;
  platformViewingRestaurant: UserRestaurantAssignment | null;
  activeRestaurant: UserRestaurantAssignment | null;
  restaurants: UserRestaurantAssignment[];
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: AuthUser; restaurants: UserRestaurantAssignment[] }>;
  logout: () => Promise<void>;
  setActiveRestaurant: (restaurant: UserRestaurantAssignment) => void;
  enterRestaurantContext: (restaurant: UserRestaurantAssignment) => Promise<void>;
  exitRestaurantContext: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(authService.getStoredUser());
  const [restaurants, setRestaurants] = useState<UserRestaurantAssignment[]>([]);
  const [activeRestaurant, setActiveRestaurantState] = useState<UserRestaurantAssignment | null>(null);
  const [platformViewingRestaurant, setPlatformViewingRestaurant] = useState<UserRestaurantAssignment | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('aura_platform_viewing_restaurant');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const initAuth = useCallback(async () => {
    const token = authService.getToken();
    if (!token) {
      setUser(null);
      setRestaurants([]);
      setActiveRestaurantState(null);
      setPlatformViewingRestaurant(null);
      setLoading(false);
      return;
    }

    try {
      const data = await authService.me();
      setUser(data.user);
      setRestaurants(data.restaurants);

      // Restore active restaurant preference or default to first
      const savedSlug = localStorage.getItem('aura_active_restaurant_slug');
      const matched = data.restaurants.find(r => r.slug === savedSlug);
      setActiveRestaurantState(matched || data.restaurants[0] || null);
    } catch (err) {
      console.error('Session validation failed:', err);
      authService.logout();
      setUser(null);
      setRestaurants([]);
      setActiveRestaurantState(null);
      setPlatformViewingRestaurant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const refreshProfile = async () => {
    try {
      const data = await authService.me();
      setUser(data.user);
      setRestaurants(data.restaurants);
      const currentActive = data.restaurants.find(r => r.id === activeRestaurant?.id) || data.restaurants[0] || null;
      setActiveRestaurantState(currentActive);
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    setUser(res.user);
    setRestaurants(res.restaurants);
    const active = res.restaurants[0] || null;
    setActiveRestaurantState(active);
    if (active) {
      localStorage.setItem('aura_active_restaurant_slug', active.slug);
    }
    return res;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setRestaurants([]);
    setActiveRestaurantState(null);
    setPlatformViewingRestaurant(null);
    localStorage.removeItem('aura_active_restaurant_slug');
    localStorage.removeItem('aura_platform_viewing_restaurant');
  };

  const setActiveRestaurant = (restaurant: UserRestaurantAssignment) => {
    setActiveRestaurantState(restaurant);
    localStorage.setItem('aura_active_restaurant_slug', restaurant.slug);
  };

  const enterRestaurantContext = async (restaurant: UserRestaurantAssignment) => {
    setPlatformViewingRestaurant(restaurant);
    setActiveRestaurantState(restaurant);
    localStorage.setItem('aura_active_restaurant_slug', restaurant.slug);
    localStorage.setItem('aura_platform_viewing_restaurant', JSON.stringify(restaurant));
    await platformService.recordContextEnter(restaurant.id);
  };

  const exitRestaurantContext = async () => {
    if (platformViewingRestaurant) {
      await platformService.recordContextExit(platformViewingRestaurant.id);
    }
    setPlatformViewingRestaurant(null);
    localStorage.removeItem('aura_platform_viewing_restaurant');
  };

  const effectiveRestaurant = platformViewingRestaurant || activeRestaurant;
  const isPlatformAdmin = user?.platformRole === 'PLATFORM_ADMIN';
  const isPlatformUser = Boolean(user?.platformRole);
  const platformRole = user?.platformRole || null;
  const role = platformViewingRestaurant ? 'OWNER' : (activeRestaurant?.role || null);
  const permissions = effectiveRestaurant?.permissions || [];

  const hasPermission = useCallback((permission: string): boolean => {
    if (isPlatformAdmin || Boolean(platformViewingRestaurant) || role === 'OWNER') {
      return true;
    }
    if (!effectiveRestaurant) return false;
    if (effectiveRestaurant.status === 'DISABLED') return false;

    const currentPerms = effectiveRestaurant.permissions || [];
    if (currentPerms.includes(permission)) return true;

    // Legacy and aliased mappings
    if (permission === 'MANAGE_USERS' && (currentPerms.includes('VIEW_STAFF') || currentPerms.includes('MANAGE_STAFF_PERMISSIONS'))) {
      return true;
    }
    if (permission === 'VIEW_STAFF' && currentPerms.includes('MANAGE_USERS')) {
      return true;
    }
    if (permission === 'MANAGE_RESTAURANT' && (currentPerms.includes('MANAGE_RESTAURANT_SETTINGS') || currentPerms.includes('VIEW_RESTAURANT_SETTINGS'))) {
      return true;
    }
    if (permission === 'VIEW_RESTAURANT_SETTINGS' && currentPerms.includes('MANAGE_RESTAURANT')) {
      return true;
    }
    if (permission === 'TOGGLE_AVAILABILITY' && currentPerms.includes('TOGGLE_FOOD_AVAILABILITY')) {
      return true;
    }
    if (permission === 'TOGGLE_FOOD_AVAILABILITY' && currentPerms.includes('TOGGLE_AVAILABILITY')) {
      return true;
    }

    return false;
  }, [isPlatformAdmin, platformViewingRestaurant, role, effectiveRestaurant]);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        platformRole,
        isPlatformAdmin,
        isPlatformUser,
        platformViewingRestaurant,
        activeRestaurant: effectiveRestaurant,
        restaurants,
        permissions,
        hasPermission,
        isAuthenticated: Boolean(user && authService.getToken()),
        loading,
        login,
        logout,
        setActiveRestaurant,
        enterRestaurantContext,
        exitRestaurantContext,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
