import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  subscriptionService,
  type SubscriptionDetails,
  type SubscriptionPayment,
  type SubscriptionInvoice,
  type SubscriptionEvent,
  type SubscriptionPlan,
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
} from 'lucide-react';

export const AdminSubscriptionPage: React.FC = () => {
  const { activeRestaurant, refreshSubscription } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const loadData = async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      const [subData, paymentsData, eventsData, plansData] = await Promise.all([
        subscriptionService.getSubscription(activeRestaurant.id).catch(() => null),
        subscriptionService.getPayments(activeRestaurant.id).catch(() => ({ payments: [], invoices: [] })),
        subscriptionService.getHistory(activeRestaurant.id).catch(() => []),
        subscriptionService.getPlans().catch(() => []),
      ]);

      setSubscription(subData);
      setPayments(paymentsData.payments);
      setInvoices(paymentsData.invoices);
      setEvents(eventsData);
      setPlans(plansData);
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

        <div className="flex items-center gap-3">
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

      {/* Main Subscription Card */}
      {subscription ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-3xl bg-zinc-900/90 border border-zinc-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-mono text-amber-500 font-semibold">
                  Current Tier
                </span>
                <h2 className="font-serif-luxury text-3xl font-bold text-white mt-1">
                  {subscription.plan?.name || 'Standard Plan'}
                </h2>
                <p className="text-zinc-400 text-xs mt-1">{subscription.plan?.description}</p>
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
    </div>
  );
};
