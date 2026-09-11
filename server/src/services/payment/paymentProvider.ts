import { Request } from 'express';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

export interface CreatePaymentParams {
  restaurantId: string;
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  customerNote?: string;
  phoneNumber?: string; // For MB WAY
  returnUrl?: string; // For redirect flows
  metadata?: Record<string, any>;
}

export interface PaymentProviderResult {
  success: boolean;
  providerPaymentId: string;
  status: PaymentStatus;
  clientSecret?: string; // For Stripe client SDKs
  approvalUrl?: string; // For hosted redirect flows
  metadata?: Record<string, any>;
  error?: string;
}

export interface PaymentProviderStatusResult {
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  rawDetails?: any;
}

export interface RefundPaymentParams {
  providerPaymentId: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface RefundProviderResult {
  success: boolean;
  providerRefundId?: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  error?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  providerEventId: string;
  eventType: string;
  providerPaymentId?: string;
  status?: PaymentStatus;
  amount?: number;
  currency?: string;
  payload: any;
  error?: string;
}

export interface PaymentProvider {
  name: string;
  createPayment(params: CreatePaymentParams): Promise<PaymentProviderResult>;
  getPayment(providerPaymentId: string): Promise<PaymentProviderStatusResult>;
  cancelPayment(providerPaymentId: string): Promise<PaymentProviderResult>;
  refundPayment(params: RefundPaymentParams): Promise<RefundProviderResult>;
  verifyWebhook(req: Request): Promise<WebhookVerificationResult>;
}
