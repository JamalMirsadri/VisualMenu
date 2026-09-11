import React, { useEffect, useState } from 'react';
import {
  Settings,
  Shield,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Bell,
  Mail,
  DollarSign,
  Globe,
  Sliders,
} from 'lucide-react';
import { platformService } from '../../services/platformService';
import type { PlatformSettingsData } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const PlatformSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<PlatformSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { isPlatformAdmin, platformRole } = useAuth();

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await platformService.getSettings();
      setSettings(data);
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setError(err.message || 'Failed to load platform settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const updated = await platformService.updateSettings({
        platformName: settings.platformName,
        supportEmail: settings.supportEmail,
        defaultCurrency: settings.defaultCurrency,
        defaultLanguage: settings.defaultLanguage,
        maintenanceMode: settings.maintenanceMode,
        systemNotice: settings.systemNotice || null,
      });
      setSettings(updated);
      setSuccess('Platform configuration updated successfully.');
    } catch (err: any) {
      console.error('Failed to save platform settings:', err);
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm">Loading SaaS configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-amber-400" />
            <span>Global SaaS Platform Settings</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Configure system-wide identity, default regional parameters, and operational broadcast notices.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSettings}
          disabled={loading}
          className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Reload configuration"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center gap-3 text-red-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-center gap-3 text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {!isPlatformAdmin && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 flex items-center gap-3 text-amber-300 text-xs">
          <Shield className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            You are signed in as <strong>{platformRole}</strong>. Only <strong>PLATFORM_ADMIN</strong> operators are permitted to save changes to global SaaS settings.
          </span>
        </div>
      )}

      {settings && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* General Platform Identity Card */}
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Platform Identity & Support</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Platform Brand Name</label>
                <input
                  type="text"
                  disabled={!isPlatformAdmin}
                  value={settings.platformName}
                  onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Support Contact Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    disabled={!isPlatformAdmin}
                    value={settings.supportEmail}
                    onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Localization & Defaults */}
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-400" />
              <span>Regional & Currency Defaults</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Default Currency Code</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    disabled={!isPlatformAdmin}
                    value={settings.defaultCurrency}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultCurrency: e.target.value.toUpperCase() })
                    }
                    maxLength={3}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-500 disabled:opacity-60 uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Default Language</label>
                <select
                  disabled={!isPlatformAdmin}
                  value={settings.defaultLanguage}
                  onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-60"
                >
                  <option value="en">English (en)</option>
                  <option value="es">Spanish (es)</option>
                  <option value="fr">French (fr)</option>
                  <option value="de">German (de)</option>
                  <option value="ar">Arabic (ar)</option>
                  <option value="ja">Japanese (ja)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Maintenance Mode & System Broadcast Notice */}
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span>Operational Controls & Broadcasts</span>
            </h2>

            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-white">Maintenance Mode</span>
                  <p className="text-[11px] text-zinc-400">
                    When active, public menus and non-platform ordering will display scheduled maintenance notice.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isPlatformAdmin}
                    checked={settings.maintenanceMode}
                    onChange={(e) =>
                      setSettings({ ...settings, maintenanceMode: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Global System Notice (Optional)
                </label>
                <textarea
                  disabled={!isPlatformAdmin}
                  value={settings.systemNotice || ''}
                  onChange={(e) => setSettings({ ...settings, systemNotice: e.target.value })}
                  placeholder="e.g. Scheduled database maintenance tonight at 02:00 UTC."
                  rows={3}
                  className="w-full p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          {isPlatformAdmin && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving Changes...' : 'Save Configuration'}</span>
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
