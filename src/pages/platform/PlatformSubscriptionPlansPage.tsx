import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { SubscriptionPlan } from '../../services/subscriptionService';
import { FEATURE_KEYS, FEATURE_LABELS } from '../../constants/features';
import {
  Layers,
  Plus,
  Edit2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

export const PlatformSubscriptionPlansPage: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('29.00');
  const [currency, setCurrency] = useState('EUR');
  const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [trialDays, setTrialDays] = useState('14');
  const [gracePeriodDays, setGracePeriodDays] = useState('7');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [includedVideoCredits, setIncludedVideoCredits] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<SubscriptionPlan[]>('/platform/subscriptions/plans');
      setPlans(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load plans' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setCode('');
    setName('');
    setDescription('');
    setPrice('29.00');
    setCurrency('EUR');
    setBillingInterval('MONTHLY');
    setTrialDays('14');
    setGracePeriodDays('7');
    setSelectedFeatures([]);
    setIncludedVideoCredits('0');
    setModalOpen(true);
  };

  const openEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setCode(plan.code);
    setName(plan.name);
    setDescription(plan.description || '');
    setPrice(String(plan.price));
    setCurrency(plan.currency);
    setBillingInterval(plan.billingInterval);
    setTrialDays(plan.trialDays !== null && plan.trialDays !== undefined ? String(plan.trialDays) : '');
    setGracePeriodDays(String(plan.gracePeriodDays));
    setSelectedFeatures(plan.features || []);
    setIncludedVideoCredits(String(plan.includedVideoCredits || 0));
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      if (editingPlan) {
        // Update existing plan
        await apiClient.put(`/platform/subscriptions/plans/${editingPlan.id}`, {
          name,
          description,
          price: parseFloat(price),
          trialDays: trialDays ? parseInt(trialDays, 10) : null,
          gracePeriodDays: parseInt(gracePeriodDays, 10),
          features: selectedFeatures,
          includedVideoCredits: parseInt(includedVideoCredits, 10) || 0,
        });
        setFeedback({ type: 'success', message: `Plan ${name} updated successfully.` });
      } else {
        // Create new plan
        await apiClient.post('/platform/subscriptions/plans', {
          code,
          name,
          description,
          price: parseFloat(price),
          currency,
          billingInterval,
          trialDays: trialDays ? parseInt(trialDays, 10) : null,
          gracePeriodDays: parseInt(gracePeriodDays, 10),
          features: selectedFeatures,
          includedVideoCredits: parseInt(includedVideoCredits, 10) || 0,
        });
        setFeedback({ type: 'success', message: `Plan ${name} created successfully.` });
      }
      setModalOpen(false);
      await loadPlans();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Operation failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFeature = (feature: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    setFeedback(null);
    try {
      await apiClient.post(`/platform/subscriptions/plans/${plan.id}/toggle`);
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, active: !p.active } : p))
      );
      setFeedback({
        type: 'success',
        message: `Plan ${plan.name} is now ${!plan.active ? 'ACTIVE' : 'INACTIVE'}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle plan status' });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Layers className="w-8 h-8 text-amber-500" />
            <span>SaaS Subscription Plans</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Configure catalog tiers, future pricing, trial periods, and grace periods for all tenants.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-wide transition-all shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Plan</span>
        </button>
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

      {/* Plans Grid */}
      {loading ? (
        <div className="p-16 text-center text-zinc-500 flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
          <span className="text-xs">Loading plans catalog...</span>
        </div>
      ) : plans.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 text-sm">No plans found. Create your first plan above.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-3xl border p-6 flex flex-col justify-between transition-all bg-zinc-900/90 ${
                p.active ? 'border-zinc-800' : 'border-zinc-800/40 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    {p.code}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(p)}
                      className="p-1 text-zinc-400 hover:text-white"
                      title={p.active ? 'Deactivate' : 'Activate'}
                    >
                      {p.active ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-zinc-500" />}
                    </button>
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800"
                      title="Edit metadata"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-white text-lg">{p.name}</h3>
                <p className="text-zinc-400 text-xs mt-1.5 line-clamp-2">{p.description || 'No description provided.'}</p>

                <div className="mt-4 pt-4 border-t border-zinc-800 flex items-baseline gap-1">
                  <span className="text-3xl font-bold font-mono text-white">€{p.price}</span>
                  <span className="text-xs text-zinc-400 font-medium">
                    /{p.billingInterval === 'YEARLY' ? 'year' : 'month'}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-zinc-400">
                  <div className="flex justify-between">
                    <span>Trial Period:</span>
                    <span className="text-zinc-200">{p.trialDays ? `${p.trialDays} Days` : 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Grace Period:</span>
                    <span className="text-zinc-200">{p.gracePeriodDays} Days</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Video Credits:</span>
                    <span className="text-zinc-200">{p.includedVideoCredits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className={`font-semibold ${p.active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {p.active ? 'Active for new subscriptions' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Features</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(p.features || []).length === 0 ? (
                      <span className="text-[11px] text-zinc-500">None</span>
                    ) : (
                      (p.features || []).map((f) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700"
                        >
                          {FEATURE_LABELS[f as keyof typeof FEATURE_LABELS] || f}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-serif-luxury text-xl font-bold text-white">
                {editingPlan ? `Edit Plan: ${editingPlan.code}` : 'Create New Subscription Plan'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {!editingPlan && (
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Plan Code (Unique)</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    placeholder="e.g. ENTERPRISE_PLUS"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono uppercase focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Enterprise Plus"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white focus:border-amber-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Price (EUR)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Interval</label>
                  <select
                    disabled={Boolean(editingPlan)}
                    value={billingInterval}
                    onChange={(e) => setBillingInterval(e.target.value as any)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Trial Days</label>
                  <input
                    type="number"
                    min="0"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Grace Period (Days)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Included Video Credits</label>
                <input
                  type="number"
                  min="0"
                  value={includedVideoCredits}
                  onChange={(e) => setIncludedVideoCredits(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Included Features
                </label>
                <div className="space-y-1.5">
                  {FEATURE_KEYS.map((feature) => (
                    <label
                      key={feature}
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/60 cursor-pointer hover:border-zinc-500 transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFeatures.includes(feature)}
                        onChange={() => toggleFeature(feature)}
                        className="accent-amber-500 w-4 h-4 shrink-0"
                      />
                      <span className="text-zinc-200">{FEATURE_LABELS[feature]}</span>
                      <span className="ml-auto text-[10px] font-mono text-zinc-500">{feature}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold tracking-wide transition-all disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
