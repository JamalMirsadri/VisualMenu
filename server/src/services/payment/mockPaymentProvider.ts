import { Request } from 'express';
import { PaymentStatus } from '@prisma/client';
import {
  PaymentProvider,
  CreatePaymentParams,
  PaymentProviderResult,
  PaymentProviderStatusResult,
  RefundPaymentParams,
  RefundProviderResult,
  WebhookVerificationResult,
} from './paymentProvider';

/**
 * MockPaymentProvider
 * 
 * Development and test provider that simulates card & MB WAY payment lifecycles,
 * failures, cancellations, refunds, and webhook callbacks without contacting external APIs.
 */
export class MockPaymentProvider implements PaymentProvider {
  public name = 'MOCK';
  private storedPayments: Map<string, any> = new Map();

  public async createPayment(params: CreatePaymentParams): Promise<PaymentProviderResult> {
    const providerPaymentId = `mock_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Allow tests to dictate outcome via metadata
    let initialStatus: PaymentStatus = PaymentStatus.PENDING;
    if (params.metadata?.testOutcome === 'SUCCESS') {
      initialStatus = PaymentStatus.PAID;
    } else if (params.metadata?.testOutcome === 'FAILED') {
      initialStatus = PaymentStatus.FAILED;
    }

    const record = {
      providerPaymentId,
      amount: params.amount,
      currency: params.currency,
      status: initialStatus,
      method: params.method,
      createdAt: new Date().toISOString(),
      metadata: params.metadata,
    };

    this.storedPayments.set(providerPaymentId, record);

    return {
      success: initialStatus !== PaymentStatus.FAILED,
      providerPaymentId,
      status: initialStatus,
      clientSecret: `mock_secret_${providerPaymentId}`,
      approvalUrl: `http://localhost:3001/mock-checkout/${providerPaymentId}`,
      metadata: {
        simulationMode: true,
        phonePromptSent: params.method === 'MBWAY',
      },
      error: initialStatus === PaymentStatus.FAILED ? 'Simulated card decline.' : undefined,
    };
  }

  public async getPayment(providerPaymentId: string): Promise<PaymentProviderStatusResult> {
    const record = this.storedPayments.get(providerPaymentId);
    if (!record) {
      return {
        providerPaymentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'EUR',
      };
    }

    return {
      providerPaymentId,
      status: record.status,
      amount: record.amount,
      currency: record.currency,
      rawDetails: record,
    };
  }

  public async cancelPayment(providerPaymentId: string): Promise<PaymentProviderResult> {
    const record = this.storedPayments.get(providerPaymentId);
    if (record) {
      record.status = PaymentStatus.CANCELLED;
      this.storedPayments.set(providerPaymentId, record);
    }

    return {
      success: true,
      providerPaymentId,
      status: PaymentStatus.CANCELLED,
    };
  }

  public async refundPayment(params: RefundPaymentParams): Promise<RefundProviderResult> {
    const record = this.storedPayments.get(params.providerPaymentId);

    if (params.reason === 'SIMULATE_GATEWAY_ERROR') {
      return {
        success: false,
        status: 'FAILED',
        error: 'Simulated payment gateway refund failure.',
      };
    }

    const providerRefundId = `mock_ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (record) {
      record.refundedAmount = (record.refundedAmount || 0) + params.amount;
    }

    return {
      success: true,
      providerRefundId,
      status: 'SUCCESS',
    };
  }

  public async verifyWebhook(req: Request): Promise<WebhookVerificationResult> {
    const signature = req.headers['x-mock-signature'] || req.headers['authorization'];

    // In mock mode, check if explicitly told to reject signature
    if (signature === 'INVALID_SIGNATURE') {
      return {
        valid: false,
        providerEventId: '',
        eventType: '',
        payload: null,
        error: 'Invalid mock webhook signature.',
      };
    }

    const payload = req.body || {};
    const providerEventId = payload.id || payload.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const eventType = payload.type || payload.eventType || 'payment.succeeded';
    const providerPaymentId = payload.paymentId || payload.providerPaymentId;
    const status = payload.status === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.PAID;

    if (providerPaymentId && this.storedPayments.has(providerPaymentId)) {
      const record = this.storedPayments.get(providerPaymentId);
      record.status = status;
      this.storedPayments.set(providerPaymentId, record);
    }

    return {
      valid: true,
      providerEventId,
      eventType,
      providerPaymentId,
      status,
      amount: payload.amount,
      currency: payload.currency,
      payload,
    };
  }
}
