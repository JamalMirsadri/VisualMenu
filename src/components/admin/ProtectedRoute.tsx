import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../services/authService';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  allowExpired?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, allowExpired }) => {
  const { isAuthenticated, loading, role, isPlatformAdmin, isPlatformUser, subscriptionStatus } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-950 text-zinc-300">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">
          Authenticating Studio Session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // Subscription Gating (Platform operators always bypass)
  if (!isPlatformAdmin && !isPlatformUser && !allowExpired) {
    const isInactiveSub =
      subscriptionStatus === 'EXPIRED' ||
      subscriptionStatus === 'SUSPENDED' ||
      subscriptionStatus === 'CANCELLED' ||
      !subscriptionStatus;

    const isAllowedWithoutSub =
      location.pathname === '/admin/subscription-required' ||
      location.pathname === '/admin/subscription' ||
      location.pathname === '/admin/notifications';

    if (isInactiveSub && !isAllowedWithoutSub) {
      return <Navigate to="/admin/subscription-required" replace />;
    } else if (subscriptionStatus === 'PENDING' && !isAllowedWithoutSub) {
      return <Navigate to="/admin/subscription" replace />;
    }
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-950 text-zinc-300 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-center justify-center mb-4 text-red-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="font-serif-luxury text-2xl font-bold text-white mb-2">
          Access Restricted
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          Your current role (<span className="text-amber-400 font-mono font-semibold">{role}</span>) does not have permission to access this section.
        </p>
        <a
          href="/admin"
          className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold uppercase tracking-wider transition-all"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
};
