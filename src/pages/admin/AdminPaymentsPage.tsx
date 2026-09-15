import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Banknote,
  Smartphone,
  RefreshCw,
  Search,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  Printer,
  Download,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { paymentService } from '../../services/paymentService';
import { ExportDialog } from '../../components/admin/ExportDialog';
import type { Payment, PaymentMethod, PaymentStatus, FiscalDocument } from '../../types';

export const AdminPaymentsPage: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Summary Metrics
  const [summary, setSummary] = useState<{
    totalAmount: number;
    totalRefunded: number;
    netAmount: number;
    paidCount: number;
  }>({
    totalAmount: 0,
    totalRefunded: 0,
    netAmount: 0,
    paidCount: 0,
  });

  // Refund Modal State
  const [selectedPaymentForRefund, setSelectedPaymentForRefund] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<FiscalDocument | null>(null);

  // Export Modal State
  const [exportOpen, setExportOpen] = useState(false);

  const fetchPayments = async () => {
    if (!activeRestaurant?.id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await paymentService.getRestaurantPayments(activeRestaurant.id, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        method: methodFilter === 'ALL' ? undefined : methodFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      const paymentList = Array.isArray(res) ? res : (res?.payments || []);
      setPayments(paymentList);
      if (res && !Array.isArray(res) && res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [activeRestaurant?.id, statusFilter, methodFilter, startDate, endDate]);

  const handleOpenRefund = (payment: Payment) => {
    setSelectedPaymentForRefund(payment);
    const maxRefund = Number(payment.amount) - Number(payment.refundedAmount || 0);
    setRefundAmount(maxRefund.toFixed(2));
    setRefundReason('');
    setRefundError(null);
  };

  const handleSubmitRefund = async () => {
    if (!selectedPaymentForRefund) return;
    const amountNum = parseFloat(refundAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setRefundError('Please enter a valid refund amount.');
      return;
    }

    try {
      setIsProcessingRefund(true);
      setRefundError(null);
      await paymentService.refundPayment(selectedPaymentForRefund.id, amountNum, refundReason.trim() || undefined);
      setSelectedPaymentForRefund(null);
      await fetchPayments();
    } catch (err: any) {
      setRefundError(err.message || 'Refund failed.');
    } finally {
      setIsProcessingRefund(false);
    }
  };

  const handleViewReceipt = async (orderId: string) => {
    try {
      const doc = await paymentService.getStaffOrderReceipt(orderId);
      setSelectedReceipt(doc);
    } catch (err: any) {
      alert(err.message || 'Failed to retrieve receipt.');
    }
  };

  const getMethodIcon = (method: PaymentMethod) => {
    switch (method) {
      case 'CASH':
        return <Banknote className="w-4 h-4 text-emerald-400" />;
      case 'CARD':
        return <CreditCard className="w-4 h-4 text-blue-400" />;
      case 'MBWAY':
        return <Smartphone className="w-4 h-4 text-pink-400" />;
    }
  };

  const getStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'PAID':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'PENDING':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'AUTHORIZED':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'PARTIALLY_REFUNDED':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'REFUNDED':
        return 'bg-purple-600/20 text-purple-300 border-purple-500/40';
      case 'FAILED':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'CANCELLED':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  const filteredPayments = (payments || []).filter((p) => {
    const q = searchQuery.toLowerCase();
    const orderNum = p.order?.orderNumber?.toLowerCase() || '';
    const idStr = p.id.toLowerCase();
    const providerId = p.providerPaymentId?.toLowerCase() || '';
    return orderNum.includes(q) || idStr.includes(q) || providerId.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-amber-400" />
            Financial Transactions & Payments
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Reconciled payments ledger, card authorizations, MB WAY requests, cash collections, and refunds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold border border-amber-500 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            onClick={fetchPayments}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Gross Volume</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-white">
            €{summary.totalAmount.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {summary.paidCount} successful payments
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Net Collected</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-emerald-400">
            €{summary.netAmount.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Gross minus all processed refunds
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Total Refunded</span>
            <ArrowUpRight className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-purple-400">
            €{summary.totalRefunded.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Returned to customers
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Audit Integrity</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">
            100%
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Signed technical receipt snapshots
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by Order # or Payment ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
        >
          <option value="ALL">All Statuses</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="AUTHORIZED">Authorized</option>
          <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
          <option value="REFUNDED">Refunded</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {/* Method Filter */}
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
        >
          <option value="ALL">All Methods</option>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="MBWAY">MB WAY</option>
        </select>

        {/* Date Filters */}
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

      {/* Payments Table */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && payments.length === 0 ? (
        <div className="p-12 text-center text-zinc-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <p className="text-sm">Loading payments ledger...</p>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
          <Receipt className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
          <p className="text-sm">No payment records found matching criteria.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Payment Ref</th>
                <th className="p-4">Order #</th>
                <th className="p-4">Method</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4 text-right">Refunded</th>
                <th className="p-4">Staff / Channel</th>
                <th className="p-4">Date / Time</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredPayments.map((p) => {
                const refundableAmount = Number(p.amount) - Number(p.refundedAmount || 0);
                const canRefund = p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED';

                return (
                  <tr key={p.id} className="hover:bg-zinc-800/30 transition">
                    <td className="p-4 font-mono text-[11px] text-zinc-400">
                      <span className="text-white font-semibold">
                        {p.id.substring(0, 8)}...
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-white">
                      #{p.order?.orderNumber || '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        {getMethodIcon(p.method)}
                        <span>{p.method}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getStatusBadge(
                          p.status
                        )}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-white">
                      €{Number(p.amount).toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono text-purple-400">
                      {Number(p.refundedAmount || 0) > 0 ? `€${Number(p.refundedAmount).toFixed(2)}` : '-'}
                    </td>
                    <td className="p-4 text-zinc-400">
                      {p.receivedByUser?.name || p.provider}
                    </td>
                    <td className="p-4 text-zinc-400">
                      {new Date(p.createdAt).toLocaleDateString()}{' '}
                      <span className="text-zinc-600">
                        {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {p.orderId && (
                          <button
                            onClick={() => handleViewReceipt(p.orderId)}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 transition"
                            title="View Technical Receipt"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canRefund && refundableAmount > 0 && (
                          <button
                            onClick={() => handleOpenRefund(p)}
                            className="px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[11px] font-semibold transition flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Refund</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Refund Modal */}
      {selectedPaymentForRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12161f] border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-purple-400">
                <RotateCcw className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Process Payment Refund</h3>
              </div>
              <button
                onClick={() => setSelectedPaymentForRefund(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs space-y-1">
              <div className="flex justify-between text-zinc-400">
                <span>Payment Reference:</span>
                <span className="font-mono text-white">{selectedPaymentForRefund.id.substring(0, 12)}...</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Method:</span>
                <span className="font-bold text-white">{selectedPaymentForRefund.method}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Original Total:</span>
                <span className="font-mono text-white">€{Number(selectedPaymentForRefund.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Max Refundable:</span>
                <span className="font-mono font-bold text-emerald-400">
                  €{(Number(selectedPaymentForRefund.amount) - Number(selectedPaymentForRefund.refundedAmount || 0)).toFixed(2)}
                </span>
              </div>
            </div>

            {refundError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{refundError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">
                  Refund Amount (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">
                  Reason for Refund
                </label>
                <textarea
                  rows={2}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Customer requested cancellation / Wrong dish served"
                  className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>
            </div>

            <div className="pt-3 flex gap-2">
              <button
                onClick={handleSubmitRefund}
                disabled={isProcessingRefund}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition"
              >
                {isProcessingRefund ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Refund...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirm Refund</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setSelectedPaymentForRefund(null)}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Receipt View Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12161f] border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-4 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Receipt className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Technical Receipt</h3>
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
                  <span className="text-zinc-500">Issued At:</span>
                  <span>{new Date(selectedReceipt.issuedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Customer NIF:</span>
                  <span className="font-bold text-amber-400">
                    {selectedReceipt.customerNif || '999999990 (Consumidor Final)'}
                  </span>
                </div>
                {selectedReceipt.customerName && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Legal Name:</span>
                    <span>{selectedReceipt.customerName}</span>
                  </div>
                )}
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
                  <span>Subtotal:</span>
                  <span>€{Number(selectedReceipt.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Tax (IVA):</span>
                  <span>€{Number(selectedReceipt.taxAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-zinc-700">
                  <span>TOTAL:</span>
                  <span className="text-amber-400">€{Number(selectedReceipt.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-zinc-500">
                <p className="truncate">Hash: {selectedReceipt.hash}</p>
                <p className="italic">Documento para conferência interna e arquivo de conferência.</p>
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

      {/* Export Dialog */}
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Payments"
        onExport={(params) => {
          if (!activeRestaurant?.id) return Promise.reject(new Error('No active restaurant.'));
          return paymentService.exportPayments(activeRestaurant.id, params);
        }}
      />
    </div>
  );
};
