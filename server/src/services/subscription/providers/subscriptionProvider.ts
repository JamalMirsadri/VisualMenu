export interface CheckoutSessionInput {
  subscriptionId: string;
  restaurantId: string;
  planCode: string;
  amount: number;
  currency: string;
  returnUrl?: string;
  customerEmail?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
  provider: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventId?: string;
  eventType?: string;
  subscriptionId?: string;
  providerTransactionId?: string;
  status?: 'SUCCESS' | 'FAILED';
  rawPayload?: any;
}

export interface SubscriptionProvider {
  name: string;
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
  verifyWebhook(payload: any, signature?: string): Promise<WebhookVerificationResult>;
  cancelRecurring(providerSubscriptionId: string): Promise<boolean>;
}
