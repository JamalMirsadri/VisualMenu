import React, { useEffect, useState, useRef } from 'react';
import { buildApiUrl, getAuthToken } from '../../config';
import {
  ClipboardList,
  Clock,
  MapPin,
  AlertCircle,
  RefreshCw,
  Search,
  Eye,
  ArrowRight,
  Ban,
  FileText,
  Radio,
  Calendar,
  ExternalLink,
  History,
  Banknote,
  Receipt,
  CheckCircle,
  Printer,
  X,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { orderService } from '../../services/orderService';
import { paymentService } from '../../services/paymentService';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import type { Order, OrderStatus, FiscalDocument } from '../../types';

const STATUS_FILTERS: Array<{ label: string; value: OrderStatus | 'ALL' }> = [
  { label: 'All Orders', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Preparing', value: 'PREPARING' },
  { label: 'Ready', value: 'READY' },
  { label: 'Served', value: 'SERVED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const NEXT_STATUS_MAP: Partial<Record<OrderStatus, { next: OrderStatus; label: string; color: string }>> = {
  PENDING: { next: 'CONFIRMED', label: 'Confirm Order', color: 'bg-blue-500 hover:bg-blue-400 text-white' },
  CONFIRMED: { next: 'PREPARING', label: 'Send to Kitchen', color: 'bg-amber-500 hover:bg-amber-400 text-neutral-950' },
  PREPARING: { next: 'READY', label: 'Mark Ready', color: 'bg-emerald-500 hover:bg-emerald-400 text-white' },
  READY: { next: 'SERVED', label: 'Mark Served', color: 'bg-purple-500 hover:bg-purple-400 text-white' },
  SERVED: { next: 'COMPLETED', label: 'Complete Order', color: 'bg-zinc-700 hover:bg-zinc-600 text-white' },
};

export const AdminOrdersPage: React.FC = () => {
  const { activeRestaurant, hasPermission, user } = useAuth();
  const canCancelOrder = hasPermission('CANCEL_ORDER');
  const canConfirmOrder = hasPermission('CONFIRM_ORDER') || hasPermission('UPDATE_ORDER_STATUS');
  const canConfirmPrep = hasPermission('CONFIRM_PREPARATION') || hasPermission('UPDATE_ORDER_STATUS');
  const canMarkReady = hasPermission('MARK_READY') || hasPermission('UPDATE_ORDER_STATUS');
  const canMarkServed = hasPermission('MARK_ORDER_SERVED') || hasPermission('UPDATE_ORDER_STATUS');
  const canCompleteOrder = hasPermission('MARK_ORDER_COMPLETED') || hasPermission('UPDATE_ORDER_STATUS');
  const canViewPayments = hasPermission('VIEW_PAYMENTS') || hasPermission('VIEW_PAYMENT_STATUS');
  const canConfirmCash = hasPermission('CONFIRM_CASH_PAYMENT') || hasPermission('PROCESS_PAYMENTS');
  const canViewFiscalData = hasPermission('VIEW_CUSTOMER_FISCAL_DATA');

  const canAdvanceToStatus = (status: OrderStatus): boolean => {
    switch (status) {
      case 'CONFIRMED': return canConfirmOrder;
      case 'PREPARING': return canConfirmPrep;
      case 'READY': return canMarkReady;
      case 'SERVED': return canMarkServed;
      case 'COMPLETED': return canCompleteOrder;
      default: return hasPermission('UPDATE_ORDER_STATUS');
    }
  };
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [operationalFilter, setOperationalFilter] = useState<'ALL' | 'MY_ORDERS' | 'READY_TO_SERVE' | 'AWAITING_PAYMENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Phase 8: Cash Settlement & Receipt Modal State
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashOrder, setCashOrder] = useState<Order | null>(null);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [cashStaffNote, setCashStaffNote] = useState<string>('');
  const [isSettlingCash, setIsSettlingCash] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<FiscalDocument | null>(null);

  const getOrderPaymentStatus = (o: Order): string => {
    return (o as any).latestPayment?.status || o.payments?.[0]?.status || 'UNPAID';
  };

  const getOrderPaymentBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'PENDING':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'REFUNDED':
      case 'PARTIALLY_REFUNDED':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const handleOpenCashModal = (order: Order) => {
    setCashOrder(order);
    setAmountReceived(Number(order.total).toFixed(2));
    setCashStaffNote('');
    setCashError(null);
    setCashModalOpen(true);
  };

  const handleSettleCash = async () => {
    if (!cashOrder) return;
    const receivedNum = parseFloat(amountReceived);
    const totalNum = Number(cashOrder.total);

    if (isNaN(receivedNum) || receivedNum < totalNum) {
      setCashError(`Amount received must be at least the order total (€${totalNum.toFixed(2)}).`);
      return;
    }

    try {
      setIsSettlingCash(true);
      setCashError(null);
      const changeGiven = Math.max(0, Math.round((receivedNum - totalNum) * 100) / 100);

      const res = await paymentService.settleCashPayment(cashOrder.id, {
        amountReceived: receivedNum,
        changeGiven,
        customerNote: cashStaffNote.trim() || undefined,
        isStaffSettlement: true,
      });

      setCashModalOpen(false);
      setCashOrder(null);
      await fetchOrders();
      if (res.receipt) {
        setSelectedReceipt(res.receipt);
      }
    } catch (err: any) {
      setCashError(err.message || 'Cash settlement failed.');
    } finally {
      setIsSettlingCash(false);
    }
  };

  const handleViewOrderReceipt = async (orderId: string) => {
    try {
      const doc = await paymentService.getStaffOrderReceipt(orderId);
      setSelectedReceipt(doc);
    } catch (err: any) {
      alert(err.message || 'Failed to retrieve receipt.');
    }
  };

  const fetchOrders = async () => {
    if (!activeRestaurant?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await orderService.getOrders(activeRestaurant.id, {
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [activeRestaurant?.id, selectedStatus, dateFrom, dateTo]);

  // Real-time SSE listener
  useEffect(() => {
    if (!activeRestaurant?.id) return;

    const token = getAuthToken() || '';
    const sseUrl = `${buildApiUrl(`/restaurants/${activeRestaurant.id}/events`)}?token=${encodeURIComponent(
      token
    )}`;

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setSseConnected(true);
    };

    es.addEventListener('order_created', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.order) {
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === payload.order.id);
            if (exists) return prev;
            return [payload.order, ...prev];
          });
        }
      } catch (err) {
        console.error('SSE order_created parse error', err);
      }
    });

    es.addEventListener('order_status_changed', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.order) {
          setOrders((prev) =>
            prev.map((o) => (o.id === payload.order.id ? payload.order : o))
          );
          setSelectedOrder((current) =>
            current?.id === payload.order.id ? payload.order : current
          );
        }
      } catch (err) {
        console.error('SSE order_status_changed parse error', err);
      }
    });

    es.addEventListener('order_item_status_changed', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.orderId && payload?.itemId && payload?.newStatus) {
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== payload.orderId) return o;
              return {
                ...o,
                items: o.items.map((it) =>
                  it.id === payload.itemId ? { ...it, status: payload.newStatus } : it
                ),
              };
            })
          );
          setSelectedOrder((current) => {
            if (!current || current.id !== payload.orderId) return current;
            return {
              ...current,
              items: current.items.map((it) =>
                it.id === payload.itemId ? { ...it, status: payload.newStatus } : it
              ),
            };
          });
        }
      } catch (err) {
        console.error('SSE order_item_status_changed parse error', err);
      }
    });

    es.addEventListener('payment_status_changed', () => {
      fetchOrders();
    });

    es.addEventListener('order_assigned', () => {
      fetchOrders();
    });

    es.addEventListener('order_ready', () => {
      fetchOrders();
    });

    es.addEventListener('order_served', () => {
      fetchOrders();
    });

    es.addEventListener('floor_updated', () => {
      fetchOrders();
    });

    es.onerror = () => {
      setSseConnected(false);
    };

    // Polling fallback every 30s only if SSE disconnected
    const timer = setInterval(() => {
      if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
        fetchOrders();
      }
    }, 30000);

    return () => {
      es.close();
      clearInterval(timer);
    };
  }, [activeRestaurant?.id]);



  const handleAdvanceStatus = async (order: Order, nextStatus: OrderStatus) => {
    if (!activeRestaurant?.id) return;
    try {
      setUpdatingId(order.id);
      const updated =
        nextStatus === 'SERVED'
          ? await orderService.serveOrder(activeRestaurant.id, order.id)
          : await orderService.updateOrderStatus(activeRestaurant.id, order.id, nextStatus);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to advance order status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    if (!activeRestaurant?.id) return;
    const reason = window.prompt(`Cancel order #${order.orderNumber}? Please enter reason:`);
    if (reason === null) return;

    try {
      setUpdatingId(order.id);
      const updated = await orderService.cancelOrder(activeRestaurant.id, order.id, reason);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClaimOrder = async (orderId: string) => {
    if (!activeRestaurant?.id) return;
    try {
      setUpdatingId(orderId);
      const updated = await orderService.claimOrder(activeRestaurant.id, orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to claim order.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUnassignOrder = async (orderId: string) => {
    if (!activeRestaurant?.id) return;
    try {
      setUpdatingId(orderId);
      const updated = await orderService.unassignOrder(activeRestaurant.id, orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to release order assignment.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleServeOrder = async (orderId: string) => {
    if (!activeRestaurant?.id) return;
    try {
      setUpdatingId(orderId);
      const updated = await orderService.serveOrder(activeRestaurant.id, orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to mark order served.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSetPriority = async (orderId: string, priority: 'NORMAL' | 'HIGH' | 'URGENT') => {
    if (!activeRestaurant?.id) return;
    try {
      setUpdatingId(orderId);
      const updated = await orderService.setOrderPriority(activeRestaurant.id, orderId, priority);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to set priority.');
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'CONFIRMED':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'PREPARING':
        return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
      case 'READY':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'SERVED':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'COMPLETED':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      case 'CANCELLED':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (operationalFilter === 'MY_ORDERS') {
      const isAssignedToMe =
        o.assignedWaiter?.userId === user?.id || (o as any).assignedWaiter?.user?.id === user?.id;
      if (!isAssignedToMe) return false;
    } else if (operationalFilter === 'READY_TO_SERVE') {
      if (o.status !== 'READY') return false;
    } else if (operationalFilter === 'AWAITING_PAYMENT') {
      if (o.status !== 'SERVED' && getOrderPaymentStatus(o) !== 'UNPAID') return false;
    }

    const q = searchQuery.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      (o.table?.number && o.table.number.toLowerCase().includes(q)) ||
      (o.customerNote && o.customerNote.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-amber-400" />
            Live Orders Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time customer tray submissions, kitchen handoffs, and fulfillment for {activeRestaurant?.name}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Live SSE indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-medium">
            <Radio
              className={`w-3.5 h-3.5 ${
                sseConnected ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'
              }`}
            />
            <span className={sseConnected ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
              {sseConnected ? 'Real-Time SSE Connected' : 'Polling Updates'}
            </span>
          </div>

          <button
            onClick={fetchOrders}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner message={error} onRetry={fetchOrders} title="Could not load orders" />
      )}

      {/* Operational Role Station Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'ALL', label: 'All Orders' },
          { id: 'MY_ORDERS', label: 'My Assigned' },
          { id: 'READY_TO_SERVE', label: 'Ready to Serve' },
          { id: 'AWAITING_PAYMENT', label: 'Awaiting Payment' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setOperationalFilter(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              operationalFilter === tab.id
                ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20'
                : 'bg-zinc-900/90 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters Bar: Status Tabs & Date Range */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 lg:pb-0 no-scrollbar">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSelectedStatus(f.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedStatus === f.value
                  ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Date Range Inputs */}
        <div className="flex items-center gap-2 text-xs">
          <Calendar className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-400"
            title="Date from"
          />
          <span className="text-zinc-500">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-400"
            title="Date to"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="text-zinc-400 hover:text-white text-[11px] underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Filter by order #, table number, or note..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
        />
      </div>

      {/* Orders Grid / List */}
      {loading && orders.length === 0 ? (
        <div className="p-12 text-center text-zinc-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <p className="text-sm">Loading orders stream...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
          <FileText className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
          <p className="text-sm">No orders matching the active criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const nextAction = NEXT_STATUS_MAP[order.status];
            const isBusy = updatingId === order.id;

            return (
              <div
                key={order.id}
                className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Order Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-lg text-white">
                          #{order.orderNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getStatusBadge(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getOrderPaymentBadge(
                            getOrderPaymentStatus(order)
                          )}`}
                        >
                          {getOrderPaymentStatus(order)}
                        </span>
                        {order.priority && order.priority !== 'NORMAL' && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                              order.priority === 'URGENT'
                                ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            }`}
                          >
                            {order.priority}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>•</span>
                        {order.table ? (
                          <span className="flex items-center gap-1 text-amber-400 font-semibold">
                            <MapPin className="w-3 h-3" /> Table {order.table.number}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-medium">Takeaway</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-amber-400 text-base">
                        {order.currency} {Number(order.total).toFixed(2)}
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        {order.items.reduce((acc, i) => acc + i.quantity, 0)} items
                      </span>
                    </div>
                  </div>

                  {/* Items Preview */}
                  <div className="mt-3.5 space-y-1 text-xs border-t border-zinc-800/60 pt-3">
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between text-zinc-300">
                        <span className="truncate">
                          <strong className="text-amber-400 font-semibold mr-1.5">
                            {item.quantity}x
                          </strong>
                          {item.foodNameSnapshot}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="text-[11px] text-zinc-500 italic">
                        +{order.items.length - 3} more items...
                      </div>
                    )}
                  </div>

                  {order.customerNote && (
                    <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 italic">
                      "{order.customerNote}"
                    </div>
                  )}

                  {/* Waiter Assignment & Priority */}
                  <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-400 truncate">
                      <User className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      {order.assignedWaiter ? (
                        <span className="text-zinc-200 font-medium truncate">
                          {order.assignedWaiter.user?.name || 'Assigned Staff'}
                        </span>
                      ) : (
                        <span className="text-zinc-600 italic">Unassigned</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!order.assignedWaiter ? (
                        <button
                          disabled={isBusy}
                          onClick={() => handleClaimOrder(order.id)}
                          className="px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                        >
                          Claim
                        </button>
                      ) : (
                        (order.assignedWaiter.userId === user?.id ||
                          (order.assignedWaiter as any).user?.id === user?.id) && (
                          <button
                            disabled={isBusy}
                            onClick={() => handleUnassignOrder(order.id)}
                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] transition cursor-pointer disabled:opacity-50"
                          >
                            Release
                          </button>
                        )
                      )}

                      {/* Priority Switcher */}
                      <div className="flex items-center gap-0.5 ml-1">
                        {(['NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                          <button
                            key={p}
                            disabled={isBusy || order.priority === p}
                            onClick={() => handleSetPriority(order.id, p)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                              order.priority === p
                                ? 'bg-amber-400 text-black font-extrabold'
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                            title={`Set priority to ${p}`}
                          >
                            {p[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
                      title="View Full Ticket"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {getOrderPaymentStatus(order) !== 'PAID' && order.status !== 'CANCELLED' ? (
                      canConfirmCash && (
                        <button
                          onClick={() => handleOpenCashModal(order)}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                          title="Settle Cash Payment"
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          <span>Settle Cash</span>
                        </button>
                      )
                    ) : (
                      canViewPayments && (
                        <button
                          onClick={() => handleViewOrderReceipt(order.id)}
                          className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition cursor-pointer"
                          title="View Technical Receipt"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {order.status === 'READY' && canAdvanceToStatus('SERVED') && (
                      <button
                        onClick={() => handleServeOrder(order.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-purple-500 hover:bg-purple-400 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Serve</span>
                      </button>
                    )}

                    {order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && canCancelOrder && (
                      <button
                        onClick={() => handleCancelOrder(order)}
                        disabled={isBusy}
                        className="p-2 rounded-xl bg-zinc-800/50 hover:bg-red-950/40 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                        title="Cancel Order"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}

                    {nextAction && order.status !== 'CANCELLED' && order.status !== 'READY' && canAdvanceToStatus(nextAction.next) && (
                      <button
                        onClick={() => handleAdvanceStatus(order, nextAction.next)}
                        disabled={isBusy}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm ${nextAction.color} disabled:opacity-50 cursor-pointer`}
                      >
                        <span>{nextAction.label}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ORDER DETAILS MODAL / TICKET */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl text-white max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4 mb-4">
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-widest">Order Details</span>
                <h2 className="text-2xl font-black text-amber-400 mt-0.5">
                  #{selectedOrder.orderNumber}
                </h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                  <span>{new Date(selectedOrder.createdAt).toLocaleString()}</span>
                  <span>•</span>
                  <span>{selectedOrder.table ? `Table ${selectedOrder.table.number}` : 'Direct Order'}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Itemized Breakdown & History */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Public Tracker Link */}
              {selectedOrder.publicToken && (
                <a
                  href={`/order/${selectedOrder.publicToken}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:text-white hover:border-amber-400 transition text-xs font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    Customer Public Tracker URL
                  </span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <h4 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Itemized Breakdown</h4>
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                  <div className="flex justify-between items-start text-sm">
                    <span className="font-semibold text-white">
                      {item.quantity}x {item.foodNameSnapshot}
                    </span>
                    <span className="font-bold text-amber-400">
                      {selectedOrder.currency} {Number(item.lineTotal).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-zinc-500 mt-1">
                    <span>Unit Price: {selectedOrder.currency} {Number(item.unitPrice).toFixed(2)}</span>
                    <span className="uppercase text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">
                      {item.status}
                    </span>
                  </div>
                  {item.customerNote && (
                    <p className="text-xs text-amber-300/80 italic mt-1.5 bg-amber-500/10 p-1.5 rounded-lg">
                      Note: "{item.customerNote}"
                    </p>
                  )}
                </div>
              ))}

              {selectedOrder.customerNote && (
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
                  <strong className="block text-amber-400 font-semibold mb-1">Overall Kitchen Note:</strong>
                  <span>{selectedOrder.customerNote}</span>
                </div>
              )}

              {/* Order Status History Timeline */}
              {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    <History className="w-3.5 h-3.5 text-amber-400" />
                    <span>Status Transition Log</span>
                  </div>
                  <div className="space-y-1.5 text-xs divide-y divide-zinc-800/50">
                    {selectedOrder.statusHistory.map((hist) => (
                      <div key={hist.id} className="pt-1.5 flex items-center justify-between text-zinc-400">
                        <div>
                          <span className="text-amber-300 font-semibold font-mono">{hist.toStatus}</span>
                          {hist.fromStatus && (
                            <span className="text-zinc-500 text-[11px] ml-1.5">
                              (from {hist.fromStatus})
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500">
                          {new Date(hist.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 8: Payment & Fiscal Details */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[10px]">
                    Payment & Fiscal Data
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getOrderPaymentBadge(
                      getOrderPaymentStatus(selectedOrder)
                    )}`}
                  >
                    {getOrderPaymentStatus(selectedOrder)}
                  </span>
                </div>

                <div className="space-y-1 text-zinc-400">
                  <div className="flex justify-between">
                    <span>Method:</span>
                    <span className="font-medium text-white">
                      {(selectedOrder as any).latestPayment?.method || selectedOrder.payments?.[0]?.method || 'CASH'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer NIF:</span>
                    <span className="font-mono text-amber-300">
                      {canViewFiscalData
                        ? ((selectedOrder as any).nif || (selectedOrder as any).receipts?.[0]?.customerNif || '999999990 (Consumidor Final)')
                        : '***-***-*** (Protected)'}
                    </span>
                  </div>
                  {((selectedOrder as any).customerFiscalName || (selectedOrder as any).receipts?.[0]?.customerName) && (
                    <div className="flex justify-between">
                      <span>Legal Name:</span>
                      <span className="text-white">
                        {canViewFiscalData
                          ? ((selectedOrder as any).customerFiscalName || (selectedOrder as any).receipts?.[0]?.customerName)
                          : '*** (Protected)'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  {getOrderPaymentStatus(selectedOrder) !== 'PAID' ? (
                    canConfirmCash && (
                      <button
                        onClick={() => handleOpenCashModal(selectedOrder)}
                        className="flex-1 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Settle Cash Payment</span>
                      </button>
                    )
                  ) : (
                    canViewPayments && (
                      <button
                        onClick={() => handleViewOrderReceipt(selectedOrder.id)}
                        className="flex-1 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Receipt className="w-4 h-4" />
                        <span>View Technical Receipt</span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Pricing Totals */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span className="text-white">{selectedOrder.currency} {Number(selectedOrder.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Tax</span>
                  <span className="text-white">{selectedOrder.currency} {Number(selectedOrder.tax).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Service Charge</span>
                  <span className="text-white">{selectedOrder.currency} {Number(selectedOrder.serviceCharge).toFixed(2)}</span>
                </div>
                <div className="border-t border-zinc-800 pt-2 flex justify-between text-base font-black text-white">
                  <span>Total</span>
                  <span className="text-amber-400">{selectedOrder.currency} {Number(selectedOrder.total).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300"
              >
                Close Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Settlement Modal */}
      {cashModalOpen && cashOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12161f] border border-emerald-500/30 rounded-3xl p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Banknote className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Settle Cash Payment</h3>
              </div>
              <button
                onClick={() => setCashModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-xs space-y-2">
              <div className="flex justify-between text-zinc-400">
                <span>Order Reference:</span>
                <span className="font-bold text-white">#{cashOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Table / Type:</span>
                <span className="text-white">{cashOrder.table ? `Table ${cashOrder.table.number}` : 'Direct'}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-zinc-800">
                <span>Total Due:</span>
                <span className="text-amber-400 font-mono text-base">
                  €{Number(cashOrder.total).toFixed(2)}
                </span>
              </div>
            </div>

            {cashError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cashError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">
                  Amount Received From Customer (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-2 text-base font-mono font-bold text-white focus:outline-none focus:border-emerald-400"
                />

                {/* Quick amount chips */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setAmountReceived(Number(cashOrder.total).toFixed(2))}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                  >
                    Exact (€{Number(cashOrder.total).toFixed(2)})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAmountReceived((Math.ceil(Number(cashOrder.total) / 5) * 5 || Number(cashOrder.total) + 5).toFixed(2))
                    }
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                  >
                    Next €5
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAmountReceived((Math.ceil(Number(cashOrder.total) / 10) * 10 || Number(cashOrder.total) + 10).toFixed(2))
                    }
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                  >
                    Next €10
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAmountReceived((Math.ceil(Number(cashOrder.total) / 20) * 20 || Number(cashOrder.total) + 20).toFixed(2))
                    }
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                  >
                    Next €20
                  </button>
                </div>
              </div>

              {/* Calculated Change Due */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <span className="text-emerald-300 font-semibold">Change to Return:</span>
                <span className="font-mono font-black text-emerald-400 text-lg">
                  €{Math.max(0, (parseFloat(amountReceived) || 0) - Number(cashOrder.total)).toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">
                  Staff Note (Optional)
                </label>
                <input
                  type="text"
                  value={cashStaffNote}
                  onChange={(e) => setCashStaffNote(e.target.value)}
                  placeholder="e.g. Received at register 1"
                  className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={handleSettleCash}
                disabled={isSettlingCash || (parseFloat(amountReceived) || 0) < Number(cashOrder.total)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
              >
                {isSettlingCash ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Settling Payment...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Confirm Cash & Issue Receipt</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setCashModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Receipt Modal */}
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
                <p className="italic">Documento técnico de conferência interna.</p>
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
