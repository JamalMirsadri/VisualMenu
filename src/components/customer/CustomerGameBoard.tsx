import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, RefreshCw, Trophy, Users, Wifi, WifiOff } from 'lucide-react';
import {
  customerGameService,
  type BoardConnection,
  type GameSessionDto,
} from '../../services/customerGameService';

const BOARD_SIZE = 100;

// Square number -> center in a 0..100 viewBox (each cell is 10 units).
function getSquareCenter(square: number): { x: number; y: number } {
  const row = Math.floor((square - 1) / 10);
  const col = (square - 1) % 10;
  const displayCol = row % 2 === 1 ? 9 - col : col;
  return { x: (displayCol + 0.5) * 10, y: (9 - row + 0.5) * 10 };
}

// Squares in visual order (top-left -> bottom-right) for the CSS grid.
const VISUAL_SQUARES: number[] = (() => {
  const arr: number[] = [];
  for (let vr = 0; vr < 10; vr++) {
    const row = 9 - vr;
    for (let vc = 0; vc < 10; vc++) {
      const col = row % 2 === 1 ? 9 - vc : vc;
      arr.push(row * 10 + col + 1);
    }
  }
  return arr;
})();

const PLAYER_COLORS = ['#f59e0b', '#34d399', '#38bdf8', '#fb7185', '#a78bfa', '#fb923c'];

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 1, 2, 6, 7, 8],
};

