import { SubscriptionProvider } from './subscriptionProvider';
import { mockSubscriptionProvider } from './mockSubscriptionProvider';

export * from './subscriptionProvider';
export * from './mockSubscriptionProvider';

const registry = new Map<string, SubscriptionProvider>();
registry.set('MOCK', mockSubscriptionProvider);

export function getSubscriptionProvider(name: string = 'MOCK'): SubscriptionProvider {
  const provider = registry.get(name.toUpperCase());
  if (!provider) {
    // Fall back to MOCK provider for safety
    return mockSubscriptionProvider;
  }
  return provider;
}
