import { apiClient } from './apiClient';
import type { Order, OrderItem, OrderStatus, OrderItemStatus, PaymentMethod } from '../types';

export interface CreateOrderPayload {
  restaurantSlug: string;
  tableNumber?: string;
  customerNote?: string;
  idempotencyKey?: string;
  paymentMethod?: PaymentMethod;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  nif?: string;
  customerFiscalName?: string;
  customerTaxCountry?: string;
  saveFiscalProfile?: boolean;
  items: Array<{
    foodItemId: string;
    quantity: number;
    customerNote?: string;
  }>;
}

export const orderService = {
  /**
   * Public: Place an order from customer menu / table QR with Idempotency-Key header
   */
  async createOrder(payload: CreateOrderPayload): Promise<Order> {
    const key =
      payload.idempotencyKey ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    return apiClient.post<Order>('/orders', payload, {
      'Idempotency-Key': key,
    });
  },

  /**
   * Public: Get tracked order by secure publicToken
   */
  async getTrackedOrder(publicOrderToken: string): Promise<Order> {
    return apiClient.get<Order>(`/orders/track/${publicOrderToken}`);
  },

  /**
   * Admin/Staff: Get orders for restaurant
   */
  async getOrders(
    restaurantId: string,
    params?: {
      status?: OrderStatus;
      tableId?: string;
      page?: number;
      limit?: number;
      dateFrom?: string;
      dateTo?: string;
      assignedToMe?: boolean;
      filter?: string;
      assignedWaiterId?: string;
    }
  ): Promise<Order[]> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.tableId) query.append('tableId', params.tableId);
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.dateFrom) query.append('dateFrom', params.dateFrom);
    if (params?.dateTo) query.append('dateTo', params.dateTo);
    if (params?.assignedToMe) query.append('assignedToMe', 'true');
    if (params?.filter) query.append('filter', params.filter);
    if (params?.assignedWaiterId) query.append('assignedWaiterId', params.assignedWaiterId);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get<Order[]>(`/restaurants/${restaurantId}/orders${qs}`);
  },

  /**
   * Admin/Staff: Get detailed order by ID
   */
  async getOrderById(restaurantId: string, orderId: string): Promise<Order> {
    return apiClient.get<Order>(`/restaurants/${restaurantId}/orders/${orderId}`);
  },

  /**
   * Admin/Kitchen: Advance order status
   */
  async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<Order> {
    return apiClient.patch<Order>(`/restaurants/${restaurantId}/orders/${orderId}/status`, {
      status,
    });
  },

  /**
   * Admin/Kitchen: Update individual order item status
   */
  async updateOrderItemStatus(
    restaurantId: string,
    orderId: string,
    itemId: string,
    status: OrderItemStatus
  ): Promise<OrderItem> {
    return apiClient.patch<OrderItem>(
      `/restaurants/${restaurantId}/orders/${orderId}/items/${itemId}/status`,
      { status }
    );
  },

  /**
   * Admin: Cancel order with optional reason
   */
  async cancelOrder(
    restaurantId: string,
    orderId: string,
    reason?: string
  ): Promise<Order> {
    return apiClient.post<Order>(`/restaurants/${restaurantId}/orders/${orderId}/cancel`, {
      reason,
    });
  },

  /**
   * Waiter/Staff: Claim order for current logged-in user
   */
  async claimOrder(restaurantId: string, orderId: string): Promise<Order> {
    return apiClient.post<Order>(`/restaurants/${restaurantId}/orders/${orderId}/claim`, {});
  },

  /**
   * Manager/Staff: Assign order to a specific staff userRestaurantId
   */
  async assignOrder(restaurantId: string, orderId: string, staffUserRestaurantId: string): Promise<Order> {
    return apiClient.post<Order>(`/restaurants/${restaurantId}/orders/${orderId}/assign`, {
      staffUserRestaurantId,
    });
  },

  /**
   * Staff/Manager: Unassign / release waiter from order
   */
  async unassignOrder(restaurantId: string, orderId: string): Promise<Order> {
    return apiClient.post<Order>(`/restaurants/${restaurantId}/orders/${orderId}/unassign`, {});
  },

  /**
   * Waiter/Staff: Serve order (transitions from READY to SERVED)
   */
  async serveOrder(restaurantId: string, orderId: string): Promise<Order> {
    return apiClient.post<Order>(`/restaurants/${restaurantId}/orders/${orderId}/serve`, {});
  },

  /**
   * Kitchen/Staff: Set order priority (NORMAL, HIGH, URGENT)
   */
  async setOrderPriority(restaurantId: string, orderId: string, priority: 'NORMAL' | 'HIGH' | 'URGENT'): Promise<Order> {
    return apiClient.patch<Order>(`/restaurants/${restaurantId}/orders/${orderId}/priority`, {
      priority,
    });
  },

  /**
   * Waiter/Staff: Get ready to serve orders
   */
  async getReadyToServeOrders(restaurantId: string): Promise<Order[]> {
    return apiClient.get<Order[]>(`/restaurants/${restaurantId}/orders/ready-to-serve`);
  },

  /**
   * Cashier/Staff: Get awaiting payment orders
   */
  async getAwaitingPaymentOrders(restaurantId: string): Promise<Order[]> {
    return apiClient.get<Order[]>(`/restaurants/${restaurantId}/orders/awaiting-payment`);
  },

  /**
   * Floor Operations: Get live floor state with all tables and summary
   */
  async getFloorState(restaurantId: string): Promise<any> {
    return apiClient.get<any>(`/restaurants/${restaurantId}/floor`);
  },

  /**
   * Table Operations: Get dynamic operational state for a specific table
   */
  async getTableOperationalState(restaurantId: string, tableId: string): Promise<any> {
    return apiClient.get<any>(`/restaurants/${restaurantId}/tables/${tableId}/operational-state`);
  },
};


