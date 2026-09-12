import {
  CheckoutSessionInput,
  CheckoutSessionResult,
  SubscriptionProvider,
  WebhookVerificationResult,
} from './subscriptionProvider';

export class MockSubscriptionProvider implements SubscriptionProvider {
  name = 'MOCK';

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const sessionId = `mock_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      sessionId,
      checkoutUrl: `/admin/subscription/checkout?session=${sessionId}&sub=${input.subscriptionId}`,
      provider: this.name,
    };
  }

  async verifyWebhook(payload: any, _signature?: string): Promise<WebhookVerificationResult> {
    if (!payload || !payload.id || !payload.event) {
      return { isValid: false };
    }

    return {
      isValid: true,
      eventId: payload.id,
      eventType: payload.event,
      subscriptionId: payload.subscriptionId,
      providerTransactionId: payload.transactionId || `mock_tx_${payload.id}`,
      status: payload.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      rawPayload: payload,
    };
  }

  async cancelRecurring(_providerSubscriptionId: string): Promise<boolean> {
    return true;
  }
}

export const mockSubscriptionProvider = new MockSubscriptionProvider();
