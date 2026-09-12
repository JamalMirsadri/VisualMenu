import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  subscriptionService,
  type SubscriptionDetails,
  type SubscriptionPayment,
  type SubscriptionInvoice,
  type SubscriptionEvent,
  type SubscriptionPlan,
  type SubscriptionRequest,
} from '../../services/subscriptionService';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  RefreshCw,
  FileText,
  History,
  ArrowRight,
  XCircle,
  Send,
  Zap,
  Gift,
  Award,
} from 'lucide-react';

export const AdminSubscriptionPage: React.FC = () => {
  const { activeRestaurant, refreshSubscription } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [requestNotes, setRequestNotes] = useState('');

  const loadData = async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      const [subData, paymentsData, eventsData, plansData, requestsData] = await Promise.all([
        subscriptionService.getSubscription(activeRestaurant.id).catch(() => null),
        subscriptionService.getPayments(activeRestaurant.id).catch(() => ({ payments: [], invoices: [] })),
        subscriptionService.getHistory(activeRestaurant.id).catch(() => []),
        subscriptionService.getPlans().catch(() => []),
        subscriptionService.getRequests(activeRestaurant.id).catch(() => []),
      ]);

      setSubscription(subData);
      setPayments(paymentsData.payments);
      setInvoices(paymentsData.invoices);
      setEvents(eventsData);
      setPlans(plansData);
      setRequests(requestsData);
      if (plansData.length > 0 && !selectedPlanId) {
        setSelectedPlanId(plansData[0].id);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load subscription data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRestaurant?.id]);

  const handleRenew = async () => {
    if (!activeRestaurant?.id) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await subscriptionService.renew(activeRestaurant.id);
      setFeedback({ type: 'success', message: 'Subscription successfully renewed!' });
      await refreshSubscription();
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Renewal failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!activeRestaurant?.id || !subscription) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      if (subscription.autoRenew) {
        await subscriptionService.cancelAutoRenew(activeRestaurant.id, 'User cancelled auto-renewal');
        setFeedback({ type: 'success', message: 'Auto-renewal has been cancelled. Access remains active until period end.' });
      } else {
        await subscriptionService.resumeAutoRenew(activeRestaurant.id);
        setFeedback({ type: 'success', message: 'Auto-renewal resumed successfully.' });
      }
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update auto-renewal' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurant?.id || !selectedPlanId) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await subscriptionService.requestSubscription(
        activeRestaurant.id,
        selectedPlanId,
        requestNotes.trim() || undefined
      );
      setShowRequestModal(false);
      setRequestNotes('');
      setFeedback({ type: 'success', message: 'Subscription request submitted successfully! Pending platform review.' });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit subscription request' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivatePayment = async (requestId?: string) => {
    if (!activeRestaurant?.id) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const req = requests.find((r) => r.id === requestId) || requests.find((r) => r.status === 'PAYMENT_REQUIRED');
      const plan = req?.requestedPlan || plans.find((p) => p.id === selectedPlanId) || plans[0];
      await subscriptionService.activateWithPayment(activeRestaurant.id, {
        planId: plan?.id || selectedPlanId,
        amount: Number(plan?.price || 29),
        currency: plan?.currency || 'EUR',
        requestId: req?.id,
      });
      setFeedback({ type: 'success', message: 'Payment confirmed! Subscription is now ACTIVE with full access.' });
      await refreshSubscription();
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Activation failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (!activeRestaurant?.id) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await subscriptionService.createCheckout(activeRestaurant.id, plan.code);
      // In mock provider, checkout immediately triggers or renews
      await subscriptionService.renew(activeRestaurant.id, Number(plan.price));
      setShowPlanModal(false);
      setFeedback({ type: 'success', message: `Plan updated to ${plan.name}!` });
      await refreshSubscription();
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Plan change failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const getAssignmentBadge = (type?: string) => {
    switch (type) {
      case 'COMPLIMENTARY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-300">
            <Gift className="w-3 h-3 text-purple-400" /> Complimentary Plan
          </span>
        );
      case 'MANUAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-300">
            <Award className="w-3 h-3 text-blue-400" /> Platform Assigned
          </span>
        );
      case 'PAID':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <CreditCard className="w-3 h-3" /> Standard Paid Plan
          </span>
        );
    }
  };

  const getRequestStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3" /> Awaiting Review
          </span>
        );
      case 'PAYMENT_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 animate-pulse">
            <CreditCard className="w-3 h-3" /> Payment Required
          </span>
        );
      case 'PAID':
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Approved & Paid
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            {status}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Active
          </span>
        );
      case 'GRACE_PERIOD':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> Grace Period
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400">
            <XCircle className="w-3.5 h-3.5" /> Expired
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 border border-red-500/40 text-red-300">
            <ShieldAlert className="w-3.5 h-3.5" /> Suspended
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-zinc-400">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mb-3" />
        <p className="text-sm">Loading subscription and billing overview...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-tight">
            SaaS Subscription & Billing
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your restaurant platform plan, payment methods, and financial history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold tracking-wider uppercase transition-all shadow-md shadow-sky-600/20"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Request Subscription</span>
          </button>
          <button
            onClick={() => setShowPlanModal(true)}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold tracking-wider uppercase transition-all"
          >
            Change Plan
          </button>
          <button
            onClick={handleRenew}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-wide transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
            <span>Renew Subscription</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Inactive Subscription Warning Banner */}
      {(!subscription || (subscription.status !== 'ACTIVE' && subscription.status !== 'GRACE_PERIOD')) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-200">
                Subscription Required — Administrative & Public Menu Operations Locked
              </h3>
              <p className="text-xs text-amber-300/80 mt-1">
                Your restaurant status is <span className="font-mono font-bold uppercase">{subscription?.status || 'NO_SUBSCRIPTION'}</span>.
                Operational APIs (foods, categories, floor plan, orders, settings) and customer ordering menus are locked until an active subscription is activated.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {requests.some(r => r.status === 'PAYMENT_REQUIRED') ? (
              <button
                onClick={() => {
                  const req = requests.find(r => r.status === 'PAYMENT_REQUIRED');
                  if (req) handleActivatePayment(req.id);
                }}
                disabled={actionLoading}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs tracking-wide shadow-md shadow-emerald-500/20"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Complete Payment & Activate</span>
              </button>
            ) : (
              <button
                onClick={() => setShowRequestModal(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-wide shadow-md shadow-amber-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Request Plan Now</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Subscription Card */}
      {subscription ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-3xl bg-zinc-900/90 border border-zinc-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] uppercase tracking-wider font-mono text-amber-500 font-semibold">
                    Current Tier
                  </span>
                  {getAssignmentBadge(subscription.assignmentType)}
                </div>
                <h2 className="font-serif-luxury text-3xl font-bold text-white mt-1">
                  {subscription.plan?.name || 'Standard Plan'}
                </h2>
                <p className="text-zinc-400 text-xs mt-1">{subscription.plan?.description}</p>
                {subscription.assignmentReason && (
                  <p className="text-[11px] text-zinc-400 italic mt-2 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80">
                    Assignment note: {subscription.assignmentReason}
                  </p>
                )}
              </div>
              {getStatusBadge(subscription.status)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-800">
              <div>
                <span className="text-[11px] text-zinc-500 block">Agreed Price</span>
                <span className="text-lg font-bold text-white font-mono">
                  €{subscription.agreedPrice}
                  <span className="text-xs text-zinc-400 font-normal"> /mo</span>
                </span>
              </div>
              <div>
                <span className="text-[11px] text-zinc-500 block">Days Remaining</span>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {subscription.daysRemaining} days
                </span>
              </div>
              <div>
                <span className="text-[11px] text-zinc-500 block">Current Period End</span>
                <span className="text-sm font-semibold text-zinc-200">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-zinc-500 block">Auto-Renew</span>
                <span className={`text-sm font-semibold ${subscription.autoRenew ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {subscription.autoRenew ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Auto-renew settings */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-zinc-200 block">Automatic Renewal</span>
                <span className="text-[11px] text-zinc-400">
                  {subscription.autoRenew
                    ? 'Your subscription will renew automatically at period end.'
                    : 'Auto-renewal is off. Access will enter grace period at period end.'}
                </span>
              </div>
              <button
                onClick={handleToggleAutoRenew}
                disabled={actionLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  subscription.autoRenew
                    ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {subscription.autoRenew ? 'Disable Auto-Renew' : 'Enable Auto-Renew'}
              </button>
            </div>
          </div>

          {/* Billing Summary Box */}
          <div className="rounded-3xl bg-zinc-900/90 border border-zinc-800 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Billing Summary</span>
            </h3>

            <div className="space-y-3 text-xs text-zinc-400">
              <div className="flex justify-between pb-2 border-b border-zinc-800">
                <span>Payment Provider</span>
                <span className="font-mono text-zinc-200">{subscription.provider}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-zinc-800">
                <span>Start Date</span>
                <span className="text-zinc-200">{new Date(subscription.startsAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-zinc-800">
                <span>Grace Period</span>
                <span className="text-zinc-200">{subscription.plan?.gracePeriodDays ?? 7} Days</span>
              </div>
              <div className="flex justify-between">
                <span>Invoices Generated</span>
                <span className="font-mono text-white">{invoices.length}</span>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => setShowPlanModal(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold tracking-wider transition-all"
              >
                <span>Explore Other Plans</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 text-center">
          <p className="text-sm text-zinc-400 mb-4">No subscription found for this restaurant.</p>
          <button
            onClick={() => setShowPlanModal(true)}
            className="px-6 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs uppercase tracking-wider"
          >
            Choose a Plan
          </button>
        </div>
      )}

      {/* Tabs / Sections: Billing History & Lifecycle Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments History */}
        <div className="rounded-3xl bg-zinc-900/90 border border-zinc-800 p-6 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-amber-400" />
            <span>Billing Payments</span>
          </h3>

          <div className="overflow-x-auto">
            {payments.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No payment history recorded yet.</p>
            ) : (
              <table className="w-full text-left text-xs text-zinc-300">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Transaction ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-800/30">
                      <td className="py-2.5">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 font-mono font-semibold text-white">
                        {p.currency} {p.amount}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                            p.status === 'SUCCEEDED'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-zinc-500 text-[11px]">
                        {p.providerTransactionId || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Lifecycle Events */}
        <div className="rounded-3xl bg-zinc-900/90 border border-zinc-800 p-6 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <span>Subscription History</span>
          </h3>

          <div className="max-h-80 overflow-y-auto space-y-3">
            {events.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No events recorded yet.</p>
            ) : (
              events.map((e) => (
                <div key={e.id} className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-zinc-200 text-[11px]">{e.eventType}</span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(e.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    {e.reason && <p className="text-zinc-400 text-[11px] mt-0.5">{e.reason}</p>}
                    {e.actor && (
                      <span className="text-[10px] text-zinc-500 mt-1 block">Actor: {e.actor.name}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Subscription Requests Section */}
      <div className="rounded-3xl bg-zinc-900/90 border border-zinc-800 p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-400" />
              <span>Subscription Requests & Approvals</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-300">
                {requests.length}
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Track requests submitted to Platform Administration, payment approval status, and activation actions.
            </p>
          </div>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold tracking-wide transition-all shadow-md shadow-sky-600/20 self-start sm:self-auto"
          >
            <Send className="w-3.5 h-3.5" />
            <span>New Request</span>
          </button>
        </div>

        {requests.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-xs text-zinc-500">No subscription requests have been recorded for this restaurant.</p>
            <button
              onClick={() => setShowRequestModal(true)}
              className="text-xs text-amber-400 hover:text-amber-300 underline font-medium"
            >
              Submit your first request
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="pb-2">Requested Date</th>
                  <th className="pb-2">Requested Plan</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Notes / Reason</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/30">
                    <td className="py-3 text-zinc-400 font-mono text-[11px]">
                      {new Date(r.requestedAt).toLocaleDateString()} {new Date(r.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 font-semibold text-white">
                      {r.requestedPlan?.name || 'Custom Plan'}
                      <span className="text-zinc-500 text-[11px] block font-normal font-mono">
                        €{r.requestedPlan?.price} / {r.requestedPlan?.billingInterval?.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-3">
                      {getRequestStatusBadge(r.status)}
                    </td>
                    <td className="py-3 text-zinc-400 text-[11px] max-w-xs">
                      {r.notes && <div className="text-zinc-300 mb-0.5">&quot;{r.notes}&quot;</div>}
                      {r.rejectionReason && (
                        <div className="text-red-400/90 text-[10px] font-mono">
                          Reason: {r.rejectionReason}
                        </div>
                      )}
                      {!r.notes && !r.rejectionReason && <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="py-3 text-right">
                      {r.status === 'PAYMENT_REQUIRED' ? (
                        <button
                          onClick={() => handleActivatePayment(r.id)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs tracking-wide shadow-md shadow-emerald-500/20"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Pay & Activate</span>
                        </button>
                      ) : r.status === 'PAID' || r.status === 'APPROVED' ? (
                        <span className="text-emerald-400 text-xs font-semibold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : r.status === 'PENDING' ? (
                        <span className="text-amber-400/80 text-xs font-mono">In Review</span>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan Selection Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-serif-luxury text-xl font-bold text-white">Select Subscription Plan</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Choose the plan that fits your operational needs.</p>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="text-zinc-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {plans.map((p) => {
                const isCurrent = subscription?.plan?.code === p.code;
                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl p-5 border flex flex-col justify-between transition-all ${
                      isCurrent
                        ? 'border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/30'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500 font-semibold">
                        {p.billingInterval}
                      </span>
                      <h4 className="font-bold text-white text-base mt-1">{p.name}</h4>
                      <p className="text-zinc-400 text-xs mt-2 line-clamp-3">{p.description}</p>
                      <div className="mt-4">
                        <span className="text-2xl font-bold text-white font-mono">€{p.price}</span>
                        <span className="text-xs text-zinc-400"> / {p.billingInterval === 'YEARLY' ? 'yr' : 'mo'}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectPlan(p)}
                      disabled={isCurrent || actionLoading}
                      className={`mt-6 w-full py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                        isCurrent
                          ? 'bg-zinc-800 text-zinc-400 cursor-default'
                          : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-sm'
                      }`}
                    >
                      {isCurrent ? 'Current Plan' : 'Select Plan'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Subscription Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-serif-luxury text-xl font-bold text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-sky-400" />
                  <span>Request Restaurant Subscription</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Submit a plan request to Platform Administration to unlock your restaurant.
                </p>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="text-zinc-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Select Desired Plan</label>
                <select
                  required
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-sky-400 focus:outline-none"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — €{p.price}/{p.billingInterval.toLowerCase()} ({p.description || 'Full features'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Notes or Custom Requirements (Optional)
                </label>
                <textarea
                  rows={3}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g. Opening on Friday, requesting annual billing or promotional trial review..."
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-sky-400 focus:outline-none placeholder:text-zinc-600"
                />
              </div>

              <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-800/40 text-xs text-sky-300">
                💡 Once reviewed by Platform Admin, the request will be approved for payment activation. You will then complete payment to instantly activate full operational access.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedPlanId}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Submit Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
