import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  ShoppingBag,
  DollarSign,
  ShieldCheck,
  Server,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { platformService } from '../../services/platformService';
import type { PlatformMetrics, PlatformRestaurantItem } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const PlatformDashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [recentRestaurants, setRecentRestaurants] = useState<PlatformRestaurantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { enterRestaurantContext, platformRole } = useAuth();
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [metricsData, restaurantsData] = await Promise.all([
        platformService.getMetrics(),
        platformService.listRestaurants({ page: 1, limit: 5 }),
      ]);
      setMetrics(metricsData || null);
      const items = Array.isArray(restaurantsData?.items)
        ? restaurantsData.items
        : Array.isArray(restaurantsData)
          ? restaurantsData
          : [];
      setRecentRestaurants(items);
    } catch (err: any) {
      console.error('Failed to load platform dashboard data:', err);
      setError(err.message || 'Failed to load platform dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenRestaurant = async (r: PlatformRestaurantItem) => {
    try {
      await enterRestaurantContext({
        id: r.id,
        name: r.name,
        slug: r.slug,
        role: 'OWNER', // Platform Admin has unrestricted override access
      });
      navigate('/admin');
    } catch (err: any) {
      alert(`Failed to enter restaurant context: ${err.message}`);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm">Loading platform intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span>SaaS Platform Control</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono font-normal">
              v1.0
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Global operational overview, multi-tenant performance metrics, and system administration.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/platform/restaurants"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-all shadow-lg shadow-amber-500/20"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Manage Tenants</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Restaurants */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total Tenants
            </span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {metrics?.totalRestaurants ?? 0}
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              {metrics?.activeRestaurants ?? 0} Active
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 flex items-center gap-2">
            <span>{metrics?.inactiveRestaurants ?? 0} Inactive / Suspended</span>
          </div>
        </div>

        {/* Orders Today */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Orders (Today)
            </span>
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {metrics?.ordersToday ?? 0}
            </span>
            <span className="text-xs text-zinc-400">
              Open: {metrics?.openOrders ?? 0}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 flex items-center gap-2">
            <span className="text-emerald-400 font-medium">
              Real-time multi-tenant volume
            </span>
          </div>
        </div>

        {/* Revenue Today */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Gross Volume (Today)
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              ${(metrics?.revenueToday ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Lifetime GMV: ${(metrics?.totalRevenue ?? 0).toFixed(2)}
          </div>
        </div>

        {/* Platform Users */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Platform Operators
            </span>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {metrics?.platformUsers ?? 0}
            </span>
            <span className="text-xs text-zinc-400">
              Total Users: {metrics?.totalUsers ?? 0}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Active SaaS Control Personnel
          </div>
        </div>
      </div>

      {/* System Infrastructure Health & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Health Card */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Platform Health</span>
            </h2>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
              <span className="text-zinc-400">Database Engine</span>
              <span className="font-mono text-zinc-200">PostgreSQL (Prisma v6)</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
              <span className="text-zinc-400">Isolation Policy</span>
              <span className="font-mono text-emerald-400">Strict Tenant-Scoped</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
              <span className="text-zinc-400">Realtime Engine</span>
              <span className="font-mono text-zinc-200">SSE + Broadcast</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
              <span className="text-zinc-400">Operator Session</span>
              <span className="font-mono text-amber-300 font-semibold">{platformRole}</span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              to="/platform/settings"
              className="block w-full py-2 px-3 text-center text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all"
            >
              Configure SaaS Settings
            </Link>
          </div>
        </div>

        {/* Recent Tenants Directory */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Active Tenants Directory</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Direct tenant context switching and status monitoring.
              </p>
            </div>
            <Link
              to="/platform/restaurants"
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-zinc-800/60">
            {recentRestaurants.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No tenants registered yet.</p>
            ) : (
              recentRestaurants.map((r) => (
                <div
                  key={r.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
                        {r.name}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          r.active
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-red-500/10 text-red-300 border-red-500/30'
                        }`}
                      >
                        {r.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">
                      /{r.slug} • {r.userCount || 0} Staff • {r.dishCount || 0} Items • {r.orderCount || 0} Orders
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleOpenRestaurant(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open Restaurant</span>
                    </button>
                    <Link
                      to={`/platform/restaurants/${r.id}`}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
