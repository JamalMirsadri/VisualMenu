import React, { useEffect, useState, useRef, useMemo } from 'react';
import { buildApiUrl, getAuthToken } from '../../config';
import {
  LayoutGrid,
  Clock,
  User,
  UtensilsCrossed,
  CheckCircle,
  Banknote,
  Search,
  RefreshCw,
  Radio,
  Bell,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { orderService } from '../../services/orderService';
import { paymentService } from '../../services/paymentService';
import { TableDetailDrawer } from '../../components/admin/TableDetailDrawer';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import type { TableOperationalInfo, FloorSummary, Order } from '../../types';

type OperationalFilter =
  | 'ALL'
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'PREPARING'
  | 'READY_TO_SERVE'
  | 'AWAITING_PAYMENT'
  | 'MY_ASSIGNED';

const STATE_BADGE_STYLES: Record<string, { label: string; bg: string; text: string; border: string; glow?: string }> = {
  AVAILABLE: {
    label: 'Available',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  ORDER_PENDING: {
    label: 'Pending',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  ORDER_ACTIVE: {
    label: 'Active',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  PREPARING: {
    label: 'In Kitchen',
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
  },
  READY_TO_SERVE: {
    label: 'Ready to Serve',
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    border: 'border-purple-500/40',
    glow: 'ring-2 ring-purple-500/50 animate-pulse',
  },
  SERVED: {
    label: 'Served',
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
  },
  AWAITING_PAYMENT: {
    label: 'Bill Requested',
    bg: 'bg-amber-400/20',
    text: 'text-amber-300',
    border: 'border-amber-400/40',
  },
  PAID: {
    label: 'Paid (Pending Release)',
    bg: 'bg-teal-500/15',
    text: 'text-teal-300',
    border: 'border-teal-500/30',
  },
};

export const AdminFloorPage: React.FC = () => {
  const { activeRestaurant, user } = useAuth();
  const [floorData, setFloorData] = useState<FloorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OperationalFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState<TableOperationalInfo | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cash modal state
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashOrder, setCashOrder] = useState<Order | null>(null);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [cashStaffNote, setCashStaffNote] = useState<string>('');
  const [isSettlingCash, setIsSettlingCash] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  const fetchFloor = async (silent = false) => {
    if (!activeRestaurant?.id) {
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const data = await orderService.getFloorState(activeRestaurant.id);
      setFloorData(data);
      setError(null);
      // If table drawer is open, keep selected table in sync
      if (selectedTable) {
        const updated = data.tables.find((t: TableOperationalInfo) => t.id === selectedTable.id);
        if (updated) setSelectedTable(updated);
      }
    } catch (err: any) {
      console.error('Failed to load floor state:', err);
      if (!silent) setError(err.message || 'Failed to fetch floor operational state');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchFloor();
  }, [activeRestaurant?.id]);

  // Real-time SSE updates for floor operations
  useEffect(() => {
    if (!activeRestaurant?.id) return;

    const token = getAuthToken();
    const sseUrl = `${buildApiUrl(`/restaurants/${activeRestaurant.id}/orders/stream`)}${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setSseConnected(true);
    };

    es.onerror = () => {
      setSseConnected(false);
    };

    // Generic refresh handler
    const handleUpdate = () => {
      fetchFloor(true);
    };

    es.addEventListener('order_created', handleUpdate);
    es.addEventListener('order_updated', handleUpdate);
    es.addEventListener('order_status_updated', handleUpdate);
    es.addEventListener('order_assigned', handleUpdate);
    es.addEventListener('order_ready', handleUpdate);
    es.addEventListener('order_served', handleUpdate);
    es.addEventListener('floor_updated', handleUpdate);
    es.addEventListener('payment_completed', handleUpdate);

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [activeRestaurant?.id]);

  // Cash modal settlement handlers
  const handleOpenCashModal = (order: Order) => {
    setCashOrder(order);
    setAmountReceived(Number(order.total).toFixed(2));
    setCashStaffNote('');
    setCashError(null);
    setCashModalOpen(true);
  };

  const handleSettleCash = async () => {
    if (!cashOrder || !activeRestaurant?.id) return;
    const receivedNum = parseFloat(amountReceived);
    const totalNum = Number(cashOrder.total);

    if (isNaN(receivedNum) || receivedNum < totalNum) {
      setCashError(`Amount received must be at least €${totalNum.toFixed(2)}`);
      return;
    }

    setIsSettlingCash(true);
    setCashError(null);
    try {
      const changeGiven = Math.max(0, Math.round((receivedNum - totalNum) * 100) / 100);
      await paymentService.settleCashPayment(cashOrder.id, {
        amountReceived: receivedNum,
        changeGiven,
        customerNote: cashStaffNote.trim() || undefined,
        isStaffSettlement: true,
      });

      setCashModalOpen(false);
      fetchFloor(true);
    } catch (err: any) {
      setCashError(err.message || 'Cash settlement failed');
    } finally {
      setIsSettlingCash(false);
    }
  };

  // Quick claim directly from table card
  const handleQuickClaim = async (e: React.MouseEvent, table: TableOperationalInfo) => {
    e.stopPropagation();
    const activeOrders = table.activeOrders || [];
    if (!activeRestaurant?.id || activeOrders.length === 0) return;
    try {
      const firstUnassigned = activeOrders.find((o) => !o.assignedWaiter);
      if (firstUnassigned) {
        await orderService.claimOrder(activeRestaurant.id, firstUnassigned.id);
        fetchFloor(true);
      }
    } catch (err) {
      console.error('Quick claim failed', err);
    }
  };

  // Quick serve directly from table card
  const handleQuickServe = async (e: React.MouseEvent, table: TableOperationalInfo) => {
    e.stopPropagation();
    const activeOrders = table.activeOrders || [];
    if (!activeRestaurant?.id) return;
    try {
      const readyOrder = activeOrders.find((o) => o.status === 'READY');
      if (readyOrder) {
        await orderService.serveOrder(activeRestaurant.id, readyOrder.id);
        fetchFloor(true);
      }
    } catch (err) {
      console.error('Quick serve failed', err);
    }
  };

  // Filtered tables list
  const filteredTables = useMemo(() => {
    if (!floorData) return [];
    let list = floorData.tables;

    // Filter by tab
    if (filter === 'AVAILABLE') {
      list = list.filter((t) => t.state === 'AVAILABLE');
    } else if (filter === 'OCCUPIED') {
      list = list.filter((t) => t.state !== 'AVAILABLE');
    } else if (filter === 'PREPARING') {
      list = list.filter((t) => t.state === 'PREPARING');
    } else if (filter === 'READY_TO_SERVE') {
      list = list.filter((t) => t.state === 'READY_TO_SERVE');
    } else if (filter === 'AWAITING_PAYMENT') {
      list = list.filter((t) => t.state === 'AWAITING_PAYMENT');
    } else if (filter === 'MY_ASSIGNED') {
      list = list.filter((t) =>
        t.assignedWaiters?.some((w) => w.userId === user?.id)
      );
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.number.toLowerCase().includes(q) ||
          (t.name && t.name.toLowerCase().includes(q)) ||
          (t.location && t.location.toLowerCase().includes(q))
      );
    }

    return list;
  }, [floorData, filter, searchQuery, user?.id]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 text-amber-300 text-xs font-semibold uppercase tracking-wider">
              <LayoutGrid className="w-3.5 h-3.5" />
              Floor Operations & Table State
            </span>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                sseConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              <Radio
                className={`w-3 h-3 ${sseConnected ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`}
              />
              <span>{sseConnected ? 'Floor Live' : 'Reconnecting...'}</span>
            </div>
          </div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-wide">
            Dining Floor Operations
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time table occupancy, kitchen readiness, waiter coordination, and table balance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchFloor()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition border border-zinc-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Bar */}
      {floorData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Total Tables
            </span>
            <span className="text-xl font-bold text-white font-mono mt-1">
              {floorData.totalTables}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
              Available
            </span>
            <span className="text-xl font-bold text-emerald-400 font-mono mt-1">
              {floorData.availableTables}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">
              Occupied
            </span>
            <span className="text-xl font-bold text-blue-400 font-mono mt-1">
              {floorData.occupiedTables}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">
              Kitchen Prep
            </span>
            <span className="text-xl font-bold text-orange-400 font-mono mt-1">
              {floorData.ordersPreparing}
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex flex-col justify-between ${
            floorData.ordersReadyToServe > 0 ? 'ring-1 ring-purple-500/50 animate-pulse' : ''
          }`}>
            <span className="text-[11px] font-medium text-purple-300 uppercase tracking-wider flex items-center gap-1">
              <Bell className="w-3 h-3 text-purple-400" />
              Ready to Serve
            </span>
            <span className="text-xl font-bold text-purple-300 font-mono mt-1">
              {floorData.ordersReadyToServe}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
              Bill Requested
            </span>
            <span className="text-xl font-bold text-amber-400 font-mono mt-1">
              {floorData.awaitingPayment}
            </span>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'All Tables' },
            { id: 'AVAILABLE', label: 'Available' },
            { id: 'OCCUPIED', label: 'Occupied' },
            { id: 'PREPARING', label: 'Cooking' },
            { id: 'READY_TO_SERVE', label: 'Ready' },
            { id: 'AWAITING_PAYMENT', label: 'Awaiting Payment' },
            { id: 'MY_ASSIGNED', label: 'My Tables' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as OperationalFilter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                filter === tab.id
                  ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64 shrink-0">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search table number or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
          />
        </div>
      </div>

      {/* Main Floor Tables Grid */}
      {loading && !floorData ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <div className="w-9 h-9 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-3" />
          <p className="text-xs font-medium">Loading floor state...</p>
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => fetchFloor()} title="Could not load floor state" />
      ) : filteredTables.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-dashed border-zinc-800 text-zinc-500">
          <LayoutGrid className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No tables match current filter</p>
          <p className="text-xs text-zinc-600 mt-1">
            Try adjusting your search query or selecting &quot;All Tables&quot;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTables.map((table) => {
            const badge = STATE_BADGE_STYLES[table.state] || {
              label: table.state,
              bg: 'bg-zinc-800',
              text: 'text-zinc-300',
              border: 'border-zinc-700',
            };

            const hasReadyOrder = table.state === 'READY_TO_SERVE';
            const hasUnassignedOrder = (table.activeOrders || []).some((o) => !o.assignedWaiter);
            const myAssigned = table.assignedWaiters?.some((w) => w.userId === user?.id);

            return (
              <div
                key={table.id}
                onClick={() => {
                  setSelectedTable(table);
                  setIsDrawerOpen(true);
                }}
                className={`p-5 rounded-2xl bg-zinc-900/80 border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01] ${
                  table.state === 'READY_TO_SERVE'
                    ? 'border-purple-500/60 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/40'
                    : table.state === 'AWAITING_PAYMENT'
                    ? 'border-amber-500/50 shadow-md shadow-amber-500/5'
                    : table.state === 'AVAILABLE'
                    ? 'border-zinc-800/80 hover:border-emerald-500/40'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  {/* Card Header: Table Number & Status Badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center font-serif text-amber-300 font-bold text-sm">
                        {table.number}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          {table.name}
                        </h3>
                        <span className="text-[10px] text-zinc-500">
                          Cap: {table.capacity} guests
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold ${badge.bg} ${badge.text} ${badge.border} ${
                        badge.glow || ''
                      }`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Operational Status Info */}
                  <div className="space-y-2 py-2 text-xs border-t border-b border-zinc-800/70">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        Duration in state
                      </span>
                      <span className="font-mono font-medium text-zinc-200">
                        {table.minutesInCurrentState ?? 0} min
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <UtensilsCrossed className="w-3.5 h-3.5 text-zinc-500" />
                        Active orders
                      </span>
                      <span className="font-mono font-medium text-amber-400">
                        {table.activeOrderCount}
                      </span>
                    </div>

                    {table.totalUnpaidAmount > 0 && (
                      <div className="flex items-center justify-between text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                          Unpaid bill
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          €{Number(table.totalUnpaidAmount).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Assigned Waiter info */}
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-400 truncate">
                      <User className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      {table.assignedWaiters && table.assignedWaiters.length > 0 ? (
                        <span className="truncate text-zinc-300 font-medium">
                          {table.assignedWaiters[0].name}
                        </span>
                      ) : (
                        <span className="text-zinc-600 italic">Unassigned</span>
                      )}
                    </div>

                    {myAssigned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                        Assigned to you
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Quick Action Bar */}
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {hasReadyOrder && (
                      <button
                        onClick={(e) => handleQuickServe(e, table)}
                        className="px-2.5 py-1 rounded-lg bg-purple-500 hover:bg-purple-400 text-white font-semibold text-xs transition flex items-center gap-1 shadow-md shadow-purple-500/20 cursor-pointer"
                      >
                        <CheckCircle className="w-3 h-3" />
                        <span>Serve</span>
                      </button>
                    )}

                    {hasUnassignedOrder && !myAssigned && (
                      <button
                        onClick={(e) => handleQuickClaim(e, table)}
                        className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 font-semibold text-xs transition cursor-pointer"
                      >
                        Claim
                      </button>
                    )}
                  </div>

                  <span className="text-xs font-semibold text-amber-400 group-hover:text-amber-300 flex items-center gap-1">
                    Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table Detail Slide-Over Drawer */}
      <TableDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        table={selectedTable}
        onRefresh={() => fetchFloor(true)}
        onOpenCashModal={(order) => handleOpenCashModal(order)}
      />

      {/* Cash Settlement Modal */}
      {cashModalOpen && cashOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-zinc-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h3 className="font-serif-luxury text-lg font-bold text-white">
                  Cash Settlement
                </h3>
              </div>
              <button
                onClick={() => setCashModalOpen(false)}
                className="text-zinc-500 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Order Reference:</span>
                <span className="font-mono text-zinc-200">#{cashOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Total Due:</span>
                <span className="font-mono text-base font-bold text-emerald-400">
                  €{Number(cashOrder.total).toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Amount Received (€)
              </label>
              <input
                type="number"
                step="0.01"
                min={Number(cashOrder.total)}
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
              />
              {parseFloat(amountReceived) > Number(cashOrder.total) && (
                <p className="text-xs text-emerald-400 mt-1">
                  Change to return:{' '}
                  <span className="font-mono font-bold">
                    €{(parseFloat(amountReceived) - Number(cashOrder.total)).toFixed(2)}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Staff Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Paid at Table 4"
                value={cashStaffNote}
                onChange={(e) => setCashStaffNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {cashError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {cashError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setCashModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition"
              >
                Cancel
              </button>
              <button
                disabled={isSettlingCash}
                onClick={handleSettleCash}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition disabled:opacity-50"
              >
                {isSettlingCash ? 'Processing...' : 'Confirm Cash Received'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
