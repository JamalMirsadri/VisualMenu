export const FEATURE_KEYS = [
  'ADVANCED_ANALYTICS',
  'ANALYTICS_EXPORT',
  'CUSTOMER_ANALYTICS',
  'AI_INSIGHTS',
  'ADVANCED_FORECASTING',
  'AI_FOOD_VIDEO',
  'GAMES_LOYALTY',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  ADVANCED_ANALYTICS: 'Advanced Analytics',
  ANALYTICS_EXPORT: 'Analytics Export',
  CUSTOMER_ANALYTICS: 'Customer Analytics',
  AI_INSIGHTS: 'AI Insights',
  ADVANCED_FORECASTING: 'Advanced Forecasting',
  AI_FOOD_VIDEO: 'AI Food Video Studio',
  GAMES_LOYALTY: 'Games & Loyalty',
};
