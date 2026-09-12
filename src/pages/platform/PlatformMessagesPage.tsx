import React, { useEffect, useState } from 'react';
import {
  Send,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Check,
  X,
  FileEdit,
  Ban,
  Radio,
  Pin,
  Loader2,
} from 'lucide-react';
import {
  platformMessageService,
  type PlatformMessageItem,
  type PlatformMessageTargetType,
  type PlatformMessageStatus,
} from '../../services/platformMessageService';
import type { NotificationPriority } from '../../services/notificationService';
import { apiClient } from '../../services/apiClient';

export const PlatformMessagesPage: React.FC = () => {
  const [messages, setMessages] = useState<PlatformMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Compose Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formTargetType, setFormTargetType] = useState<PlatformMessageTargetType>('ALL_RESTAURANTS');
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);
  const [formPriority, setFormPriority] = useState<NotificationPriority>('NORMAL');
  const [formPinned, setFormPinned] = useState(false);
  const [formRequiresAck, setFormRequiresAck] = useState(false);
  const [formIsScheduled, setFormIsScheduled] = useState(false);
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formConfirmAll, setFormConfirmAll] = useState(false);
  const [formFilterStatus, setFormFilterStatus] = useState<string[]>([]);

  // Available restaurants for targeting
  const [availableRestaurants, setAvailableRestaurants] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  // Detail Modal State
  const [detailModalItem, setDetailModalItem] = useState<PlatformMessageItem | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<PlatformMessageItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Load messages
  const fetchMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformMessageService.getMessages({
        page,
        limit: 15,
        search: search.trim() || undefined,
        status: statusFilter !== 'ALL' ? (statusFilter as PlatformMessageStatus) : undefined,
        priority: priorityFilter !== 'ALL' ? (priorityFilter as NotificationPriority) : undefined,
      });
      setMessages(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load platform messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [page, statusFilter, priorityFilter]);

  // Load restaurants for compose selector
  useEffect(() => {
    if (isComposeOpen && availableRestaurants.length === 0) {
      apiClient
        .get<any>('/platform/restaurants?limit=200')
        .then((res) => {
          if (res && res.items) {
            setAvailableRestaurants(res.items.map((r: any) => ({ id: r.id, name: r.name, slug: r.slug })));
          }
        })
        .catch(() => {});
    }
  }, [isComposeOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchMessages();
  };

  const handleOpenCompose = () => {
    setFormTitle('');
    setFormBody('');
    setFormTargetType('ALL_RESTAURANTS');
    setSelectedRestaurantIds([]);
    setFormPriority('NORMAL');
    setFormPinned(false);
    setFormRequiresAck(false);
    setFormIsScheduled(false);
    setFormScheduledAt('');
    setFormExpiresAt('');
    setFormConfirmAll(false);
    setFormFilterStatus([]);
    setComposeError(null);
    setIsComposeOpen(true);
  };

  const handleSendMessage = async (isDraft = false) => {
    if (!formTitle.trim()) {
      setComposeError('Please provide a message title.');
      return;
    }
    if (!formBody.trim()) {
      setComposeError('Please provide a message body.');
      return;
    }
    if (formTargetType === 'RESTAURANT' && selectedRestaurantIds.length === 0) {
      setComposeError('Please select a target restaurant.');
      return;
    }
    if (formTargetType === 'MULTIPLE_RESTAURANTS' && selectedRestaurantIds.length === 0) {
      setComposeError('Please select at least one restaurant.');
      return;
    }
    if (formTargetType === 'ALL_RESTAURANTS' && !isDraft && !formConfirmAll) {
      setComposeError('You must explicitly confirm broadcasting to ALL restaurants.');
      return;
    }
    if (formIsScheduled && !formScheduledAt) {
      setComposeError('Please select a future date/time for scheduled delivery.');
      return;
    }

    setComposeSubmitting(true);
    setComposeError(null);

    try {
      await platformMessageService.createMessage({
        title: formTitle.trim(),
        body: formBody.trim(),
        targetType: formTargetType,
        targetRestaurantIds: selectedRestaurantIds.length > 0 ? selectedRestaurantIds : undefined,
        filterStatus: formFilterStatus.length > 0 ? formFilterStatus : undefined,
        priority: formPriority,
        pinned: formPinned,
        requiresAcknowledgement: formRequiresAck,
        scheduledAt: formIsScheduled && formScheduledAt ? new Date(formScheduledAt).toISOString() : undefined,
        expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : undefined,
        confirmAll: formConfirmAll,
        isDraft,
      });

      setIsComposeOpen(false);
      fetchMessages();
    } catch (err: any) {
      setComposeError(err.message || 'Failed to dispatch message.');
    } finally {
      setComposeSubmitting(false);
    }
  };

  const handleViewDetails = async (id: string) => {
    try {
      const details = await platformMessageService.getMessageDetails(id);
      setDetailModalItem(details);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch details');
    }
  };

  const handleCancelScheduled = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled message?')) return;
    try {
      await platformMessageService.cancelScheduledMessage(id);
      fetchMessages();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel scheduled message');
    }
  };

  const handleOpenEdit = (item: PlatformMessageItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditBody(item.body);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    if (!editTitle.trim() || !editBody.trim()) {
      alert('Title and body cannot be empty');
      return;
    }
    setEditSubmitting(true);
    try {
      await platformMessageService.editMessage(editingItem.id, {
        title: editTitle.trim(),
        body: editBody.trim(),
      });
      setEditingItem(null);
      fetchMessages();
      if (detailModalItem && detailModalItem.id === editingItem.id) {
        handleViewDetails(editingItem.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to edit message');
    } finally {
      setEditSubmitting(false);
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

  const getStatusBadge = (s: PlatformMessageStatus) => {
    switch (s) {
      case 'SENT':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'SCHEDULED':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'DRAFT':
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
      case 'CANCELLED':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'EXPIRED':
        return 'bg-zinc-900 text-zinc-500 border-zinc-800';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-amber-400" />
            Platform Messaging & Announcements
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Dispatch announcements, maintenance alerts, and system notices to restaurants with delivery and read telemetry.
          </p>
        </div>

        <button
          onClick={handleOpenCompose}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold text-sm shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Announcement
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </form>

        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium whitespace-nowrap">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">All Statuses</option>
              <option value="SENT">Sent</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="DRAFT">Draft</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium whitespace-nowrap">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Messages Table */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-zinc-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <span className="text-sm">Loading announcements...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">
            <p>{error}</p>
            <button
              onClick={fetchMessages}
              className="mt-3 px-4 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-semibold hover:bg-red-500/20"
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <Send className="w-12 h-12 mx-auto text-zinc-700 mb-3" />
            <h3 className="text-base font-semibold text-zinc-300">No Announcements Found</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Create your first broadcast message to inform restaurants about maintenance, updates, or billing policies.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="bg-zinc-950/60 border-b border-zinc-800/80 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Priority & Title</th>
                  <th className="px-6 py-3.5">Target</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Delivery & Reads</th>
                  <th className="px-6 py-3.5">Ack %</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {messages.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider mt-0.5 ${getPriorityBadge(
                            m.priority
                          )}`}
                        >
                          {m.priority}
                        </span>
                        <div>
                          <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                            {m.title}
                            {m.pinned && (
                              <Pin className="w-3 h-3 text-amber-400 fill-amber-400 inline shrink-0" />
                            )}
                            {m.requiresAcknowledgement && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                                ACK REQ
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{m.body}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                        {m.targetType === 'ALL_RESTAURANTS' ? (
                          <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-medium">
                            All Tenants
                          </span>
                        ) : m.targetType === 'MULTIPLE_RESTAURANTS' ? (
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                            {m.targetRestaurantIds?.length || 0} Restaurants
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                            Single Restaurant
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(m.status)}`}>
                        {m.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {m.stats ? (
                        <div className="space-y-1">
                          <div className="text-xs font-mono text-zinc-300">
                            {m.stats.readCount} / {m.stats.deliveryCount} read ({m.stats.readPercentage}%)
                          </div>
                          <div className="w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${m.stats.readPercentage}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono">
                      {m.requiresAcknowledgement && m.stats ? (
                        <span className="text-amber-400 font-medium">
                          {m.stats.acknowledgedCount} ({m.stats.acknowledgedPercentage}%)
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-zinc-400">
                      {m.sentAt
                        ? new Date(m.sentAt).toLocaleDateString()
                        : m.scheduledAt
                        ? `Sched: ${new Date(m.scheduledAt).toLocaleDateString()}`
                        : new Date(m.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewDetails(m.id)}
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
                          title="View Telemetry & Recipients"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(m)}
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
                          title="Edit Announcement"
                        >
                          <FileEdit className="w-4 h-4" />
                        </button>

                        {m.status === 'SCHEDULED' && (
                          <button
                            onClick={() => handleCancelScheduled(m.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                            title="Cancel Scheduled Send"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span>
              Showing page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Compose Announcement Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
              <div className="flex items-center gap-2.5">
                <Send className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-zinc-100">Compose Platform Announcement</h2>
              </div>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {composeError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{composeError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Announcement Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled Platform Maintenance Window"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  maxLength={200}
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Message Body <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe the update, impact, or required actions..."
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* Targeting Mode */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">Recipient Scope</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { type: 'ALL_RESTAURANTS', label: 'All Tenants', desc: 'Broadcast to all' },
                    { type: 'MULTIPLE_RESTAURANTS', label: 'Multi-Select', desc: 'Specific group' },
                    { type: 'RESTAURANT', label: 'Single Restaurant', desc: '1 tenant only' },
                  ].map((target) => (
                    <button
                      key={target.type}
                      type="button"
                      onClick={() => {
                        setFormTargetType(target.type as PlatformMessageTargetType);
                        if (target.type === 'ALL_RESTAURANTS') setSelectedRestaurantIds([]);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        formTargetType === target.type
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="font-semibold text-xs text-zinc-100">{target.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{target.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi/Single selector */}
              {formTargetType !== 'ALL_RESTAURANTS' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Select Target Restaurant{formTargetType === 'MULTIPLE_RESTAURANTS' ? 's' : ''}
                  </label>
                  <select
                    multiple={formTargetType === 'MULTIPLE_RESTAURANTS'}
                    value={formTargetType === 'RESTAURANT' ? selectedRestaurantIds[0] || '' : selectedRestaurantIds}
                    onChange={(e) => {
                      if (formTargetType === 'RESTAURANT') {
                        setSelectedRestaurantIds(e.target.value ? [e.target.value] : []);
                      } else {
                        const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                        setSelectedRestaurantIds(selected);
                      }
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50 max-h-36"
                  >
                    {formTargetType === 'RESTAURANT' && <option value="">-- Choose Restaurant --</option>}
                    {availableRestaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.slug})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    {formTargetType === 'MULTIPLE_RESTAURANTS'
                      ? 'Hold Ctrl/Cmd to select multiple restaurants'
                      : 'Selected: ' + (selectedRestaurantIds.length > 0 ? '1 restaurant' : 'none')}
                  </p>
                </div>
              )}

              {/* Priority & Toggles */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Priority</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as NotificationPriority)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="LOW">Low (Informational)</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High (Important)</option>
                    <option value="URGENT">Urgent (Requires Ack / Banner)</option>
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPinned}
                      onChange={(e) => setFormPinned(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-800 text-amber-500 focus:ring-amber-500/20"
                    />
                    <span className="text-xs text-zinc-300 font-medium">Pin to top of notification inbox</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formRequiresAck}
                      onChange={(e) => setFormRequiresAck(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-800 text-amber-500 focus:ring-amber-500/20"
                    />
                    <span className="text-xs text-zinc-300 font-medium">Require tenant user acknowledgement</span>
                  </label>
                </div>
              </div>

              {/* Scheduling & Expiry */}
              <div className="grid grid-cols-2 gap-4 border-t border-zinc-800/80 pt-4">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                    <input
                      type="checkbox"
                      checked={formIsScheduled}
                      onChange={(e) => setFormIsScheduled(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-800 text-amber-500 focus:ring-amber-500/20"
                    />
                    <span className="text-xs font-semibold text-zinc-300">Schedule for future send</span>
                  </label>
                  {formIsScheduled && (
                    <input
                      type="datetime-local"
                      value={formScheduledAt}
                      onChange={(e) => setFormScheduledAt(e.target.value)}
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Optional Expiration Date</label>
                  <input
                    type="datetime-local"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              {/* Confirmation Banner for Broadcasts */}
              {formTargetType === 'ALL_RESTAURANTS' && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    BROADCAST SAFETY CHECK
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    This will dispatch this announcement to EVERY active restaurant tenant on the platform.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={formConfirmAll}
                      onChange={(e) => setFormConfirmAll(e.target.checked)}
                      className="rounded bg-zinc-900 border-amber-500 text-amber-500 focus:ring-amber-500/30"
                    />
                    <span className="text-xs font-semibold text-amber-200">
                      I confirm broadcasting this message to all restaurants
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleSendMessage(true)}
                disabled={composeSubmitting}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Save as Draft
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  className="px-4 py-2 rounded-xl bg-transparent hover:bg-zinc-900 text-zinc-400 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage(false)}
                  disabled={composeSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold text-xs shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {composeSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {formIsScheduled ? 'Schedule Announcement' : 'Publish & Broadcast'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Telemetry & Recipient Breakdown Modal */}
      {detailModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-8">
            <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPriorityBadge(detailModalItem.priority)}`}>
                    {detailModalItem.priority}
                  </span>
                  <h2 className="text-base font-bold text-zinc-100">{detailModalItem.title}</h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">{detailModalItem.body}</p>
              </div>
              <button
                onClick={() => setDetailModalItem(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Telemetry Stat Cards */}
              {detailModalItem.stats && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 text-center">
                    <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Total Delivered</div>
                    <div className="text-2xl font-bold font-mono text-zinc-100 mt-1">
                      {detailModalItem.stats.deliveryCount}
                    </div>
                  </div>

                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 text-center">
                    <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Read Telemetry</div>
                    <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                      {detailModalItem.stats.readPercentage}%
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {detailModalItem.stats.readCount} of {detailModalItem.stats.deliveryCount} read
                    </div>
                  </div>

                  <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 text-center">
                    <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                      Acknowledged Telemetry
                    </div>
                    <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                      {detailModalItem.stats.acknowledgedPercentage}%
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {detailModalItem.stats.acknowledgedCount} acknowledged
                    </div>
                  </div>
                </div>
              )}

              {/* Revision History if any */}
              {detailModalItem.revisions && detailModalItem.revisions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Revision History ({detailModalItem.revisions.length})
                  </h4>
                  <div className="space-y-2">
                    {detailModalItem.revisions.map((rev) => (
                      <div key={rev.id} className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800 text-xs text-zinc-300">
                        <div className="flex justify-between font-mono text-[11px] text-zinc-500 mb-1">
                          <span>Revision at {new Date(rev.editedAt).toLocaleString()}</span>
                        </div>
                        <div className="font-semibold text-zinc-200">{rev.title}</div>
                        <div className="text-zinc-400 mt-0.5">{rev.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recipient Breakdown Table */}
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Tenant Delivery & Read Receipts
                </h4>
                {detailModalItem.recipients && detailModalItem.recipients.length > 0 ? (
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="bg-zinc-950/80 border-b border-zinc-800 text-[10px] font-semibold text-zinc-400 uppercase">
                        <tr>
                          <th className="px-4 py-2.5">Restaurant</th>
                          <th className="px-4 py-2.5">Delivered</th>
                          <th className="px-4 py-2.5">Read At</th>
                          <th className="px-4 py-2.5">Acknowledged</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {detailModalItem.recipients.map((rec) => (
                          <tr key={rec.id} className="hover:bg-zinc-800/20">
                            <td className="px-4 py-2.5 font-medium text-zinc-200">
                              {rec.restaurant?.name || rec.restaurantId}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-400">
                              {new Date(rec.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-2.5">
                              {rec.readAt ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                                  <Check className="w-3 h-3" />
                                  {new Date(rec.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : (
                                <span className="text-zinc-600">Unread</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {rec.acknowledgedAt ? (
                                <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {new Date(rec.acknowledgedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">No recipient rows recorded.</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40 flex justify-end">
              <button
                onClick={() => setDetailModalItem(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <FileEdit className="w-5 h-5 text-amber-400" />
              Edit Announcement
            </h3>
            <p className="text-xs text-zinc-400">
              Editing an already sent announcement records a new revision history row non-destructively.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Message Body</label>
              <textarea
                rows={4}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-xs font-medium hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSubmitting}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1.5"
              >
                {editSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
