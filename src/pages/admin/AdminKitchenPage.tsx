import React, { useEffect, useState, useRef } from 'react';
import { buildApiUrl, getAuthToken } from '../../config';
import {
  ChefHat,
  Clock,
  MapPin,
  Flame,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  FileText,
  Radio,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { orderService } from '../../services/orderService';
import { ErrorBanner } from '../../components/admin/ErrorBanner';
import type { Order, OrderStatus, OrderItemStatus } from '../../types';

export const AdminKitchenPage: React.FC = () => {
  const { activeRestaurant, hasPermission } = useAuth();
  const canUpdateKitchen = hasPermission('UPDATE_KITCHEN_STATUS') || hasPermission('CONFIRM_PREPARATION') || hasPermission('MARK_READY');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const kdsWarningMins = (activeRestaurant as any)?.settings?.kdsWarningMinutes ?? 15;
  const kdsUrgentMins = (activeRestaurant as any)?.settings?.kdsUrgentMinutes ?? 25;


  const fetchKitchenOrders = async () => {
    if (!activeRestaurant?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await orderService.getOrders(activeRestaurant.id, { limit: 100 });
      // Kitchen focuses on active culinary stages
      const activeKitchenStages: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'];
      setOrders(data.filter((o) => activeKitchenStages.includes(o.status)));
    } catch (err: any) {
      setError(err.message || 'Failed to load kitchen tickets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenOrders();
  }, [activeRestaurant?.id]);

  // Live SSE Connection for Kitchen
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
          const activeKitchenStages: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'];
          if (activeKitchenStages.includes(payload.order.status)) {
            setOrders((prev) => {
              const exists = prev.some((o) => o.id === payload.order.id);
              if (exists) return prev;
              return [payload.order, ...prev];
            });
          }
        }
      } catch (err) {
        console.error('SSE order_created parse error in KDS', err);
      }
    });

    es.addEventListener('order_status_changed', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.order) {
          const activeKitchenStages: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'];
          setOrders((prev) => {
            if (activeKitchenStages.includes(payload.order.status)) {
              const exists = prev.some((o) => o.id === payload.order.id);
              if (exists) {
                return prev.map((o) => (o.id === payload.order.id ? payload.order : o));
              }
              return [payload.order, ...prev];
            } else {
              // Order completed or cancelled, remove from active KDS
              return prev.filter((o) => o.id !== payload.order.id);
            }
          });
        }
      } catch (err) {
        console.error('SSE order_status_changed parse error in KDS', err);
      }
    });

    es.addEventListener('order_item_status_changed', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.orderId && payload?.itemId && payload?.newStatus) {
          setOrders((prev) =>
            prev.map((order) => {
              if (order.id !== payload.orderId) return order;
              return {
                ...order,
                items: order.items.map((item) =>
                  item.id === payload.itemId ? { ...item, status: payload.newStatus } : item
                ),
              };
            })
          );
        }
      } catch (err) {
        console.error('SSE order_item_status_changed parse error in KDS', err);
      }
    });

    es.addEventListener('order_assigned', () => {
      fetchKitchenOrders();
    });

    es.addEventListener('order_ready', () => {
      fetchKitchenOrders();
    });

    es.addEventListener('order_served', () => {
      fetchKitchenOrders();
    });

    es.addEventListener('floor_updated', () => {
      fetchKitchenOrders();
    });

    es.onerror = () => {
      setSseConnected(false);
    };

    // Polling fallback every 30s only if disconnected
    const interval = setInterval(() => {
      if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
        fetchKitchenOrders();
      }
    }, 30000);

    return () => {
      es.close();
      clearInterval(interval);
    };
  }, [activeRestaurant?.id]);

  const handleAdvance = async (orderId: string, nextStatus: OrderStatus) => {
    if (!activeRestaurant?.id) return;
    try {
      setUpdatingId(orderId);
      await orderService.updateOrderStatus(activeRestaurant.id, orderId, nextStatus);
      await fetchKitchenOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to update order status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAdvanceItem = async (
    orderId: string,
    itemId: string,
    currentStatus: OrderItemStatus = 'PENDING'
  ) => {
    if (!activeRestaurant?.id) return;
    const nextMap: Record<OrderItemStatus, OrderItemStatus> = {
      PENDING: 'PREPARING',
      PREPARING: 'READY',
      READY: 'SERVED',
      SERVED: 'SERVED',
      CANCELLED: 'CANCELLED',
    };
    const nextStatus = nextMap[currentStatus];
    if (!nextStatus || nextStatus === currentStatus) return;
    try {
      await orderService.updateOrderItemStatus(activeRestaurant.id, orderId, itemId, nextStatus);
    } catch (err: any) {
      console.error('Failed to update item status', err);
    }
  };

  // Group into KDS lanes
  const queueOrders = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED');
  const prepOrders = orders.filter((o) => o.status === 'PREPARING');
  const readyOrders = orders.filter((o) => o.status === 'READY');

  const getMinutesAgo = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diffMs / 60000);
  };

  const renderTicketCard = (
    order: Order,
    actionButton: { label: string; nextStatus: OrderStatus; bg: string }
  ) => {
    const minutesAgo = getMinutesAgo(order.createdAt);
    const isUrgent = minutesAgo >= kdsUrgentMins;
    const isWarning = minutesAgo >= kdsWarningMins && !isUrgent;
    const isBusy = updatingId === order.id;

    return (
      <div
        key={order.id}
        className={`rounded-2xl p-4 transition border flex flex-col justify-between ${
          isUrgent
            ? 'bg-red-950/30 border-red-500/60 shadow-lg shadow-red-950/40 ring-1 ring-red-500/30'
            : isWarning
            ? 'bg-amber-950/20 border-amber-500/50 shadow-md shadow-amber-950/30'
            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <div>
          {/* Ticket Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-base font-black text-amber-400">
                #{order.orderNumber}
              </span>
              {order.table ? (
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center gap-1 border border-amber-500/30">
                  <MapPin className="w-3 h-3" /> Table {order.table.number}
                </span>
              ) : (
                <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                  Direct
                </span>
              )}
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

            <div
              className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
                isUrgent
                  ? 'bg-red-500 text-white animate-pulse'
                  : isWarning
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-zinc-400 bg-zinc-800/80'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{minutesAgo}m ago</span>
            </div>
          </div>

          {/* Dish List */}
          <div className="space-y-2 mb-4">

            {order.items.map((item) => (
              <div key={item.id} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-white leading-tight">
                    <span className="inline-block w-6 text-amber-400 text-base font-black">
                      {item.quantity}×
                    </span>
                    {item.foodNameSnapshot}
                  </span>
                  {canUpdateKitchen ? (
                    <button
                      onClick={() => handleAdvanceItem(order.id, item.id, item.status)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition cursor-pointer shrink-0 ${
                        item.status === 'READY'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : item.status === 'PREPARING'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                          : item.status === 'SERVED'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                      }`}
                      title="Click to advance item status"
                    >
                      {item.status || 'PENDING'}
                    </button>
                  ) : (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                        item.status === 'READY'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : item.status === 'PREPARING'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {item.status || 'PENDING'}
                    </span>
                  )}
                </div>
                {item.customerNote && (
                  <div className="ml-6 mt-1 text-xs text-amber-300/90 italic bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                    "{item.customerNote}"
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Overall note if present */}
          {order.customerNote && (
            <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300/90 mb-4 flex items-start gap-1.5">
              <FileText className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
              <span>
                <strong>Kitchen Note:</strong> {order.customerNote}
              </span>
            </div>
          )}
        </div>

        {/* 1-Click Action */}
        {canUpdateKitchen ? (
          <button
            onClick={() => handleAdvance(order.id, actionButton.nextStatus)}
            disabled={isBusy}
            className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-50 cursor-pointer ${actionButton.bg}`}
          >
            {isBusy ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{actionButton.label}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        ) : (
          <div className="w-full py-2.5 px-4 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-zinc-400 font-semibold text-xs text-center flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>Read-Only View</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* KDS Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ChefHat className="w-7 h-7 text-amber-400" />
            Kitchen Display Screen (KDS)
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Real-time kitchen order sequencing, cooking stations, and plating for {activeRestaurant?.name}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!canUpdateKitchen && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              <Lock className="w-3.5 h-3.5" />
              <span>Read-Only Mode</span>
            </div>
          )}

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl text-xs">
            <Radio
              className={`w-3.5 h-3.5 ${
                sseConnected ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'
              }`}
            />
            <span className={sseConnected ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
              {sseConnected ? 'KDS Live Stream Connected' : 'Polling Updates'}
            </span>
          </div>

          <button
            onClick={fetchKitchenOrders}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
            title="Refresh now"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

      </div>

      {error && (
        <ErrorBanner message={error} onRetry={fetchKitchenOrders} title="Could not load kitchen tickets" />
      )}

      {/* 3-Column KDS Floor Layout */}
      {loading && orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <div className="w-9 h-9 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-3" />
          <p className="text-xs font-medium">Loading kitchen tickets...</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Order Queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 px-4 py-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Queue / Fire</h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-black">
              {queueOrders.length}
            </span>
          </div>

          <div className="space-y-4">
            {queueOrders.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl">
                No tickets in queue
              </div>
            ) : (
              queueOrders.map((order) =>
                renderTicketCard(order, {
                  label: 'Start Cooking',
                  nextStatus: 'PREPARING',
                  bg: 'bg-amber-500 hover:bg-amber-400 text-neutral-950',
                })
              )
            )}
          </div>
        </div>

        {/* Column 2: In Preparation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 px-4 py-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Cooking</h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black">
              {prepOrders.length}
            </span>
          </div>

          <div className="space-y-4">
            {prepOrders.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl">
                Kitchen stations idle
              </div>
            ) : (
              prepOrders.map((order) =>
                renderTicketCard(order, {
                  label: 'Mark Plated & Ready',
                  nextStatus: 'READY',
                  bg: 'bg-emerald-500 hover:bg-emerald-400 text-white',
                })
              )
            )}
          </div>
        </div>

        {/* Column 3: Ready for Expedite / Service */}
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 px-4 py-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Ready to Serve</h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-black">
              {readyOrders.length}
            </span>
          </div>

          <div className="space-y-4">
            {readyOrders.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl">
                No orders waiting on pass
              </div>
            ) : (
              readyOrders.map((order) =>
                renderTicketCard(order, {
                  label: 'Delivered to Table (Served)',
                  nextStatus: 'SERVED',
                  bg: 'bg-purple-600 hover:bg-purple-500 text-white',
                })
              )
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
