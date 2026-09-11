import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  Mail,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import type { RestaurantMember, UserRole } from '../../types';

export const AdminUsersPage: React.FC = () => {
  const { activeRestaurant, role: currentUserRole, user: currentAuthUser } = useAuth();
  const [members, setMembers] = useState<RestaurantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'STAFF' as UserRole,
    password: '',
  });
  const [inviting, setInviting] = useState(false);

  // Password reset modal state
  const [resetResult, setResetResult] = useState<{ email: string; tempPass: string } | null>(null);

  // Load members
  const fetchMembers = async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await userService.getMembers(activeRestaurant.id);
      setMembers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [activeRestaurant?.id]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurant?.id) return;
    setInviting(true);
    setError(null);
    try {
      await userService.addMember(activeRestaurant.id, {
        name: inviteForm.name,
        email: inviteForm.email,
        role: inviteForm.role,
        password: inviteForm.password || undefined,
      });
      setSuccessMsg(`Successfully invited ${inviteForm.name} as ${inviteForm.role}`);
      setShowInviteModal(false);
      setInviteForm({ name: '', email: '', role: 'STAFF', password: '' });
      fetchMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to add team member');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    if (!activeRestaurant?.id) return;
    setError(null);
    try {
      await userService.updateMemberRole(activeRestaurant.id, targetUserId, { role: newRole });
      setSuccessMsg('Member role updated successfully');
      fetchMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to update member role');
    }
  };

  const handleRemoveMember = async (targetUserId: string, memberName: string) => {
    if (!activeRestaurant?.id) return;
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this restaurant?`)) {
      return;
    }
    setError(null);
    try {
      await userService.removeMember(activeRestaurant.id, targetUserId);
      setSuccessMsg(`Removed ${memberName} from restaurant.`);
      fetchMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  const handleResetPassword = async (targetUserId: string, targetEmail: string) => {
    if (!activeRestaurant?.id) return;
    setError(null);
    try {
      const res = await userService.resetPassword(activeRestaurant.id, targetUserId);
      if (res.temporaryPassword) {
        setResetResult({
          email: targetEmail,
          tempPass: res.temporaryPassword,
        });
      } else {
        setSuccessMsg(`Password reset requested for ${targetEmail}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
  };


  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'OWNER':
        return 'bg-amber-400/20 text-amber-300 border-amber-400/40';
      case 'ADMIN':
        return 'bg-purple-400/20 text-purple-300 border-purple-400/40';
      case 'MANAGER':
        return 'bg-blue-400/20 text-blue-300 border-blue-400/40';
      case 'STAFF':
      default:
        return 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40';
    }
  };

  const canManageUsers = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif-luxury text-white tracking-wide flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" />
            Team & User Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage restaurant staff access, RBAC permissions, and team credentials for{' '}
            <span className="text-zinc-200 font-semibold">{activeRestaurant?.name}</span>.
          </p>

        </div>

        {canManageUsers && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 text-black font-semibold hover:bg-amber-300 transition shadow-lg shadow-amber-400/20 text-sm shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Team Member</span>
          </button>
        )}
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white text-xs">
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-white text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Role Matrix Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Owner</span>
            <Shield className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-[11px] text-zinc-400">
            Full restaurant control, tenant settings, billing, and user invites up to Owner.
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Admin</span>
            <Shield className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <p className="text-[11px] text-zinc-400">
            Menu management, dining tables, orders, KDS, and invites for Admin/Manager/Staff.
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Manager</span>
            <Shield className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <p className="text-[11px] text-zinc-400">
            Food availability toggles, live order dispatch, table status, and audit viewing.
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Staff</span>
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-[11px] text-zinc-400">
            Kitchen display workflow, updating order prep/ready status, and order viewing.
          </p>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span>Members</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300">
              {members.length}
            </span>
          </h2>
          <button
            onClick={fetchMembers}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-zinc-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
            <p className="text-sm">Loading team members...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <p className="text-sm">No members found for this restaurant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-xs uppercase bg-zinc-950/60 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Joined</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {members.map((member) => {
                  const targetId = member.userId || member.id;
                  const memberName = member.user?.name || member.name;
                  const memberEmail = member.user?.email || member.email;
                  const memberDate = member.createdAt || member.joinedAt;
                  const isSelf = targetId === currentAuthUser?.id;

                  return (
                    <tr key={member.id || member.membershipId} className="hover:bg-zinc-800/30 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-amber-400 text-sm">
                            {memberName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{memberName}</span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-zinc-500" />
                              <span>{memberEmail}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {canManageUsers && !isSelf ? (
                          <select
                            value={member.role}
                            onChange={(e) =>
                              handleRoleChange(targetId, e.target.value as UserRole)
                            }
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border focus:outline-none ${getRoleBadge(
                              member.role
                            )}`}
                          >
                            {currentUserRole === 'OWNER' && <option value="OWNER">OWNER</option>}
                            <option value="ADMIN">ADMIN</option>
                            <option value="MANAGER">MANAGER</option>
                            <option value="STAFF">STAFF</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg border ${getRoleBadge(
                              member.role
                            )}`}
                          >
                            {member.role}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-zinc-400">
                        {new Date(memberDate).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canManageUsers && (
                            <button
                              onClick={() =>
                                handleResetPassword(targetId, memberEmail)
                              }
                              title="Reset Password"
                              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-amber-400 hover:bg-zinc-700 transition"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                          )}
                          {canManageUsers && !isSelf && (
                            <button
                              onClick={() =>
                                handleRemoveMember(targetId, memberName)
                              }
                              title="Remove Member"
                              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 font-serif-luxury">
                <UserPlus className="w-5 h-5 text-amber-400" />
                Invite Team Member
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    type="text"
                    required
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                    placeholder="e.g. Maria Gonzalez"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="e.g. maria@restaurant.com"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Role Assignment
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, role: e.target.value as UserRole })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  {currentUserRole === 'OWNER' && <option value="OWNER">OWNER</option>}
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="STAFF">STAFF</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Temporary Password (Optional)
                </label>
                <input
                  type="password"
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                  placeholder="Leave blank to auto-generate"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  If left blank, a secure temporary password will be automatically assigned.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-amber-400 text-black hover:bg-amber-300 transition shadow-lg shadow-amber-400/20 disabled:opacity-50"
                >
                  {inviting ? 'Inviting...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Result Modal */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 font-serif-luxury">
                <KeyRound className="w-5 h-5 text-amber-400" />
                Temporary Password Generated
              </h3>
              <button
                onClick={() => setResetResult(null)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-zinc-300">
              A temporary password has been set for{' '}
              <span className="font-semibold text-white">{resetResult.email}</span>. Please copy
              and provide this credential to the team member:
            </p>

            <div className="p-3.5 bg-zinc-950 border border-amber-400/40 rounded-xl flex items-center justify-between gap-3">
              <code className="text-sm font-mono text-amber-300 select-all font-bold">
                {resetResult.tempPass}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetResult.tempPass);
                  alert('Copied temporary password to clipboard!');
                }}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setResetResult(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-400 text-black hover:bg-amber-300 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
