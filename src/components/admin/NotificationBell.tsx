import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { notificationService, type NotificationItem } from '../../services/notificationService';
import { Bell, Check, ExternalLink, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export const NotificationBell: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchUnread = async () => {
    if (!activeRestaurant?.id) return;
    try {
      const count = await notificationService.getUnreadCount(activeRestaurant.id);
      setUnreadCount(count);
    } catch {
      // Non-blocking
    }
  };

  const fetchRecent = async () => {
    if (!activeRestaurant?.id) return;
    try {
      const res = await notificationService.getNotifications(activeRestaurant.id, { limit: 5 });
      setRecentNotifications(res.items);
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);

    // Realtime SSE listener for instant badge update
    let es: EventSource | null = null;
    if (activeRestaurant?.id) {
      try {
        const token = localStorage.getItem('aura_admin_token') || localStorage.getItem('token') || '';
        const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
        const sseUrl = `${baseUrl}/restaurants/${activeRestaurant.id}/events${
          token ? `?token=${encodeURIComponent(token)}` : ''
        }`;
        es = new EventSource(sseUrl);
        const handleEvent = () => {
          fetchUnread();
          if (isOpen) fetchRecent();
        };
        es.addEventListener('notification', handleEvent);
        es.addEventListener('notification_created', handleEvent);
        es.addEventListener('platform_message', handleEvent);
        es.addEventListener('NOTIFICATION_CREATED', handleEvent);
        es.addEventListener('NOTIFICATION', handleEvent);
        es.addEventListener('PLATFORM_MESSAGE', handleEvent);
      } catch {
        // Fallback gracefully
      }
    }

    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, [activeRestaurant?.id, isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchRecent();
    }
  }, [isOpen, activeRestaurant?.id]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationService.markRead(id);
      setRecentNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-all"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950 shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/80 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/90">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-100 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-mono">
                  {unreadCount} new
                </span>
              )}
            </div>
            <Link
              to="/admin/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              View All
            </Link>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/60">
            {recentNotifications.length === 0 ? (
              <div className="p-6 text-center text-zinc-500 text-xs">No notifications yet.</div>
            ) : (
              recentNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (n.type.startsWith('SUBSCRIPTION')) {
                      navigate('/admin/subscription');
                    } else {
                      navigate('/admin/notifications');
                    }
                    setIsOpen(false);
                  }}
                  className={`p-3.5 hover:bg-zinc-800/50 transition-colors cursor-pointer flex items-start gap-3 ${
                    !n.readAt ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <div className="mt-0.5">{getIcon(n.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-xs font-semibold truncate ${!n.readAt ? 'text-zinc-100' : 'text-zinc-400'}`}>
                        {n.title}
                      </p>
                      {!n.readAt && (
                        <button
                          onClick={(e) => handleMarkRead(n.id, e)}
                          className="text-zinc-500 hover:text-amber-400 p-0.5"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{n.message}</p>
                    <span className="text-[10px] text-zinc-500 mt-1 inline-block">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 border-t border-zinc-800 bg-zinc-950/60 text-center">
            <Link
              to="/admin/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1 font-medium"
            >
              Go to Notification Center <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
