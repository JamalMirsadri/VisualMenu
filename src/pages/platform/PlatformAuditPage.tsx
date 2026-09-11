import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { platformService } from '../../services/platformService';
import type { PlatformAuditItem } from '../../types';

export const PlatformAuditPage: React.FC = () => {
  const [logs, setLogs] = useState<PlatformAuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await platformService.listAuditLogs({
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
        page,
        limit,
      });
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      setError(err.message || 'Failed to load platform audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [page, actionFilter, entityTypeFilter]);

  const getActionBadgeStyle = (action: string) => {
    switch (action) {
      case 'ACTIVATE':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
      case 'DEACTIVATE':
        return 'bg-red-500/10 text-red-300 border-red-500/30';
      case 'CONTEXT_ENTER':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'CONTEXT_EXIT':
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
      case 'CREATE':
        return 'bg-sky-500/10 text-sky-300 border-sky-500/30';
      case 'UPDATE':
        return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
      case 'DELETE':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
            <span>Platform Audit Log & Security Trail</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Immutable trace of operator activities, tenant activations, context switches, and configuration events.
          </p>
        </div>

        <button
          onClick={loadAuditLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400 font-medium">Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">All Actions</option>
            <option value="ACTIVATE">ACTIVATE</option>
            <option value="DEACTIVATE">DEACTIVATE</option>
            <option value="CONTEXT_ENTER">CONTEXT_ENTER</option>
            <option value="CONTEXT_EXIT">CONTEXT_EXIT</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400 font-medium">Entity Type:</label>
          <select
            value={entityTypeFilter}
            onChange={(e) => {
              setEntityTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">All Entities</option>
            <option value="Restaurant">Restaurant</option>
            <option value="User">User</option>
            <option value="PlatformSettings">PlatformSettings</option>
          </select>
        </div>

        {(actionFilter || entityTypeFilter) && (
          <button
            onClick={() => {
              setActionFilter('');
              setEntityTypeFilter('');
              setPage(1);
            }}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium underline ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Logs Table */}
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Action</th>
                <th className="px-4 py-3.5">Target Entity</th>
                <th className="px-4 py-3.5">Operator</th>
                <th className="px-4 py-3.5">Tenant Scope</th>
                <th className="px-5 py-3.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
                    <span>Loading security audit logs...</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                    No audit records match the current criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap text-zinc-400 font-mono text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${getActionBadgeStyle(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">{log.entityType}</span>
                        <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[120px]">
                          {log.entityId}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-200">
                          {log.user?.name || 'System'}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {log.actorPlatformRole || log.user?.email || 'SYSTEM'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      {log.restaurant ? (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium text-[11px]">
                          {log.restaurant.name}
                        </span>
                      ) : (
                        <span className="text-zinc-600 font-mono text-[11px]">Global</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      {log.metadata ? (
                        <pre className="text-[11px] font-mono text-zinc-400 bg-zinc-950/60 p-1.5 rounded-lg max-w-xs overflow-x-auto border border-zinc-800/60">
                          {typeof log.metadata === 'string'
                            ? log.metadata
                            : JSON.stringify(log.metadata, null, 1)}
                        </pre>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 bg-zinc-950/80 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <div>
            Showing <span className="font-semibold text-white">{logs.length}</span> of{' '}
            <span className="font-semibold text-white">{total}</span> total events
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-zinc-300">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
