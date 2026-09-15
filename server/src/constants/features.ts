/**
 * Feature entitlement keys. These are the only valid feature identifiers that
 * can be mapped onto subscription plans and enforced via `requireFeature()`.
 */
export const FEATURE_KEYS = [
  'ADVANCED_ANALYTICS',
  'ANALYTICS_EXPORT',
  'CUSTOMER_ANALYTICS',
  'AI_INSIGHTS',
  'ADVANCED_FORECASTING',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ADVANCED_ANALYTICS: 'Advanced Analytics',
  ANALYTICS_EXPORT: 'Analytics Export',
  CUSTOMER_ANALYTICS: 'Customer Analytics',
  AI_INSIGHTS: 'AI Insights',
  ADVANCED_FORECASTING: 'Advanced Forecasting',
};

/** Normalizes an arbitrary input array into a unique, valid feature-key list. */
export function sanitizeFeatureKeys(input: unknown): FeatureKey[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<FeatureKey>();
  for (const value of input) {
    if (typeof value === 'string' && (FEATURE_KEYS as readonly string[]).includes(value)) {
      set.add(value as FeatureKey);
    }
  }
  return Array.from(set);
}
