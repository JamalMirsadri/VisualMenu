import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Mail,
  UserX,
  UserCheck,
  Clock,
  Send,
  X,
  Search,
  Sliders,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { staffService, type CatalogResponse } from '../../services/staffService';
import type {
  StaffMember,
  StaffInvitationItem,
  StaffRole,
  RoleTemplate,
  PermissionDefinition,
} from '../../types';

export const AdminStaffPage: React.FC = () => {
  const { activeRestaurant, role: currentUserRole, user: currentAuthUser, hasPermission } = useAuth();

  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitationItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active view tab: 'STAFF' or 'INVITATIONS'
  const [activeTab, setActiveTab] = useState<'STAFF' | 'INVITATIONS'>('STAFF');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('CUSTOM');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Create / Invite Form state
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'STAFF' as StaffRole,
    jobTemplate: 'WAITER' as RoleTemplate,
    password: '',
    isDirectPassword: false,
    permissions: [] as string[],
  });
  const [inviting, setInviting] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Collapsed groups state in permissions matrix
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const canCreateStaff = hasPermission('CREATE_STAFF') || currentUserRole === 'OWNER';
  const canEditPermissions = hasPermission('MANAGE_STAFF_PERMISSIONS') || currentUserRole === 'OWNER';
  const canDisableStaff = hasPermission('DISABLE_STAFF') || currentUserRole === 'OWNER';

  // Load staff & permissions catalog
  const fetchData = async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [staffData, catalogData] = await Promise.all([
        staffService.listStaff(activeRestaurant.id),
        staffService.getPermissionsCatalog(activeRestaurant.id),
      ]);
      setMembers(staffData.data);
      setInvitations(staffData.invitations);
      setCatalog(catalogData);
    } catch (err: any) {
      setError(err.message || 'Failed to load staff management data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeRestaurant?.id]);

  // Grouped permissions memo
  const groupedPermissions = useMemo(() => {
    if (!catalog?.permissions) return {};
    const groups: Record<string, PermissionDefinition[]> = {};
    for (const p of catalog.permissions) {
      const groupName = p.group || 'Other';
      if (!groups[groupName]) groups[groupName] = [];
      if (!permissionSearch || p.label.toLowerCase().includes(permissionSearch.toLowerCase()) || p.key.toLowerCase().includes(permissionSearch.toLowerCase())) {
        groups[groupName].push(p);
      }
    }
    return groups;
  }, [catalog?.permissions, permissionSearch]);

  // Apply template prefill
  const applyTemplateToSelection = (tmpl: RoleTemplate | 'SELECT_ALL' | 'CLEAR_ALL') => {
    if (!catalog) return;
    if (tmpl === 'SELECT_ALL') {
      setSelectedPermissions(catalog.permissions.map((p) => p.key));
      setSelectedTemplate('CUSTOM');
      return;
    }
    if (tmpl === 'CLEAR_ALL') {
      setSelectedPermissions([]);
      setSelectedTemplate('CUSTOM');
      return;
    }
    const templatePerms = catalog.templates[tmpl] || [];
    setSelectedPermissions(templatePerms);
    setSelectedTemplate(tmpl);
  };

  const togglePermission = (key: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setSelectedTemplate('CUSTOM');
  };

  const toggleGroupSelection = (groupPermissions: PermissionDefinition[]) => {
    const keys = groupPermissions.map((p) => p.key);
    const allSelected = keys.every((k) => selectedPermissions.includes(k));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((k) => !keys.includes(k)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...keys])));
    }
    setSelectedTemplate('CUSTOM');
  };

  // Open Edit Permissions modal
  const handleOpenEditPermissions = (member: StaffMember) => {
    setEditingStaff(member);
    setSelectedPermissions(member.permissions || []);
    setSelectedTemplate(member.jobTemplate || 'CUSTOM');
    setPermissionSearch('');
  };

  // Save Permissions
  const handleSavePermissions = async () => {
    if (!activeRestaurant?.id || !editingStaff) return;
    setSavingPermissions(true);
    setError(null);
    try {
      await staffService.updateStaffPermissions(
        activeRestaurant.id,
        editingStaff.id,
        selectedPermissions,
        selectedTemplate
      );
      setSuccessMsg(`Permissions updated for ${editingStaff.name}`);
      setEditingStaff(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update permissions.');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Toggle Staff Status (Active / Disabled)
  const handleToggleStatus = async (member: StaffMember) => {
    if (!activeRestaurant?.id) return;
    const nextStatus = member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const actionLabel = nextStatus === 'DISABLED' ? 'disable' : 'enable';
    if (!window.confirm(`Are you sure you want to ${actionLabel} access for ${member.name}?`)) {
      return;
    }
    setError(null);
    try {
      await staffService.updateStaffStatus(activeRestaurant.id, member.id, nextStatus);
      setSuccessMsg(`Staff access ${nextStatus === 'ACTIVE' ? 'enabled' : 'disabled'} for ${member.name}`);
      fetchData();
    } catch (err: any) {
      setError(err.message || `Failed to ${actionLabel} staff.`);
    }
  };

  // Remove Staff from restaurant
  const handleRemoveStaff = async (member: StaffMember) => {
    if (!activeRestaurant?.id) return;
    if (!window.confirm(`Are you sure you want to remove ${member.name} from this restaurant? Their global account will remain preserved.`)) {
      return;
    }
    setError(null);
    try {
      await staffService.removeStaff(activeRestaurant.id, member.id);
      setSuccessMsg(`Removed ${member.name} from this restaurant.`);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove staff member.');
    }
  };

  // Resend invitation
  const handleResendInvitation = async (inv: StaffInvitationItem) => {
    if (!activeRestaurant?.id) return;
    setError(null);
    try {
      const res = await staffService.resendStaffInvitation(activeRestaurant.id, inv.id);
      const fullUrl = `${window.location.origin}${res.invitation.onboardingUrl}`;
      setCreatedInviteLink(fullUrl);
      setSuccessMsg(`Invitation resent to ${inv.invitedEmail}`);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to resend invitation.');
    }
  };

  // Revoke invitation
  const handleRevokeInvitation = async (inv: StaffInvitationItem) => {
    if (!activeRestaurant?.id) return;
    if (!window.confirm(`Revoke invitation for ${inv.invitedEmail}?`)) return;
    setError(null);
    try {
      await staffService.revokeStaffInvitation(activeRestaurant.id, inv.id);
      setSuccessMsg(`Invitation revoked for ${inv.invitedEmail}`);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invitation.');
    }
  };

  // Handle Create / Invite Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurant?.id) return;
    setInviting(true);
    setError(null);
    try {
      const payloadPermissions =
        selectedPermissions.length > 0
          ? selectedPermissions
          : (catalog?.templates[inviteForm.jobTemplate] || []);

      const result = await staffService.createOrInviteStaff(activeRestaurant.id, {
        name: inviteForm.name,
        email: inviteForm.email,
        phone: inviteForm.phone || undefined,
        role: inviteForm.role,
        jobTemplate: inviteForm.jobTemplate,
        permissions: payloadPermissions,
        password: inviteForm.isDirectPassword && inviteForm.password ? inviteForm.password : undefined,
      });

      if (result.invitation?.onboardingUrl) {
        const fullUrl = `${window.location.origin}${result.invitation.onboardingUrl}`;
        setCreatedInviteLink(fullUrl);
        setSuccessMsg(`Invitation created for ${inviteForm.name}`);
      } else {
        setSuccessMsg(`Staff member ${inviteForm.name} created successfully.`);
        setShowInviteModal(false);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create staff member.');
    } finally {
      setInviting(false);
    }
  };

  // Reset Create Form
  const handleOpenCreateModal = () => {
    setInviteForm({
      name: '',
      email: '',
      phone: '',
      role: 'STAFF',
      jobTemplate: 'WAITER',
      password: '',
      isDirectPassword: false,
      permissions: [],
    });
    if (catalog) {
      setSelectedPermissions(catalog.templates['WAITER'] || []);
      setSelectedTemplate('WAITER');
    }
    setCreatedInviteLink(null);
    setCopiedLink(false);
    setShowInviteModal(true);
  };

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.jobTemplate && m.jobTemplate.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, searchQuery, roleFilter, statusFilter]);

  // Metrics
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length;
  const disabledCount = members.filter((m) => m.status === 'DISABLED').length;
  const pendingInvitesCount = invitations.filter((i) => i.status === 'PENDING').length;

  const getRoleBadgeStyle = (r: StaffRole) => {
    switch (r) {
      case 'OWNER':
        return 'bg-amber-400/15 text-amber-300 border-amber-400/30';
      case 'ADMIN':
        return 'bg-purple-400/15 text-purple-300 border-purple-400/30';
      case 'MANAGER':
        return 'bg-blue-400/15 text-blue-300 border-blue-400/30';
      case 'STAFF':
        return 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Restaurant Staff & Permissions
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Phase 11A RBAC
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Manage team assignments, role templates, cryptographic invitations, and individual permission matrices.
          </p>
        </div>

        {canCreateStaff && (
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite or Add Staff</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-400 font-medium">Total Staff</span>
            <Users className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold text-white font-serif">{members.length}</div>
          <p className="text-[10px] text-zinc-400 mt-1">Assigned team members</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-400 font-medium">Active Access</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-serif">{activeCount}</div>
          <p className="text-[10px] text-zinc-400 mt-1">Can log in & perform actions</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-400 font-medium">Disabled</span>
            <UserX className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400 font-serif">{disabledCount}</div>
          <p className="text-[10px] text-zinc-400 mt-1">Access immediately blocked</p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-400 font-medium">Pending Invites</span>
            <Mail className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-serif">{pendingInvitesCount}</div>
          <p className="text-[10px] text-zinc-400 mt-1">Awaiting acceptance</p>
        </div>
      </div>

      {/* Tabs & Search Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('STAFF')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'STAFF'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            Staff Directory ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('INVITATIONS')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'INVITATIONS'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <span>Invitations</span>
            {pendingInvitesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                {pendingInvitesCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs bg-zinc-900/80 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-white placeholder-zinc-400 focus:outline-none focus:border-amber-400 w-48 sm:w-64"
            />
          </div>

          {activeTab === 'STAFF' && (
            <>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-1.5 text-zinc-300 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Roles</option>
                <option value="OWNER">Owner</option>
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="STAFF">Staff</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-1.5 text-zinc-300 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* TAB 1: STAFF DIRECTORY TABLE */}
      {activeTab === 'STAFF' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
          {loading ? (
            <div className="p-12 text-center text-zinc-400 text-xs">Loading staff members...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 text-xs">No staff members found matching criteria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/50 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Job Template</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Custom Permissions</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-xs">
                  {filteredMembers.map((member) => {
                    const isSelf = member.id === currentAuthUser?.id;
                    const isOwner = member.role === 'OWNER';

                    return (
                      <tr key={member.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-amber-300 text-xs shrink-0">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate flex items-center gap-1.5">
                                <span>{member.name}</span>
                                {isSelf && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 truncate">{member.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${getRoleBadgeStyle(member.role)}`}>
                            {member.role}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          {member.jobTemplate ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 uppercase">
                              {member.jobTemplate}
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-400">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {member.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400 text-[11px] font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                              Disabled
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {isOwner ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
                              <Lock className="w-3 h-3" />
                              <span>Full Inherent Access</span>
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono text-zinc-300">
                                {member.permissions.length} granted
                              </span>
                              {canEditPermissions && (
                                <button
                                  onClick={() => handleOpenEditPermissions(member)}
                                  className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                                >
                                  Configure Matrix
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canEditPermissions && !isOwner && (
                              <button
                                onClick={() => handleOpenEditPermissions(member)}
                                className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-amber-300 transition-colors cursor-pointer"
                                title="Configure Custom Permissions"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canDisableStaff && !isSelf && (
                              <button
                                onClick={() => handleToggleStatus(member)}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  member.status === 'ACTIVE'
                                    ? 'bg-zinc-800/80 hover:bg-red-950/40 border-zinc-700 text-zinc-300 hover:text-red-300'
                                    : 'bg-emerald-950/30 hover:bg-emerald-900/40 border-emerald-800/60 text-emerald-400'
                                }`}
                                title={member.status === 'ACTIVE' ? 'Disable Access' : 'Enable Access'}
                              >
                                {member.status === 'ACTIVE' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            )}

                            {canDisableStaff && !isSelf && !isOwner && (
                              <button
                                onClick={() => handleRemoveStaff(member)}
                                className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-950/50 border border-zinc-700 hover:border-red-800 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                                title="Remove from Restaurant"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* TAB 2: PENDING INVITATIONS TABLE */}
      {activeTab === 'INVITATIONS' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
          {invitations.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 text-xs">No pending or historical invitations found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/50 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Invitee</th>
                    <th className="py-3 px-4">Assigned Role</th>
                    <th className="py-3 px-4">Template</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-xs">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{inv.invitedName}</div>
                        <div className="text-[11px] text-zinc-400">{inv.invitedEmail}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${getRoleBadgeStyle(inv.role)}`}>
                          {inv.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 uppercase">
                          {inv.jobTemplate || 'CUSTOM'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {inv.status === 'PENDING' && (
                          <span className="text-amber-400 text-[11px] font-medium flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        )}
                        {inv.status === 'ACCEPTED' && (
                          <span className="text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Accepted
                          </span>
                        )}
                        {inv.status === 'EXPIRED' && <span className="text-zinc-400 text-[11px]">Expired</span>}
                        {inv.status === 'REVOKED' && <span className="text-red-400 text-[11px]">Revoked</span>}
                      </td>

                      <td className="py-3.5 px-4 text-zinc-400 text-[11px]">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {inv.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleResendInvitation(inv)}
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] flex items-center gap-1 cursor-pointer"
                                title="Resend fresh link"
                              >
                                <Send className="w-3 h-3" />
                                <span>Resend</span>
                              </button>

                              <button
                                onClick={() => handleRevokeInvitation(inv)}
                                className="p-1 rounded-lg bg-zinc-800 hover:bg-red-950/50 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                                title="Revoke Invitation"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: EDIT PERMISSION MATRIX MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                    Configure Permission Matrix
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Adjusting permissions for <span className="text-white font-medium">{editingStaff.name}</span> ({editingStaff.email})
                </p>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Quick Selection Bar */}
            <div className="p-4 bg-zinc-900/60 border-b border-zinc-800 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Templates:
              </span>
              {(['WAITER', 'KITCHEN', 'CASHIER', 'HOST', 'SUPERVISOR', 'ACCOUNTING'] as RoleTemplate[]).map((tmpl) => (
                <button
                  key={tmpl}
                  type="button"
                  onClick={() => applyTemplateToSelection(tmpl)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase transition-all cursor-pointer ${
                    selectedTemplate === tmpl
                      ? 'bg-amber-500 text-black shadow-sm'
                      : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {tmpl}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyTemplateToSelection('SELECT_ALL')}
                  className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-zinc-700">|</span>
                <button
                  type="button"
                  onClick={() => applyTemplateToSelection('CLEAR_ALL')}
                  className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Search Filter for Permissions */}
            <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
              <div className="relative w-full max-w-sm">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter permissions..."
                  value={permissionSearch}
                  onChange={(e) => setPermissionSearch(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-white placeholder-zinc-400 focus:outline-none focus:border-amber-400"
                />
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {selectedPermissions.length} selected
              </span>
            </div>

            {/* Matrix Body (Scrollable Group Cards) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {Object.entries(groupedPermissions).map(([groupName, groupPerms]) => {
                const isCollapsed = Boolean(collapsedGroups[groupName]);
                const groupKeys = groupPerms.map((p) => p.key);
                const allGroupSelected = groupKeys.every((k) => selectedPermissions.includes(k));

                return (
                  <div
                    key={groupName}
                    className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden"
                  >
                    {/* Group Header */}
                    <div className="p-3 bg-zinc-900/80 border-b border-zinc-800/60 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))
                        }
                        className="flex items-center gap-2 text-xs font-bold text-white tracking-wide hover:text-amber-300 cursor-pointer"
                      >
                        {isCollapsed ? <ChevronRight className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                        <span>{groupName}</span>
                        <span className="text-[10px] text-zinc-400 font-normal">
                          ({groupPerms.filter((p) => selectedPermissions.includes(p.key)).length}/{groupPerms.length})
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleGroupSelection(groupPerms)}
                        className="text-[10px] text-zinc-400 hover:text-amber-400 underline cursor-pointer"
                      >
                        {allGroupSelected ? 'Deselect group' : 'Select all group'}
                      </button>
                    </div>

                    {/* Permissions list */}
                    {!isCollapsed && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {groupPerms.map((perm) => {
                          const isChecked = selectedPermissions.includes(perm.key);

                          return (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                                isChecked
                                  ? 'bg-amber-400/5 border-amber-400/30 text-white'
                                  : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-400 hover:border-zinc-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(perm.key)}
                                className="mt-0.5 rounded border-zinc-700 text-amber-500 focus:ring-amber-400 focus:ring-offset-zinc-900"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-zinc-200">
                                  {perm.label}
                                </div>
                                <div className="text-[10px] text-zinc-400 leading-relaxed mt-0.5">
                                  {perm.description}
                                </div>
                                <div className="text-[9px] font-mono text-zinc-400 mt-1">
                                  {perm.key}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
              <div className="text-xs text-zinc-400">
                Changes will take effect on the employee's subsequent requests immediately.
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={savingPermissions}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {savingPermissions ? 'Saving...' : 'Apply Permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: INVITE / CREATE STAFF MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                    Add or Invite Staff
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Create an employee account or issue a secure cryptographic onboarding link.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Generated Link Banner if completed */}
            {createdInviteLink ? (
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Staff Invitation Generated!</div>
                    <div className="text-[11px] text-emerald-400 mt-0.5">
                      Send this onboarding URL to your team member. The link expires in 7 days.
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdInviteLink}
                    className="bg-transparent text-xs text-amber-300 font-mono w-full focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteLink);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maria Silva"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                      className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="maria@restaurant.com"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Role
                    </label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as StaffRole })}
                      className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="STAFF">Staff</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                      {currentUserRole === 'OWNER' && <option value="OWNER">Owner</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Role Template
                    </label>
                    <select
                      value={inviteForm.jobTemplate}
                      onChange={(e) => {
                        const tmpl = e.target.value as RoleTemplate;
                        setInviteForm({ ...inviteForm, jobTemplate: tmpl });
                        if (catalog?.templates[tmpl]) {
                          setSelectedPermissions(catalog.templates[tmpl]);
                        }
                      }}
                      className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="WAITER">Waiter (Dining room, orders, cash)</option>
                      <option value="KITCHEN">Kitchen (KDS & preparation)</option>
                      <option value="CASHIER">Cashier (Settlement & receipts)</option>
                      <option value="HOST">Host (Tables & QR codes)</option>
                      <option value="SUPERVISOR">Supervisor (Floor operations & voids)</option>
                      <option value="ACCOUNTING">Accounting (Reports & fiscal)</option>
                      <option value="CUSTOM">Custom Configuration</option>
                    </select>
                  </div>
                </div>

                {/* Provisioning Mode Toggle */}
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Direct Password Provisioning</div>
                      <div className="text-[10px] text-zinc-400">
                        If disabled, generates a secure onboarding link for the user to set their password.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={inviteForm.isDirectPassword}
                      onChange={(e) => setInviteForm({ ...inviteForm, isDirectPassword: e.target.checked })}
                      className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                    />
                  </div>

                  {inviteForm.isDirectPassword && (
                    <div className="pt-2">
                      <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                        Temporary Password (min. 8 chars) *
                      </label>
                      <input
                        type="password"
                        required={inviteForm.isDirectPassword}
                        minLength={8}
                        placeholder="••••••••"
                        value={inviteForm.password}
                        onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                        className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}
                </div>

                {/* Summary of permissions */}
                <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">
                    Template grants <strong className="text-amber-400">{selectedPermissions.length}</strong> permissions
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Customizable in matrix after creation
                  </span>
                </div>

                {/* Submit button */}
                <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    {inviting ? 'Processing...' : inviteForm.isDirectPassword ? 'Create Staff Member' : 'Generate Invitation Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
