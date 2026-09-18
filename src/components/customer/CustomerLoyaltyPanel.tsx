import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Gift,
  History,
  QrCode,
  RefreshCw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Restaurant } from '../../types';
import {
  customerLoyaltyService,
  type CustomerLedgerEntryDto,
  type CustomerRedemptionDto,
  type CustomerRewardDto,
} from '../../services/customerLoyaltyService';

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

function loyaltyStorageKey(slug: string): string {
  return `aura_loyalty_token_${slug}`;
}

interface CustomerLoyaltyPanelProps {
  restaurant: Restaurant;
  onClose: () => void;
}

export const CustomerLoyaltyPanel: React.FC<CustomerLoyaltyPanelProps> = ({ restaurant, onClose }) => {
  const restaurantId = restaurant.id;
  const slug = restaurant.slug;

  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [loyaltyUrl, setLoyaltyUrl] = useState<string | null>(null);
  const [ledger, setLedger] = useState<CustomerLedgerEntryDto[]>([]);
  const [rewards, setRewards] = useState<CustomerRewardDto[]>([]);
  const [redemptions, setRedemptions] = useState<CustomerRedemptionDto[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [enrolling, setEnrolling] = useState(false);
  const [enrollName, setEnrollName] = useState('');
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrollPhone, setEnrollPhone] = useState('');

  const [redeeming, setRedeeming] = useState(false);
  const [confirmReward, setConfirmReward] = useState<CustomerRewardDto | null>(null);

  // Resolve the loyalty token: URL query first (scanned QR), then localStorage.
  useEffect(() => {
    let found: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      found = params.get('loyalty');
      if (found) {
        localStorage.setItem(loyaltyStorageKey(slug), found);
      } else {
        found = localStorage.getItem(loyaltyStorageKey(slug));
      }
    } catch {
      found = null;
    }
    setToken(found);
  }, [slug]);

  const loadLoyaltyData = useCallback(
    async (currentToken: string) => {
      setLoading(true);
      setError(null);
      try {
        const [me, ledgerData, rewardsData, redemptionsData, qrData] = await Promise.all([
          customerLoyaltyService.getMe(restaurantId, currentToken),
          customerLoyaltyService.getLedger(restaurantId, currentToken),
          customerLoyaltyService.getRewards(restaurantId),
          customerLoyaltyService.getRedemptions(restaurantId, currentToken),
          customerLoyaltyService.getQr(restaurantId, currentToken),
        ]);
        setBalance(me.balance ?? 0);
        setCustomerName(me.name);
        setLedger(ledgerData.entries ?? []);
        setRewards(rewardsData.rewards ?? []);
        setRedemptions(redemptionsData.redemptions ?? []);
        setLoyaltyUrl(qrData.loyaltyUrl ?? null);
      } catch (err: any) {
        setError(err.message || 'Failed to load your loyalty account.');
      } finally {
        setLoading(false);
      }
    },
    [restaurantId]
  );

  useEffect(() => {
    if (token) {
      loadLoyaltyData(token);
    } else {
      setLoading(false);
    }
  }, [token, loadLoyaltyData]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = enrollName.trim();
    const email = enrollEmail.trim();
    const phone = enrollPhone.trim();
    if (!name && !email && !phone) {
      setError('Provide your name, email, or phone to enroll — NIF is never required.');
      return;
    }
    setEnrolling(true);
    setError(null);
    try {
      const result = await customerLoyaltyService.enroll(restaurantId, { name, email, phone });
      if (result.token) {
        localStorage.setItem(loyaltyStorageKey(slug), result.token);
        setToken(result.token);
        setLoyaltyUrl(result.loyaltyUrl);
        setBalance(result.balance ?? 0);
        setCustomerName(result.name);
        await loadLoyaltyData(result.token);
        flash('Welcome to My Loyalty!');
      } else if (result.alreadyEnrolled) {
        setError('You are already enrolled. Use your existing loyalty QR to recover your account.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to enroll.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleRedeem = async () => {
    if (!token || !confirmReward) return;
    setRedeeming(true);
    setError(null);
    try {
      const idempotencyKey = `redeem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await customerLoyaltyService.redeem(restaurantId, token, confirmReward.id, idempotencyKey);
      flash(`Redeemed "${confirmReward.name}"!`);
      setConfirmReward(null);
      await loadLoyaltyData(token);
    } catch (err: any) {
      setError(err.message || 'Failed to redeem reward.');
      setConfirmReward(null);
    } finally {
      setRedeeming(false);
    }
  };

  const absoluteLoyaltyUrl = useMemo(() => {
    if (!loyaltyUrl) return null;
    if (loyaltyUrl.startsWith('/')) {
      return `${window.location.origin}${loyaltyUrl}`;
    }
    return loyaltyUrl;
  }, [loyaltyUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        role="dialog"
        aria-modal="true"
        aria-label="My Loyalty"
        className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[92svh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-4 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
              <Gift className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-serif-luxury text-base font-bold text-white leading-tight">My Loyalty</h2>
              <p className="text-[11px] text-zinc-500">{restaurant.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close loyalty"
            className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {notice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-zinc-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
              <p className="text-sm">Loading your loyalty account...</p>
            </div>
          ) : !token ? (
            /* ----------------------------- Enrollment ----------------------------- */
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/15 to-transparent border border-amber-500/30 text-center">
                <Sparkles className="w-7 h-7 text-amber-400 mx-auto mb-2" />
                <h3 className="font-serif-luxury text-lg font-bold text-white mb-1">Join {restaurant.name} Loyalty</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Earn points, redeem rewards, and keep your account with a personal QR code — no NIF required.
                </p>
              </div>

              <form onSubmit={handleEnroll} className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 font-semibold mb-1.5">Name (optional)</label>
                  <input
                    type="text"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 font-semibold mb-1.5">Email (optional)</label>
                  <input
                    type="email"
                    value={enrollEmail}
                    onChange={(e) => setEnrollEmail(e.target.value)}
                    className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 font-semibold mb-1.5">Phone (optional)</label>
                  <input
                    type="tel"
                    value={enrollPhone}
                    onChange={(e) => setEnrollPhone(e.target.value)}
                    className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                    placeholder="+351 ..."
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  At least one identifier is required. Your NIF / tax ID is optional and never required.
                </p>
                <button
                  type="submit"
                  disabled={enrolling}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {enrolling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                  Enroll Now
                </button>
              </form>
            </div>
          ) : (
            /* ----------------------------- Loyalty Dashboard ----------------------------- */
            <div className="space-y-4">
              {/* Balance */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/20 via-zinc-900 to-zinc-900 border border-amber-500/30 text-center">
                <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">Points Balance</div>
                <div className="text-5xl font-black text-amber-300">{balance ?? 0}</div>
                {customerName && <div className="text-sm text-zinc-300 mt-2">{customerName}</div>}
              </div>

              {/* QR card */}
              {absoluteLoyaltyUrl && (
                <div className="p-5 rounded-2xl bg-white text-center">
                  <div className="flex justify-center">
                    <QRCodeSVG value={absoluteLoyaltyUrl} size={200} bgColor="#ffffff" fgColor="#18181b" level="M" />
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-2 text-zinc-700">
                    <QrCode className="w-4 h-4" />
                    <span className="text-xs font-semibold">Your Personal Loyalty QR</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                    Scan this QR next time you visit to recover the same loyalty account.
                  </p>
                </div>
              )}

              {/* Available rewards */}
              <section>
                <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                  <Gift className="w-4 h-4 text-amber-400" />
                  <span>Available Rewards</span>
                </div>
                {rewards.length === 0 ? (
                  <p className="text-xs text-zinc-500">No rewards available yet.</p>
                ) : (
                  <div className="space-y-2">
                    {rewards.map((reward) => {
                      const outOfStock = !reward.unlimitedStock && (reward.stock == null || reward.stock < 1);
                      const insufficient = (balance ?? 0) < reward.pointsCost;
                      return (
                        <div key={reward.id} className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{reward.name}</div>
                            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{reward.description || 'No description'}</p>
                            <div className="text-[11px] text-zinc-400 mt-1.5">
                              <span className="font-mono text-amber-300">{reward.pointsCost} pts</span>
                              <span className="text-zinc-600"> · </span>
                              <span>{reward.unlimitedStock ? 'Unlimited' : `${reward.stock ?? 0} left`}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => setConfirmReward(reward)}
                            disabled={outOfStock || insufficient}
                            className="shrink-0 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Redeem
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Redemption history */}
              <section>
                <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Redemption History</span>
                </div>
                {redemptions.length === 0 ? (
                  <p className="text-xs text-zinc-500">No redemptions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {redemptions.map((r) => (
                      <div key={r.id} className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white">{r.rewardName || 'Reward'}</div>
                          <div className="text-[11px] text-zinc-500">{formatDate(r.redeemedAt || r.createdAt)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-amber-300">-{r.pointsSpent}</div>
                          <div className={`text-[10px] font-bold uppercase ${r.status === 'COMPLETED' ? 'text-emerald-400' : 'text-zinc-500'}`}>{r.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Points history */}
              <section>
                <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                  <History className="w-4 h-4 text-amber-400" />
                  <span>Points History</span>
                </div>
                {ledger.length === 0 ? (
                  <p className="text-xs text-zinc-500">No point transactions yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {ledger.map((entry, i) => (
                      <div key={i} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white">{TRANSACTION_LABELS[entry.type] || entry.type}</div>
                          <div className="text-[10px] text-zinc-500">{formatDate(entry.createdAt)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-mono text-sm ${entry.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">bal {entry.balanceAfter}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-semibold text-sm flex items-center justify-center gap-1"
              >
                <ChevronRight className="w-4 h-4" />
                Back to Menu
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Redeem confirmation */}
      <AnimatePresence>
        {confirmReward && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmReward(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-white mb-2">Redeem Reward</h3>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Redeem <span className="text-white font-semibold">{confirmReward.name}</span> for{' '}
                <span className="font-mono text-amber-300">{confirmReward.pointsCost} points</span>?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmReward(null)}
                  disabled={redeeming}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRedeem}
                  disabled={redeeming}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition disabled:opacity-50"
                >
                  {redeeming && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