function DieFace({ value, rolling }: { value: number; rolling: boolean }) {
  const pips = DIE_PIPS[value] || [];
  return (
    <motion.div
      animate={rolling ? { rotate: [0, 360], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }}
      transition={rolling ? { duration: 0.7, ease: 'easeInOut' } : { duration: 0.2 }}
      className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white to-zinc-200 shadow-xl shadow-black/40 border border-zinc-300 grid grid-cols-3 grid-rows-3 p-3 gap-1"
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full ${pips.includes(i) ? 'bg-zinc-900' : 'bg-transparent'}`}
        />
      ))}
    </motion.div>
  );
}

interface CustomerGameBoardProps {
  restaurantId: string;
  session: GameSessionDto;
  playerId: string;
  token: string;
  ladders: BoardConnection[];
  snakes: BoardConnection[];
  onExit: () => void;
}

export const CustomerGameBoard: React.FC<CustomerGameBoardProps> = ({
  restaurantId,
  session: initialSession,
  playerId,
  token,
  ladders,
  snakes,
  onExit,
}) => {
  const reducedMotion = useReducedMotion();
  const [session, setSession] = useState<GameSessionDto>(initialSession);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [rolling, setRolling] = useState(false);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [diceRolling, setDiceRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ from: number; to: number; type: 'snake' | 'ladder' } | null>(null);

  // Visual piece positions (used only for animation interpolation).
  const [piecePositions, setPiecePositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialSession.players.map((p) => [p.id, p.position]))
  );

  const timersRef = useRef<number[]>([]);
  const pendingMoveRef = useRef<{ diceLanding: number; toPosition: number } | null>(null);

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const applySnapshot = (snapshot: GameSessionDto) => {
    setSession(snapshot);
    setPiecePositions(Object.fromEntries(snapshot.players.map((p) => [p.id, p.position])));
  };

  // Authoritative state resyncs on every snapshot.
  useEffect(() => {
    setSession(initialSession);
    setPiecePositions(Object.fromEntries(initialSession.players.map((p) => [p.id, p.position])));
  }, [initialSession.id]);

  // SSE subscription.
  useEffect(() => {
    setConnectionStatus('connecting');
    const es = new EventSource(customerGameService.gameEventsUrl(restaurantId, session.id, token));

    es.onopen = () => setConnectionStatus('connected');
    es.onerror = () => setConnectionStatus('reconnecting');

    const on = (name: string, handler: (data: any) => void) => {
      es.addEventListener(name, (evt: MessageEvent) => {
        try {
          handler(JSON.parse(evt.data));
        } catch {
          /* ignore malformed frame */
        }
      });
    };

    on('game_snapshot', (d) => d?.snapshot && applySnapshot(d.snapshot));

    on('player_joined', (d) => {
      if (d?.player) {
        setSession((prev) =>
          prev && !prev.players.some((p) => p.id === d.player.id)
            ? { ...prev, players: [...prev.players, d.player] }
            : prev
        );
      }
    });

    on('player_left', (d) => {
      if (d?.playerId) {
        setSession((prev) =>
          prev ? { ...prev, players: prev.players.filter((p) => p.id !== d.playerId) } : prev
        );
      }
    });

    on('dice_rolled', (d) => {
      const { playerId: pid, fromPosition, toPosition, diceRoll } = d;
      setDiceValue(diceRoll);
      setDiceRolling(true);
      const diceLanding = fromPosition + diceRoll;
      const overshoot = diceLanding > BOARD_SIZE;
      const duration = reducedMotion ? 0 : 550;

      if (overshoot) {
        setPiecePositions((prev) => ({ ...prev, [pid]: fromPosition }));
      } else {
        setPiecePositions((prev) => ({ ...prev, [pid]: diceLanding }));
        if (diceLanding !== toPosition) {
          pendingMoveRef.current = { diceLanding, toPosition };
          schedule(() => {
            setPiecePositions((prev) => ({ ...prev, [pid]: toPosition }));
            pendingMoveRef.current = null;
          }, duration);
        }
      }
      schedule(() => setDiceRolling(false), reducedMotion ? 0 : 800);
    });

    on('snake_ladder', (d) => {
      const type = d?.movedBySnake ? 'snake' : 'ladder';
      const to = d?.toPosition;
      const from = pendingMoveRef.current?.diceLanding ?? d?.fromPosition;
      setHighlight({ from, to, type });
      schedule(() => setHighlight(null), reducedMotion ? 0 : 1600);
    });

    on('turn_changed', (d) => {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              currentTurnPlayerId: d.currentTurnPlayerId,
              turnNumber: d.turnNumber,
            }
          : prev
      );
    });

    on('game_finished', (d) => {
      setSession((prev) => (prev ? { ...prev, status: 'FINISHED', winnerPlayerId: d.winnerPlayerId } : prev));
    });

    on('game_cancelled', () => {
      setSession((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
    });

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, token, restaurantId]);

  const isMyTurn = session.status === 'IN_PROGRESS' && session.currentTurnPlayerId === playerId;
  const currentPlayer = session.players.find((p) => p.id === session.currentTurnPlayerId);
  const winner = session.players.find((p) => p.id === session.winnerPlayerId);

  const handleRoll = async () => {
    if (!isMyTurn || rolling || connectionStatus !== 'connected') return;
    setRolling(true);
    setError(null);
    try {
      await customerGameService.roll(restaurantId, session.id, token);
    } catch (err: any) {
      setError(err.message || 'Unable to roll the dice.');
    } finally {
      setRolling(false);
    }
  };

  const snakeLadderElements = useMemo(() => {
    return (
      <>
        {ladders.map((conn) => {
          const a = getSquareCenter(conn.from);
          const b = getSquareCenter(conn.to);
          const rungs = [];
          for (let i = 1; i <= 4; i++) {
            const y = a.y + ((b.y - a.y) * i) / 5;
            rungs.push(
              <line key={i} x1={a.x - 2.2} y1={y} x2={a.x + 2.2} y2={y} stroke="#b45309" strokeWidth={0.9} strokeLinecap="round" />
            );
          }
          return (
            <g key={`ladder-${conn.from}`} opacity={0.9}>
              <line x1={a.x - 1.6} y1={a.y} x2={b.x - 1.6} y2={b.y} stroke="#d97706" strokeWidth={1.1} strokeLinecap="round" />
              <line x1={a.x + 1.6} y1={a.y} x2={b.x + 1.6} y2={b.y} stroke="#d97706" strokeWidth={1.1} strokeLinecap="round" />
              {rungs}
            </g>
          );
        })}

        {snakes.map((conn) => {
          const a = getSquareCenter(conn.from); // head (higher)
          const b = getSquareCenter(conn.to); // tail (lower)
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const perpX = -dy;
          const perpY = dx;
          const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
          const wiggle = 3.5;
          const cx1 = midX + (perpX / len) * wiggle;
          const cy1 = midY + (perpY / len) * wiggle;
          const cx2 = midX - (perpX / len) * wiggle;
          const cy2 = midY - (perpY / len) * wiggle;
          return (
            <g key={`snake-${conn.from}`} opacity={0.85}>
              <path
                d={`M ${a.x} ${a.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${b.x} ${b.y}`}
                fill="none"
                stroke="#16a34a"
                strokeWidth={2.4}
                strokeLinecap="round"
              />
              <circle cx={a.x} cy={a.y} r={1.4} fill="#15803d" />
            </g>
          );
        })}
      </>
    );
  }, [ladders, snakes]);

  const finished = session.status === 'FINISHED';
  const cancelled = session.status === 'CANCELLED';

  return (
    <div className="space-y-4">
      {/* Turn / connection bar */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-zinc-400">
          {connectionStatus === 'connected' ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          ) : connectionStatus === 'reconnecting' ? (
            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-zinc-500" />
          )}
          {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </span>
        <span className="flex items-center gap-1.5 text-zinc-300">
          <Users className="w-3.5 h-3.5 text-amber-400" />
          {session.players.length}/{session.maxPlayers}
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Status line */}
      {!finished && !cancelled && (
        <div className="text-center">
          <div className={`text-sm font-semibold ${isMyTurn ? 'text-amber-300' : 'text-zinc-300'}`}>
            {isMyTurn ? 'Your turn — roll the dice!' : `${currentPlayer?.alias || 'Opponent'}'s turn`}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Turn {session.turnNumber}</div>
        </div>
      )}

      {/* Board */}
      <div className="relative w-full aspect-square select-none rounded-2xl overflow-hidden border border-zinc-700/70 bg-gradient-to-br from-zinc-900 to-zinc-950 shadow-2xl">
        {/* Tiles */}
        <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
          {VISUAL_SQUARES.map((square, i) => {
            const isStart = square === 1;
            const isFinish = square === 100;
            const isHighlight =
              highlight &&
              (square === highlight.from || square === highlight.to);
            return (
              <div
                key={square}
                className={`relative border border-zinc-800/60 flex items-center justify-center ${
                  (i % 2 === 0) ? 'bg-zinc-800/40' : 'bg-zinc-800/70'
                } ${isHighlight ? 'bg-amber-500/30' : ''}`}
              >
                <span className={`text-[9px] font-mono ${isStart ? 'text-emerald-400 font-bold' : isFinish ? 'text-amber-300 font-bold' : 'text-zinc-500'}`}>
                  {square}
                </span>
              </div>
            );
          })}
        </div>

        {/* Snakes & Ladders overlay */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          {snakeLadderElements}
        </svg>

        {/* Player pieces */}
        {session.players.map((p, idx) => {
          const pos = piecePositions[p.id] ?? p.position;
          const center = getSquareCenter(pos);
          const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
          const active = p.id === session.currentTurnPlayerId && session.status === 'IN_PROGRESS';
          return (
            <motion.div
              key={p.id}
              initial={false}
              animate={{ left: `${center.x}%`, top: `${center.y}%` }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeInOut' }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
              style={{ width: '10%' }}
            >
              <motion.div
                animate={active ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={active ? { repeat: Infinity, duration: 1.4 } : { duration: 0 }}
                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 flex items-center justify-center font-black text-[10px] shadow-lg ${
                  active ? 'ring-2 ring-amber-300' : ''
                } ${p.id === playerId ? 'border-white' : 'border-black/40'}`}
                style={{ backgroundColor: color, color: '#18181b' }}
              >
                {(p.alias || '?').charAt(0).toUpperCase()}
              </motion.div>
              <span className="text-[8px] text-zinc-300 truncate max-w-full text-center mt-0.5 leading-none">
                {p.alias}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Dice + roll */}
      {!finished && !cancelled && (
        <div className="flex items-center justify-center gap-5 py-2">
          <DieFace value={diceValue ?? 1} rolling={diceRolling} />
          <button
            onClick={handleRoll}
            disabled={!isMyTurn || rolling || connectionStatus !== 'connected'}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {rolling ? 'Rolling…' : isMyTurn ? 'Roll Dice' : 'Waiting…'}
          </button>
        </div>
      )}

      {/* Winner screen */}
      {finished && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6 space-y-4">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-16 h-16 mx-auto rounded-full bg-amber-500/15 border border-amber-400/40 flex items-center justify-center"
          >
            <Trophy className="w-8 h-8 text-amber-400" />
          </motion.div>
          <h3 className="font-serif-luxury text-2xl font-bold text-white">{winner?.alias || 'Player'} wins!</h3>
          <div className="space-y-1.5 max-w-xs mx-auto">
            {session.players
              .slice()
              .sort((a, b) => b.position - a.position)
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs text-zinc-300">
                  <span>{p.alias}</span>
                  <span className="font-mono text-zinc-500">square {p.position}</span>
                </div>
              ))}
          </div>
          <button onClick={onExit} className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm">
            Back to Order
          </button>
        </motion.div>
      )}

      {/* Cancelled screen */}
      {cancelled && (
        <div className="text-center py-6">
          <h3 className="font-serif-luxury text-xl font-bold text-white">Game cancelled</h3>
          <p className="text-xs text-zinc-500 mt-1 mb-4">This game is no longer active.</p>
          <button onClick={onExit} className="px-6 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm">
            Back to Order
          </button>
        </div>
      )}
    </div>
  );
};
