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
  Building2,
  ClipboardList,
  ChefHat,
  Armchair,
  Users,
  Eye,
  CreditCard,
  Banknote,
  UserCheck,
} from 'lucide-react';
import type { Restaurant } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface AdminSidebarProps {
  restaurant: Restaurant | null;
  onResetData?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  restaurant,
  onResetData,
}) => {
  const { user, role, logout, restaurants, activeRestaurant, setActiveRestaurant, hasPermission } = useAuth();
  const navigate = useNavigate();

  const allNavItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: 'VIEW_DASHBOARD' },
    { to: '/admin/floor', label: 'Floor Operations', icon: LayoutGrid, permission: 'VIEW_TABLES' },
    { to: '/admin/orders', label: 'Live Orders', icon: ClipboardList, permission: 'VIEW_ORDERS' },
    { to: '/admin/kitchen', label: 'Kitchen KDS', icon: ChefHat, permission: 'VIEW_KITCHEN' },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard, permission: 'VIEW_PAYMENTS' },
    { to: '/admin/cash', label: 'Cash Register', icon: Banknote, permission: 'CONFIRM_CASH_PAYMENT' },
    { to: '/admin/customers', label: 'Customers & NIF', icon: UserCheck, permission: 'VIEW_CUSTOMERS' },
    { to: '/admin/tables', label: 'Dining Tables', icon: Armchair, permission: 'VIEW_TABLES' },
    { to: '/admin/categories', label: 'Categories', icon: FolderTree, permission: 'MANAGE_CATEGORIES' },
    { to: '/admin/foods', label: 'Food Items', icon: UtensilsCrossed, permission: 'MANAGE_FOODS' },
    { to: '/admin/media', label: 'Media Library', icon: ImageIcon, permission: 'VIEW_MEDIA' },
    { to: '/admin/menu-preview', label: 'Menu Preview', icon: Eye, permission: 'VIEW_MENU' },
    { to: '/admin/qr', label: 'QR Codes', icon: QrCode, permission: 'VIEW_QR_CODES' },
    { to: '/admin/staff', label: 'Staff & Roles', icon: Users, permission: 'VIEW_STAFF' },
    { to: '/admin/restaurants', label: 'All Restaurants', icon: Building2, permission: 'MANAGE_RESTAURANT_SETTINGS' },
    { to: '/admin/restaurant', label: 'Restaurant Settings', icon: Settings, permission: 'MANAGE_RESTAURANT_SETTINGS' },
  ];

  const visibleNavItems = allNavItems.filter((item) => !item.permission || hasPermission(item.permission));

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
    <aside className="w-64 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col justify-between p-4 h-full">
      <div className="space-y-5">
        {/* Brand header */}
        <div className="flex items-center gap-3 px-2 py-2">
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
            <h2 className="font-serif-luxury text-sm font-bold text-white tracking-wide truncate">
              {restaurant?.name || 'Loading Restaurant...'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                AURA Studio
              </span>
            </div>
          </div>
        </div>

        {/* Multi-Restaurant Switcher (if user assigned to multiple) */}
        {restaurants.length > 1 && (
          <div className="px-2">
            <label className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              <span>Active Tenant</span>
            </label>
            <select
              value={activeRestaurant?.slug || ''}
              onChange={(e) => {
                const selected = restaurants.find((r) => r.slug === e.target.value);
                if (selected) setActiveRestaurant(selected);
              }}
              className="w-full text-xs py-1.5 px-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-amber-400"
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.slug}>
                  {r.name} ({r.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Live Menu Preview Link */}
        <div className="px-2">
          <a
            href={`/menu/${restaurant?.slug || 'demo-restaurant'}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-400/15 to-transparent border border-amber-400/40 text-amber-300 hover:text-white hover:border-amber-400 text-xs font-semibold tracking-wide transition-all group shadow-sm"
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Customer Menu
            </span>
            <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-amber-500 text-black font-semibold shadow-md shadow-amber-500/20'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/80'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer Utilities with Authenticated User Details */}
      <div className="pt-4 border-t border-zinc-800 space-y-3">
        {user && (
          <div className="p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {user.name}
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
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
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-amber-300 hover:bg-zinc-900 transition-colors cursor-pointer"
              title="Refresh state from PostgreSQL"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sync DB</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors cursor-pointer"
            title="Sign out of management portal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>

        <div className="px-2 text-[10px] text-zinc-400 flex items-center justify-between">
          <span>AURA Engine</span>
          <span className="text-emerald-400 font-mono">v3.0 Production</span>
        </div>
      </div>
    </aside>
  );
};
