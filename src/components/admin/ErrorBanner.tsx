import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  title?: string;
  onRetry?: () => void;
}

/**
 * Shared inline error banner used by every admin async view.
 * Shows the real backend message safely (plain text, never HTML) and an
 * optional Retry action so a failed request never leaves the user stranded.
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  title = 'Something went wrong',
  onRetry,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-200">{title}</p>
          <p className="text-xs text-red-300/80 mt-0.5 break-words">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/60 text-red-200 text-xs font-semibold transition-colors shrink-0 cursor-pointer min-h-[36px]"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
    </div>
  );
};
