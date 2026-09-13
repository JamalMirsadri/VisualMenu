import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface RestaurantDataGateProps {
  loading: boolean;
  error: string | null;
  hasRestaurant: boolean;
  loadingLabel?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}

/**
 * Single, reliable gate for the restaurant bootstrap flow.
 * - Shows a spinner only while a request is actually in flight.
 * - Shows a clear error + retry state when the restaurant failed to load
 *   (never a perpetual "Loading..." state).
 * - Renders children only once a restaurant is available.
 */
export const RestaurantDataGate: React.FC<RestaurantDataGateProps> = ({
  loading,
  error,
  hasRestaurant,
  loadingLabel = 'Loading restaurant...',
  onRetry,
  children,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="text-sm font-medium">{loadingLabel}</p>
      </div>
    );
  }

  if (!hasRestaurant) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center text-zinc-400">
        <div className="w-12 h-12 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-center justify-center mb-4 text-red-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="font-serif-luxury text-xl font-bold text-white mb-2">
          Restaurant unavailable
        </h3>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          {error || 'No restaurant is assigned to your account.'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold uppercase tracking-wider transition-all min-h-[36px]"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
};
