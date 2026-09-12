import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationService, type NotificationItem } from '../../services/notificationService';

export const UrgentNotificationBanner: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const [urgentNotice, setUrgentNotice] = useState<NotificationItem | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const fetchUrgentNotice = async () => {
    if (!activeRestaurant?.id) return;
    try {
      const res = await notificationService.getNotifications(activeRestaurant.id, {
        priority: 'URGENT',
        unacknowledgedOnly: true,
        limit: 1,
      });
      if (res.items.length > 0) {
        setUrgentNotice(res.items[0]);
      } else {
        setUrgentNotice(null);
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchUrgentNotice();
    const interval = setInterval(fetchUrgentNotice, 30000);
    return () => clearInterval(interval);
  }, [activeRestaurant?.id]);

  const handleAcknowledge = async () => {
    if (!urgentNotice) return;
    setAcknowledging(true);
    try {
      await notificationService.acknowledge(urgentNotice.id);
      setUrgentNotice(null);
    } catch (err) {
      console.error('Failed to acknowledge urgent notice:', err);
    } finally {
      setAcknowledging(false);
    }
  };

  if (!urgentNotice) return null;

  return (
    <div
      role="alert"
      className="bg-gradient-to-r from-red-950/90 via-red-900/80 to-amber-950/90 border-b border-red-500/50 px-4 py-2.5 text-white shadow-lg shrink-0 flex flex-wrap items-center justify-between gap-3 z-40 animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="p-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse shrink-0">
          <AlertCircle className="w-4 h-4" />
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-black font-extrabold uppercase tracking-wider">
              CRITICAL NOTICE
            </span>
            <span className="text-xs font-bold text-red-200 truncate">{urgentNotice.title}</span>
          </div>
          <p className="text-xs text-zinc-300 truncate max-w-2xl mt-0.5">{urgentNotice.message}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleAcknowledge}
          disabled={acknowledging}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-black font-bold text-xs shadow transition-all cursor-pointer disabled:opacity-50"
        >
          {acknowledging ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          <span>Acknowledge</span>
        </button>

        <Link
          to="/admin/notifications"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-700/60 transition-colors"
        >
          <span>View All</span>
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
