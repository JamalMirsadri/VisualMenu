import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ExternalLink,
  Flame,
  FolderTree,
  ImageIcon,
  Plus,
  Sparkles,
  UtensilsCrossed,
  LayoutGrid,
  ChefHat,
  ClipboardList,
  CreditCard,
  Banknote,
  Users,
  DollarSign,
  Clock,
  ShieldCheck,
  TrendingUp,
  Lock,
} from 'lucide-react';
import { FoodFormModal } from '../../components/admin/FoodFormModal';
import { RestaurantDataGate } from '../../components/admin/RestaurantDataGate';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import { useAdminData } from '../../hooks/useAdminData';
import { useAuth } from '../../context/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import type { FoodItem } from '../../types';

export const AdminDashboard: React.FC = () => {
  const {
    restaurant,
    categories,
    foods,
    media,
    loading,
    error,
    refresh,
    createFood,
    updateFood,
    deleteFood,
    toggleFoodAvailability,
  } = useAdminData();

  const { role, activeRestaurant, hasPermission } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [isFoodModalOpen, setIsFoodModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);

  // Permission capabilities
  const canViewMenu = hasPermission('VIEW_MENU');
  const canManageFoods = hasPermission('MANAGE_FOODS');
  const canToggleAvailability = hasPermission('TOGGLE_FOOD_AVAILABILITY') || hasPermission('TOGGLE_AVAILABILITY');
  const canViewOrders = hasPermission('VIEW_ORDERS');
  const canViewKitchen = hasPermission('VIEW_KITCHEN') || hasPermission('UPDATE_KITCHEN_STATUS');
  const canViewPayments = hasPermission('VIEW_PAYMENTS');
  const canConfirmCash = hasPermission('CONFIRM_CASH_PAYMENT');
  const canViewStaff = hasPermission('VIEW_STAFF');
  const canViewTables = hasPermission('VIEW_TABLES');
  const canViewFinancials = hasPermission('VIEW_FINANCIAL_REPORTS') && metrics?.financialMetrics;

  const jobTemplate = activeRestaurant?.jobTemplate;
  const roleLabel = jobTemplate ? jobTemplate.replace('_', ' ') : role || 'STAFF';

  const fetchMetrics = async () => {
    if (!activeRestaurant?.id) return;
    setMetricsError(null);
    try {
      const data = await restaurantService.getDashboardMetrics(activeRestaurant.id);
      setMetrics(data);
    } catch (err: any) {
      setMetricsError(err.message || 'Could not load dashboard metrics.');
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [activeRestaurant?.id]);

  const availableFoodsCount = foods.filter((f) => f.available).length;
  const activeCategoriesCount = categories.filter((c) => c.isActive).length;
  const averagePrice = foods.length > 0
    ? (foods.reduce((acc, curr) => acc + curr.price, 0) / foods.length).toFixed(2)
    : '0.00';

  const handleOpenNewFood = () => {
    if (!canManageFoods) return;
    setEditingFood(null);
    setIsFoodModalOpen(true);
  };

  const handleEditFood = (food: FoodItem) => {
    if (!canManageFoods) return;
    setEditingFood(food);
    setIsFoodModalOpen(true);
  };

  if (loading || !restaurant) {
    return (
      <RestaurantDataGate
        loading={loading}
        error={error}
        hasRestaurant={Boolean(restaurant)}
        loadingLabel="Loading restaurant metrics..."
        onRetry={refresh}
      />
    );
  }

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} onRetry={refresh} title="Could not load restaurant data" />}
      {metricsError && (
        <ErrorBanner
          message={metricsError}
          onRetry={fetchMetrics}
          title="Could not load dashboard metrics"
        />
      )}
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/20 via-zinc-900 to-zinc-900 border border-amber-500/30 p-6 sm:p-8">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 text-amber-300 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                Live Interactive Restaurant Management
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] font-bold text-zinc-300 uppercase tracking-wide">
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                Role: {roleLabel}
              </span>
            </div>
            <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-wide">
              {restaurant.name}
            </h1>
            <p className="text-sm text-zinc-400 max-w-xl mt-1">
              Role-authorized console: capabilities adapt dynamically to your assigned permissions.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {canManageFoods && (
              <button
                onClick={handleOpenNewFood}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Food Item</span>
              </button>
            )}
            {canViewMenu && (
              <a
                href={`/menu/${restaurant.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs uppercase tracking-wider transition-all border border-zinc-700"
              >
                <span>View Live Menu</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Operational Role Workspaces Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold font-serif-luxury text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Operational Role Workspaces
          </h2>
          <span className="text-xs text-zinc-400">Quick-access station hubs</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {canViewTables && (
            <Link
              to="/admin/floor"
              className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-amber-500/50 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                    LIVE
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition">
                  Floor Operations
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Interactive table map, occupancy, waiter calls, and instant table bills.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-amber-400 font-semibold">
                <span>Open Floor</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>
          )}

          {canViewOrders && (
            <Link
              to="/admin/orders"
              className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-blue-500/50 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-105 transition">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                    {metrics?.orderMetrics?.activeOrders ?? 0} ACTIVE
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition">
                  Floor & Waiter Station
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Live table orders, trays, handoffs, and fulfillment status.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-blue-400 font-semibold">
                <span>Enter Station</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>
          )}

          {canViewKitchen && (
            <Link
              to="/admin/kitchen"
              className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-amber-500/50 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                    {metrics?.kitchenMetrics?.urgentOrders ?? 0} URGENT
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition">
                  Kitchen KDS Station
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Real-time cooking queue, station progression, and plated items.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-amber-400 font-semibold">
                <span>Enter KDS</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>
          )}

          {(canViewPayments || canConfirmCash) && (
            <Link
              to="/admin/cash"
              className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-emerald-500/50 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                    {metrics?.paymentMetrics?.pendingCashOrders ?? 0} UNPAID
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition">
                  Cash Register & POS
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Cash drawer operations, change calculator, and fiscal receipts.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>Open Register</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>
          )}

          {canViewStaff && (
            <Link
              to="/admin/staff"
              className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-purple-500/50 transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-105 transition">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                    {metrics?.staffMetrics?.activeStaff ?? 1} ACTIVE
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition">
                  Staff Roster & Access
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Team invitations, job roles, and 51 granular permission gates.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-purple-400 font-semibold">
                <span>Manage Staff</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Permission-Scoped KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Orders or Categories */}
        {canViewOrders ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Active Orders</span>
              <ClipboardList className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-serif-luxury text-white">
                {metrics?.orderMetrics?.activeOrders ?? 0}
              </span>
              <span className="text-xs text-zinc-400">orders in flight</span>
            </div>
          </div>
        ) : canViewMenu ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Active Categories</span>
              <FolderTree className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-serif-luxury text-white">
                {activeCategoriesCount}
              </span>
              <span className="text-xs text-zinc-400">/ {categories.length} total</span>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Assigned Role</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-serif-luxury text-amber-400">
                {roleLabel}
              </span>
            </div>
          </div>
        )}

        {/* KPI 2: Kitchen Queue or Available Dishes */}
        {canViewKitchen ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Kitchen Tickets</span>
              <ChefHat className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-serif-luxury text-amber-400">
                {metrics?.kitchenMetrics?.activeKitchenOrders ?? 0}
              </span>
              <span className="text-xs text-zinc-400">tickets in prep</span>
            </div>
          </div>
        ) : canViewMenu ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Available Dishes</span>
              <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-serif-luxury text-emerald-400">
                {availableFoodsCount}
              </span>
              <span className="text-xs text-zinc-400">/ {foods.length} dishes</span>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Active Dining Room</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white truncate">
                {activeRestaurant?.name}
              </span>
            </div>
          </div>
        )}

        {/* KPI 3: Revenue (if permitted) or Daily Paid Orders or Average Price */}
        {canViewFinancials ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Today's Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold font-serif-luxury text-white">
                {restaurant.currencySymbol}{Number(metrics.financialMetrics.todayRevenue ?? 0).toFixed(2)}
              </span>
              <span className="text-xs text-emerald-400 font-mono ml-1">gross</span>
            </div>
          </div>
        ) : canViewPayments ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Settled Orders Today</span>
              <CreditCard className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-serif-luxury text-emerald-400">
                {metrics?.paymentMetrics?.paidTodayCount ?? 0}
              </span>
              <span className="text-xs text-zinc-400">transactions</span>
            </div>
          </div>
        ) : canViewMenu ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Average Dish Price</span>
              <span className="text-amber-400 font-serif font-bold text-sm">€</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold font-serif-luxury text-white">
                {restaurant.currencySymbol}{averagePrice}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Operational Security</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-emerald-400">
                Access Verified
              </span>
            </div>
          </div>
        )}

        {/* KPI 4: Financial Avg Order Value (if permitted) or Media Assets */}
        {canViewFinancials ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Avg Order Ticket</span>
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold font-serif-luxury text-white">
                {restaurant.currencySymbol}{Number(metrics.financialMetrics.averageOrderValue ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        ) : canViewMenu ? (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Media Assets</span>
              <ImageIcon className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-serif-luxury text-white">
                {media.length}
              </span>
              <span className="text-xs text-zinc-400">photos & reels</span>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-medium">Station Shift</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-white">
                Active Session
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Featured Dishes & Quick Management Section (Only visible with VIEW_MENU) */}
      {canViewMenu && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold font-serif-luxury text-white">
                Chef Signature Dishes & Recent Items
              </h2>
              <p className="text-xs text-zinc-400">
                {canToggleAvailability
                  ? 'Toggle live availability or select an item to inspect details.'
                  : 'Live availability view (read-only for your current role).'}
              </p>
            </div>
            <Link
              to="/admin/foods"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold"
            >
              <span>Manage all {foods.length} dishes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {foods.slice(0, 6).map((food) => {
              const category = categories.find((c) => c.id === food.categoryId);
              return (
                <div
                  key={food.id}
                  className="group relative rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-amber-400/40 p-4 transition-all duration-300 flex gap-3.5"
                >
                  {/* Thumbnail */}
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-zinc-800 bg-black">
                    <img
                      src={food.image || ''}
                      alt={food.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {food.video && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] text-amber-400 font-bold">
                        VIDEO
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-amber-400/90 font-medium truncate">
                          {category?.name || 'Uncategorized'}
                        </span>
                        {food.spicyLevel && food.spicyLevel > 0 ? (
                          <span className="text-[10px] text-red-400 flex items-center">
                            <Flame className="w-3 h-3" />
                          </span>
                        ) : null}
                      </div>

                      <h3
                        onClick={() => canManageFoods && handleEditFood(food)}
                        className={`text-sm font-bold text-white truncate ${
                          canManageFoods ? 'hover:text-amber-300 cursor-pointer' : ''
                        }`}
                      >
                        {food.name}
                      </h3>
                      <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                        {food.tagline || food.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-800/80">
                      <span className="font-serif-luxury font-bold text-sm gold-gradient-text">
                        {food.currencySymbol}{food.price.toFixed(2)}
                      </span>

                      {canToggleAvailability ? (
                        <button
                          onClick={() => toggleFoodAvailability(food.id, food.available)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide transition-colors cursor-pointer ${
                            food.available
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {food.available ? 'Available' : 'Unavailable'}
                        </button>
                      ) : (
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide flex items-center gap-1 ${
                            food.available
                              ? 'bg-emerald-950/40 text-emerald-400/70 border border-emerald-800/40'
                              : 'bg-zinc-800/40 text-zinc-500 border border-zinc-800'
                          }`}
                        >
                          <Lock className="w-2.5 h-2.5" />
                          {food.available ? 'Available' : 'Unavailable'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Food Modal */}
      {canManageFoods && (
        <FoodFormModal
          isOpen={isFoodModalOpen}
          food={editingFood}
          categories={categories}
          onClose={() => setIsFoodModalOpen(false)}
          onSave={(data) => {
            if (editingFood) {
              updateFood(editingFood.id, data);
            } else {
              createFood(data);
            }
          }}
          onDelete={(id) => deleteFood(id)}
          restaurantId={restaurant.id}
          defaultCurrency={restaurant.currency}
          defaultCurrencySymbol={restaurant.currencySymbol}
        />
      )}
    </div>
  );
};
