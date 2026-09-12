import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Users,
  Utensils,
  ShoppingBag,
  DollarSign,
  CheckCircle2,
  XCircle,
  Power,
  PowerOff,
  RefreshCw,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import { platformService } from '../../services/platformService';
import { useAuth } from '../../context/AuthContext';
import { PlatformEditRestaurantModal } from '../../components/platform/PlatformEditRestaurantModal';

export const PlatformRestaurantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { enterRestaurantContext } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditModalOpen(true);
    }
  }, [searchParams]);

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    if (searchParams.get('edit')) {
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const loadDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await platformService.getRestaurantDetails(id);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load restaurant details:', err);
      setError(err.message || 'Failed to load restaurant details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [id]);

  const handleOpenRestaurant = async () => {
    if (!data?.restaurant) return;
    try {
      await enterRestaurantContext({
        id: data.restaurant.id,
        name: data.restaurant.name,
        slug: data.restaurant.slug,
        role: 'OWNER',
      });
      navigate('/admin');
    } catch (err: any) {
      alert(`Failed to enter context: ${err.message}`);
    }
  };

  const handleToggleStatus = async () => {
    if (!data?.restaurant) return;
    const nextStatus = !data.restaurant.active;
    const confirmMsg = nextStatus
      ? 'Are you sure you want to activate this restaurant?'
      : 'Are you sure you want to deactivate this restaurant? Public ordering will be suspended.';
    if (!window.confirm(confirmMsg)) return;

    try {
      setStatusLoading(true);
      await platformService.setRestaurantStatus(data.restaurant.id, nextStatus);
      await loadDetails();
    } catch (err: any) {
      alert(`Status change failed: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleResendInvitation = async () => {
    if (!restaurant) return;
    if (!window.confirm(`Resend onboarding invitation to owner? Any active previous invitation will be revoked.`)) return;
    try {
      setStatusLoading(true);
      const res = await platformService.resendInvitation(restaurant.id);
      alert(`Invitation resent successfully! Onboarding link: ${window.location.origin}${res.invitation.onboardingUrl}`);
      await loadDetails();
    } catch (err: any) {
      alert(`Failed to resend invitation: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleRevokeInvitation = async () => {
    if (!restaurant) return;
    if (!window.confirm(`Are you sure you want to revoke the active owner onboarding invitation?`)) return;
    try {
      setStatusLoading(true);
      await platformService.revokeInvitation(restaurant.id);
      alert(`Owner invitation revoked.`);
      await loadDetails();
    } catch (err: any) {
      alert(`Failed to revoke invitation: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm">Loading tenant specification...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="w-6 h-6" />
          <h2 className="text-lg font-bold">Failed to load restaurant</h2>
        </div>
        <p className="text-sm text-zinc-400">{error || 'Restaurant not found'}</p>
        <Link
          to="/platform/restaurants"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Directory</span>
        </Link>
      </div>
    );
  }

  const { restaurant, stats, members, invitation } = data;

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb & Back */}
      <div className="flex items-center justify-between">
        <Link
          to="/platform/restaurants"
          className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Restaurants Directory</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDetails}
            disabled={loading}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh details"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tenant Header Profile Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 flex items-center justify-center font-serif text-black font-black text-2xl shadow-xl shadow-amber-500/20 shrink-0">
              {restaurant.name.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {restaurant.name}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    restaurant.active
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-red-500/10 text-red-300 border-red-500/30'
                  }`}
                >
                  {restaurant.active ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                      <span>Inactive</span>
                    </>
                  )}
                </span>
                {restaurant.provisioningStatus && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-zinc-800 border border-zinc-700 text-amber-300">
                    {restaurant.provisioningStatus}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 font-mono">
                <span>Slug: /{restaurant.slug}</span>
                <span>•</span>
                <span>ID: {restaurant.id}</span>
                <span>•</span>
                <span>Created: {new Date(restaurant.createdAt).toLocaleDateString()}</span>
                {restaurant.activatedAt && (
                  <>
                    <span>•</span>
                    <span>Activated: {new Date(restaurant.activatedAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Edit Restaurant Action */}
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-400/60 text-white font-semibold text-xs transition-all shadow-md cursor-pointer"
            >
              <Pencil className="w-4 h-4 text-amber-400" />
              <span>Edit Restaurant</span>
            </button>

            {/* Enter Context Action */}
            <button
              onClick={handleOpenRestaurant}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Restaurant Console</span>
            </button>

            {/* Toggle Status */}
            <button
              onClick={handleToggleStatus}
              disabled={statusLoading}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                restaurant.active
                  ? 'bg-zinc-800 hover:bg-red-950/60 border-zinc-700 hover:border-red-800 text-zinc-300 hover:text-red-300'
                  : 'bg-zinc-800 hover:bg-emerald-950/60 border-zinc-700 hover:border-emerald-800 text-zinc-300 hover:text-emerald-300'
              }`}
            >
              {statusLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              ) : restaurant.active ? (
                <>
                  <PowerOff className="w-4 h-4" />
                  <span>Deactivate Tenant</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4" />
                  <span>Activate Tenant</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Owner & Onboarding Invitation Card */}
      <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <span>Owner Onboarding & Invitation Lifecycle</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Secure hashed invitation token status and account activation details.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {invitation && (invitation.status === 'PENDING' || invitation.status === 'EXPIRED') && (
              <>
                <button
                  onClick={handleResendInvitation}
                  disabled={statusLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resend Invitation</span>
                </button>
                <button
                  onClick={handleRevokeInvitation}
                  disabled={statusLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-red-950/60 hover:text-red-300 border border-zinc-700 text-zinc-300 text-xs font-semibold transition-all cursor-pointer"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>Revoke</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Assigned Owner</span>
            <div className="font-semibold text-white">
              {members.find((m: any) => m.role === 'OWNER')?.user?.name || 'Pending Owner'}
            </div>
            <div className="text-zinc-400 font-mono text-[11px]">
              {members.find((m: any) => m.role === 'OWNER')?.user?.email || invitation?.invitedEmail || '—'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Invitation Status</span>
            <div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  invitation?.status === 'ACCEPTED'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : invitation?.status === 'PENDING'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : invitation?.status === 'EXPIRED'
                    ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {invitation?.status || 'No Invitation'}
              </span>
            </div>
            <div className="text-zinc-500 text-[10px]">
              {invitation?.acceptedAt
                ? `Accepted ${new Date(invitation.acceptedAt).toLocaleDateString()}`
                : invitation?.expiresAt
                ? `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`
                : '—'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Provisioning State</span>
            <div className="font-bold text-white font-mono">{restaurant.provisioningStatus || 'ACTIVE'}</div>
            <div className="text-zinc-500 text-[10px]">
              {restaurant.provisionedAt
                ? `Provisioned on ${new Date(restaurant.provisionedAt).toLocaleDateString()}`
                : 'Active Tenant'}
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate Operational Metrics Grid — All 8 Entities */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Categories</span>
            <Utensils className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.categories || 0}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Food Dishes</span>
            <Utensils className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.foods || 0}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Media Assets</span>
            <Utensils className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.media || 0}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Dining Tables</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.tables || 0}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Orders</span>
            <ShoppingBag className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.totalOrders || 0}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Customers</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.totalCustomers || 0}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Payments</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.totalPayments || 0}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Fiscal Docs</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.fiscalDocuments || 0}</div>
        </div>
      </div>

      {/* Staff & Members Table */}
      <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <span>Assigned Restaurant Members & Staff</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Users linked via UserRestaurant membership with scoped RBAC permissions.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Member Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Restaurant Role</th>
                <th className="px-4 py-3">User Status</th>
                <th className="px-4 py-3 text-right">Joined Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {(!members || members.length === 0) ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No members assigned to this restaurant yet.
                  </td>
                </tr>
              ) : (
                members.map((m: any) => (
                  <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white">{m.user?.name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono">{m.user?.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono text-[10px] font-semibold uppercase">
                        {m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          m.user?.active
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-red-500/10 text-red-300'
                        }`}
                      >
                        {m.user?.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500 font-mono">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Restaurant Modal */}
      {data?.restaurant && (
        <PlatformEditRestaurantModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          restaurant={data.restaurant}
          settings={data.settings}
          onSuccess={() => loadDetails()}
        />
      )}
    </div>
  );
};
