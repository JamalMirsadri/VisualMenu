import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscriptionService, type SubscriptionDetails } from '../../services/subscriptionService';
import { AlertOctagon, RefreshCw, CheckCircle2, ShieldAlert, CreditCard, LogOut, Bell } from 'lucide-react';
import { UrgentNotificationBanner } from '../../components/admin/UrgentNotificationBanner';
import { NotificationBell } from '../../components/admin/NotificationBell';

export const SubscriptionRequiredPage: React.FC = () => {
  const { activeRestaurant, refreshSubscription, logout } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const loadSubscription = async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    try {
      const data = await subscriptionService.getSubscription(activeRestaurant.id);
      setSubscription(data);
      if (data.status === 'ACTIVE') {
        // If restored or already active, redirect back to admin dashboard!
        navigate('/admin');
      }
    } catch (err: any) {
      setError('Unable to load current subscription information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, [activeRestaurant?.id]);

  const handleRenewNow = async () => {
    if (!activeRestaurant?.id) return;
    setRenewing(true);
    setError(null);
    try {
      const result = await subscriptionService.renew(activeRestaurant.id);
      if (result.subscription.status === 'ACTIVE') {
        setSuccess(true);
        await refreshSubscription();
        setTimeout(() => {
          navigate('/admin');
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Renewal payment failed. Please try again or contact support.');
    } finally {
      setRenewing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-red-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Urgent Announcement Banner */}
      <div className="max-w-4xl mx-auto w-full z-20 mb-4">
        <UrgentNotificationBanner />
      </div>

      {/* Top Header */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-zinc-950 font-black font-serif text-xl shadow-lg shadow-amber-500/20">
            A
          </div>
          <div>
            <span className="font-serif-luxury font-bold tracking-wider text-white text-lg">AURA</span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block">SaaS Platform</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell />
          <Link
            to="/admin/notifications"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 text-xs text-zinc-300 hover:text-white transition-all"
          >
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            <span>Notifications</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 text-xs text-zinc-400 hover:text-zinc-200 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Center Gate Content */}
      <div className="max-w-md mx-auto w-full z-10 my-8">
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6 text-red-400 shadow-inner">
            <AlertOctagon className="w-8 h-8" />
          </div>

          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold tracking-wider uppercase mb-2">
              Subscription Required
            </span>
            <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Administration Access Suspended
            </h1>
            <p className="text-zinc-400 text-sm mt-2">
              An active subscription is required to access the management portal for{' '}
              <span className="text-white font-medium">{activeRestaurant?.name || 'your restaurant'}</span>.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="p-6 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-center animate-fade-in">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">Subscription Restored!</h3>
              <p className="text-xs text-emerald-200 mt-1">Access restored immediately. Redirecting to dashboard...</p>
            </div>
          ) : (
            <>
              {loading ? (
                <div className="py-8 text-center text-zinc-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                  <span className="text-xs">Loading subscription details...</span>
                </div>
              ) : subscription ? (
                <div className="space-y-4 mb-6">
                  <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800/80 p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Current Plan:</span>
                      <span className="font-bold text-white">{subscription.plan?.name || 'Starter'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Status:</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                        {subscription.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Agreed Price:</span>
                      <span className="font-mono text-white font-semibold">
                        €{subscription.agreedPrice} / {subscription.plan?.billingInterval === 'YEARLY' ? 'year' : 'month'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Period Ended:</span>
                      <span className="text-zinc-300">
                        {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleRenewNow}
                    disabled={renewing}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-sm tracking-wide shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {renewing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Processing Renewal...</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        <span>Renew Now ({subscription.agreedCurrency} {subscription.agreedPrice})</span>
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      onClick={() => navigate('/admin/subscription')}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium underline transition-colors"
                    >
                      View Full Billing & Plan Options
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-zinc-400 mb-4">No subscription record found for this restaurant.</p>
                  <button
                    onClick={() => navigate('/admin/subscription')}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs"
                  >
                    Set Up Subscription
                  </button>
                </div>
              )}
            </>
          )}

          <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
            <p className="text-[11px] text-zinc-500">
              Need assistance with your account?{' '}
              <a href="mailto:support@auradining.com" className="text-zinc-400 hover:text-zinc-200 underline">
                Contact Platform Support
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto w-full text-center text-[11px] text-zinc-600 z-10">
        &copy; {new Date().getFullYear()} AURA SaaS Platform. All rights reserved.
      </div>
    </div>
  );
};
