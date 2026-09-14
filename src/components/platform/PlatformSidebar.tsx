import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  Utensils,
  ExternalLink,
  Layers,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePlatformSettings } from '../../context/PlatformSettingsContext';

interface PlatformSidebarProps {
  onItemClick?: () => void;
}

export const PlatformSidebar: React.FC<PlatformSidebarProps> = ({ onItemClick }) => {
  const { user, platformRole, logout, restaurants, activeRestaurant } = useAuth();
  const { platformName, branding } = usePlatformSettings();
  const navigate = useNavigate();

  const navItems = [
    { to: '/platform', label: 'Platform Dashboard', icon: LayoutDashboard, end: true },
    { to: '/platform/restaurants', label: 'Restaurants Directory', icon: Building2 },
    { to: '/platform/subscriptions/plans', label: 'Subscription Plans', icon: Layers },
    { to: '/platform/messages', label: 'Broadcast Messages', icon: Send },
    { to: '/platform/users', label: 'Platform Users', icon: Users },
    { to: '/platform/audit', label: 'Platform Audit Logs', icon: ShieldCheck },
    { to: '/platform/settings', label: 'Platform Settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const getRoleBadgeStyle = (r?: string | null) => {
    switch (r) {
      case 'PLATFORM_ADMIN':
        return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
      case 'PLATFORM_SUPPORT':
        return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
      case 'PLATFORM_VIEWER':
        return 'bg-purple-500/20 text-purple-300 border-purple-400/40';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <aside className="w-64 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col justify-between p-4 h-full select-none">
      <div className="space-y-6">
        {/* Brand header */}
        <div className="flex items-center gap-3 px-2 py-2">
          {branding.logo ? (
            <img
              src={branding.logo}
              alt={platformName}
              className="w-10 h-10 rounded-xl object-cover shrink-0 border border-zinc-800"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 flex items-center justify-center font-serif text-black font-black text-xl shadow-lg shadow-amber-500/20 shrink-0">
              {platformName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="overflow-hidden min-w-0">
            <h2 className="text-base font-bold text-white tracking-tight truncate">
              {platformName}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase truncate">
                {branding.tagline || 'Platform Control'}
              </span>
            </div>
          </div>
        </div>

        {/* Platform Navigation */}
        <nav className="space-y-1">
          <p className="px-3 text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2">
            Platform Operations
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onItemClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Restaurant Context Shortcut (if assigned or viewing) */}
        {(restaurants.length > 0 || activeRestaurant) && (
          <div className="pt-2 border-t border-zinc-800/80 space-y-2">
            <p className="px-3 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
              Tenant Context
            </p>
            <NavLink
              to="/admin"
              onClick={onItemClick}
              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-all group"
            >
              <span className="flex items-center gap-2.5 truncate">
                <Utensils className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">
                  {activeRestaurant ? activeRestaurant.name : 'Restaurant Admin'}
                </span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 shrink-0 ml-1" />
            </NavLink>
          </div>
        )}
      </div>

      {/* User Session Footer */}
      <div className="pt-4 border-t border-zinc-800/80 space-y-3">
        <div className="px-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-semibold text-white truncate">{user?.name || 'Operator'}</p>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full border font-semibold shrink-0 uppercase ${getRoleBadgeStyle(
                platformRole
              )}`}
            >
              {platformRole || 'SUPPORT'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 hover:border-red-800/50 text-xs font-semibold text-zinc-300 hover:text-red-300 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
