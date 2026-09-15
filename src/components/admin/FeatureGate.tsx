import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { FeatureKey } from '../../constants/features';

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children only when the active restaurant's subscription
 * plan includes the given feature. Platform operators always pass through.
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({ feature, children, fallback = null }) => {
  const { hasFeature } = useAuth();
  if (!hasFeature(feature)) return <>{fallback}</>;
  return <>{children}</>;
};
