import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { PlatformRole } from '../../types';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface PlatformRouteProps {
  children: React.ReactNode;
  allowedRoles?: PlatformRole[];
}

export const PlatformRoute: React.FC<PlatformRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, isPlatformUser, platformRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-950 text-zinc-300">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">
          Verifying Platform Credentials...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (!isPlatformUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-950 text-zinc-300 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-950/40 border border-amber-800/60 flex items-center justify-center mb-5 text-amber-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
          Platform Access Restricted
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
          The SaaS Platform control center requires a platform-level administrative role (<span className="text-amber-300 font-mono">PLATFORM_ADMIN</span>, <span className="text-amber-300 font-mono">PLATFORM_SUPPORT</span>, or <span className="text-amber-300 font-mono">PLATFORM_VIEWER</span>).
        </p>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-semibold uppercase tracking-wider transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Restaurant Admin</span>
        </Link>
      </div>
    );
  }

  if (allowedRoles && platformRole && !allowedRoles.includes(platformRole)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-950 text-zinc-300 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-center justify-center mb-5 text-red-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Insufficient Platform Permissions
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          Your platform role (<span className="text-amber-400 font-mono font-semibold">{platformRole}</span>) is not permitted to perform this operation.
        </p>
        <Link
          to="/platform"
          className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold uppercase tracking-wider transition-all"
        >
          Return to Platform Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};
