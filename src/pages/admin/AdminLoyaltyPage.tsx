import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  Gift,
  KeyRound,
  Pencil,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import {
  loyaltyAdminService,
  type CustomerLoyaltyProfileDto,
  type LoyaltyCustomerListItemDto,
  type LoyaltyOverviewDto,
  type RedemptionDto,
  type RewardDto,
} from '../../services/loyaltyAdminService';

const inputClass =
  'w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const labelClass = 'block text-xs text-zinc-400 font-semibold mb-1.5';
const cardClass = 'p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80';

const TRANSACTION_LABELS: Record<string, string> = {
  GAME_WIN: 'Game Win',
  REWARD_REDEEM: 'Reward Redemption',
  ADMIN_ADJUST: 'Manual Adjustment',
  EXPIRY: 'Expiry',
  REFUND: 'Refund',
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatPoints(amount: number): string {
  return `${amount > 0 ? '+' : ''}${amount}`;
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, accent = 'text-white' }) => (
  <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex items-center gap-4">
    <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center shrink-0">
      <Icon className="w-5 h-5 text-amber-400" />
    </div>
    <div className="min-w-0">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  </div>
);

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  busy,
  onConfirm,
  onCancel,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      role="dialog"
      aria-modal="true"
      className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <button onClick={onCancel} className="text-zinc-500 hover:text-white" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition disabled:opacity-50 ${
            danger ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
          }`}
        >
          {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </motion.div>
  </div>
);

// ---------------------------------------------------------------------------
// Reward form modal
// ---------------------------------------------------------------------------

interface RewardFormState {
  name: string;
  description: string;
  pointsCost: string;
  unlimitedStock: boolean;
  stock: string;
  sortOrder: string;
}

const EMPTY_REWARD: RewardFormState = {
  name: '',
  description: '',
  pointsCost: '100',
  unlimitedStock: true,
  stock: '',
  sortOrder: '0',
};

interface RewardFormModalProps {
  editing: RewardDto | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: RewardFormState) => void;
}

const RewardFormModal: React.FC<RewardFormModalProps> = ({ editing, busy, onClose, onSubmit }) => {
  const [form, setForm] = useState<RewardFormState>(() =>
    editing
      ? {
          name: editing.name,
          description: editing.description ?? '',
          pointsCost: String(editing.pointsCost),
          unlimitedStock: editing.unlimitedStock,
          stock: editing.stock == null ? '' : String(editing.stock),
          sortOrder: String(editing.sortOrder ?? 0),
        }
      : EMPTY_REWARD
  );
  const [error, setError] = useState<string | null>(null);

  const setString = (key: 'name' | 'description' | 'pointsCost' | 'stock' | 'sortOrder', value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleUnlimited = () => {
    setForm((prev) => ({ ...prev, unlimitedStock: !prev.unlimitedStock }));
  };

  const submit = () => {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    const pointsCost = Number(form.pointsCost);
    if (!Number.isInteger(pointsCost) || pointsCost <= 0) {
      setError('Points cost must be a positive whole number.');
      return;
    }
    if (!form.unlimitedStock) {
      const stock = Number(form.stock);
      if (form.stock === '' || !Number.isInteger(stock) || stock < 0) {
        setError('Stock is required and must be a non-negative whole number for limited-stock rewards.');
        return;
      }
    }
    setError(null);
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">{editing ? 'Edit Reward' : 'New Reward'}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Configure the reward catalog item.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setString('name', e.target.value)}
              className={inputClass}
              placeholder="e.g. Free Dessert"
            />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setString('description', e.target.value)}
              className={`${inputClass} min-h-[72px]`}
              placeholder="Optional description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Points Cost</label>
              <input
                type="number"
                min={1}
                value={form.pointsCost}
                onChange={(e) => setString('pointsCost', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setString('sortOrder', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Unlimited Stock</div>
              <p className="text-xs text-zinc-500 mt-0.5">When off, stock is decremented on each redemption.</p>
            </div>
            <button
              type="button"
              onClick={toggleUnlimited}
              aria-pressed={form.unlimitedStock}
              className={`relative inline-flex shrink-0 items-center rounded-full transition-colors ${
                form.unlimitedStock ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
              style={{ width: '52px', height: '28px' }}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  form.unlimitedStock ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {!form.unlimitedStock && (
            <div>
              <label className={labelClass}>Stock</label>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setString('stock', e.target.value)}
                className={inputClass}
                placeholder="Available quantity"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition disabled:opacity-50"
          >
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {editing ? 'Save Changes' : 'Create Reward'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const AdminLoyaltyPage: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const restaurantId = activeRestaurant?.id;

  const [overview, setOverview] = useState<LoyaltyOverviewDto | null>(null);
  const [rewards, setRewards] = useState<RewardDto[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionDto[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Customer detail (drawer) + profile
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerLoyaltyProfileDto | null>(null);

  // Adjust form
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove'>('add');
  const [adjustBusy, setAdjustBusy] = useState(false);

  // Reward modal
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<RewardDto | null>(null);
  const [rewardBusy, setRewardBusy] = useState(false);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  // Customer directory
  const [directory, setDirectory] = useState<LoyaltyCustomerListItemDto[]>([]);
  const [dirSearch, setDirSearch] = useState('');
  const [dirStatus, setDirStatus] = useState<string>('ALL');
  const [dirSort, setDirSort] = useState<string>('newest');
  const [dirPage, setDirPage] = useState(1);
  const [dirPageSize, setDirPageSize] = useState(10);
  const [dirTotal, setDirTotal] = useState(0);
  const [dirTotalPages, setDirTotalPages] = useState(0);
  const [dirLoading, setDirLoading] = useState(false);

  // Customer detail drawer + QR
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrValue, setQrValue] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const data = await loyaltyAdminService.getOverview(restaurantId);
      setOverview(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load loyalty overview.');
    }
  }, [restaurantId]);

  const loadRewards = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const data = await loyaltyAdminService.listRewards(restaurantId);
      setRewards(data.rewards);
    } catch (err: any) {
      setError(err.message || 'Failed to load rewards.');
    }
  }, [restaurantId]);

  const loadRedemptions = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const data = await loyaltyAdminService.listRedemptions(restaurantId);
      setRedemptions(data.redemptions);
    } catch (err: any) {
      setError(err.message || 'Failed to load redemptions.');
    }
  }, [restaurantId]);

  const loadAll = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    await Promise.all([loadOverview(), loadRewards(), loadRedemptions()]);
    setLoading(false);
  }, [restaurantId, loadOverview, loadRewards, loadRedemptions]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const loadDirectory = useCallback(async () => {
    if (!restaurantId) return;
    setDirLoading(true);
    try {
      const data = await loyaltyAdminService.listCustomers(restaurantId, {
        search: dirSearch || undefined,
        status: dirStatus === 'ALL' ? undefined : dirStatus,
        sort: dirSort,
        page: dirPage,
        limit: dirPageSize,
      });
      setDirectory(data.customers);
      setDirTotal(data.pagination.total);
      setDirTotalPages(data.pagination.totalPages);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer directory.');
    } finally {
      setDirLoading(false);
    }
  }, [restaurantId, dirSearch, dirStatus, dirSort, dirPage, dirPageSize]);

  useEffect(() => {
    loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDirectory]);

  const openCustomer = async (item: LoyaltyCustomerListItemDto) => {
    setDrawerOpen(true);
    setQrOpen(false);
    setProfile(null);
    setLookupError(null);
    setAdjustAmount('');
    setAdjustReason('');
    if (!restaurantId) return;
    try {
      const data = await loyaltyAdminService.getCustomer(restaurantId, item.customerId);
      setProfile(data);
    } catch (err: any) {
      setLookupError(err.message || 'Failed to load customer details.');
    }
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const refreshProfile = async (customerId: string) => {
    if (!restaurantId) return;
    try {
      const data = await loyaltyAdminService.getCustomer(restaurantId, customerId);
      setProfile(data);
    } catch (err: any) {
      setLookupError(err.message || 'Failed to refresh customer profile.');
    }
  };

  const submitAdjust = async () => {
    if (!restaurantId || !profile) return;
    setAdjustBusy(true);
    try {
      const amount = Number(adjustAmount);
      const signed = adjustMode === 'add' ? amount : -amount;
      await loyaltyAdminService.adjustPoints(restaurantId, profile.customer.id, {
        amount: signed,
        reason: adjustReason.trim(),
      });
      flash(`Points ${adjustMode === 'add' ? 'added' : 'removed'} successfully.`);
      setAdjustAmount('');
      setAdjustReason('');
      setConfirm(null);
      await Promise.all([refreshProfile(profile.customer.id), loadOverview(), loadDirectory()]);
    } catch (err: any) {
      setError(err.message || 'Failed to adjust points.');
      setConfirm(null);
    } finally {
      setAdjustBusy(false);
    }
  };

  const openAdjustConfirm = () => {
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount < 1) {
      setError('Enter a positive whole number for the point amount.');
      return;
    }
    if (!adjustReason.trim()) {
      setError('A reason is required.');
      return;
    }
    setError(null);
    setConfirm({
      title: adjustMode === 'add' ? 'Add Points' : 'Remove Points',
      message: `${adjustMode === 'add' ? 'Add' : 'Remove'} ${amount} points ${
        adjustMode === 'remove' ? 'from' : 'to'
      } ${profile?.customer.name || 'this customer'} — Reason: ${adjustReason.trim()}`,
      confirmLabel: adjustMode === 'add' ? 'Add Points' : 'Remove Points',
      danger: adjustMode === 'remove',
      action: submitAdjust,
    });
  };

  // --- Reward CRUD ---
  const openCreateReward = () => {
    setEditingReward(null);
    setRewardModalOpen(true);
  };

  const openEditReward = (reward: RewardDto) => {
    setEditingReward(reward);
    setRewardModalOpen(true);
  };

  const submitReward = async (form: {
    name: string;
    description: string;
    pointsCost: string;
    unlimitedStock: boolean;
    stock: string;
    sortOrder: string;
  }) => {
    if (!restaurantId) return;
    setRewardBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        pointsCost: Number(form.pointsCost),
        unlimitedStock: form.unlimitedStock,
        stock: form.unlimitedStock ? null : Number(form.stock),
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editingReward) {
        await loyaltyAdminService.updateReward(restaurantId, editingReward.id, payload);
        flash('Reward updated.');
      } else {
        await loyaltyAdminService.createReward(restaurantId, payload);
        flash('Reward created.');
      }
      setRewardModalOpen(false);
      await Promise.all([loadRewards(), loadOverview()]);
    } catch (err: any) {
      setError(err.message || 'Failed to save reward.');
    } finally {
      setRewardBusy(false);
    }
  };

  const toggleRewardStatus = async (reward: RewardDto) => {
    if (!restaurantId) return;
    try {
      await loyaltyAdminService.setRewardStatus(restaurantId, reward.id, !reward.active);
      flash(reward.active ? 'Reward deactivated.' : 'Reward activated.');
      await Promise.all([loadRewards(), loadOverview()]);
    } catch (err: any) {
      setError(err.message || 'Failed to update reward status.');
    }
  };

  const openDeleteReward = (reward: RewardDto) => {
    setConfirm({
      title: 'Delete Reward',
      message: `Delete "${reward.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      action: async () => {
        if (!restaurantId) return;
        try {
          await loyaltyAdminService.deleteReward(restaurantId, reward.id);
          flash('Reward deleted.');
          setConfirm(null);
          await Promise.all([loadRewards(), loadOverview()]);
        } catch (err: any) {
          setError(err.message || 'Failed to delete reward.');
          setConfirm(null);
        }
      },
    });
  };

  // --- Redemptions ---
  const openRefund = (redemption: RedemptionDto) => {
    setConfirm({
      title: 'Refund Redemption',
      message: `Refund ${redemption.pointsSpent} points for ${redemption.customer?.name || 'customer'} (${redemption.reward?.name || 'reward'})?`,
      confirmLabel: 'Refund',
      action: async () => {
        if (!restaurantId) return;
        try {
          await loyaltyAdminService.refundRedemption(restaurantId, redemption.id);
          flash('Redemption refunded.');
          setConfirm(null);
          await Promise.all([loadRedemptions(), loadOverview()]);
          if (profile) await refreshProfile(profile.customer.id);
        } catch (err: any) {
          setError(err.message || 'Failed to refund redemption.');
          setConfirm(null);
        }
      },
    });
  };

  // --- Identity revoke ---
  const openRevokeIdentity = () => {
    if (!profile) return;
    setConfirm({
      title: 'Revoke Loyalty QR',
      message: `Revoke the loyalty QR token for ${profile.customer.name || 'this customer'}? Their existing QR code will stop working.`,
      confirmLabel: 'Revoke',
      danger: true,
      action: async () => {
        if (!restaurantId) return;
        try {
          await loyaltyAdminService.revokeIdentity(restaurantId, profile.customer.id);
          flash('Loyalty identity revoked.');
          setConfirm(null);
          await Promise.all([refreshProfile(profile.customer.id), loadDirectory()]);
        } catch (err: any) {
          setError(err.message || 'Failed to revoke loyalty identity.');
          setConfirm(null);
        }
      },
    });
  };

  if (loading && !overview) {
    return (
      <div className="p-12 text-center text-zinc-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
        <p className="text-sm">Loading loyalty dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Gift className="w-6 h-6 text-amber-400" />
            Loyalty
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage loyalty customers, rewards, and redemptions for {activeRestaurant?.name || 'this restaurant'}.
          </p>
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Banners */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 1. Overview */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Loyalty Customers" value={overview?.totalLoyaltyCustomers ?? 0} />
          <StatCard icon={Coins} label="Points Issued" value={overview?.totalPointsIssued ?? 0} accent="text-emerald-400" />
          <StatCard icon={Wallet} label="Points Redeemed" value={overview?.totalPointsRedeemed ?? 0} accent="text-amber-300" />
          <StatCard icon={Gift} label="Active Rewards" value={overview?.activeRewards ?? 0} />
        </div>

        {overview?.recentRedemptions && overview.recentRedemptions.length > 0 && (
          <div className={cardClass}>
            <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Recent Redemptions
            </div>
            <div className="space-y-2">
              {overview.recentRedemptions.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs text-zinc-400">
                  <div className="min-w-0 truncate">
                    <span className="text-white font-medium">{r.customer?.name || 'Guest'}</span>
                    <span className="text-zinc-600"> · {r.reward?.name || 'Reward'}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-amber-300">-{r.pointsSpent}</span>
                    <span className="text-zinc-600">{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      {/* 2. Customer directory */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Users className="w-4 h-4 text-amber-400" />
          <span>Customer Directory</span>
          <span className="text-zinc-600">({dirTotal})</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search name, loyalty code, NIF, or phone..."
              value={dirSearch}
              onChange={(e) => {
                setDirSearch(e.target.value);
                setDirPage(1);
              }}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>
          <select
            value={dirStatus}
            onChange={(e) => {
              setDirStatus(e.target.value);
              setDirPage(1);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="REVOKED">Revoked</option>
          </select>
          <select
            value={dirSort}
            onChange={(e) => {
              setDirSort(e.target.value);
              setDirPage(1);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
          >
            <option value="newest">Newest</option>
            <option value="lastActivity">Last Activity</option>
            <option value="points">Points</option>
          </select>
        </div>

        {dirLoading && directory.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
            <p className="text-sm">Loading customer directory...</p>
          </div>
        ) : directory.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
            <Users className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
            <p className="text-sm">No loyalty customers found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Loyalty Code</th>
                  <th className="p-4 text-right">Points</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Last Activity</th>
                  <th className="p-4 text-right">Orders</th>
                  <th className="p-4 text-right">Spend</th>
                  <th className="p-4 text-right">Redeemed</th>
                  <th className="p-4 text-right">QR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {directory.map((c) => (
                  <tr
                    key={c.customerId}
                    onClick={() => openCustomer(c)}
                    className="hover:bg-zinc-800/30 transition cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="font-medium text-white">{c.name || 'Guest Customer'}</div>
                      <div className="text-[11px] text-zinc-500">{c.restaurantName || '—'}</div>
                    </td>
                    <td className="p-4 font-mono text-amber-300">{c.loyaltyCode}</td>
                    <td className="p-4 text-right font-mono font-bold text-white">{c.balance}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          c.identityStatus === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {c.identityStatus}
                      </span>
                    </td>
                    <td className="p-4 text-zinc-400">{formatDate(c.lastActivityAt)}</td>
                    <td className="p-4 text-right text-zinc-400">{c.totalOrders}</td>
                    <td className="p-4 text-right font-mono text-zinc-300">€{c.totalSpend.toFixed(2)}</td>
                    <td className="p-4 text-right text-zinc-400">{c.rewardsRedeemed}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const slug = activeRestaurant?.slug || '';
                          setQrValue(`${window.location.origin}/menu/${slug}?loyalty=${encodeURIComponent(c.loyaltyCode)}`);
                          setQrOpen(true);
                        }}
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 transition"
                        title="View loyalty QR"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dirTotalPages > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
            <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
              <span>
                Page {dirPage} of {dirTotalPages} · {dirTotal} records
              </span>
              <label className="flex items-center gap-1.5">
                <span>Show</span>
                <select
                  value={dirPageSize}
                  onChange={(e) => {
                    setDirPageSize(Number(e.target.value));
                    setDirPage(1);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>per page</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDirPage((p) => Math.max(1, p - 1))}
                disabled={dirPage <= 1}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-zinc-400">{dirPage} / {dirTotalPages}</span>
              <button
                onClick={() => setDirPage((p) => Math.min(dirTotalPages, p + 1))}
                disabled={dirPage >= dirTotalPages}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </motion.section>

      {/* Customer detail drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="relative w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Customer Details</h3>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {lookupError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{lookupError}</span>
                  </div>
                )}

                {!profile ? (
                  <div className="p-12 text-center text-zinc-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
                    <p className="text-sm">Loading customer details...</p>
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className={cardClass}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">{profile.customer.name || 'Guest Customer'}</div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {[profile.customer.email, profile.customer.phone].filter(Boolean).join(' · ') || 'No contact details'}
                          </div>
                          {profile.customer.loyaltyCode && (
                            <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 font-mono text-amber-300 text-xs">
                              <QrCode className="w-3.5 h-3.5" />
                              {profile.customer.loyaltyCode}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Balance</div>
                            <div className="text-2xl font-bold text-amber-300">{profile.customer.balance}</div>
                          </div>
                          <div className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                            profile.identity?.active
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                          }`}>
                            <QrCode className="w-4 h-4" />
                            {profile.identity?.active ? 'QR Active' : profile.identity ? 'QR Revoked' : 'No QR Identity'}
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500 uppercase">Registered</div>
                          <div className="text-xs font-semibold text-white mt-1">{formatDate(profile.customer.registrationDate)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500 uppercase">Last Activity</div>
                          <div className="text-xs font-semibold text-white mt-1">{formatDate(profile.customer.lastActivityAt)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500 uppercase">Orders / Spend</div>
                          <div className="text-xs font-semibold text-white mt-1">
                            {profile.customer.totalOrders} · €{profile.customer.totalSpend.toFixed(2)}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500 uppercase">Rewards Redeemed</div>
                          <div className="text-xs font-semibold text-white mt-1">{profile.customer.rewardsRedeemed}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end gap-2">
                        {profile.customer.qrUrl && (
                          <button
                            onClick={() => {
                              setQrValue(
                                profile.customer.qrUrl!.startsWith('/')
                                  ? `${window.location.origin}${profile.customer.qrUrl}`
                                  : profile.customer.qrUrl!
                              );
                              setQrOpen(true);
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            Show QR
                          </button>
                        )}
                        {profile.identity?.active && (
                          <button
                            onClick={openRevokeIdentity}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-red-400 transition"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Revoke QR
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Adjust form */}
                    <div className={cardClass}>
                      <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Coins className="w-4 h-4 text-amber-400" />
                        Manual Point Adjustment
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className={labelClass}>Action</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setAdjustMode('add')}
                              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${
                                adjustMode === 'add'
                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdjustMode('remove')}
                              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${
                                adjustMode === 'remove'
                                  ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Amount</label>
                          <input
                            type="number"
                            min={1}
                            value={adjustAmount}
                            onChange={(e) => setAdjustAmount(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Reason</label>
                          <input
                            type="text"
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                            className={inputClass}
                            placeholder="e.g. Goodwill credit"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={openAdjustConfirm}
                          disabled={adjustBusy}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Review Adjustment
                        </button>
                      </div>
                    </div>

                    {/* Ledger */}
                    <div className={cardClass}>
                      <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        Points History
                      </div>
                      {profile.ledger.length === 0 ? (
                        <p className="text-xs text-zinc-500">No point transactions yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-zinc-300">
                            <thead className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-zinc-800">
                              <tr>
                                <th className="py-2 pr-3">Type</th>
                                <th className="py-2 pr-3">Amount</th>
                                <th className="py-2 pr-3">Balance After</th>
                                <th className="py-2">Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60">
                              {profile.ledger.map((entry) => (
                                <tr key={entry.id}>
                                  <td className="py-2 pr-3 text-zinc-400">{TRANSACTION_LABELS[entry.type] || entry.type}</td>
                                  <td className={`py-2 pr-3 font-mono ${entry.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {formatPoints(entry.amount)}
                                  </td>
                                  <td className="py-2 pr-3 font-mono text-white">{entry.balanceAfter}</td>
                                  <td className="py-2 text-zinc-500">{formatDate(entry.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Redemptions */}
                    <div className={cardClass}>
                      <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Gift className="w-4 h-4 text-amber-400" />
                        Rewards Redeemed
                      </div>
                      {profile.redemptions.length === 0 ? (
                        <p className="text-xs text-zinc-500">No redemptions for this customer.</p>
                      ) : (
                        <div className="space-y-2">
                          {profile.redemptions.map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-xs text-zinc-400">
                              <span className="text-white">{r.reward?.name || 'Reward'}</span>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-amber-300">-{r.pointsSpent}</span>
                                <span className="text-zinc-600">{r.status}</span>
                                <span className="text-zinc-600">{formatDate(r.redeemedAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR modal */}
      <AnimatePresence>
        {qrOpen && qrValue && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setQrOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative w-full max-w-sm bg-white rounded-2xl p-6 text-center"
            >
              <div className="flex justify-center">
                <QRCodeSVG value={qrValue} size={220} bgColor="#ffffff" fgColor="#18181b" level="M" />
              </div>
              <p className="mt-4 text-[11px] text-zinc-600 break-all font-mono">{qrValue}</p>
              <button
                onClick={() => setQrOpen(false)}
                className="mt-4 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Rewards management */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Gift className="w-4 h-4 text-amber-400" />
            <span>Rewards</span>
            <span className="text-zinc-600">({rewards.length})</span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
          <button
            onClick={openCreateReward}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            New Reward
          </button>
        </div>

        {rewards.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
            <Gift className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
            <p className="text-sm">No rewards configured yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward) => (
              <div key={reward.id} className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{reward.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${reward.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {reward.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{reward.description || 'No description'}</p>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-zinc-400">
                    <span className="font-mono text-amber-300">{reward.pointsCost} pts</span>
                    <span>{reward.unlimitedStock ? 'Unlimited stock' : `${reward.stock ?? 0} in stock`}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleRewardStatus(reward)}
                    title={reward.active ? 'Deactivate' : 'Activate'}
                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition"
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditReward(reward)}
                    title="Edit"
                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openDeleteReward(reward)}
                    title="Delete"
                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 text-zinc-400 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      {/* 5. Redemptions */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Redemptions</span>
          <span className="text-zinc-600">({redemptions.length})</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        {redemptions.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
            <Trophy className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
            <p className="text-sm">No redemptions yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Reward</th>
                  <th className="p-4 text-center">Points</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Redeemed</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {redemptions.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/30 transition">
                    <td className="p-4 font-medium text-white">{r.customer?.name || 'Guest'}</td>
                    <td className="p-4 text-zinc-400">{r.reward?.name || '—'}</td>
                    <td className="p-4 text-center font-mono text-amber-300">-{r.pointsSpent}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        r.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-4 text-zinc-400">{formatDate(r.redeemedAt || r.createdAt)}</td>
                    <td className="p-4 text-right">
                      {r.status === 'COMPLETED' ? (
                        <button
                          onClick={() => openRefund(r)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-amber-300 transition"
                        >
                          Refund
                        </button>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      {/* Modals */}
      <AnimatePresence>
        {rewardModalOpen && (
          <RewardFormModal
            key="reward-form"
            editing={editingReward}
            busy={rewardBusy}
            onClose={() => setRewardModalOpen(false)}
            onSubmit={submitReward}
          />
        )}
        {confirm && (
          <ConfirmDialog
            key="confirm"
            title={confirm.title}
            message={confirm.message}
            confirmLabel={confirm.confirmLabel}
            danger={confirm.danger}
            busy={adjustBusy}
            onConfirm={confirm.action}
            onCancel={() => setConfirm(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
