import React, { useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  UserPlus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  PowerOff,
  Power,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { platformService } from '../../services/platformService';
import type { PlatformUser, PlatformRole } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const PlatformUsersPage: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { isPlatformAdmin, user: currentUser } = useAuth();

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    platformRole: 'PLATFORM_SUPPORT' as PlatformRole,
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await platformService.listUsers();
      setUsers(data.items || []);
    } catch (err: any) {
      console.error('Failed to load platform users:', err);
      setError(err.message || 'Failed to load platform operators');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await platformService.createUser(formData);
      setModalOpen(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        platformRole: 'PLATFORM_SUPPORT',
      });
      await loadUsers();
    } catch (err: any) {
      alert(`Failed to create platform operator: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (targetUser: PlatformUser) => {
    if (targetUser.id === currentUser?.id) {
      alert('You cannot deactivate your own active session.');
      return;
    }

    const nextActive = !targetUser.active;
    const confirmMsg = nextActive
      ? `Activate operator ${targetUser.name}?`
      : `Deactivate operator ${targetUser.name}? They will immediately lose platform access.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await platformService.updateUser(targetUser.id, { active: nextActive });
      await loadUsers();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  const getRoleBadgeStyle = (r: PlatformRole) => {
    switch (r) {
      case 'PLATFORM_ADMIN':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'PLATFORM_SUPPORT':
        return 'bg-sky-500/10 text-sky-300 border-sky-500/30';
      case 'PLATFORM_VIEWER':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-400" />
            <span>Platform Operators & RBAC</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage global SaaS personnel with platform-level access and governance credentials.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadUsers}
            disabled={loading}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh operators list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {isPlatformAdmin && (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Platform Operator</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Operators Table */}
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-3.5">Operator Name</th>
                <th className="px-4 py-3.5">Email</th>
                <th className="px-4 py-3.5">Platform Role</th>
                <th className="px-4 py-3.5">Account Status</th>
                <th className="px-4 py-3.5">Created Date</th>
                {isPlatformAdmin && <th className="px-5 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
                    <span>Loading platform operators...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                    No platform operators found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-4 font-bold text-white flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-300 uppercase text-xs shrink-0">
                        {u.name.charAt(0)}
                      </div>
                      <span>{u.name}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          You
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-zinc-300 font-mono">{u.email}</td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border ${getRoleBadgeStyle(
                          u.platformRole
                        )}`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>{u.platformRole}</span>
                      </span>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                          u.active
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-red-500/10 text-red-300 border-red-500/30'
                        }`}
                      >
                        {u.active ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-red-400" />
                            <span>Inactive</span>
                          </>
                        )}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-zinc-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    {isPlatformAdmin && (
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              u.active
                                ? 'bg-zinc-800 hover:bg-red-950/60 border-zinc-700 hover:border-red-800 text-zinc-400 hover:text-red-300'
                                : 'bg-zinc-800 hover:bg-emerald-950/60 border-zinc-700 hover:border-emerald-800 text-zinc-400 hover:text-emerald-300'
                            }`}
                            title={u.active ? 'Deactivate operator' : 'Activate operator'}
                          >
                            {u.active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Operator Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <span>Create Platform Operator</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Operator Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Platform Operations"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="operator@auramenu.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Initial Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Platform Access Role</label>
                <select
                  value={formData.platformRole}
                  onChange={(e) =>
                    setFormData({ ...formData, platformRole: e.target.value as PlatformRole })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="PLATFORM_ADMIN">PLATFORM_ADMIN (Full SaaS Control)</option>
                  <option value="PLATFORM_SUPPORT">PLATFORM_SUPPORT (Support Operations)</option>
                  <option value="PLATFORM_VIEWER">PLATFORM_VIEWER (Read-Only Metrics)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold shadow-lg shadow-amber-500/20"
                >
                  {submitting ? 'Creating...' : 'Create Operator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
