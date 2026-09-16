import React, { useEffect, useState } from 'react';
import {
  Wallet,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  Coins,
} from 'lucide-react';
import {
  videoCreditService,
  type VideoCreditPack,
  type RestaurantCreditBalance,
} from '../../services/videoCreditService';

export const PlatformVideoCreditsPage: React.FC = () => {
  const [packs, setPacks] = useState<VideoCreditPack[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantCreditBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  // Pack form
  const [packName, setPackName] = useState('');
  const [packCredits, setPackCredits] = useState('10');
  const [packPrice, setPackPrice] = useState('10');

  // Grant / purchase
  const [grantAmount, setGrantAmount] = useState('');
  const [purchasePackId, setPurchasePackId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([videoCreditService.listPacks(), videoCreditService.listRestaurants()]);
      setPacks(p);
      setRestaurants(r);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load credits' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (id: string) => {
    setSelected(id);
    try {
      setDetail(await videoCreditService.getRestaurant(id));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load detail' });
    }
  };

  const handleCreatePack = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await videoCreditService.createPack({ name: packName, credits: parseInt(packCredits, 10), price: parseFloat(packPrice) });
      setPackName(''); setPackCredits('10'); setPackPrice('10');
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Create pack failed' });
    }
  };

  const handleRemovePack = async (id: string) => {
    try {
      await videoCreditService.removePack(id);
      await load();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Delete pack failed' });
    }
  };

  const handleGrant = async () => {
    if (!selected || !grantAmount) return;
    try {
      await videoCreditService.grantCredits(selected, parseInt(grantAmount, 10));
      setGrantAmount('');
      await load();
      await loadDetail(selected);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Grant failed' });
    }
  };

  const handlePurchase = async () => {
    if (!selected || !purchasePackId) return;
    try {
      await videoCreditService.purchasePack(selected, purchasePackId);
      setPurchasePackId('');
      await load();
      await loadDetail(selected);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Purchase failed' });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
          <Wallet className="w-8 h-8 text-amber-500" />
          Video Credit Management
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Configure credit packs and administer restaurant video credit balances.</p>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 border ${feedback.type === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-red-950/40 border-red-800/60 text-red-300'}`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-zinc-500 flex flex-col items-center gap-2"><RefreshCw className="w-6 h-6 animate-spin text-amber-500" /><span className="text-xs">Loading...</span></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Credit packs */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold"><Coins className="w-5 h-5 text-amber-500" /> Credit Packs</div>
            {packs.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                <div>
                  <div className="text-sm font-semibold text-zinc-200">{p.name}</div>
                  <div className="text-[11px] text-zinc-500">{p.credits} credits · €{p.price}</div>
                </div>
                <button onClick={() => handleRemovePack(p.id)} className="p-1.5 text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <form onSubmit={handleCreatePack} className="pt-2 space-y-2 border-t border-zinc-800">
              <input value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="Pack name" required className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={packCredits} onChange={(e) => setPackCredits(e.target.value)} placeholder="Credits" required className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white" />
                <input type="number" step="0.01" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} placeholder="Price" required className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white" />
              </div>
              <button type="submit" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold"><Plus className="w-3.5 h-3.5" /> Add pack</button>
            </form>
          </div>

          {/* Restaurant balances */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-2">
            <div className="text-white font-bold">Restaurant Balances</div>
            {restaurants.map((r) => (
              <button key={r.id} onClick={() => loadDetail(r.id)} className={`w-full text-left p-3 rounded-xl border transition ${selected === r.id ? 'bg-amber-500/10 border-amber-500/40' : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-200 truncate">{r.name}</span>
                  <span className="text-xs font-mono text-amber-400">{r.balance} left</span>
                </div>
                <div className="text-[11px] text-zinc-500">allowance {r.allowance} · used {r.used} · purchased {r.purchased}</div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-3">
            <div className="text-white font-bold">Selected Restaurant</div>
            {!detail ? (
              <p className="text-xs text-zinc-500">Select a restaurant to view ledger and manage credits.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-zinc-800/60"><div className="text-lg font-bold text-white">{detail.balance}</div><div className="text-[10px] text-zinc-500">Remaining</div></div>
                  <div className="p-2 rounded-lg bg-zinc-800/60"><div className="text-lg font-bold text-white">{detail.used}</div><div className="text-[10px] text-zinc-500">Used</div></div>
                  <div className="p-2 rounded-lg bg-zinc-800/60"><div className="text-lg font-bold text-white">{detail.allowance}</div><div className="text-[10px] text-zinc-500">Allowance</div></div>
                </div>

                <div className="flex gap-2">
                  <input type="number" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} placeholder="Grant amount" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white" />
                  <button onClick={handleGrant} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Grant</button>
                </div>

                <div className="flex gap-2">
                  <select value={purchasePackId} onChange={(e) => setPurchasePackId(e.target.value)} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white">
                    <option value="">Select pack...</option>
                    {packs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.credits})</option>)}
                  </select>
                  <button onClick={handlePurchase} className="px-3 py-2 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold">Purchase</button>
                </div>

                <div className="pt-2 border-t border-zinc-800">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-2">Transaction History</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(detail.ledger || []).map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">{l.type}</span>
                        <span className={`font-mono ${l.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{l.amount > 0 ? '+' : ''}{l.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
