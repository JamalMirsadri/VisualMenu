import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Dices,
  Gamepad2,
  LogOut,
  Play,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { Restaurant } from '../../types';
import {
  customerGameService,
  type GameConfigDto,
  type GameMode,
  type GamePlayerDto,
  type GameSessionDto,
} from '../../services/customerGameService';
import { CustomerGameBoard } from './CustomerGameBoard';

const PLAYER_KEY_STORAGE = 'aura_game_player_key';
const ACTIVE_GAME_STORAGE = 'aura_active_game';

function getPlayerKey(): string {
  if (typeof window === 'undefined') return '';
  let key = window.localStorage.getItem(PLAYER_KEY_STORAGE);
  if (!key) {
    key = (window.crypto?.randomUUID?.() as string) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(PLAYER_KEY_STORAGE, key);
  }
  return key;
}

interface CustomerGameLobbyProps {
  restaurant: Restaurant;
  table: { id: string; number?: string; name?: string } | null;
  config: GameConfigDto;
  onClose: () => void;
}

type Stage = 'select' | 'alias' | 'active';

export const CustomerGameLobby: React.FC<CustomerGameLobbyProps> = ({ restaurant, table, config, onClose }) => {
  const restaurantId = restaurant.id;

  const [stage, setStage] = useState<Stage>('select');
  const [mode, setMode] = useState<GameMode | null>(null);
  const [alias, setAlias] = useState('');
  const [session, setSession] = useState<GameSessionDto | null>(null);
  const [player, setPlayer] = useState<GamePlayerDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');

  // Existing waiting lobby for the same table (PRIVATE discovery).
  const [tableGame, setTableGame] = useState<GameSessionDto | null>(null);

  const playerKey = useMemo(() => getPlayerKey(), []);

  const modes = config.modes ?? [];
  const privateEnabled = modes.includes('PRIVATE') && Boolean(table?.id);
  const randomEnabled = modes.includes('RANDOM');
  const isHost = Boolean(player?.isHost);

  useEffect(() => {
    if (privateEnabled && table?.id) {
      customerGameService
        .getTableGame(restaurantId, table.id)
        .then((d) => setTableGame(d.game))
        .catch(() => setTableGame(null));
    }
  }, [privateEnabled, table?.id, restaurantId]);

  // Restore an active game for this restaurant (e.g. returning after refresh).
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = window.localStorage.getItem(ACTIVE_GAME_STORAGE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.restaurantId !== restaurantId || !saved.sessionId || !saved.token || !saved.playerId) return;
      customerGameService
        .getGame(restaurantId, saved.sessionId, saved.token)
        .then((res) => {
          if (cancelled) return;
          const game = res.game;
          if (game.status === 'WAITING' || game.status === 'IN_PROGRESS') {
            setSession(game);
            setToken(saved.token);
            setPlayer(game.players.find((p) => p.id === saved.playerId) || null);
            setMode(game.mode);
            setStage('active');
          } else {
            window.localStorage.removeItem(ACTIVE_GAME_STORAGE);
          }
        })
        .catch(() => {
          if (!cancelled) window.localStorage.removeItem(ACTIVE_GAME_STORAGE);
        });
    } catch {
      /* ignore malformed storage */
    }
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  // SSE subscription while the lobby is waiting (board owns its own stream).
  useEffect(() => {
    if (!session?.id || !token || session.status !== 'WAITING') return;

    setConnectionStatus('connecting');
    const es = new EventSource(customerGameService.gameEventsUrl(restaurantId, session.id, token));

    es.onopen = () => setConnectionStatus('connected');
    es.onerror = () => setConnectionStatus('reconnecting');

    es.addEventListener('game_snapshot', (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (data?.snapshot) setSession(data.snapshot);
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener('player_joined', (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (data?.player) {
          setSession((prev) =>
            prev && !prev.players.some((p) => p.id === data.player.id)
              ? { ...prev, players: [...prev.players, data.player] }
              : prev
          );
        }
      } catch {
        /* ignore */
      }
    });

    es.addEventListener('player_left', (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (data?.playerId) {
          setSession((prev) =>
            prev ? { ...prev, players: prev.players.filter((p) => p.id !== data.playerId) } : prev
          );
        }
      } catch {
        /* ignore */
      }
    });

    es.addEventListener('game_started', () => {
      setSession((prev) => (prev ? { ...prev, status: 'IN_PROGRESS' } : prev));
    });

    es.addEventListener('game_cancelled', () => {
      setSession((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
    });

    return () => es.close();
  }, [session?.id, session?.status, token, restaurantId]);

  const chooseMode = (m: GameMode) => {
    setMode(m);
    setStage('alias');
    setError(null);
  };

  const startGame = async () => {
    const trimmed = alias.trim();
    if (!trimmed) {
      setError('Enter a display name to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let result;
      if (mode === 'PRIVATE') {
        if (!table?.id) {
          setError('A table is required to play with your table.');
          return;
        }
        result =
          tableGame && tableGame.status === 'WAITING'
            ? await customerGameService.joinPrivate(restaurantId, tableGame.id, {
                tableId: table.id,
                alias: trimmed,
                playerKey,
              })
            : await customerGameService.createPrivate(restaurantId, {
                tableId: table.id,
                alias: trimmed,
                playerKey,
              });
      } else {
        result = await customerGameService.joinRandom(restaurantId, {
          alias: trimmed,
          playerKey,
        });
      }
      setSession(result.session);
      setPlayer(result.player);
      setToken(result.token);
      setStage('active');
      try {
        window.localStorage.setItem(
          ACTIVE_GAME_STORAGE,
          JSON.stringify({
            restaurantId,
            sessionId: result.session.id,
            token: result.token,
            playerId: result.player.id,
            mode: result.session.mode,
          })
        );
      } catch {
        /* storage may be unavailable */
      }
    } catch (err: any) {
      setError(err.message || 'Unable to join a game.');
    } finally {
      setBusy(false);
    }
  };

  const hostStart = async () => {
    if (!session?.id || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await customerGameService.start(restaurantId, session.id, token);
      setSession(res.game);
      setNotice('Game started!');
    } catch (err: any) {
      setError(err.message || 'Unable to start the game.');
    } finally {
      setBusy(false);
    }
  };

  const hostCancel = async () => {
    if (!session?.id || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await customerGameService.cancel(restaurantId, session.id, token);
      setSession(res.game);
      try {
        window.localStorage.removeItem(ACTIVE_GAME_STORAGE);
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      setError(err.message || 'Unable to cancel the game.');
    } finally {
      setBusy(false);
    }
  };

  const leaveLobby = async () => {
    if (!session?.id || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await customerGameService.leave(restaurantId, session.id, token);
      if (res.game) {
        setSession(res.game);
      }
      setSession(null);
      setPlayer(null);
      setToken(null);
      setStage('select');
      try {
        window.localStorage.removeItem(ACTIVE_GAME_STORAGE);
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      setError(err.message || 'Unable to leave.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStage('select');
    setMode(null);
    setAlias('');
    setSession(null);
    setPlayer(null);
    setToken(null);
    setError(null);
    setNotice(null);
  };

  const isWaiting = session?.status === 'WAITING';
  const isInProgress = session?.status === 'IN_PROGRESS';
  const isCancelled = session?.status === 'CANCELLED';
  const canStart = isWaiting && isHost && (session?.players.length ?? 0) >= config.minPlayers;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        role="dialog"
        aria-modal="true"
        aria-label="Play while you wait"
        className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[92svh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-4 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
              <Gamepad2 className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-serif-luxury text-base font-bold text-white leading-tight">Play While You Wait</h2>
              <p className="text-[11px] text-zinc-500">{restaurant.name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:text-white text-sm font-semibold transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Order</span>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* ---------------- Mode selection ---------------- */}
          {stage === 'select' && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">Choose how you want to play while you wait.</p>

              <button
                onClick={() => chooseMode('PRIVATE')}
                disabled={!privateEnabled}
                className="w-full p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-left disabled:opacity-40 disabled:cursor-not-allowed hover:border-amber-500/40 transition"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-sm font-semibold text-white">Play with my table</div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {tableGame && tableGame.status === 'WAITING'
                        ? `Join the lobby already waiting (${tableGame.players.length} player${tableGame.players.length === 1 ? '' : 's'})`
                        : 'Create a private lobby for guests at your table.'}
                    </p>
                  </div>
                </div>
                {!privateEnabled && <p className="text-[10px] text-zinc-600 mt-2">Requires a table context.</p>}
              </button>

              <button
                onClick={() => chooseMode('RANDOM')}
                disabled={!randomEnabled}
                className="w-full p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-left disabled:opacity-40 disabled:cursor-not-allowed hover:border-amber-500/40 transition"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-sm font-semibold text-white">Play with random guests</div>
                    <p className="text-xs text-zinc-500 mt-0.5">Join restaurant-wide matchmaking.</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ---------------- Alias entry ---------------- */}
          {stage === 'alias' && (
            <div className="space-y-4">
              <button onClick={() => setStage('select')} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div>
                <label className="block text-xs text-zinc-400 font-semibold mb-1.5">Your display name</label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="e.g. Alex"
                  autoFocus
                  className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                />
                <p className="text-[11px] text-zinc-500 mt-1.5">Only your alias is shown to other players.</p>
              </div>
              <button
                onClick={startGame}
                disabled={busy || !alias.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {mode === 'PRIVATE' ? (tableGame?.status === 'WAITING' ? 'Join Lobby' : 'Create Lobby') : 'Find Players'}
              </button>
            </div>
          )}

          {/* ---------------- Active game ---------------- */}
          {stage === 'active' && session && (
            <div className="space-y-4">
              {/* Connection status */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectionStatus === 'connected'
                        ? 'bg-emerald-400'
                        : connectionStatus === 'reconnecting'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-zinc-500'
                    }`}
                  />
                  {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
                </span>
                <span className="font-mono">{session.mode === 'PRIVATE' ? 'Same Table' : 'Random Match'}</span>
              </div>

              {/* Lobby (waiting) */}
              {isWaiting && (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    {session.mode === 'RANDOM' ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                          className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-amber-400/20 border-t-amber-400"
                        />
                        <h3 className="font-serif-luxury text-lg font-bold text-white">Searching for players…</h3>
                        <p className="text-xs text-zinc-500 mt-1">We'll match you with other guests.</p>
                      </>
                    ) : (
                      <>
                        <Dices className="w-10 h-10 mx-auto mb-3 text-amber-400" />
                        <h3 className="font-serif-luxury text-lg font-bold text-white">Waiting Lobby</h3>
                        <p className="text-xs text-zinc-500 mt-1">
                          {session.players.length}/{session.maxPlayers} players
                        </p>
                      </>
                    )}
                  </div>

                  {/* Players */}
                  <div className="space-y-2">
                    {session.players.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 font-bold text-xs">
                            {(p.alias || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-white">{p.alias}</span>
                          {p.id === player?.id && <span className="text-[10px] text-zinc-500">(you)</span>}
                        </div>
                        {p.isHost && <span className="text-[10px] font-bold uppercase text-amber-400">Host</span>}
                      </motion.div>
                    ))}
                  </div>

                  {/* Host controls */}
                  {isHost ? (
                    <div className="space-y-2">
                      <button
                        onClick={hostStart}
                        disabled={busy || !canStart}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm disabled:opacity-40"
                      >
                        Start Game{!canStart ? ` (need ${config.minPlayers - (session.players.length ?? 0)} more)` : ''}
                      </button>
                      <button
                        onClick={hostCancel}
                        disabled={busy}
                        className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-red-400 text-sm font-semibold"
                      >
                        Cancel Lobby
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={leaveLobby}
                      disabled={busy}
                      className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      <LogOut className="w-4 h-4" /> Leave Lobby
                    </button>
                  )}
                </div>
              )}

              {/* Active board */}
              {isInProgress && player && token && (
                <CustomerGameBoard
                  restaurantId={restaurantId}
                  session={session}
                  playerId={player.id}
                  token={token}
                  ladders={config.ladders ?? []}
                  snakes={config.snakes ?? []}
                  onExit={onClose}
                />
              )}

              {/* Cancelled */}
              {isCancelled && (
                <div className="text-center py-8 space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    <X className="w-8 h-8 text-zinc-500" />
                  </div>
                  <h3 className="font-serif-luxury text-xl font-bold text-white">Game cancelled</h3>
                  <p className="text-xs text-zinc-500">This lobby is no longer available.</p>
                  <button onClick={reset} className="px-5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm">
                    Start Over
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
