import React, { useEffect, useState, useRef, useCallback } from 'react';
import { buildApiUrl } from '../../config';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  UtensilsCrossed,
  Sparkles,
  AlertTriangle,
  Radio,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Gamepad2,
  Receipt,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  X,
} from 'lucide-react';
import { orderService } from '../../services/orderService';
import { paymentService } from '../../services/paymentService';
import { customerGameService, type GameConfigDto } from '../../services/customerGameService';
import { CustomerGameLobby } from '../../components/customer/CustomerGameLobby';
import type { Order, OrderStatus, OrderItemStatus, FiscalDocument } from '../../types';

interface StatusStep {
  status: OrderStatus;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ORDER_STEPS: StatusStep[] = [
  {
    status: 'PENDING',
    label: 'Order Received',
    sublabel: 'Received by restaurant',
    icon: Clock,
  },
  {
    status: 'CONFIRMED',
    label: 'Order Confirmed',
    sublabel: 'Accepted & queued for preparation',
    icon: Sparkles,
  },
  {
    status: 'PREPARING',
    label: 'Cooking In Progress',
    sublabel: 'Dishes being crafted fresh',
    icon: ChefHat,
  },
  {
    status: 'READY',
    label: 'Ready to Serve',
    sublabel: 'Dishes plated and departing kitchen',
    icon: UtensilsCrossed,
  },
  {
    status: 'SERVED',
    label: 'Order Served',
    sublabel: 'Delivered to your table',
    icon: CheckCircle2,
  },
];

const STATUS_PROGRESS: Record<OrderStatus, number> = {
  PENDING: 1,
  CONFIRMED: 2,
  PREPARING: 3,
  READY: 4,
  SERVED: 5,
  COMPLETED: 5,
  CANCELLED: -1,
};

const STATUS_DETAILS: Record<
  OrderStatus,
  { title: string; subtitle: string; badge: string; color: string }
> = {
  PENDING: {
    title: 'ORDER RECEIVED',
    subtitle: 'Your order has been received and sent to the kitchen.',
    badge: 'Order Received',
    color: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  },
  CONFIRMED: {
    title: 'ORDER CONFIRMED',
    subtitle: 'The kitchen has confirmed your order and is queuing tickets.',
    badge: 'Order Confirmed',
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  },
  PREPARING: {
    title: 'COOKING IN PROGRESS',
    subtitle: 'Your food is being prepared fresh by our culinary artisans.',
    badge: 'Food Preparing',
    color: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  },
  READY: {
    title: 'READY TO SERVE',
    subtitle: 'Your order is ready and will be served shortly.',
    badge: 'Ready to Serve',
    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  },
  SERVED: {
    title: 'ORDER SERVED',
    subtitle: 'Your order has been served. Enjoy your meal!',
    badge: 'Order Served',
    color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  },
  COMPLETED: {
    title: 'ORDER COMPLETED',
    subtitle: 'Thank you for dining with us! We look forward to seeing you again.',
    badge: 'Order Completed',
    color: 'text-zinc-300 bg-zinc-800 border-zinc-700',
  },
  CANCELLED: {
    title: 'ORDER CANCELLED',
    subtitle: 'This order has been cancelled.',
    badge: 'Cancelled',
    color: 'text-red-400 bg-red-950/40 border-red-500/30',
  },
};

type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export const CustomerOrderTrackingPage: React.FC = () => {
  const { publicOrderToken } = useParams<{ publicOrderToken: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('reconnecting');
  const [showItems, setShowItems] = useState(true);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<FiscalDocument | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [gameConfig, setGameConfig] = useState<GameConfigDto | null>(null);
  const [showGameLobby, setShowGameLobby] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenReceipt = async () => {
    if (!publicOrderToken) return;
    setReceiptModalOpen(true);
    if (!receiptData) {
      try {
        setLoadingReceipt(true);
        const doc = await paymentService.getCustomerOrderReceipt(publicOrderToken);
        setReceiptData(doc);
      } catch (err) {
        console.error('Failed to load receipt', err);
      } finally {
        setLoadingReceipt(false);
      }
    }
  };

  // Authoritative State Fetching & Reconciliation
  const fetchOrder = useCallback(async () => {
    if (!publicOrderToken) return;
    try {
      const data = await orderService.getTrackedOrder(publicOrderToken);
      setOrder(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to locate order ticket.');
    } finally {
      setLoading(false);
    }
  }, [publicOrderToken]);

  // Fetch game availability for "Play While You Wait" (restaurant-scoped).
  useEffect(() => {
    if (!order?.restaurantId) return;
    let cancelled = false;
    customerGameService
      .getConfig(order.restaurantId)
      .then((cfg) => {
        if (!cancelled) setGameConfig(cfg.enabled ? cfg : null);
      })
      .catch(() => {
        if (!cancelled) setGameConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [order?.restaurantId]);

  // Initial fetch on mount
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Real-Time SSE Connection with Exponential Backoff & Lifecycle Management
  useEffect(() => {
    if (!publicOrderToken) return;

    let isUnmounted = false;

    const connectSse = () => {
      if (isUnmounted) return;

      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const sseUrl = buildApiUrl(`/orders/track/${publicOrderToken}/events`);

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (isUnmounted) return;
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        // Immediate authoritative reconciliation on connect
        fetchOrder();
      };

      // Listen for order status transitions
      es.addEventListener('order_status_changed', (evt: MessageEvent) => {
        if (isUnmounted) return;
        try {
          const payload = JSON.parse(evt.data);
          if (payload?.order) {
            setOrder(payload.order);
          } else if (payload?.newStatus) {
            setOrder((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                status: payload.newStatus,
              };
            });
            // Reconcile complete updated record in background
            fetchOrder();
          }
        } catch (err) {
          console.error('SSE order_status_changed parse error', err);
        }
      });

      // Listen for individual item status transitions
      es.addEventListener('order_item_status_changed', (evt: MessageEvent) => {
        if (isUnmounted) return;
        try {
          const payload = JSON.parse(evt.data);
          if (payload?.itemId && payload?.newStatus) {
            setOrder((prev) => {
              if (!prev) return prev;
              const updatedItems = prev.items.map((item) =>
                item.id === payload.itemId ? { ...item, status: payload.newStatus } : item
              );
              return { ...prev, items: updatedItems };
            });
          }
        } catch (err) {
          console.error('SSE order_item_status_changed parse error', err);
        }
      });

      // Listen for payment status transitions (SSE)
      es.addEventListener('payment_status_changed', () => {
        if (isUnmounted) return;
        try {
          fetchOrder();
        } catch (err) {
          console.error('SSE payment_status_changed parse error', err);
        }
      });

      es.onerror = () => {
        if (isUnmounted) return;
        es.close();
        eventSourceRef.current = null;

        if (!navigator.onLine) {
          setConnectionStatus('offline');
          return;
        }

        setConnectionStatus('reconnecting');

        // Exponential backoff: 1s, 2s, 4s, 8s, capped at 15s
        const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 15000);
        reconnectAttemptsRef.current += 1;

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connectSse();
        }, backoffMs);
      };
    };

    connectSse();

    // Reconcile state when customer tab is foregrounded or device wakes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchOrder();
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          connectSse();
        }
      }
    };

