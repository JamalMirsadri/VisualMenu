import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Plus,
  RotateCcw,
  Play,
  Pause,
  XCircle,
  Gift,
  Ban,
} from 'lucide-react';
import { platformService } from '../../services/platformService';

interface SubscriptionCardProps {
  restaurantId: string;
  restaurantName: string;
}

export const PlatformRestaurantSubscriptionCard: React.FC<SubscriptionCardProps> = ({
  restaurantId,
  restaurantName,
}) => {
  const [subscription, setSubscription] = useState<any>(null);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal / Action states
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendDays, setExtendDays] = useState(7);
  const [extendReason, setExtendReason] = useState('');

  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [changePlanReason, setChangePlanReason] = useState('');

  // Phase 13C: Manual Assign & Revoke states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignType, setAssignType] = useState<'MANUAL' | 'COMPLIMENTARY'>('MANUAL');
  const [assignPrice, setAssignPrice] = useState('29.00');
  const [assignDurationMonths, setAssignDurationMonths] = useState(1);
  const [assignReason, setAssignReason] = useState('');

  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');

  // Tab views
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'payments' | 'requests'>('details');

  const loadSubscription = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await platformService.getRestaurantSubscription(restaurantId);
      setSubscription(res);
    } catch (err: any) {
      console.error('Failed to load restaurant subscription:', err);
      setError(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const plans = await platformService.getSubscriptionPlans();
      setAvailablePlans(plans || []);
    } catch (err) {
      console.error('Failed to load plans:', err);
    }
  };

  useEffect(() => {
    if (restaurantId) {
      loadSubscription();
      loadPlans();
    }
  }, [restaurantId]);

  const handleActivate = async () => {
    if (!window.confirm(`Manually activate subscription for "${restaurantName}"?`)) return;
    try {
      setActionLoading(true);
      await platformService.activateRestaurantSubscription(restaurantId, 'Manual Platform Admin activation');
      await loadSubscription();
    } catch (err: any) {
      alert(`Activation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!window.confirm(`Restore subscription access for "${restaurantName}"?`)) return;
    try {
      setActionLoading(true);
      await platformService.restoreRestaurantSubscription(restaurantId, 'Restored by Platform Admin');
      await loadSubscription();
    } catch (err: any) {
      alert(`Restoration failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendReason.trim()) {
      alert('A reason is required to suspend a subscription.');
      return;
    }
    try {
      setActionLoading(true);
      await platformService.suspendRestaurantSubscription(restaurantId, suspendReason.trim());
      setShowSuspendModal(false);
      setSuspendReason('');
      await loadSubscription();
    } catch (err: any) {
      alert(`Suspension failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await platformService.extendRestaurantSubscription(
        restaurantId,
        extendDays,
        extendReason.trim() || `Platform Admin extension (+${extendDays} days)`
      );
      setShowExtendModal(false);
      setExtendReason('');
      await loadSubscription();
    } catch (err: any) {
      alert(`Extension failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) {
      alert('Please select a plan.');
      return;
    }
    try {
      setActionLoading(true);
      await platformService.changeRestaurantSubscriptionPlan(
        restaurantId,
        selectedPlanId,
        changePlanReason.trim() || 'Plan changed by Platform Admin'
      );
      setShowChangePlanModal(false);
      setSelectedPlanId('');
      setChangePlanReason('');
      await loadSubscription();
    } catch (err: any) {
      alert(`Failed to change plan: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignPlanId) {
      alert('Please select a plan to assign.');
      return;
    }
    if (!assignReason.trim()) {
      alert('A reason is mandatory for manual or complimentary subscription assignment.');
      return;
    }
    try {
      setActionLoading(true);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + assignDurationMonths);
      await platformService.assignRestaurantSubscription(restaurantId, {
        planId: assignPlanId,
        assignmentType: assignType,
        agreedPrice: assignType === 'COMPLIMENTARY' ? 0 : parseFloat(assignPrice || '0'),
        periodEnd: endDate.toISOString(),
        reason: assignReason.trim(),
      });
      setShowAssignModal(false);
      setAssignReason('');
      await loadSubscription();
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeReason.trim()) {
      alert('A mandatory reason is required to revoke subscription access.');
      return;
    }
    try {
      setActionLoading(true);
      await platformService.revokeRestaurantSubscription(restaurantId, revokeReason.trim());
      setShowRevokeModal(false);
      setRevokeReason('');
      await loadSubscription();
    } catch (err: any) {
      alert(`Revocation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelAutoRenew = async () => {
    const reason = window.prompt('Enter reason for cancelling auto-renew (subscription remains active until period end):');
    if (!reason || !reason.trim()) return;
    try {
      setActionLoading(true);
      await platformService.cancelAutoRenewRestaurantSubscription(restaurantId, reason.trim());
      await loadSubscription();
    } catch (err: any) {
      alert(`Cancel auto-renew failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewRequest = async (requestId: string, approved: boolean) => {
    let reviewNotes = '';
    if (!approved) {
      const promptNotes = window.prompt('Enter rejection reason (mandatory):');
      if (!promptNotes || !promptNotes.trim()) return;
      reviewNotes = promptNotes.trim();
    } else {
      reviewNotes = 'Approved by Platform Admin. Payment required for activation.';
    }
    try {
      setActionLoading(true);
      await platformService.reviewSubscriptionRequest(
        requestId,
        approved ? 'APPROVE' : 'REJECT',
        reviewNotes
      );
      await loadSubscription();
    } catch (err: any) {
      alert(`Review request failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-lg flex items-center justify-center min-h-[200px]">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-lg space-y-4">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertCircle className="w-5 h-5" />
          <h2 className="text-base font-bold text-white">SaaS Subscription & Billing Isolation</h2>
        </div>
        <p className="text-xs text-zinc-400">
          {error || 'No active subscription found. Newly provisioned restaurants require an explicit subscription request or manual assignment.'}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (availablePlans.length > 0 && !assignPlanId) setAssignPlanId(availablePlans[0].id);
              setShowAssignModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-zinc-950 shadow-md shadow-amber-500/20"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Assign Subscription Plan</span>
          </button>
          <button
            onClick={loadSubscription}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>

        {/* Modal: Assign Subscription (When empty) */}
        {showAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 text-left">
            <div className="w-full max-w-md p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Gift className="w-4 h-4 text-amber-400" />
                <span>Assign Restaurant Subscription</span>
              </h3>
              <form onSubmit={handleAssign} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Select Plan</label>
                  <select
                    required
                    value={assignPlanId}
                    onChange={(e) => {
                      setAssignPlanId(e.target.value);
                      const p = availablePlans.find((pl) => pl.id === e.target.value);
                      if (p && assignType === 'MANUAL') setAssignPrice(String(p.price));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">-- Select a Plan --</option>
                    {availablePlans.filter((p) => p.active).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.billingInterval}) — €{p.price}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Assignment Type</label>
                    <select
                      value={assignType}
                      onChange={(e: any) => {
                        setAssignType(e.target.value);
                        if (e.target.value === 'COMPLIMENTARY') setAssignPrice('0.00');
                        else {
                          const p = availablePlans.find((pl) => pl.id === assignPlanId);
                          setAssignPrice(p ? String(p.price) : '29.00');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                    >
                      <option value="MANUAL">MANUAL (Agreed Price)</option>
                      <option value="COMPLIMENTARY">COMPLIMENTARY (€0)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Duration (Months)</label>
                    <select
                      value={assignDurationMonths}
                      onChange={(e) => setAssignDurationMonths(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                    >
                      <option value={1}>1 Month</option>
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months (1 Year)</option>
                    </select>
                  </div>
                </div>

                {assignType === 'MANUAL' && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Agreed Monthly Price (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={assignPrice}
                      onChange={(e) => setAssignPrice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Mandatory Assignment Reason
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Contractual agreement #102, sales partnership promo, VIP pilot"
                    value={assignReason}
                    onChange={(e) => setAssignReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-zinc-950 shadow-md"
                  >
                    {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'GRACE_PERIOD':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'PAST_DUE':
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      case 'EXPIRED':
        return 'bg-red-500/15 text-red-300 border-red-500/30';
      case 'SUSPENDED':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'CANCELLED':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      case 'PENDING':
      default:
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    }
  };

  const formatCurrency = (amount: any, currency = 'EUR') => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(num);
  };

  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <CreditCard className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">SaaS Subscription & Billing</h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold border ${getStatusBadge(
                subscription.status
              )}`}
            >
              {subscription.status}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Tenant-scoped revenue billing lifecycle, access gate enforcement, and historical audit trail.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (availablePlans.length > 0 && !assignPlanId) setAssignPlanId(availablePlans[0].id);
              setShowAssignModal(true);
            }}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Assign Plan</span>
          </button>

          {subscription.status === 'PENDING' && (
            <button
              onClick={handleActivate}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Activate</span>
            </button>
          )}

          {subscription.status === 'SUSPENDED' && (
            <button
              onClick={handleRestore}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
          )}

          {(subscription.status === 'ACTIVE' || subscription.status === 'GRACE_PERIOD') && (
            <>
              <button
                onClick={() => setShowRevokeModal(true)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-300 text-xs font-semibold transition-all cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Revoke Access</span>
              </button>

              <button
                onClick={() => setShowSuspendModal(true)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold transition-all cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Suspend</span>
              </button>
            </>
          )}

          {subscription.autoRenew && (
            <button
              onClick={handleCancelAutoRenew}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5 text-zinc-400" />
              <span>Cancel Auto-Renew</span>
            </button>
          )}

          <button
            onClick={() => setShowExtendModal(true)}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Extend (+Days)</span>
          </button>

          <button
            onClick={() => setShowChangePlanModal(true)}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <span>Change Plan</span>
          </button>
        </div>
      </div>

      {/* Core Subscription Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Subscription Plan</span>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                subscription.assignmentType === 'COMPLIMENTARY'
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : subscription.assignmentType === 'MANUAL'
                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {subscription.assignmentType || 'PAID'}
            </span>
          </div>
          <div className="font-bold text-white text-sm">{subscription.plan?.name || 'Custom Plan'}</div>
          <div className="text-amber-400 font-mono text-xs font-semibold">
            {formatCurrency(subscription.agreedPrice || subscription.plan?.price, subscription.agreedCurrency || 'EUR')}{' '}
            <span className="text-zinc-500 text-[10px]">/{subscription.plan?.billingInterval?.toLowerCase()}</span>
          </div>
          {subscription.assignmentReason && (
            <div className="text-[10px] text-zinc-400 font-mono italic truncate mt-1" title={subscription.assignmentReason}>
              Note: {subscription.assignmentReason}
            </div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Current Period</span>
          <div className="text-zinc-300 font-mono">
            {new Date(subscription.currentPeriodStart).toLocaleDateString()} –{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </div>
          <div className="text-[11px] font-semibold text-zinc-400">
            {subscription.daysRemaining > 0 ? (
              <span className="text-emerald-400">{subscription.daysRemaining} days remaining</span>
            ) : subscription.daysRemaining === 0 ? (
              <span className="text-amber-400">Expires today</span>
            ) : (
              <span className="text-red-400">Expired {Math.abs(subscription.daysRemaining)} days ago</span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Auto-Renew & Provider</span>
          <div className="font-semibold text-white flex items-center gap-1.5">
            {subscription.autoRenew ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-Renew ON</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-zinc-400">Auto-Renew OFF</span>
              </>
            )}
          </div>
          <div className="text-zinc-400 font-mono text-[11px]">Provider: {subscription.provider}</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Grace & Expiry Info</span>
          <div className="text-zinc-300 font-mono">
            {subscription.graceEndsAt
              ? `Grace ends: ${new Date(subscription.graceEndsAt).toLocaleDateString()}`
              : `Grace: ${subscription.plan?.gracePeriodDays || 7} days`}
          </div>
          <div className="text-[11px] text-zinc-500">
            {subscription.trialEndsAt
              ? `Trial ends: ${new Date(subscription.trialEndsAt).toLocaleDateString()}`
              : 'No trial active'}
          </div>
        </div>
      </div>

      {/* Tabs: Details / Billing / Event Timeline */}
      <div className="space-y-4">
        <div className="flex border-b border-zinc-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'details'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Overview & Invoices ({subscription.invoices?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'payments'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Subscription Payments ({subscription.payments?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'history'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Audit Events Timeline ({subscription.events?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'requests'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Subscription Requests ({subscription.requests?.length || 0})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'details' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">SaaS Invoices</h4>
            {(!subscription.invoices || subscription.invoices.length === 0) ? (
              <p className="text-xs text-zinc-500 py-4 text-center">No invoices generated for this subscription yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2">Subtotal</th>
                      <th className="px-3 py-2">Tax</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {subscription.invoices.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 font-mono text-amber-400">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2 text-zinc-400 font-mono text-[11px]">
                          {new Date(inv.periodStart).toLocaleDateString()} – {new Date(inv.periodEnd).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{formatCurrency(inv.subtotal, inv.currency)}</td>
                        <td className="px-3 py-2 text-zinc-400">{formatCurrency(inv.tax, inv.currency)}</td>
                        <td className="px-3 py-2 font-semibold text-white">{formatCurrency(inv.total, inv.currency)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-500 font-mono">
                          {new Date(inv.issuedAt || inv.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Payment Transactions</h4>
            {(!subscription.payments || subscription.payments.length === 0) ? (
              <p className="text-xs text-zinc-500 py-4 text-center">No subscription payment transactions recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Transaction ID</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Provider</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Failure Reason</th>
                      <th className="px-3 py-2 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {subscription.payments.map((p: any) => (
                      <tr key={p.id} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 font-mono text-zinc-300">
                          {p.providerTransactionId || p.id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-white">{formatCurrency(p.amount, p.currency)}</td>
                        <td className="px-3 py-2 text-zinc-400 font-mono">{p.provider}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              p.status === 'SUCCEEDED'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : p.status === 'FAILED'
                                ? 'bg-red-500/15 text-red-300'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-500 italic">{p.failureReason || '—'}</td>
                        <td className="px-3 py-2 text-right text-zinc-500 font-mono">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Subscription Events & Audit</h4>
            {(!subscription.events || subscription.events.length === 0) ? (
              <p className="text-xs text-zinc-500 py-4 text-center">No lifecycle events recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {subscription.events.map((evt: any) => (
                  <div
                    key={evt.id}
                    className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400 text-[11px]">{evt.eventType}</span>
                        {evt.fromStatus && evt.toStatus && (
                          <span className="text-[10px] text-zinc-400 font-mono">
                            ({evt.fromStatus} → {evt.toStatus})
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 text-[11px]">{evt.reason || 'No description provided'}</p>
                    </div>
                    <div className="text-right text-zinc-500 font-mono text-[10px] shrink-0">
                      <div>{evt.actor ? `${evt.actor.name} (${evt.actor.email})` : 'System / Auto'}</div>
                      <div>{new Date(evt.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Tenant Subscription Requests ({subscription.requests?.length || 0})
              </h4>
            </div>

            {(!subscription.requests || subscription.requests.length === 0) ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No subscription requests filed by this restaurant yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Requested Date</th>
                      <th className="px-3 py-2">Plan</th>
                      <th className="px-3 py-2">Requester</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Notes</th>
                      <th className="px-3 py-2 text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {subscription.requests.map((r: any) => (
                      <tr key={r.id} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-zinc-400 font-mono text-[11px]">
                          {new Date(r.requestedAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 font-semibold text-white">
                          {r.requestedPlan?.name || 'Plan'}
                          <span className="text-zinc-500 text-[10px] block font-normal">
                            €{r.requestedPlan?.price} / {r.requestedPlan?.billingInterval?.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.requester?.name || r.requester?.email || 'Owner'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              r.status === 'PAID' || r.status === 'APPROVED'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : r.status === 'PAYMENT_REQUIRED'
                                ? 'bg-sky-500/15 text-sky-300'
                                : r.status === 'REJECTED'
                                ? 'bg-red-500/15 text-red-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-400 text-[11px] max-w-xs">
                          {r.notes && <div className="text-zinc-300">&quot;{r.notes}&quot;</div>}
                          {r.reviewNotes && (
                            <div className="text-amber-400 text-[10px] font-mono mt-0.5">
                              Review: {r.reviewNotes}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleReviewRequest(r.id, true)}
                                disabled={actionLoading}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-all"
                              >
                                Approve Payment
                              </button>
                              <button
                                onClick={() => handleReviewRequest(r.id, false)}
                                disabled={actionLoading}
                                className="px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 font-semibold text-[11px] transition-all"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-500 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Extend Subscription */}
      {showExtendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Grant Subscription Extension</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Grant a manual extension without altering historical invoices. This action will be audited.
            </p>

            <form onSubmit={handleExtend} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Extension Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {[7, 14, 30].map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setExtendDays(d)}
                      className={`py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                        extendDays === d
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      +{d} Days
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Reason for Extension</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Courtesy trial extension / Sales agreement"
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExtendModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-semibold text-black cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  {actionLoading ? 'Extending...' : `Extend +${extendDays} Days`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Suspend Subscription */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
              <Pause className="w-4 h-4" />
              <span>Suspend Subscription</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Suspends administrative access immediately for &quot;{restaurantName}&quot;. Public menu remains active.
            </p>

            <form onSubmit={handleSuspend} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Reason for Suspension</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Non-payment, terms violation, requested hold"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-red-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSuspendModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer shadow-lg shadow-red-600/20"
                >
                  {actionLoading ? 'Suspending...' : 'Confirm Suspension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change Plan */}
      {showChangePlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span>Change Subscription Plan</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Select a new plan. Future billing will use this plan. Historical invoices will remain immutable.
            </p>

            <form onSubmit={handleChangePlan} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Select New Plan</label>
                <select
                  required
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                >
                  <option value="">-- Select a Plan --</option>
                  {availablePlans
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.billingInterval}) — {formatCurrency(p.price, p.currency)}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Reason for Change</label>
                <input
                  type="text"
                  placeholder="e.g. Customer requested upgrade to Professional"
                  value={changePlanReason}
                  onChange={(e) => setChangePlanReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePlanModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-semibold text-black cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  {actionLoading ? 'Updating...' : 'Apply Plan Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Revoke Access */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
              <Ban className="w-4 h-4" />
              <span>Revoke Subscription Access</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Immediately revokes subscription access for &quot;{restaurantName}&quot;. Administration and public menus will be blocked.
            </p>

            <form onSubmit={handleRevoke} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Mandatory Revocation Reason
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Non-payment default, breach of terms, operational dispute"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-red-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white shadow-lg shadow-red-600/20"
                >
                  {actionLoading ? 'Revoking...' : 'Confirm Immediate Revoke'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign Subscription */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 text-left">
          <div className="w-full max-w-md p-6 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-400" />
              <span>Assign / Replace Restaurant Subscription</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Manually assign or replace a plan for &quot;{restaurantName}&quot;. An audit record will be logged.
            </p>

            <form onSubmit={handleAssign} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Select Plan</label>
                <select
                  required
                  value={assignPlanId}
                  onChange={(e) => {
                    setAssignPlanId(e.target.value);
                    const p = availablePlans.find((pl) => pl.id === e.target.value);
                    if (p && assignType === 'MANUAL') setAssignPrice(String(p.price));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                >
                  <option value="">-- Select a Plan --</option>
                  {availablePlans.filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.billingInterval}) — €{p.price}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Assignment Type</label>
                  <select
                    value={assignType}
                    onChange={(e: any) => {
                      setAssignType(e.target.value);
                      if (e.target.value === 'COMPLIMENTARY') setAssignPrice('0.00');
                      else {
                        const p = availablePlans.find((pl) => pl.id === assignPlanId);
                        setAssignPrice(p ? String(p.price) : '29.00');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                  >
                    <option value="MANUAL">MANUAL (Agreed Price)</option>
                    <option value="COMPLIMENTARY">COMPLIMENTARY (€0)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Duration (Months)</label>
                  <select
                    value={assignDurationMonths}
                    onChange={(e) => setAssignDurationMonths(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                  >
                    <option value={1}>1 Month</option>
                    <option value={3}>3 Months</option>
                    <option value={6}>6 Months</option>
                    <option value={12}>12 Months (1 Year)</option>
                  </select>
                </div>
              </div>

              {assignType === 'MANUAL' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Agreed Monthly Price (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={assignPrice}
                    onChange={(e) => setAssignPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Mandatory Assignment Reason
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Sales partnership agreement, VIP courtesy access, offline payment"
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-zinc-950 shadow-md"
                >
                  {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
