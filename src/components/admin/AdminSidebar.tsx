import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  FolderTree,
  ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  QrCode,
  RotateCcw,
  Settings,
  UtensilsCrossed,
  ClipboardList,
  ChefHat,
  Armchair,
  Users,
  Eye,
  CreditCard,
  Banknote,
  Wallet,
  UserCheck,
  Bell,
  Printer,
  BarChart3,
  Sparkles,
  Clapperboard,
} from 'lucide-react';
import type { Restaurant } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useAdminBadges, type BadgeKey } from '../../hooks/useAdminBadges';

interface AdminNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  permission?: string;
  feature?: string;
  badgeKey?: BadgeKey;
}

interface AdminSidebarProps {
  restaurant: Restaurant | null;
  onResetData?: () => void;
  onNavigate?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  restaurant,
  onResetData,
  onNavigate,
}) => {
  const { user, role, logout, hasPermission, activeRestaurant, hasFeature } = useAuth();
  const { badgeCount, markSeen } = useAdminBadges(activeRestaurant?.id);
  const navigate = useNavigate();

  // All restaurant-level operational navigation items
  // Note: All Restaurants and cross-tenant directories are strictly platform-only under /platform/*
  const allNavItems: AdminNavItem[] = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: 'VIEW_DASHBOARD' },
    { to: '/admin/floor', label: 'Floor Operations', icon: LayoutGrid, permission: 'VIEW_TABLES' },
    { to: '/admin/orders', label: 'Live Orders', icon: ClipboardList, permission: 'VIEW_ORDERS', badgeKey: 'liveOrders' },
    { to: '/admin/kitchen', label: 'Kitchen KDS', icon: ChefHat, permission: 'VIEW_KITCHEN', badgeKey: 'kitchen' },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard, permission: 'VIEW_PAYMENTS', badgeKey: 'payments' },
    { to: '/admin/cash', label: 'Cash Register', icon: Banknote, permission: 'CONFIRM_CASH_PAYMENT' },
    { to: '/admin/customers', label: 'Customers & NIF', icon: UserCheck, permission: 'VIEW_CUSTOMERS' },
    { to: '/admin/tables', label: 'Dining Tables', icon: Armchair, permission: 'VIEW_TABLES', badgeKey: 'tables' },
    { to: '/admin/categories', label: 'Categories', icon: FolderTree, permission: 'MANAGE_CATEGORIES' },
    { to: '/admin/foods', label: 'Food Items', icon: UtensilsCrossed, permission: 'MANAGE_FOODS' },
    { to: '/admin/media', label: 'Media Library', icon: ImageIcon, permission: 'VIEW_MEDIA' },
    { to: '/admin/menu-preview', label: 'Menu Preview', icon: Eye, permission: 'VIEW_MENU' },
    { to: '/admin/qr', label: 'QR Codes', icon: QrCode, permission: 'VIEW_QR_CODES' },
    { to: '/admin/qr-print', label: 'QR Print Studio', icon: Printer, permission: 'VIEW_QR_CODES' },
    { to: '/admin/analytics', label: 'Analytics & Reports', icon: BarChart3, permission: 'VIEW_ORDERS', feature: 'ADVANCED_ANALYTICS' },
    { to: '/admin/ai-insights', label: 'AI Insights', icon: Sparkles, permission: 'VIEW_ORDERS', feature: 'AI_INSIGHTS' },
    { to: '/admin/ai-video', label: 'AI Video Studio', icon: Clapperboard, permission: 'VIEW_MEDIA', feature: 'AI_FOOD_VIDEO' },
    { to: '/admin/staff', label: 'Staff & Roles', icon: Users, permission: 'VIEW_STAFF', badgeKey: 'staffInvitations' },
    { to: '/admin/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
    ...(role === 'OWNER' ? [{ to: '/admin/subscription', label: 'Subscription', icon: CreditCard }] : []),
    { to: '/admin/restaurant', label: 'Restaurant Settings', icon: Settings, permission: 'MANAGE_RESTAURANT_SETTINGS' },
    { to: '/admin/payment-settings', label: 'Payment Settings', icon: Wallet, permission: 'MANAGE_RESTAURANT_SETTINGS' },
  ];

  const visibleNavItems = allNavItems.filter(
    (item) => (!item.permission || hasPermission(item.permission)) && (!item.feature || hasFeature(item.feature))
  );

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const getRoleBadgeColor = (r?: string | null) => {
    switch (r) {
      case 'OWNER':
        return 'bg-amber-400/15 text-amber-300 border-amber-400/30';
      case 'ADMIN':
        return 'bg-purple-400/15 text-purple-300 border-purple-400/30';
      case 'MANAGER':
        return 'bg-blue-400/15 text-blue-300 border-blue-400/30';
      case 'STAFF':
        return 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <aside
      id="admin-sidebar"
      aria-label="Restaurant management navigation"
      className="w-64 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full overflow-hidden select-none"
    >
      {/* Top Header: Brand Header & Customer Menu Link */}
      <div className="p-4 pb-3 shrink-0 border-b border-zinc-800/80 space-y-3 bg-zinc-950">
        <div className="flex items-center gap-3 px-1">
          {restaurant?.logo ? (
            <img
              src={restaurant.logo}
              alt="Restaurant Logo"
              className="w-10 h-10 rounded-full object-cover border border-amber-400/40 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center font-serif text-amber-300 font-bold text-lg shrink-0">
              A
            </div>
          )}
          <div className="overflow-hidden min-w-0">
            <h2 className="font-serif-luxury text-sm font-bold text-white tracking-wide truncate" title={restaurant?.name}>
              {restaurant?.name || 'No Restaurant'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                AURA Studio
              </span>
            </div>
          </div>
        </div>

        {/* Live Menu Preview Link */}
        <a
          href={`/menu/${restaurant?.slug || ''}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-400/15 to-transparent border border-amber-400/40 text-amber-300 hover:text-white hover:border-amber-400 text-xs font-semibold tracking-wide transition-all group shadow-sm min-h-[38px]"
        >
          <span className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">Live Customer Menu</span>
          </span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>

      {/* Independently Scrollable Navigation */}
      <div
        id="admin-sidebar-nav-container"
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1 custom-scrollbar"
      >
        <nav className="space-y-1" aria-label="Restaurant navigation">
          {visibleNavItems.map((item) => {
            const count = item.badgeKey ? badgeCount(item.badgeKey) : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => {
                  if (item.badgeKey) void markSeen(item.badgeKey);
                  onNavigate?.();
                }}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all min-h-[40px] ${
                    isActive
                      ? 'bg-amber-500 text-black font-semibold shadow-md shadow-amber-500/20'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900/80'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {count > 0 && (
                  <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950 shrink-0">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Utilities with Authenticated User Details */}
      <div className="p-4 pt-3 shrink-0 border-t border-zinc-800 bg-zinc-950/95 space-y-3">
        {user && (
          <div className="p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate" title={user.name}>
                {user.name}
              </div>
              <div className="text-[10px] text-zinc-400 truncate" title={user.email}>
                {user.email}
              </div>
            </div>
            {role && (
              <span
                className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider border uppercase shrink-0 ${getRoleBadgeColor(
                  role
                )}`}
              >
                {role}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {onResetData && (
            <button
              onClick={() => onResetData()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-amber-300 hover:bg-zinc-900 transition-colors cursor-pointer min-h-[38px]"
              title="Refresh state from PostgreSQL"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sync DB</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors cursor-pointer min-h-[38px]"
            title="Sign out of management portal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>

        <div className="px-1 text-[10px] text-zinc-400 flex items-center justify-between">
          <span>AURA Engine</span>
          <span className="text-emerald-400 font-mono">v3.0 Production</span>
        </div>
      </div>
    </aside>
  );
};
