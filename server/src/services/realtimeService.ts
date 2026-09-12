import { Response } from 'express';

export type RealtimeEventName =
  | 'connected'
  | 'CONNECTED'
  | 'order_created'
  | 'ORDER_CREATED'
  | 'order_status_changed'
  | 'ORDER_STATUS_CHANGED'
  | 'order_item_status_changed'
  | 'ORDER_ITEM_STATUS_CHANGED'
  | 'order_cancelled'
  | 'ORDER_CANCELLED'
  | 'payment_status_changed'
  | 'PAYMENT_STATUS_CHANGED'
  | 'payment_received'
  | 'PAYMENT_RECEIVED'
  | 'payment_refunded'
  | 'PAYMENT_REFUNDED'
  | 'order_assigned'
  | 'ORDER_ASSIGNED'
  | 'floor_updated'
  | 'FLOOR_UPDATED'
  | 'order_ready'
  | 'ORDER_READY'
  | 'order_served'
  | 'ORDER_SERVED'
  | 'subscription_status_changed'
  | 'SUBSCRIPTION_STATUS_CHANGED'
  | 'subscription_restored'
  | 'SUBSCRIPTION_RESTORED'
  | 'notification_created'
  | 'NOTIFICATION_CREATED'
  | 'notification'
  | 'NOTIFICATION'
  | 'platform_message'
  | 'PLATFORM_MESSAGE';

export interface OrderStatusChangedEvent {
  type: 'order_status_changed';
  orderId: string;
  publicOrderToken: string;
  previousStatus: string;
  newStatus: string;
  changedAt: string;
  order?: any;
}

export interface OrderItemStatusChangedEvent {
  type: 'order_item_status_changed';
  orderId: string;
  publicOrderToken: string;
  itemId: string;
  previousStatus: string;
  newStatus: string;
  changedAt: string;
  item?: any;
}

export interface OrderCreatedEvent {
  type: 'order_created';
  orderId: string;
  orderNumber: string;
  publicOrderToken: string;
  status: string;
  tableNumber?: string;
  total: string | number;
  itemCount: number;
  createdAt: string;
  order?: any;
}

class RealtimeService {
  private channels: Map<string, Set<Response>> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Subscribes an HTTP response stream to an SSE channel
   */
  public subscribe(channel: string, res: Response): void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    const subscribers = this.channels.get(channel)!;
    subscribers.add(res);

    // Setup headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send connection established event
    this.sendToClient(res, 'connected', {
      channel,
      timestamp: new Date().toISOString(),
    });