    // Reconnect and reconcile when network returns online
    const handleOnline = () => {
      setConnectionStatus('reconnecting');
      fetchOrder();
      connectSse();
    };

    const handleOffline = () => {
      setConnectionStatus('offline');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fallback polling interval (6s) strictly as safety net when disconnected
    const fallbackPollInterval = setInterval(() => {
      if (connectionStatus !== 'connected') {
        fetchOrder();
      }
    }, 6000);

    return () => {
      isUnmounted = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearInterval(fallbackPollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [publicOrderToken, fetchOrder, connectionStatus]);

  const renderItemStatusBadge = (status: OrderItemStatus) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Ready
          </span>
        );
      case 'PREPARING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Preparing
          </span>
        );
      case 'SERVED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Served
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded-full">
            Cancelled
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            Pending
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="font-serif text-sm tracking-widest text-zinc-400 uppercase">
            Connecting to Live Order Stream...
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-center space-y-4 shadow-2xl">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-xl font-bold font-serif-luxury text-white">Order Not Found</h2>
          <p className="text-sm text-zinc-400">
            {error || 'This order tracker may be expired or the ticket URL is invalid.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 text-black font-semibold text-sm hover:bg-amber-300 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Menu</span>
          </Link>
        </div>
      </div>
    );
  }

  const currentProgress = STATUS_PROGRESS[order.status] ?? 1;
  const isCancelled = order.status === 'CANCELLED';
  const statusInfo = STATUS_DETAILS[order.status] || STATUS_DETAILS.PENDING;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link
            to={`/menu/${(order as any).restaurant?.slug || 'demo-restaurant'}`}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-300 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Menu</span>
          </Link>

          {/* Connection status indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-medium shadow-inner">
            <Radio
              className={`w-3 h-3 ${
                connectionStatus === 'connected'
                  ? 'text-emerald-400 animate-pulse'
                  : connectionStatus === 'reconnecting'
                  ? 'text-amber-400 animate-spin'
                  : 'text-red-400'
              }`}
            />
            <span
              className={
                connectionStatus === 'connected'
                  ? 'text-emerald-400 font-semibold'
                  : connectionStatus === 'reconnecting'
                  ? 'text-amber-400'
                  : 'text-red-400'
              }
            >
              {connectionStatus === 'connected'
                ? 'Live Stream'
                : connectionStatus === 'reconnecting'
                ? 'Reconnecting...'
                : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Order Hero Header */}
        <div className="p-6 rounded-3xl bg-gradient-to-b from-zinc-900 via-zinc-900/80 to-zinc-950 border border-zinc-800/90 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                {(order as any).restaurant?.name || 'AURA Dining'}
              </span>
              <h1 className="text-3xl font-bold font-serif-luxury text-white tracking-wide mt-1">
                Order #{order.orderNumber}
              </h1>
            </div>

            <div className="text-right">
              {order.table ? (
                <div className="px-3 py-1 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-bold">
                  Table {order.table.number}
                </div>
              ) : (
                <div className="px-3 py-1 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold">
                  Takeaway
                </div>
              )}
              <div className="text-[11px] text-zinc-500 mt-1">
                {new Date(order.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>

          {/* Animated Hero Status Announcement Banner */}
          <AnimatePresence mode="wait">
            <motion.div
              key={order.status}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="mt-6 pt-5 border-t border-zinc-800/80 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">Live Order Status</span>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${statusInfo.color}`}
                >
                  {statusInfo.badge}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {order.status === 'READY' && <Sparkles className="w-4 h-4 text-emerald-400" />}
                {order.status === 'PREPARING' && <ChefHat className="w-4 h-4 text-orange-400" />}
                {statusInfo.title}
              </h2>
              <p className="text-xs text-zinc-300/90 leading-relaxed">{statusInfo.subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Play While You Wait (moved from menu header) */}
        {gameConfig?.enabled && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <button
              onClick={() => setShowGameLobby(true)}
              className="w-full p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl flex items-center justify-between gap-3 hover:border-amber-500/40 transition text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">Play While You Wait</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Pass the time with a quick game at your table.
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
            </button>
          </motion.div>
        )}

        {/* Cancellation Notice if Cancelled */}
        {isCancelled && (
          <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 space-y-1">
            <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>This order has been cancelled</span>
            </div>
            {order.cancellationReason && (
              <p className="text-xs text-red-300/80 pl-6">Reason: {order.cancellationReason}</p>
            )}
          </div>
        )}

        {/* Dynamic Progress Timeline */}
        {!isCancelled && (
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl space-y-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Live Progress
            </h2>

            <div className="relative pl-6 space-y-7 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
              {ORDER_STEPS.map((step, idx) => {
                const stepNumber = idx + 1;
                const isPassed = currentProgress > stepNumber;
                const isCurrent = currentProgress === stepNumber;

                return (
                  <div key={step.status} className="relative flex items-start gap-4 group">
                    {/* Step Icon */}
                    <div
                      className={`absolute -left-6 top-0 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
                        isCurrent
                          ? 'bg-amber-400 text-black ring-4 ring-amber-400/20 shadow-lg shadow-amber-400/30'
                          : isPassed
                          ? 'bg-emerald-500 text-black'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {isPassed ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <step.icon className="w-3.5 h-3.5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`text-sm font-semibold tracking-wide transition-colors ${
                            isCurrent
                              ? 'text-amber-300 font-bold'
                              : isPassed
                              ? 'text-white'
                              : 'text-zinc-500'
                          }`}
                        >
                          {step.label}
                        </h3>
                        {isCurrent && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        )}
                      </div>
                      <p
                        className={`text-xs mt-0.5 ${
                          isCurrent ? 'text-zinc-300' : 'text-zinc-500'
                        }`}
                      >
                        {step.sublabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order Status History Log */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="p-5 rounded-3xl bg-zinc-900/40 border border-zinc-800/70 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Transition History
            </h3>
            <div className="space-y-2">
              {order.statusHistory.map((hist) => (
                <div
                  key={hist.id}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-800/40 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-amber-400 font-semibold">{hist.toStatus}</span>
                    {hist.fromStatus && (
                      <span className="text-zinc-500 text-[11px]">(from {hist.fromStatus})</span>
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

        {/* Phase 8: Payment Status & Digital Receipt Section */}
        <div className="p-5 rounded-3xl bg-zinc-900/70 border border-zinc-800/80 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                {(order as any).latestPayment?.method === 'CASH' ? (
                  <Banknote className="w-4 h-4" />
                ) : (order as any).latestPayment?.method === 'MBWAY' ? (
                  <Smartphone className="w-4 h-4" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Payment Status</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Method: {(order as any).latestPayment?.method || 'Pending Settlement'}
                </p>
              </div>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase ${
                (order as any).latestPayment?.status === 'PAID'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : (order as any).latestPayment?.status === 'PENDING'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                  : (order as any).latestPayment?.status === 'REFUNDED'
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
              }`}
            >
              {(order as any).latestPayment?.status || 'UNPAID'}
            </span>
          </div>

          {/* Payment Guidance Messages */}
          <div className="text-xs text-zinc-300 bg-black/40 p-3 rounded-2xl border border-zinc-800/60 leading-relaxed">
            {(order as any).latestPayment?.status === 'PAID' ? (
              <span className="text-emerald-300 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Payment received and verified. Thank you!
              </span>
            ) : (order as any).latestPayment?.method === 'CASH' ? (
              <span className="text-amber-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                Cash payment requested. Restaurant staff will collect payment at your table or counter.
              </span>
            ) : (order as any).latestPayment?.method === 'MBWAY' ? (
              <span className="text-amber-300 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                Payment prompt sent to your MB WAY app. Please confirm on your mobile device.
              </span>
            ) : (
              <span className="text-zinc-400">
                Total to be settled: {order.currency === 'EUR' ? '€' : '$'}{Number(order.total).toFixed(2)}
              </span>
            )}
          </div>

          {/* Digital Receipt Trigger */}
          {((order as any).latestPayment?.status === 'PAID' || (order as any).latestReceipt) && (
            <button
              onClick={handleOpenReceipt}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
            >
              <Receipt className="w-4 h-4" />
              <span>View / Print Digital Receipt</span>
            </button>
          )}
        </div>

        {/* Items Summary Accordion with Item-Level Real-Time Status */}
        <div className="p-5 rounded-3xl bg-zinc-900/70 border border-zinc-800/80 shadow-xl space-y-4">
          <button
            onClick={() => setShowItems(!showItems)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <h3 className="text-sm font-semibold text-white">Order Summary</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {order.items.reduce((acc, i) => acc + i.quantity, 0)} items • {order.currency === 'EUR' ? '€' : '$'}
                {Number(order.total).toFixed(2)}
              </p>
            </div>
            {showItems ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>

          {showItems && (
            <div className="pt-3 border-t border-zinc-800/80 divide-y divide-zinc-800/50">
              {order.items.map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-amber-400 bg-zinc-800 px-2 py-0.5 rounded-md shrink-0">
                      {item.quantity}x
                    </span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-white">{item.foodNameSnapshot}</h4>
                        {renderItemStatusBadge(item.status)}
                      </div>
                      {item.customerNote && (
                        <p className="text-xs text-amber-300/80 italic">
                          "{item.customerNote}"
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-zinc-300 font-semibold shrink-0">
                    {order.currency === 'EUR' ? '€' : '$'}{(Number(item.unitPrice) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}

              <div className="pt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Total</span>
                <span className="text-base font-mono font-bold text-amber-400">
                  {order.currency === 'EUR' ? '€' : '$'}{Number(order.total).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Digital Receipt Modal */}
        <AnimatePresence>
          {receiptModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-[#12161f] border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-5 text-white max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-base">Digital Receipt</h3>
                  </div>
                  <button
                    onClick={() => setReceiptModalOpen(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {loadingReceipt ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Loading receipt snapshot...</span>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs font-mono">
                    {/* Header Info */}
                    <div className="text-center space-y-1 pb-3 border-b border-dashed border-zinc-700">
                      <h4 className="font-bold text-sm text-white font-sans">
                        {order.restaurant?.name || 'Restaurant'}
                      </h4>
                      <p className="text-[11px] text-zinc-400">
                        {order.restaurant?.address || 'Portugal'}
                      </p>
                      <div className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-amber-300 mt-1">
                        DOCUMENTO TÉCNICO / RECEIPT
                      </div>
                    </div>

                    {/* Metadata table */}
                    <div className="space-y-1 text-zinc-300 py-2 border-b border-dashed border-zinc-700">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Document No:</span>
                        <span className="font-bold text-white">
                          {receiptData?.documentNumber || (order as any).latestReceipt?.documentNumber || 'REC-PENDING'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Date/Time:</span>
                        <span>
                          {new Date(receiptData?.issuedAt || order.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Order:</span>
                        <span>#{order.orderNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Table:</span>
                        <span>{order.table?.number ? `Table ${order.table.number}` : 'Direct'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Customer NIF:</span>
                        <span className="font-bold text-amber-400">
                          {receiptData?.customerNif || (order as any).nif || '999999990 (Consumidor Final)'}
                        </span>
                      </div>
                      {((order as any).customerFiscalName || receiptData?.customerName) && (
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Name:</span>
                          <span>{receiptData?.customerName || (order as any).customerFiscalName}</span>
                        </div>
                      )}
                    </div>

                    {/* Items table */}
                    <div className="space-y-2 py-2 border-b border-dashed border-zinc-700">
                      {order.items.map((i) => (
                        <div key={i.id} className="flex justify-between">
                          <span className="truncate pr-2">
                            {i.quantity}x {i.foodNameSnapshot}
                          </span>
                          <span className="text-white font-semibold">
                            {order.currency === 'EUR' ? '€' : '$'}{(Number(i.unitPrice) * i.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-zinc-400">
                        <span>Subtotal:</span>
                        <span>{order.currency === 'EUR' ? '€' : '$'}{Number(order.subtotal).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Tax (IVA):</span>
                        <span>{order.currency === 'EUR' ? '€' : '$'}{Number(order.tax).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-zinc-700">
                        <span>TOTAL:</span>
                        <span className="text-amber-400">
                          {order.currency === 'EUR' ? '€' : '$'}{Number(order.total).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Hash & Disclaimer */}
                    <div className="pt-3 text-[10px] text-zinc-500 space-y-1">
                      <p className="truncate">Hash: {receiptData?.hash || 'SHA256-AUTHENTICATED-DOCUMENT'}</p>
                      <p className="italic">
                        Emitido para conferência técnica e arquivo operacional do cliente.
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-4 flex gap-2 font-sans">
                      <button
                        onClick={() => window.print()}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 text-neutral-950 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-amber-400 transition"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Print Receipt</span>
                      </button>
                      <button
                        onClick={() => setReceiptModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Play While You Wait Lobby */}
      {showGameLobby && gameConfig && order.restaurant && (
        <CustomerGameLobby
          restaurant={order.restaurant}
          table={order.table ? { id: order.table.id, number: order.table.number, name: order.table.name } : null}
          config={gameConfig}
          onClose={() => setShowGameLobby(false)}
        />
      )}
    </div>
  );
};
