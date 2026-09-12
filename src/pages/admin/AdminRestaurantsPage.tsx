import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  ExternalLink,
  Power,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Shield,
  Palette,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import type { Restaurant } from '../../types';

export const AdminRestaurantsPage: React.FC = () => {
  const { isPlatformUser } = useAuth();

  // Tenant isolation guard: normal restaurant users must only manage their own restaurant settings
  if (!isPlatformUser) {
    return <Navigate to="/admin/restaurant" replace />;
  }

  return <Navigate to="/platform/restaurants" replace />;
};

export const _AdminRestaurantsPageLegacy: React.FC = () => {
  const { restaurants, activeRestaurant, setActiveRestaurant } = useAuth();
  const [restaurantList, setRestaurantList] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Restaurant Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    description: '',
    themeColor: '#d97706',
  });
  const [creating, setCreating] = useState(false);

  const fetchRestaurants = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await restaurantService.getAll();
      setRestaurantList(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load restaurants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const newRest = await restaurantService.create({
        name: createForm.name,
        slug: createForm.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        description: createForm.description || undefined,
        themeColor: createForm.themeColor,
      });
      setSuccessMsg(`Successfully created restaurant "${newRest.name}"!`);
      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '', description: '', themeColor: '#d97706' });
      await fetchRestaurants();
      // Switch active restaurant to new one
      setActiveRestaurant({
        id: newRest.id,
        name: newRest.name,
        slug: newRest.slug,
        role: 'OWNER',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create restaurant');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (restaurantId: string, currentActive: boolean) => {
    setError(null);
    try {
      const updated = await restaurantService.updateStatus(restaurantId, !currentActive);
      const isNowActive = updated.active ?? updated.isActive;
      setRestaurantList((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, active: isNowActive, isActive: isNowActive } : r))
      );
      setSuccessMsg(
        `Restaurant "${updated.name}" is now ${isNowActive ? 'ACTIVE (taking orders)' : 'INACTIVE (orders blocked)'}.`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update restaurant status');
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif-luxury text-white tracking-wide flex items-center gap-2">
            <Building2 className="w-6 h-6 text-amber-400" />
            Multi-Tenant Restaurants
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your restaurant brands, tenant statuses, and switch active operating studios.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 text-black font-semibold hover:bg-amber-300 transition shadow-lg shadow-amber-400/20 text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Restaurant Brand</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white text-xs">
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-white text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Restaurant Grid */}
      {loading ? (
        <div className="p-12 text-center text-zinc-400 bg-zinc-900/40 border border-zinc-800 rounded-2xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <p className="text-sm">Loading restaurants...</p>
        </div>
      ) : restaurantList.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 bg-zinc-900/40 border border-zinc-800 rounded-2xl">
          <Building2 className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
          <p className="text-sm">No restaurants found. Click above to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {restaurantList.map((restaurant) => {
            const isSelected = activeRestaurant?.id === restaurant.id;
            const userTenant = restaurants.find((r) => r.id === restaurant.id);
            const userRole = userTenant?.role || 'STAFF';

            return (
              <div
                key={restaurant.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-zinc-900/90 border-amber-400 shadow-xl shadow-amber-400/5 ring-1 ring-amber-400/30'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      {restaurant.logo ? (
                        <img
                          src={restaurant.logo}
                          alt={restaurant.name}
                          className="w-11 h-11 rounded-xl object-cover border border-zinc-700 shrink-0"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center font-serif text-white font-bold text-lg shrink-0"
                          style={{ backgroundColor: restaurant.themeColor || '#d97706' }}
                        >
                          {restaurant.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h3 className="font-serif-luxury font-bold text-base text-white truncate">
                          {restaurant.name}
                        </h3>
                        <span className="text-xs text-zinc-400">/{restaurant.slug}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          (restaurant.active ?? restaurant.isActive)
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-red-500/20 text-red-300 border-red-500/40'
                        }`}
                      >
                        {(restaurant.active ?? restaurant.isActive) ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-semibold text-amber-400">
                          Current Studio
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-2 min-h-[32px] mb-4">
                    {restaurant.description || 'No description provided.'}
                  </p>

                  <div className="flex items-center gap-2 mb-4 text-xs text-zinc-400">
                    <Shield className="w-3.5 h-3.5 text-zinc-500" />
                    <span>
                      Your Role:{' '}
                      <strong className="text-zinc-200 uppercase">{userRole}</strong>
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={`/menu/${restaurant.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      title="View Live Menu"
                      className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    {userRole === 'OWNER' && (
                      <button
                        onClick={() => handleToggleStatus(restaurant.id, (restaurant.active ?? restaurant.isActive))}
                        title={(restaurant.active ?? restaurant.isActive) ? 'Deactivate Restaurant' : 'Activate Restaurant'}
                        className={`p-2 rounded-xl transition ${
                          (restaurant.active ?? restaurant.isActive)
                            ? 'bg-zinc-800 text-emerald-400 hover:text-red-400 hover:bg-red-950/40'
                            : 'bg-zinc-800 text-red-400 hover:text-emerald-400 hover:bg-emerald-950/40'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    )}
                  </div>


                  {isSelected ? (
                    <span className="px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 text-xs font-semibold border border-amber-400/40">
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() =>
                        setActiveRestaurant({
                          id: restaurant.id,
                          name: restaurant.name,
                          slug: restaurant.slug,
                          role: userRole as any,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-200 hover:bg-amber-400 hover:text-black text-xs font-semibold transition"
                    >
                      <span>Switch Studio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Restaurant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 font-serif-luxury">
                <Building2 className="w-5 h-5 text-amber-400" />
                Create New Restaurant
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Restaurant Name
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    setCreateForm({ ...createForm, name, slug: autoSlug });
                  }}
                  placeholder="e.g. Lumina Bistro"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  URL Slug (Unique identifier)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-zinc-500">/menu/</span>
                  <input
                    type="text"
                    required
                    value={createForm.slug}
                    onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                    placeholder="lumina-bistro"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-16 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  placeholder="Atmospheric dining experience..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  <span>Theme Accent Color</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={createForm.themeColor}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, themeColor: e.target.value })
                    }
                    className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={createForm.themeColor}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, themeColor: e.target.value })
                    }
                    className="w-32 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-amber-400 text-black hover:bg-amber-300 transition shadow-lg shadow-amber-400/20 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Restaurant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