    // Clean up when client disconnects
    res.on('close', () => {
      subscribers.delete(res);
      if (subscribers.size === 0) {
        this.channels.delete(channel);
      }
    });
  }

  /**
   * Broadcasts an event to all clients on a specific channel
   */
  public broadcast(channel: string, eventName: RealtimeEventName, data: any): void {
    const subscribers = this.channels.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    for (const client of subscribers) {
      try {
        this.sendToClient(client, eventName, data);
      } catch {
        subscribers.delete(client);
      }
    }
  }

  /**
   * Broadcasts an event to a specific restaurant tenant
   */
  public broadcastToRestaurant(restaurantId: string, eventName: RealtimeEventName | string, data: any): void {
    this.broadcast(`restaurant:${restaurantId}`, eventName as any, data);
  }

  /**
   * Helper: Order Created notification
   */
  public notifyOrderCreated(restaurantId: string, order: any): void {
    const payload: OrderCreatedEvent = {
      type: 'order_created',
      orderId: order.id,
      orderNumber: order.orderNumber,
      publicOrderToken: order.publicToken,
      status: order.status,
      tableNumber: order.table?.number,
      total: order.total,
      itemCount: order.items?.length || 0,
      createdAt: order.createdAt,
      order,
    };

    // Broadcast to restaurant staff & KDS
    this.broadcast(`restaurant:${restaurantId}`, 'order_created', payload);

    // Broadcast to customer tracking channel
    if (order.publicToken) {
      this.broadcast(`order:${order.publicToken}`, 'order_created', payload);
    }
  }

  /**
   * Helper: Order Status Transition notification
   */
  public notifyOrderStatusChanged(
    restaurantId: string,
    order: any,
    fromStatus: string,
    toStatus: string
  ): void {
    const changedAt = new Date().toISOString();
    const payload: OrderStatusChangedEvent = {
      type: 'order_status_changed',
      orderId: order.id,
      publicOrderToken: order.publicToken,
      previousStatus: fromStatus,
      newStatus: toStatus,
      changedAt,
      order,
    };

    // Broadcast to restaurant staff & KDS
    this.broadcast(`restaurant:${restaurantId}`, 'order_status_changed', payload);

    // Broadcast to customer tracking channel
    if (order.publicToken) {
      this.broadcast(`order:${order.publicToken}`, 'order_status_changed', payload);
    }
  }

  /**
   * Helper: Order Item Status Transition notification
   */
  public notifyOrderItemStatusChanged(
    restaurantId: string,
    publicOrderToken: string,
    orderId: string,
    itemId: string,
    fromStatus: string,
    toStatus: string,
    item?: any
  ): void {
    const changedAt = new Date().toISOString();
    const payload: OrderItemStatusChangedEvent = {
      type: 'order_item_status_changed',
      orderId,
      publicOrderToken,
      itemId,
      previousStatus: fromStatus,
      newStatus: toStatus,
      changedAt,
      item,
    };

    // Broadcast to restaurant staff & KDS
    this.broadcast(`restaurant:${restaurantId}`, 'order_item_status_changed', payload);

    // Broadcast to customer tracking channel
    if (publicOrderToken) {
      this.broadcast(`order:${publicOrderToken}`, 'order_item_status_changed', payload);
    }
  }

  /**
   * Helper: Payment Status Transition notification (emits to staff and customer)
   */
  public notifyPaymentStatusChanged(
    restaurantId: string,
    publicOrderToken: string | undefined,
    payment: {
      paymentId: string;
      orderId: string;
      status: string;
      method: string;
      amount: number;
      currency: string;
      amountReceived?: number;
      changeGiven?: number;
      receiptNumber?: string;
      refundAmount?: number;
    },
    order?: any
  ): void {
    const changedAt = new Date().toISOString();
    const payload = {
      type: 'payment_status_changed',
      ...payment,
      publicOrderToken,
      changedAt,
      order,
    };

    // Broadcast to restaurant staff
    this.broadcast(`restaurant:${restaurantId}`, 'payment_status_changed', payload);

    // Broadcast to customer tracking channel
    if (publicOrderToken) {
      this.broadcast(`order:${publicOrderToken}`, 'payment_status_changed', payload);
    }
  }

  /**
   * Helper: Order Assigned notification (emits to staff)
   */
  public notifyOrderAssigned(
    restaurantId: string,
    orderId: string,
    assignedWaiter: { id: string; userRestaurantId: string; name: string; email: string } | null,
    order?: any
  ): void {
    const payload = {
      type: 'order_assigned',
      orderId,
      assignedWaiter,
      assignedAt: new Date().toISOString(),
      order,
    };
    this.broadcast(`restaurant:${restaurantId}`, 'order_assigned', payload);
  }

  /**
   * Helper: Floor Table Operational State Updated notification
   */
  public notifyFloorUpdated(
    restaurantId: string,
    tableId: string,
    operationalState: string,
    metadata?: any
  ): void {
    const payload = {
      type: 'floor_updated',
      tableId,
      operationalState,
      updatedAt: new Date().toISOString(),
      ...metadata,
    };
    this.broadcast(`restaurant:${restaurantId}`, 'floor_updated', payload);
  }

  /**
   * Helper: Order Ready notification (alerts waiter / floor)
   */
  public notifyOrderReady(restaurantId: string, order: any): void {
    const payload = {
      type: 'order_ready',
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.table?.number,
      readyAt: new Date().toISOString(),
      order,
    };
    this.broadcast(`restaurant:${restaurantId}`, 'order_ready', payload);
    if (order.publicToken) {
      this.broadcast(`order:${order.publicToken}`, 'order_status_changed', {
        type: 'order_status_changed',
        orderId: order.id,
        publicOrderToken: order.publicToken,
        previousStatus: 'PREPARING',
        newStatus: 'READY',
        changedAt: new Date().toISOString(),
        order,
      });
    }
  }

  /**
   * Formats and writes an SSE message
   * Emits both lowercase (spec standard) and uppercase (legacy) event names
   * so any listener convention receives the event cleanly.
   */
  private sendToClient(res: Response, event: string, data: any): void {
    const lower = event.toLowerCase();
    const upper = event.toUpperCase();

    res.write(`event: ${lower}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);

    if (upper !== lower) {
      res.write(`event: ${upper}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  /**
   * Periodic ping to keep HTTP/2 connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [, subscribers] of this.channels) {
        for (const client of subscribers) {
          try {
            client.write(': ping\n\n');
          } catch {
            subscribers.delete(client);
          }
        }
      }
    }, 25000);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public getActiveSubscribersCount(channel?: string): number {
    if (channel) {
      return this.channels.get(channel)?.size || 0;
    }
    let total = 0;
    for (const [, sub] of this.channels) {
      total += sub.size;
    }
    return total;
  }
}

export const realtimeService = new RealtimeService();
