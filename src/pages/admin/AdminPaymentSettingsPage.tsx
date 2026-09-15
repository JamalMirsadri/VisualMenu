import React, { useEffect, useState } from 'react';
import {
  Banknote,
  Smartphone,
  CreditCard,
  Wallet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Save,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { settingsService } from '../../services/settingsService';

interface PaymentSettings {
  cashEnabled: boolean;
  cardEnabled: boolean;
  mbwayEnabled: boolean;
  stripeEnabled: boolean;
  stripeAccountId: string | null;
  stripePublishableKey: string | null;
  stripeConfigured: boolean;
  mbwayConfigured: boolean;
}

interface MethodRowProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  enabled: boolean;
  configured?: boolean;
  independent?: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const MethodRow: React.FC<MethodRowProps> = ({
  icon: Icon,
  title,
  description,
  enabled,
  configured,
  independent,
  onToggle,
  disabled,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{title}</span>
            {enabled && independent && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wide">
                Always available
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {configured !== undefined && enabled && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
              configured
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}
          >
            {configured ? 'Configured' : 'Needs credentials'}
          </span>
        )}

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={enabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-emerald-500' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export const AdminPaymentSettingsPage: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Secret-only write fields (never pre-populated from the API).
  const [stripeAccountId, setStripeAccountId] = useState('');
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [mbwayApiKey, setMbwayApiKey] = useState('');

  const fetchSettings = async () => {
    if (!activeRestaurant?.id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await settingsService.getPaymentSettings(activeRestaurant.id);
      setSettings(data);
      setStripeAccountId(data.stripeAccountId || '');
      setStripePublishableKey(data.stripePublishableKey || '');
      setStripeSecretKey('');
      setMbwayApiKey('');
    } catch (err: any) {
      setError(err.message || 'Failed to load payment settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurant?.id]);

  const updateMethod = async (patch: Partial<PaymentSettings>) => {
    if (!activeRestaurant?.id) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const data = await settingsService.updatePaymentSettings(activeRestaurant.id, patch);
      setSettings(data);
      setNotice('Payment method updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update payment method.');
    } finally {
      setSaving(false);
    }
  };

  const saveCredentials = async () => {
    if (!activeRestaurant?.id) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const payload: any = {
        stripeAccountId: stripeAccountId || null,
        stripePublishableKey: stripePublishableKey || null,
      };
      if (stripeSecretKey.trim()) payload.stripeSecretKey = stripeSecretKey.trim();
      if (mbwayApiKey.trim()) payload.mbwayApiKey = mbwayApiKey.trim();

      const data = await settingsService.updatePaymentSettings(activeRestaurant.id, payload);
      setSettings(data);
      setStripeSecretKey('');
      setMbwayApiKey('');
      setNotice('Provider credentials saved securely.');
    } catch (err: any) {
      setError(err.message || 'Failed to save credentials.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="p-12 text-center text-zinc-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
        <p className="text-sm">Loading payment settings...</p>
      </div>
    );
  }

  const s = settings;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-amber-400" />
            Payment Settings
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Enable or disable accepted payment methods and manage provider credentials per restaurant.
          </p>
        </div>

        <button
          onClick={fetchSettings}
          disabled={loading || saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Status banners */}
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

      {/* Payment Methods */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <span>Accepted Methods</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        {s && (
          <>
            <MethodRow
              icon={Banknote}
              title="Cash"
              description="Accepted at the table or register. Available independently of provider credentials."
              enabled={s.cashEnabled}
              independent
              onToggle={() => updateMethod({ cashEnabled: !s.cashEnabled })}
              disabled={saving}
            />

            <MethodRow
              icon={CreditCard}
              title="Credit / Debit Card"
              description="Card payments via Stripe. Requires Stripe to be enabled and configured."
              enabled={s.cardEnabled}
              onToggle={() => updateMethod({ cardEnabled: !s.cardEnabled })}
              disabled={saving}
            />

            <MethodRow
              icon={Smartphone}
              title="MB WAY"
              description="Mobile payment for Portuguese customers. Requires provider credentials."
              enabled={s.mbwayEnabled}
              configured={s.mbwayConfigured}
              onToggle={() => updateMethod({ mbwayEnabled: !s.mbwayEnabled })}
              disabled={saving}
            />

            <MethodRow
              icon={CreditCard}
              title="Stripe"
              description="Master switch for Stripe Checkout / Payment Intent integration."
              enabled={s.stripeEnabled}
              configured={s.stripeConfigured}
              onToggle={() => updateMethod({ stripeEnabled: !s.stripeEnabled })}
              disabled={saving}
            />
          </>
        )}
      </section>

      {/* Provider Credentials */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>Provider Credentials</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Stripe</div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Stored encrypted at rest. Secret keys are never returned by the API.
              </p>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                s?.stripeConfigured
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              {s?.stripeConfigured ? 'Configured' : 'Not configured'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 font-semibold mb-1">Stripe Account ID (Connect)</label>
              <input
                type="text"
                value={stripeAccountId}
                onChange={(e) => setStripeAccountId(e.target.value)}
                placeholder="acct_..."
                className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 font-semibold mb-1">Publishable Key</label>
              <input
                type="text"
                value={stripePublishableKey}
                onChange={(e) => setStripePublishableKey(e.target.value)}
                placeholder="pk_live_..."
                className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 font-semibold mb-1">Secret Key</label>
              <input
                type="password"
                value={stripeSecretKey}
                onChange={(e) => setStripeSecretKey(e.target.value)}
                placeholder={s?.stripeConfigured ? '•••••••• (leave blank to keep)' : 'sk_live_...'}
                className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 font-semibold mb-1">MB WAY API Key</label>
              <input
                type="password"
                value={mbwayApiKey}
                onChange={(e) => setMbwayApiKey(e.target.value)}
                placeholder={s?.mbwayConfigured ? '•••••••• (leave blank to keep)' : 'Enter API key'}
                className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveCredentials}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Save Credentials</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
