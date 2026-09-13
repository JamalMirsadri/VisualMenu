import React, { useState } from 'react';
import {
  X,
  User,
  UtensilsCrossed,
  AlertCircle,
  CheckCircle,
  Banknote,
  UserPlus,
  UserMinus,
  RefreshCw,
  Ban,
} from 'lucide-react';
import type { TableOperationalInfo, Order, OrderStatus } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { orderService } from '../../services/orderService';

interface TableDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  table: TableOperationalInfo | null;
  onRefresh: () => void;
  onOpenCashModal?: (order: Order) => void;
}

const STATE_BADGE_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  AVAILABLE: { label: 'Available', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  ORDER_PENDING: { label: 'Order Pending', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  ORDER_ACTIVE: { label: 'Active', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  PREPARING: { label: 'Kitchen Preparing', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  READY_TO_SERVE: { label: 'Ready to Serve', bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' },
  SERVED: { label: 'Served', bg: 'bg-indigo-500/15', text: 'text-indigo-300', border: 'border-indigo-500/30' },
  AWAITING_PAYMENT: { label: 'Awaiting Payment', bg: 'bg-amber-400/20', text: 'text-amber-300', border: 'border-amber-400/40' },
  PAID: { label: 'Paid (Pending Release)', bg: 'bg-teal-500/15', text: 'text-teal-300', border: 'border-teal-500/30' },
};

export const TableDetailDrawer: React.FC<TableDetailDrawerProps> = ({
  isOpen,
  onClose,
  table,
  onRefresh,
  onOpenCashModal,
}) => {
  const { activeRestaurant, hasPermission, user } = useAuth();
  const [actingOrderId, setActingOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen || !table) return null;

  const canUpdateStatus = hasPermission('UPDATE_ORDER_STATUS');
  const canConfirmOrder = hasPermission('CONFIRM_ORDER') || canUpdateStatus;
  const canConfirmPrep = hasPermission('CONFIRM_PREPARATION') || canUpdateStatus;
  const canMarkReady = hasPermission('MARK_READY') || canUpdateStatus;
  const canMarkServed = hasPermission('MARK_ORDER_SERVED') || canUpdateStatus;
  const canCancelOrder = hasPermission('CANCEL_ORDER');
  const canConfirmCash = hasPermission('CONFIRM_CASH_PAYMENT') || hasPermission('PROCESS_PAYMENTS');

  const badge = STATE_BADGE_STYLES[table.state] || {
    label: table.state,
    bg: 'bg-zinc-800',
    text: 'text-zinc-300',
    border: 'border-zinc-700',
  };

  const activeOrders = table.activeOrders || [];

  const handleClaim = async (orderId: string) => {
    if (!activeRestaurant?.id) return;
    try {
      setActingOrderId(orderId);
      setActionError(null);
      await orderService.claimOrder(activeRestaurant.id, orderId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to claim order');
    } finally {
      setActingOrderId(null);
    }
  };

  const handleUnassign = async (orderId: string) => {
    if (!activeRestaurant?.id) return;
    try {
      setActingOrderId(orderId);
      setActionError(null);
      await orderService.unassignOrder(activeRestaurant.id, orderId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to release order assignment');
    } finally {
      setActingOrderId(null);
    }
  };

  const handleServe = async (orderId: string) => {
    if (!activeRestaurant?.id) return;
    try {
      setActingOrderId(orderId);
      setActionError(null);
      await orderService.serveOrder(activeRestaurant.id, orderId);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to mark order served');
    } finally {
      setActingOrderId(null);
    }
  };

  const handleAdvanceStatus = async (orderId: string, nextStatus: OrderStatus) => {
    if (!activeRestaurant?.id) return;
    try {
      setActingOrderId(orderId);
      setActionError(null);
      await orderService.updateOrderStatus(activeRestaurant.id, orderId, nextStatus);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update order status');
    } finally {
      setActingOrderId(null);
    }
  };

  const handleSetPriority = async (orderId: string, priority: 'NORMAL' | 'HIGH' | 'URGENT') => {
    if (!activeRestaurant?.id) return;
    try {
      setActingOrderId(orderId);
      setActionError(null);
      await orderService.setOrderPriority(activeRestaurant.id, orderId, priority);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to set priority');
    } finally {
      setActingOrderId(null);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    if (!activeRestaurant?.id) return;
    const reason = window.prompt(`Cancel order #${order.orderNumber}? Please enter reason:`);
    if (!reason) return;
    try {
      setActingOrderId(order.id);
      setActionError(null);
      await orderService.cancelOrder(activeRestaurant.id, order.id, reason);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel order');
    } finally {
      setActingOrderId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-zinc-950 border-l border-zinc-800 text-zinc-100 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-serif-luxury font-bold text-white tracking-wide">
                  Table {table.number}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                >
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {table.name} &bull; Capacity: {table.capacity} guests &bull;{' '}
                {table.location || 'Main Floor'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Operational Metrics Bar */}
          <div className="px-6 py-3 bg-zinc-900/30 border-b border-zinc-800/80 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="text-zinc-500 block text-[11px]">Time in State</span>
              <span className="font-mono font-semibold text-zinc-200">
                {table.minutesInCurrentState ?? 0} min
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px]">Active Orders</span>
              <span className="font-mono font-semibold text-amber-400">
                {table.activeOrderCount}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px]">Unpaid Balance</span>
              <span className="font-mono font-semibold text-emerald-400">
                €{Number(table.totalUnpaidAmount || 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Error Banner */}
          {actionError && (
            <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Assigned Waiters Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                Assigned Waiter(s)
              </h3>
              {table.assignedWaiters && table.assignedWaiters.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {table.assignedWaiters.map((w) => (
                    <div
                      key={w.userRestaurantId}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>{w.name}</span>
                      <span className="text-zinc-500 text-[10px]">({w.email})</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic">No waiter currently assigned to active orders.</p>
              )}
            </div>

            {/* Active Orders List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
                  Active Orders ({activeOrders.length})
                </h3>
              </div>

              {activeOrders.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-zinc-500">
                  <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">Table is currently available</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    New orders placed via customer QR will appear here immediately.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeOrders.map((order) => {
                    const isActing = actingOrderId === order.id;
                    const assignedWaiter = order.assignedWaiter;
                    const isClaimedByMe =
                      assignedWaiter &&
                      (assignedWaiter.userId === user?.id || (assignedWaiter as any).user?.id === user?.id);

                    return (
                      <div
                        key={order.id}
                        className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition space-y-3"
                      >
                        {/* Order Sub-Header */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-amber-300">
                              #{order.orderNumber}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                order.status === 'READY'
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse'
                                  : order.status === 'PREPARING'
                                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                                  : order.status === 'SERVED'
                                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                              }`}
                            >
                              {order.status}
                            </span>
                            {order.priority && order.priority !== 'NORMAL' && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                  order.priority === 'URGENT'
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                }`}
                              >
                                {order.priority}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-xs font-bold text-emerald-400">
                            €{Number(order.total).toFixed(2)}
                          </span>
                        </div>

                        {/* Order Items */}
                        <div className="space-y-1.5 text-xs bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800/60">
                          {order.items?.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-zinc-300">
                              <span className="truncate">
                                <span className="text-amber-400 font-bold">{item.quantity}x</span>{' '}
                                {item.foodNameSnapshot}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                  item.status === 'READY'
                                    ? 'text-purple-300 bg-purple-500/10'
                                    : item.status === 'PREPARING'
                                    ? 'text-orange-300 bg-orange-500/10'
                                    : item.status === 'SERVED'
                                    ? 'text-indigo-300 bg-indigo-500/10'
                                    : 'text-zinc-500'
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>
                          ))}
                          {order.customerNote && (
                            <div className="pt-1.5 text-[11px] text-zinc-400 italic border-t border-zinc-800/60">
                              Note: &ldquo;{order.customerNote}&rdquo;
                            </div>
                          )}
                        </div>

                        {/* Waiter Assignment Status */}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            <User className="w-3.5 h-3.5 text-zinc-500" />
                            <span>
                              {assignedWaiter ? (
                                <span className="text-zinc-200 font-medium">
                                  {assignedWaiter.user?.name || 'Assigned Waiter'}
                                </span>
                              ) : (
                                <span className="text-amber-400/80 font-medium italic">Unclaimed</span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {!assignedWaiter && (
                              <button
                                disabled={isActing}
                                onClick={() => handleClaim(order.id)}
                                className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <UserPlus className="w-3 h-3" />
                                Claim
                              </button>
                            )}
                            {assignedWaiter && isClaimedByMe && (
                              <button
                                disabled={isActing}
                                onClick={() => handleUnassign(order.id)}
                                className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <UserMinus className="w-3 h-3" />
                                Release
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Lifecycle Action Buttons */}
                        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2 flex-wrap">
                          {/* Priority Selector */}
                          <div className="flex items-center gap-1">
                            {(['NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                              <button
                                key={p}
                                disabled={isActing || order.priority === p}
                                onClick={() => handleSetPriority(order.id, p)}
                                className={`text-[10px] px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                                  order.priority === p
                                    ? 'bg-amber-400 text-black font-extrabold'
                                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {p[0]}
                              </button>
                            ))}
                          </div>

                          {/* State Transition Actions */}
                          <div className="flex items-center gap-2">
                            {order.status === 'PENDING' && canConfirmOrder && (
                              <button
                                disabled={isActing}
                                onClick={() => handleAdvanceStatus(order.id, 'CONFIRMED')}
                                className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                              >
                                Confirm
                              </button>
                            )}

                            {order.status === 'CONFIRMED' && canConfirmPrep && (
                              <button
                                disabled={isActing}
                                onClick={() => handleAdvanceStatus(order.id, 'PREPARING')}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                              >
                                Send to Kitchen
                              </button>
                            )}

                            {order.status === 'PREPARING' && canMarkReady && (
                              <button
                                disabled={isActing}
                                onClick={() => handleAdvanceStatus(order.id, 'READY')}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                              >
                                Mark Ready
                              </button>
                            )}

                            {order.status === 'READY' && canMarkServed && (
                              <button
                                disabled={isActing}
                                onClick={() => handleServe(order.id)}
                                className="px-3.5 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-semibold text-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-lg shadow-purple-500/20"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Serve Order
                              </button>
                            )}

                            {(order.status === 'SERVED' || order.status === 'READY') && canConfirmCash && (
                              <button
                                disabled={isActing}
                                onClick={() => onOpenCashModal && onOpenCashModal(order)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                              >
                                <Banknote className="w-3.5 h-3.5" />
                                Settle Cash
                              </button>
                            )}

                            {canCancelOrder && order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && (
                              <button
                                disabled={isActing}
                                onClick={() => handleCancelOrder(order)}
                                className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-950/40 text-zinc-500 hover:text-red-400 transition cursor-pointer disabled:opacity-50"
                                title="Cancel Order"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Table</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
