import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Power,
  PowerOff,
  AlertTriangle,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Plus,
} from 'lucide-react';
import { platformService } from '../../services/platformService';
import type { PlatformRestaurantItem } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const PlatformRestaurantsPage: React.FC = () => {
  const [restaurants, setRestaurants] = useState<PlatformRestaurantItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Status toggle confirmation modal state
  const [targetRestaurant, setTargetRestaurant] = useState<PlatformRestaurantItem | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { enterRestaurantContext } = useAuth();
  const navigate = useNavigate();

  const loadRestaurants = async () => {
    try {
      setLoading(true);
      setError(null);
      const statusParam =
        statusFilter === 'ACTIVE' ? 'active' : statusFilter === 'INACTIVE' ? 'inactive' : 'all';

      const data = await platformService.listRestaurants({
        search: search.trim() || undefined,
        status: statusParam,
        page,
        limit,
      });

      setRestaurants(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error('Failed to load restaurants:', err);
      setError(err.message || 'Failed to load restaurants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRestaurants();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadRestaurants();
  };

  const handleOpenRestaurant = async (r: PlatformRestaurantItem) => {
    try {
      await enterRestaurantContext({
        id: r.id,
        name: r.name,
        slug: r.slug,
        role: 'OWNER',
      });
      navigate('/admin');
    } catch (err: any) {
      alert(`Error entering context: ${err.message}`);
    }
  };

  const promptStatusChange = (r: PlatformRestaurantItem) => {
    setTargetRestaurant(r);
    setReasonInput('');
    setIsModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!targetRestaurant) return;
    try {
      setActionLoadingId(targetRestaurant.id);
      const newStatus = !targetRestaurant.active;
      await platformService.setRestaurantStatus(
        targetRestaurant.id,
        newStatus,
        reasonInput.trim() || undefined
      );

      setIsModalOpen(false);
      setTargetRestaurant(null);
      await loadRestaurants();
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-amber-400" />
            <span>Tenants & Restaurants Directory</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Browse, inspect, activate, deactivate, and access restaurant administrative workspaces.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/platform/restaurants/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Provision Restaurant</span>
          </Link>

          <button
            onClick={loadRestaurants}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by restaurant name or slug..."
            className="w-full pl-9 pr-24 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg cursor-pointer transition-colors"
          >
            Search
          </button>
        </form>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 shrink-0">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setStatusFilter(filter);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === filter
                  ? 'bg-amber-500 text-black font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {filter === 'ALL' ? 'All Tenants' : filter === 'ACTIVE' ? 'Active Only' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center gap-3 text-red-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Tenants Table */}
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-3.5">Tenant Details</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Team</th>
                <th className="px-4 py-3.5">Menu</th>
                <th className="px-4 py-3.5">Orders</th>
                <th className="px-4 py-3.5">Created</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading && restaurants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
                    <span>Loading tenants directory...</span>
                  </td>
                </tr>
              ) : restaurants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-zinc-500">
                    No restaurants match your search and filter criteria.
                  </td>
                </tr>
              ) : (
                restaurants.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-zinc-800/40 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">
                          {r.name}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-zinc-500 font-mono text-[11px]">/{r.slug}</span>
                          <span className="text-[10px] text-zinc-500">• {r.currency || 'USD'}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                          r.active
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-red-500/10 text-red-300 border-red-500/30'
                        }`}
                      >
                        {r.active ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-red-400" />
                            <span>Inactive</span>
                          </>
                        )}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-zinc-300 whitespace-nowrap">
                      <span className="font-semibold text-white">{r.userCount || 0}</span> staff
                    </td>

                    <td className="px-4 py-4 text-zinc-300 whitespace-nowrap">
                      <span className="font-semibold text-white">{r.dishCount || 0}</span> items
                    </td>

                    <td className="px-4 py-4 text-zinc-300 whitespace-nowrap">
                      <span className="font-semibold text-white">{r.orderCount || 0}</span> orders
                    </td>

                    <td className="px-4 py-4 text-zinc-400 whitespace-nowrap font-mono text-[11px]">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {/* Open Context button */}
                        <button
                          onClick={() => handleOpenRestaurant(r)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all cursor-pointer"
                          title="Open full admin console for this restaurant"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open</span>
                        </button>

                        {/* Details View */}
                        <Link
                          to={`/platform/restaurants/${r.id}`}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          title="View Tenant Metrics & Members"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>

                        {/* Activate / Deactivate Toggle */}
                        <button
                          onClick={() => promptStatusChange(r)}
                          disabled={actionLoadingId === r.id}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            r.active
                              ? 'bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-300'
                              : 'bg-zinc-800 hover:bg-emerald-950/60 text-zinc-400 hover:text-emerald-300'
                          }`}
                          title={r.active ? 'Deactivate restaurant' : 'Activate restaurant'}
                        >
                          {actionLoadingId === r.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                          ) : r.active ? (
                            <PowerOff className="w-4 h-4" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-zinc-950/80 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <div>
            Showing <span className="font-semibold text-white">{restaurants.length}</span> of{' '}
            <span className="font-semibold text-white">{total}</span> total tenants
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-zinc-300">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Tenant Activation / Deactivation */}
      {isModalOpen && targetRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  targetRestaurant.active
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                {targetRestaurant.active ? (
                  <PowerOff className="w-6 h-6" />
                ) : (
                  <Power className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {targetRestaurant.active ? 'Deactivate Restaurant' : 'Activate Restaurant'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Tenant: <span className="text-white font-semibold">{targetRestaurant.name}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {targetRestaurant.active
                ? 'Deactivating this restaurant will immediately suspend public menu ordering and alert the tenant management. The restaurant data and staff accounts will remain intact.'
                : 'Activating this restaurant will re-enable customer menu access, table orders, and operational workflows.'}
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Audit Reason (Optional)
              </label>
              <input
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="e.g. Account subscription update, maintenance..."
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setTargetRestaurant(null);
                }}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusChange}
                disabled={Boolean(actionLoadingId)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-lg transition-all ${
                  targetRestaurant.active
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                }`}
              >
                {actionLoadingId ? (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </span>
                ) : targetRestaurant.active ? (
                  'Confirm Deactivation'
                ) : (
                  'Confirm Activation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
