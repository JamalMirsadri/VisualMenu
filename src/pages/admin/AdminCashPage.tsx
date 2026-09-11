import React, { useEffect, useState } from 'react';
import {
  Banknote,
  RefreshCw,
  Search,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  User,
  AlertCircle,
  X,
  Printer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { paymentService } from '../../services/paymentService';
import type { Payment, FiscalDocument } from '../../types';

export const AdminCashPage: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const [cashPayments, setCashPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [summary, setSummary] = useState<{
    totalCashCollected: number;
    totalCashGivenAsChange: number;
    netCashInRegister: number;
    transactionCount: number;
  }>({
    totalCashCollected: 0,
    totalCashGivenAsChange: 0,
    netCashInRegister: 0,
    transactionCount: 0,
  });

  const [selectedReceipt, setSelectedReceipt] = useState<FiscalDocument | null>(null);

  const fetchCashOperations = async () => {
    if (!activeRestaurant?.id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await paymentService.getCashOperations(activeRestaurant.id, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      setCashPayments(res.cashPayments);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load cash operations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashOperations();
  }, [activeRestaurant?.id, startDate, endDate]);

  const handleViewReceipt = async (orderId: string) => {
    try {
      const doc = await paymentService.getStaffOrderReceipt(orderId);
      setSelectedReceipt(doc);
    } catch (err: any) {
      alert(err.message || 'Failed to retrieve receipt.');
    }
  };

  const filtered = cashPayments.filter((p) => {
    const q = searchQuery.toLowerCase();
    const orderNum = p.order?.orderNumber?.toLowerCase() || '';
    const staffName = p.receivedByUser?.name?.toLowerCase() || '';
    return orderNum.includes(q) || staffName.includes(q) || p.id.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Banknote className="w-6 h-6 text-emerald-400" />
            Cash Register & Drawer Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Authoritative cash settlement trail, change calculations, and staff accountability logs for {activeRestaurant?.name}.
          </p>
        </div>

        <button
          onClick={fetchCashOperations}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Drawer</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Cash Tendered In</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-white">
            €{summary.totalCashCollected.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Total banknotes & coins received
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Change Returned</span>
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-amber-400">
            €{summary.totalCashGivenAsChange.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Change returned to diners
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Net Drawer Balance</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-emerald-400">
            €{summary.netCashInRegister.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Net cash remaining in physical till
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Cash Settlements</span>
            <Banknote className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {summary.transactionCount}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Staff-verified cash closures
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by Order # or Staff Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
        />
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cash Operations Table */}
      {loading && cashPayments.length === 0 ? (
        <div className="p-12 text-center text-zinc-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <p className="text-sm">Loading cash operations audit trail...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
          <Banknote className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
          <p className="text-sm">No cash settlements found for the selected period.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Time</th>
                <th className="p-4">Order #</th>
                <th className="p-4 text-right">Total Due</th>
                <th className="p-4 text-right">Tendered In</th>
                <th className="p-4 text-right">Change Given</th>
                <th className="p-4 text-right">Net Drawer Cash</th>
                <th className="p-4">Settled By (Staff)</th>
                <th className="p-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.map((p) => {
                const tendered = Number(p.amountReceived ?? p.amount);
                const change = Number(p.changeGiven ?? 0);
                const net = Number(p.amount);

                return (
                  <tr key={p.id} className="hover:bg-zinc-800/30 transition">
                    <td className="p-4 text-zinc-400">
                      <div>{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="text-[10px] text-zinc-600">{new Date(p.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="p-4 font-semibold text-white">
                      #{p.order?.orderNumber || '-'}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-white">
                      €{net.toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono text-emerald-400">
                      €{tendered.toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono text-amber-400">
                      €{change.toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-emerald-300">
                      €{net.toFixed(2)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{p.receivedByUser?.name || 'Staff Member'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {p.orderId && (
                        <button
                          onClick={() => handleViewReceipt(p.orderId)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 transition inline-flex items-center gap-1 text-[11px]"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Staff Receipt View Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12161f] border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-4 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Receipt className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Technical Cash Receipt</h3>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="text-center pb-2 border-b border-dashed border-zinc-700">
                <div className="font-bold text-sm text-white font-sans">
                  {selectedReceipt.snapshot?.restaurant?.name || activeRestaurant?.name}
                </div>
                <div className="text-zinc-400 text-[11px]">
                  {selectedReceipt.snapshot?.restaurant?.address || (activeRestaurant as any)?.address || 'Portugal'}
                </div>
                <div className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-amber-300 mt-1">
                  SÉRIE {selectedReceipt.series} • {selectedReceipt.documentNumber}
                </div>
              </div>

              <div className="space-y-1 text-zinc-300 py-2 border-b border-dashed border-zinc-700">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Time:</span>
                  <span>{new Date(selectedReceipt.issuedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Method:</span>
                  <span className="font-bold text-emerald-400">CASH / NUMERÁRIO</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Customer NIF:</span>
                  <span className="font-bold text-amber-400">
                    {selectedReceipt.customerNif || '999999990 (Consumidor Final)'}
                  </span>
                </div>
              </div>

              <div className="space-y-1 py-2 border-b border-dashed border-zinc-700">
                {selectedReceipt.snapshot?.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate pr-2">{item.quantity}x {item.name}</span>
                    <span className="text-white font-semibold">€{Number(item.lineTotal).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-zinc-400">
                  <span>Total Due:</span>
                  <span>€{Number(selectedReceipt.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Amount Tendered:</span>
                  <span>€{Number(selectedReceipt.snapshot?.cashPayment?.amountReceived ?? selectedReceipt.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>Change Given:</span>
                  <span>€{Number(selectedReceipt.snapshot?.cashPayment?.changeGiven ?? 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-zinc-500">
                <p className="truncate">Hash: {selectedReceipt.hash}</p>
                <p className="italic">Registo emitido para efeitos de conferência de caixa.</p>
              </div>

              <div className="pt-3 flex gap-2 font-sans">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-neutral-950 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-amber-400 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 text-white text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
