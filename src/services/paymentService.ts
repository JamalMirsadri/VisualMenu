import { apiClient } from './apiClient';
import type { Payment, FiscalDocument, Customer, PaymentMethod } from '../types';

export interface InitiatePaymentParams {
  orderId: string;
  restaurantId: string;
  method: PaymentMethod;
  phoneNumber?: string;
  customerNote?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface InitiatePaymentResult {
  payment: Payment;
  clientSecret?: string;
  approvalUrl?: string;
  providerPaymentId?: string;
  isIdempotentReplay?: boolean;
}

export interface SettleCashParams {
  amountReceived: number;
  changeGiven: number;
  customerNote?: string;
  isStaffSettlement?: boolean;
}

export interface PaymentQueryParams {
  status?: string;
  method?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const paymentService = {
  // Initiate payment (Card, MB WAY, Mock, etc.)
  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const headers: HeadersInit = {};
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }

    const response = await apiClient.post<{
      data: Payment;
      clientSecret?: string;
      approvalUrl?: string;
      providerPaymentId?: string;
      isIdempotentReplay?: boolean;
    }>('/payments', params, headers);

    return {
      payment: (response as any).data || (response as any),
      clientSecret: (response as any).clientSecret,
      approvalUrl: (response as any).approvalUrl,
      providerPaymentId: (response as any).providerPaymentId,
      isIdempotentReplay: (response as any).isIdempotentReplay,
    };
  },

  // Get specific payment details
  async getPayment(paymentId: string): Promise<Payment> {
    return apiClient.get<Payment>(`/payments/${paymentId}`);
  },

  // Cancel pending payment
  async cancelPayment(paymentId: string): Promise<Payment> {
    return apiClient.post<Payment>(`/payments/${paymentId}/cancel`);
  },

  // Staff cash settlement
  async settleCashPayment(orderId: string, params: SettleCashParams): Promise<{
    payment: Payment;
    order: any;
    receipt?: FiscalDocument;
  }> {
    return apiClient.post(`/orders/${orderId}/cash-payment`, params);
  },

  // Public customer receipt
  async getCustomerOrderReceipt(publicOrderToken: string): Promise<FiscalDocument> {
    return apiClient.get<FiscalDocument>(`/orders/track/${publicOrderToken}/receipt`);
  },

  // Staff order receipt
  async getStaffOrderReceipt(orderId: string): Promise<FiscalDocument> {
    return apiClient.get<FiscalDocument>(`/orders/${orderId}/receipt`);
  },

  // List restaurant payments (Admin)
  async getRestaurantPayments(restaurantId: string, params: PaymentQueryParams = {}): Promise<{
    payments: Payment[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    summary: {
      totalAmount: number;
      totalRefunded: number;
      netAmount: number;
      paidCount: number;
    };
  }> {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.method) query.append('method', params.method);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    return apiClient.get(`/restaurants/${restaurantId}/payments?${query.toString()}`);
  },

  // Cash operations audit trail (Admin)
  async getCashOperations(restaurantId: string, params: { startDate?: string; endDate?: string } = {}): Promise<{
    cashPayments: Payment[];
    summary: {
      totalCashCollected: number;
      totalCashGivenAsChange: number;
      netCashInRegister: number;
      transactionCount: number;
    };
  }> {
    const query = new URLSearchParams();
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);

    return apiClient.get(`/restaurants/${restaurantId}/cash-operations?${query.toString()}`);
  },

  // Financial reconciliation report (Admin)
  async getReconciliation(restaurantId: string, params: { date?: string } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.date) query.append('date', params.date);

    return apiClient.get(`/restaurants/${restaurantId}/reconciliation?${query.toString()}`);
  },

  // Refund payment (Admin)
  async refundPayment(paymentId: string, amount?: number, reason?: string): Promise<Payment> {
    return apiClient.post<Payment>(`/payments/${paymentId}/refund`, { amount, reason });
  },

  // Restaurant customers directory (Admin)
  async getRestaurantCustomers(restaurantId: string, params: { search?: string; page?: number; limit?: number } = {}): Promise<{
    customers: Customer[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    return apiClient.get(`/restaurants/${restaurantId}/customers?${query.toString()}`);
  },

  // Single customer details (Admin)
  async getCustomer(restaurantId: string, customerId: string): Promise<Customer> {
    return apiClient.get<Customer>(`/restaurants/${restaurantId}/customers/${customerId}`);
  },
};
