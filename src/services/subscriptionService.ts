import { apiClient } from './apiClient';

export type SubscriptionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'GRACE_PERIOD'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SUSPENDED';

export type BillingInterval = 'MONTHLY' | 'YEARLY';

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description?: string;
  price: string | number;
  currency: string;
  billingInterval: BillingInterval;
  intervalCount: number;
  trialDays?: number | null;
  gracePeriodDays: number;
  active: boolean;
}

export interface SubscriptionDetails {
  id: string;
  restaurantId: string;
  planId: string;
  status: SubscriptionStatus;
  startsAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
  cancelledAt?: string | null;
  autoRenew: boolean;
  provider: string;
  agreedPrice: string | number;
  agreedCurrency: string;
  daysRemaining: number;
  isExpired: boolean;
  isGracePeriod: boolean;
  plan: SubscriptionPlan;
}

export interface SubscriptionPayment {
  id: string;
  subscriptionId: string;
  amount: string | number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  provider: string;
  providerTransactionId?: string;
  paidAt?: string;
  failureReason?: string;
  createdAt: string;
}

export interface SubscriptionInvoice {
  id: string;
  subscriptionId: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  currency: string;
  status: string;
  issuedAt?: string;
  paidAt?: string;
  dueAt?: string;
}

export interface SubscriptionEvent {
  id: string;
  subscriptionId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string;
  metadata?: any;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

class SubscriptionService {
  async getPlans(): Promise<SubscriptionPlan[]> {
    return apiClient.get<SubscriptionPlan[]>('/subscriptions/plans');
  }

  async getSubscription(restaurantId: string): Promise<SubscriptionDetails> {
    return apiClient.get<SubscriptionDetails>(`/subscriptions/restaurant/${restaurantId}`);
  }

  async getHistory(restaurantId: string): Promise<SubscriptionEvent[]> {
    return apiClient.get<SubscriptionEvent[]>(`/subscriptions/restaurant/${restaurantId}/history`);
  }

  async getPayments(restaurantId: string): Promise<{ payments: SubscriptionPayment[]; invoices: SubscriptionInvoice[] }> {
    return apiClient.get<{ payments: SubscriptionPayment[]; invoices: SubscriptionInvoice[] }>(
      `/subscriptions/restaurant/${restaurantId}/payments`
    );
  }

  async createCheckout(restaurantId: string, planCode: string, provider?: string): Promise<{ sessionId: string; checkoutUrl: string }> {
    return apiClient.post<{ sessionId: string; checkoutUrl: string }>(`/subscriptions/restaurant/${restaurantId}/checkout`, {
      planCode,
      provider,
    });
  }

  async renew(restaurantId: string, amount?: number): Promise<{ subscription: SubscriptionDetails; payment: SubscriptionPayment; isDuplicate: boolean }> {
    return apiClient.post<{ subscription: SubscriptionDetails; payment: SubscriptionPayment; isDuplicate: boolean }>(
      `/subscriptions/restaurant/${restaurantId}/renew`,
      { amount }
    );
  }

  async cancelAutoRenew(restaurantId: string, reason?: string): Promise<SubscriptionDetails> {
    return apiClient.post<SubscriptionDetails>(`/subscriptions/restaurant/${restaurantId}/cancel-auto-renew`, { reason });
  }

  async resumeAutoRenew(restaurantId: string): Promise<SubscriptionDetails> {
    return apiClient.post<SubscriptionDetails>(`/subscriptions/restaurant/${restaurantId}/resume`, {});
  }
}

export const subscriptionService = new SubscriptionService();
