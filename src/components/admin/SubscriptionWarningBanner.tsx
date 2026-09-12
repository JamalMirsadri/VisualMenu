import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AlertTriangle, Clock, X, ChevronRight } from 'lucide-react';

export const SubscriptionWarningBanner: React.FC = () => {
  const { subscriptionStatus, subscriptionDaysRemaining, role, isPlatformAdmin } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Only display to restaurant owners and admins
  if (isPlatformAdmin || (role !== 'OWNER' && role !== 'ADMIN')) {
    return null;
  }

  if (dismissed) {
    return null;
  }

  // Grace period banner
  if (subscriptionStatus === 'GRACE_PERIOD') {
    return (
      <div className="bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-amber-950/90 border-b border-amber-600/50 px-4 py-2.5 text-amber-100 flex items-center justify-between shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <AlertTriangle className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className="font-semibold text-white text-xs uppercase tracking-wider bg-amber-600/60 px-2 py-0.5 rounded-full mr-2">
              Grace Period
            </span>
            <span className="text-sm font-medium">
              Your subscription has expired, but admin access is currently active under your grace period.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/subscription"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-wide transition-all shadow-sm"
          >
            Renew Subscription
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-400/80 hover:text-white p-1 transition-colors"
            title="Dismiss for this session"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Active but approaching expiration: <= 30 days
  if (subscriptionStatus === 'ACTIVE' && subscriptionDaysRemaining !== null && subscriptionDaysRemaining <= 30) {
    let severityStyle = 'from-zinc-900/90 via-zinc-800/80 to-zinc-900/90 border-amber-500/40 text-amber-200';
    let urgencyBadge = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    let message = `Your subscription expires in ${subscriptionDaysRemaining} days.`;

    if (subscriptionDaysRemaining === 1) {
      severityStyle = 'from-red-950/90 via-red-900/80 to-red-950/90 border-red-600/60 text-red-100';
      urgencyBadge = 'bg-red-500/30 text-red-200 border border-red-500/40';
      message = 'Your subscription expires tomorrow.';
    } else if (subscriptionDaysRemaining <= 3) {
      severityStyle = 'from-orange-950/90 via-orange-900/80 to-orange-950/90 border-orange-600/50 text-orange-100';
      urgencyBadge = 'bg-orange-500/30 text-orange-200 border border-orange-500/40';
      message = `Your subscription expires in ${subscriptionDaysRemaining} days.`;
    } else if (subscriptionDaysRemaining <= 7) {
      severityStyle = 'from-amber-950/90 via-amber-900/80 to-amber-950/90 border-amber-600/40 text-amber-100';
      urgencyBadge = 'bg-amber-500/30 text-amber-200 border border-amber-500/30';
      message = `Your subscription expires in ${subscriptionDaysRemaining} days.`;
    }

    return (
      <div className={`bg-gradient-to-r ${severityStyle} border-b px-4 py-2 text-xs flex items-center justify-between shadow-md backdrop-blur-md`}>
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${urgencyBadge}`}>
            {subscriptionDaysRemaining === 1 ? 'Expires Tomorrow' : `${subscriptionDaysRemaining} Days Left`}
          </span>
          <span className="text-zinc-200 font-medium">{message} Renew to maintain seamless restaurant operations.</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/subscription"
            className="flex items-center gap-1 px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-all shadow-sm"
          >
            Renew Now
            <ChevronRight className="w-3 h-3" />
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="text-zinc-400 hover:text-white p-1 transition-colors"
            title="Dismiss for this session"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
