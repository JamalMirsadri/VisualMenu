import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Dices,
  Gamepad2,
  Power,
  RefreshCw,
  Save,
  Trophy,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { gameAdminService } from '../../services/gameAdminService';
import type { GameMode } from '../../types';

interface GameFormState {
  enabled: boolean;
  modes: GameMode[];
  minPlayers: number;
  maxPlayers: number;
  turnTimeoutSeconds: number;
  dailyPointsLimit: number;
  winPoints: number;
}

const DEFAULT_FORM: GameFormState = {
  enabled: false,
  modes: ['PRIVATE', 'RANDOM'],
  minPlayers: 2,
  maxPlayers: 6,
  turnTimeoutSeconds: 30,
  dailyPointsLimit: 0,
  winPoints: 0,
};

type NumericField = 'minPlayers' | 'maxPlayers' | 'turnTimeoutSeconds' | 'dailyPointsLimit' | 'winPoints';

const MODE_LABELS: Record<GameMode, { title: string; description: string }> = {
  PRIVATE: { title: 'Same Table', description: 'Guests at the same dining table compete together.' },
  RANDOM: { title: 'Same Restaurant', description: 'Guests anywhere in the restaurant are matched.' },
};

const inputClass =
  'w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

const labelClass = 'block text-xs text-zinc-400 font-semibold mb-1.5';

export const AdminGamesPage: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const [form, setForm] = useState<GameFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchConfig = async () => {
    if (!activeRestaurant?.id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await gameAdminService.getConfig(activeRestaurant.id);
      if (data.config) {
        setForm({
          enabled: data.config.enabled,
          modes: (data.config.modes as GameMode[]) || [],
          minPlayers: data.config.minPlayers ?? 2,
          maxPlayers: data.config.maxPlayers ?? 6,
          turnTimeoutSeconds: data.config.turnTimeoutSeconds ?? 30,
          dailyPointsLimit: data.config.dailyPointsLimit ?? 0,
          winPoints: (data.config.pointRules as any)?.winPoints ?? 0,
        });
      } else {
        setForm(DEFAULT_FORM);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load game configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurant?.id]);

  const toggleMode = (mode: GameMode) => {
    setForm((prev) => ({
      ...prev,
      modes: prev.modes.includes(mode) ? prev.modes.filter((m) => m !== mode) : [...prev.modes, mode],
    }));
  };

  const setNumber = (key: NumericField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? 0 : Number(e.target.value);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): string | null => {
    if (form.minPlayers < 1) return 'Minimum players must be at least 1.';
    if (form.maxPlayers < form.minPlayers) return 'Maximum players must be greater than or equal to minimum players.';
    if (form.turnTimeoutSeconds < 5) return 'Turn timeout must be at least 5 seconds.';
    if (form.dailyPointsLimit < 0) return 'Daily points limit must be a non-negative number.';
    if (form.winPoints < 0) return 'Winner points must be a non-negative number.';
    if (form.enabled && form.modes.length === 0) return 'Enable at least one game mode when Games are active.';
    return null;
  };

  const handleSave = async () => {
    if (!activeRestaurant?.id) return;
    const invalid = validate();
    if (invalid) {
      setValidationError(invalid);
      setNotice(null);
      return;
    }
    setValidationError(null);
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await gameAdminService.updateConfig(activeRestaurant.id, {
        enabled: form.enabled,
        modes: form.modes,
        minPlayers: form.minPlayers,
        maxPlayers: form.maxPlayers,
        turnTimeoutSeconds: form.turnTimeoutSeconds,
        dailyPointsLimit: form.dailyPointsLimit,
        pointRules: { winPoints: form.winPoints },
      });
      setNotice('Game configuration saved.');
      await fetchConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to save game configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValidationError(null);
    setNotice(null);
    fetchConfig();
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-zinc-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
        <p className="text-sm">Loading game configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-amber-400" />
            Games
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Control whether table games are active and how they behave for {activeRestaurant?.name || 'this restaurant'}.
          </p>
        </div>

        <button
          onClick={fetchConfig}
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

      {validationError && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Master enable/disable */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center shrink-0">
            <Power className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Games Active</div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Master switch for table games in this restaurant.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
          disabled={saving}
          aria-pressed={form.enabled}
          className={`relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            form.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
          }`}
          style={{ width: '52px', height: '28px' }}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              form.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </motion.section>

      {/* Game type */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.03 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Dices className="w-4 h-4 text-amber-400" />
          <span>Game Type</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center shrink-0">
            <Dices className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Snakes & Ladders</div>
            <p className="text-xs text-zinc-500 mt-0.5">Server-authoritative dice board game for 2–6 players.</p>
          </div>
        </div>
      </motion.section>

      {/* Game modes */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.06 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Gamepad2 className="w-4 h-4 text-amber-400" />
          <span>Game Modes</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="space-y-3">
          {(['PRIVATE', 'RANDOM'] as GameMode[]).map((mode) => {
            const active = form.modes.includes(mode);
            return (
              <div
                key={mode}
                className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{MODE_LABELS[mode].title}</div>
                  <p className="text-xs text-zinc-500 mt-0.5">{MODE_LABELS[mode].description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleMode(mode)}
                  disabled={saving || !form.enabled}
                  aria-pressed={active}
                  className={`relative inline-flex items-center rounded-full transition-colors disabled:opacity-40 ${
                    active ? 'bg-amber-500' : 'bg-zinc-700'
                  }`}
                  style={{ width: '52px', height: '28px' }}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* Players + timeout */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.09 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Users className="w-4 h-4 text-amber-400" />
          <span>Players & Turn Timing</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80">
          <div>
            <label className={labelClass}>Minimum Players</label>
            <input
              type="number"
              min={1}
              value={form.minPlayers}
              onChange={setNumber('minPlayers')}
              disabled={saving || !form.enabled}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Maximum Players</label>
            <input
              type="number"
              min={form.minPlayers}
              value={form.maxPlayers}
              onChange={setNumber('maxPlayers')}
              disabled={saving || !form.enabled}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Turn Timeout (seconds)</label>
            <input
              type="number"
              min={5}
              value={form.turnTimeoutSeconds}
              onChange={setNumber('turnTimeoutSeconds')}
              disabled={saving || !form.enabled}
              className={inputClass}
            />
          </div>
        </div>
      </motion.section>

      {/* Points */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.12 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Loyalty Points</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80">
          <div>
            <label className={labelClass}>Daily Game Points Limit</label>
            <input
              type="number"
              min={0}
              value={form.dailyPointsLimit}
              onChange={setNumber('dailyPointsLimit')}
              disabled={saving || !form.enabled}
              className={inputClass}
            />
            <p className="text-[10px] text-zinc-500 mt-1.5">Maximum GAME_WIN points a player can earn per day.</p>
          </div>
          <div>
            <label className={labelClass}>Winner Points</label>
            <input
              type="number"
              min={0}
              value={form.winPoints}
              onChange={setNumber('winPoints')}
              disabled={saving || !form.enabled}
              className={inputClass}
            />
            <p className="text-[10px] text-zinc-500 mt-1.5">Loyalty points awarded to the winner of a finished game.</p>
          </div>
        </div>
      </motion.section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          onClick={handleCancel}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span>Save Configuration</span>
        </button>
      </div>
    </div>
  );
};
