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
