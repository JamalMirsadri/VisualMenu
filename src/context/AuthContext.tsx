import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import { platformService } from '../services/platformService';
import { subscriptionService, type SubscriptionStatus } from '../services/subscriptionService';
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
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionPlan: string | null;
  subscriptionDaysRemaining: number | null;
  subscriptionLoading: boolean;
  refreshSubscription: () => Promise<void>;
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

/**
 * Deterministically resolves the active restaurant from the authenticated
 * membership list: prefer the last-selected slug, then the first ACTIVE
 * (non-DISABLED) membership. Returns null only when no usable membership exists.
 */
function resolveActiveRestaurant(
  restaurants: UserRestaurantAssignment[],
  savedSlug?: string | null
): UserRestaurantAssignment | null {
  const activeMemberships = restaurants.filter((r) => r.status !== 'DISABLED');
  if (savedSlug) {
    const matched = activeMemberships.find((r) => r.slug === savedSlug);
    if (matched) return matched;
  }
  return activeMemberships[0] || null;
}

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
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [subscriptionDaysRemaining, setSubscriptionDaysRemaining] = useState<number | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const initAuth = useCallback(async () => {
    const token = authService.getToken();
    if (!token) {
      setUser(null);
      setRestaurants([]);
      setActiveRestaurantState(null);
      setPlatformViewingRestaurant(null);
      setSubscriptionLoading(false);
      setLoading(false);
      return;
    }

    try {
      const data = await authService.me();
      setUser(data.user);
      setRestaurants(data.restaurants);

      // Deterministically resolve the active restaurant from ACTIVE memberships.
      const savedSlug = localStorage.getItem('aura_active_restaurant_slug');
      setActiveRestaurantState(resolveActiveRestaurant(data.restaurants, savedSlug));
    } catch (err) {
      console.error('Session validation failed:', err);
      authService.logout();
      setUser(null);
      setRestaurants([]);
      setActiveRestaurantState(null);
      setPlatformViewingRestaurant(null);
      setSubscriptionLoading(false);
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
      const savedSlug = localStorage.getItem('aura_active_restaurant_slug');
      const currentActive = resolveActiveRestaurant(data.restaurants, savedSlug);
      setActiveRestaurantState(currentActive);
      if (currentActive?.id) {
        await refreshSubscriptionFor(currentActive.id);
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  const refreshSubscriptionFor = async (restaurantId: string) => {
    setSubscriptionLoading(true);
    try {
      const sub = await subscriptionService.getSubscription(restaurantId);
      setSubscriptionStatus(sub.status);
      setSubscriptionPlan(sub.plan?.name || null);
      setSubscriptionDaysRemaining(sub.daysRemaining ?? null);
    } catch (err: any) {
      if (err.errorCode === 'SUBSCRIPTION_REQUIRED' || err.status === 402) {
        setSubscriptionStatus('EXPIRED');
      } else {
        setSubscriptionStatus(null);
      }
      setSubscriptionPlan(null);
      setSubscriptionDaysRemaining(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const refreshSubscription = useCallback(async () => {
    const target = platformViewingRestaurant || activeRestaurant;
    if (target?.id) {
      await refreshSubscriptionFor(target.id);
    }
  }, [platformViewingRestaurant, activeRestaurant]);

  useEffect(() => {
    const target = platformViewingRestaurant || activeRestaurant;
    if (target?.id) {
      refreshSubscriptionFor(target.id);
    } else {
      setSubscriptionLoading(false);
    }
  }, [platformViewingRestaurant?.id, activeRestaurant?.id]);

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    setUser(res.user);
    setRestaurants(res.restaurants);
    setSubscriptionStatus(null);
    const active = resolveActiveRestaurant(res.restaurants);
    setActiveRestaurantState(active);
    if (active) {
      localStorage.setItem('aura_active_restaurant_slug', active.slug);
      // The active restaurant changed; mark subscription as pending so ProtectedRoute
      // waits for resolution instead of gating on a stale/null status.
      setSubscriptionLoading(true);
    } else {
      setSubscriptionLoading(false);
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
        subscriptionStatus,
        subscriptionPlan,
        subscriptionDaysRemaining,
        subscriptionLoading,
        refreshSubscription,
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
