import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  notificationService,
  type NotificationItem,
  type NotificationSource,
  type NotificationPriority,
} from '../../services/notificationService';
import {
  Bell,
  Check,
  CheckCheck,
  Filter,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Search,
  Pin,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

export const AdminNotificationsPage: React.FC = () => {
  const { activeRestaurant } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Tabs & Filters
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD' | 'URGENT' | 'PLATFORM' | 'SUBSCRIPTION' | 'SYSTEM'>('ALL');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const navigate = useNavigate();

  const loadNotifications = async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    try {
      let source: NotificationSource | undefined;
      let priority: NotificationPriority | undefined;
      let unreadOnly = false;

      if (activeTab === 'UNREAD') {
        unreadOnly = true;
      } else if (activeTab === 'URGENT') {
        priority = 'URGENT';
      } else if (activeTab === 'PLATFORM') {
        source = 'PLATFORM';
      } else if (activeTab === 'SUBSCRIPTION') {
        source = 'SUBSCRIPTION';
      } else if (activeTab === 'SYSTEM') {
        source = 'SYSTEM';
      }

      const res = await notificationService.getNotifications(activeRestaurant.id, {
        page,
        limit: 15,
        type: typeFilter || undefined,
        source,
        priority,
        unreadOnly,
        search: search.trim() || undefined,
      });

      setNotifications(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [activeRestaurant?.id, page, activeTab, typeFilter]);

  // Real-time SSE listener for instant notification delivery without refresh
  useEffect(() => {
    if (!activeRestaurant?.id) return;

    let es: EventSource | null = null;
    try {
      const token = localStorage.getItem('aura_admin_token') || localStorage.getItem('token') || '';
      const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
      const sseUrl = `${baseUrl}/restaurants/${activeRestaurant.id}/events${
        token ? `?token=${encodeURIComponent(token)}` : ''
      }`;
      es = new EventSource(sseUrl);

      const handleEvent = () => {
        loadNotifications();
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

    return () => {
      if (es) es.close();
    };
  }, [activeRestaurant?.id, page, activeTab, typeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadNotifications();
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationService.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkUnread = async (id: string) => {
    try {
      await notificationService.markUnread(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: null } : n))
      );
    } catch (err) {
      console.error('Failed to mark unread:', err);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      const updated = await notificationService.acknowledge(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, acknowledgedAt: updated.acknowledgedAt, acknowledgedByUserId: updated.acknowledgedByUserId } : n))
      );
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!activeRestaurant?.id) return;
    try {
      await notificationService.markAllRead(activeRestaurant.id);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
      );
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const getPriorityBadge = (p: NotificationPriority) => {
    switch (p) {
      case 'URGENT':
        return 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'LOW':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getSourceBadge = (s: NotificationSource) => {
    switch (s) {
      case 'PLATFORM':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'SUBSCRIPTION':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'SECURITY':
        return 'bg-red-500/15 text-red-300 border-red-500/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  const getIcon = (severity: string, priority: NotificationPriority) => {
    if (priority === 'URGENT') {
      return <AlertCircle className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />;
    }
    switch (severity) {
      case 'CRITICAL':
        return <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />;
      case 'WARNING':
        return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Bell className="w-7 h-7 text-amber-500" />
            <span>Notification & Announcement Center</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            System notices, platform broadcasts, subscription lifecycle alerts, and operational messages.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadNotifications}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Refresh notifications"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold tracking-wider transition-all cursor-pointer"
          >
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            <span>Mark All Read</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-zinc-800">
        {[
          { key: 'ALL', label: 'All Notifications' },
          { key: 'UNREAD', label: 'Unread' },
          { key: 'URGENT', label: 'Urgent' },
          { key: 'PLATFORM', label: 'Platform Broadcasts' },
          { key: 'SUBSCRIPTION', label: 'Subscription & Billing' },
          { key: 'SYSTEM', label: 'System' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key as any);
              setPage(1);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Secondary Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
          />
        </form>

        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-500"
          >
            <option value="">All Event Types</option>
            <option value="PLATFORM_BROADCAST">Platform Broadcast</option>
            <option value="PLATFORM_DIRECT">Platform Direct Message</option>
            <option value="SUBSCRIPTION_30_DAYS">30-Day Expiry Notice</option>
            <option value="SUBSCRIPTION_14_DAYS">14-Day Expiry Notice</option>
            <option value="SUBSCRIPTION_7_DAYS">7-Day Expiry Notice</option>
            <option value="SUBSCRIPTION_3_DAYS">3-Day Urgent Reminder</option>
            <option value="SUBSCRIPTION_1_DAY">1-Day Expiry Warning</option>
            <option value="SUBSCRIPTION_EXPIRED">Subscription Expired</option>
            <option value="SUBSCRIPTION_RENEWED">Subscription Renewed</option>
            <option value="SUBSCRIPTION_PAYMENT_FAILED">Payment Failed</option>
            <option value="SUBSCRIPTION_ACTIVATED">Subscription Activated</option>
          </select>
        </div>
      </div>

      {/* Notification List */}
      <div className="rounded-3xl bg-zinc-900/90 border border-zinc-800 divide-y divide-zinc-800/80 overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
            <span className="text-xs">Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-sm">
            <Bell className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
            No notifications matching your criteria.
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`p-5 transition-colors flex items-start gap-4 ${
                n.priority === 'URGENT' && !n.acknowledgedAt
                  ? 'bg-red-950/20 border-l-4 border-red-500'
                  : !n.readAt
                  ? 'bg-amber-500/5 hover:bg-amber-500/10'
                  : 'hover:bg-zinc-800/40'
              }`}
            >
              <div className="mt-0.5">{getIcon(n.severity, n.priority)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getPriorityBadge(
                          n.priority
                        )}`}
                      >
                        {n.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider ${getSourceBadge(
                          n.source
                        )}`}
                      >
                        {n.source}
                      </span>
                      {n.pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                          <Pin className="w-3 h-3 fill-amber-400" />
                          Pinned
                        </span>
                      )}
                    </div>

                    <h3 className={`text-sm font-semibold ${!n.readAt ? 'text-white' : 'text-zinc-300'}`}>
                      {n.title}
                    </h3>
                    <span className="text-[11px] font-mono text-zinc-500">
                      {new Date(n.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* Actions right side */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Acknowledge Button */}
                    {!n.acknowledgedAt && (n.priority === 'URGENT' || n.priority === 'HIGH') && (
                      <button
                        onClick={() => handleAcknowledge(n.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow transition-colors cursor-pointer"
                        title="Acknowledge Announcement"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Acknowledge</span>
                      </button>
                    )}

                    {n.acknowledgedAt && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
                        <Check className="w-3 h-3" />
                        <span>Ack'd</span>
                      </span>
                    )}

                    {n.type.startsWith('SUBSCRIPTION') && (
                      <button
                        onClick={() => navigate('/admin/subscription')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer"
                      >
                        <span>Billing</span>
                        <ExternalLink className="w-3 h-3 text-amber-400" />
                      </button>
                    )}

                    {!n.readAt ? (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkUnread(n.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Mark as unread"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-zinc-300 mt-2 leading-relaxed whitespace-pre-line">{n.message}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-400 px-2">
          <span>
            Showing {notifications.length} of {total} notifications
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 disabled:opacity-40 text-zinc-200 cursor-pointer"
            >
              Previous
            </button>
            <span className="font-mono text-white">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 disabled:opacity-40 text-zinc-200 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
