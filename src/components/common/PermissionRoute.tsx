import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Building2, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface PermissionRouteProps {
  permission: string;
  children: React.ReactNode;
}

export const PermissionRoute: React.FC<PermissionRouteProps> = ({
  permission,
  children,
}) => {
  const { hasPermission, activeRestaurant, role, isPlatformAdmin } = useAuth();

  if (isPlatformAdmin || hasPermission(permission)) {
    return <>{children}</>;
  }

  return (
    <div className="flex-1 min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-950/80 border border-zinc-800/90 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Shield Icon */}
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-red-500/20 to-amber-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-serif font-bold text-white tracking-wide mb-2">
          Access Restricted
        </h2>

        {/* Subtitle / Details */}
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          Your account role (<span className="text-amber-400 font-semibold">{role || 'STAFF'}</span>) and custom permission matrix in{' '}
          <span className="text-white font-medium">{activeRestaurant?.name || 'this restaurant'}</span> do not grant access to this feature.
        </p>

        {/* Required permission badge */}
        <div className="mb-6 p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/80 flex items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-zinc-400" />
            <span className="text-[11px] text-zinc-400">Required Permission:</span>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-300 font-semibold">
            {permission}
          </span>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <Link
            to="/admin"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Operations Dashboard
          </Link>

          <Link
            to="/admin/restaurants"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white font-medium text-xs transition-colors cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-zinc-400" />
            Switch Restaurant Tenant
          </Link>
        </div>

        {/* Management Note */}
        <p className="mt-6 text-[10px] text-zinc-400">
          Need access? Contact the restaurant Owner to grant this permission from Team Management.
        </p>
      </div>
    </div>
  );
};
