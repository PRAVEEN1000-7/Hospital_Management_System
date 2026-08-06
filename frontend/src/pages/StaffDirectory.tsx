import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import userService from '../services/userService';
import { hospitalService } from '../services/hospitalService';
import type { UserData } from '../types/user';
import { ROLE_TEXT_COLORS, ROLE_LABELS } from '../utils/constants';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useAuth } from '../contexts/AuthContext';
import { canEdit as canEditModule } from '../config/modulePermissions';
import {
  useAssignableRoles, Drawer, SectionTitle,
  CreateStaffModal, EditStaffModal, ResetPasswordModal,
} from '../components/staff/StaffModals';

// Maps UI department label → backend role value for server-side filtering
const DEPT_TO_ROLE: Record<string, string> = {
  'Medical': 'doctor',
  'Nursing': 'nurse',
  'Pharmacy': 'pharmacist',
  'Front Desk': 'receptionist',
  'Finance': 'cashier',
  'Inventory': 'inventory_manager',
  'Administration': 'admin',
};

const getDepartment = (role: string, specialization?: string | null): string => {
  const deptMap: Record<string, string> = {
    doctor: 'Medical', nurse: 'Nursing', pharmacist: 'Pharmacy',
    receptionist: 'Front Desk', cashier: 'Finance',
    inventory_manager: 'Inventory', admin: 'Administration', super_admin: 'Administration',
  };
  const dept = deptMap[role] || 'General';
  return role === 'doctor' && specialization ? `${dept} – ${specialization}` : dept;
};

// ────────────────────────────────────────
// Main Component
// ────────────────────────────────────────
const StaffDirectory: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const { user: currentUser } = useAuth();
  // Nurse/receptionist/report_viewer newly reach this page as view-only per
  // the shared "general.staff_directory" matrix — hide every mutating action
  // for them (docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md).
  const canEdit = canEditModule('general.staff_directory', currentUser?.roles);
  // Staff Directory's own role FILTER list excludes super_admin (BUG-10) —
  // this page is for day-to-day staff management, not platform-admin
  // accounts. Scoped to this filter only: the Add/Edit Staff modal still
  // calls useAssignableRoles() independently and is unaffected, so super_admin
  // account creation (still gated to real super admins there) keeps working.
  const availableRoles = useAssignableRoles().filter(r => r !== 'super_admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [viewUser, setViewUser] = useState<UserData | null>(null);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [resetUser, setResetUser] = useState<UserData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserData | null>(null);
  // Leave Policy (System Settings) — when the hospital's on "same for every
  // employee," the individual field in these modals is greyed out instead
  // of quietly having no effect.
  const [paidLeaveUniform, setPaidLeaveUniform] = useState(false);

  useEffect(() => {
    hospitalService.getSettings()
      .then(s => setPaidLeaveUniform(!!s.paid_leave_uniform))
      .catch(() => {});
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Resolve server-side filters: explicit role takes priority; otherwise derive from department
      const effectiveRole = roleFilter || DEPT_TO_ROLE[departmentFilter] || undefined;
      const isActive = statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined;

      const res = await userService.getUsers(page, 10, search, effectiveRole, isActive);
      let filtered = res.data;

      if (sortBy !== 'default') {
        filtered.sort((a, b) => {
          let aVal: any = a[sortBy as keyof UserData];
          let bVal: any = b[sortBy as keyof UserData];
          if (aVal === null || aVal === undefined) return sortOrder === 'asc' ? 1 : -1;
          if (bVal === null || bVal === undefined) return sortOrder === 'asc' ? -1 : 1;
          if (sortBy === 'created_at' || sortBy === 'updated_at' || sortBy === 'last_login_at') {
            aVal = new Date(aVal).getTime(); bVal = new Date(bVal).getTime();
          } else if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase();
          } else if (typeof aVal === 'boolean') {
            aVal = aVal ? 1 : 0; bVal = bVal ? 1 : 0;
          }
          if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        });
      }

      setUsers(filtered);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, departmentFilter, statusFilter, sortBy, sortOrder, toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500) as unknown as number;
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchInput]);

  // Sync search state from URL when the global header search navigates here
  // (e.g. "/staff?search=foo"). Deliberately depends only on `searchParams` —
  // including `searchInput` here made this effect re-fire on every keystroke,
  // and since the URL hadn't caught up yet it would immediately revert the
  // just-typed character back to the last committed value, making the search
  // box appear to reject all input.
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    setSearchInput(urlSearch);
    setSearch(urlSearch);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep URL query in sync with page-level search box.
  useEffect(() => {
    if (search) {
      setSearchParams({ search }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [search, setSearchParams]);

  // Close bulk menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) setShowBulkMenu(false);
    };
    if (showBulkMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBulkMenu]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await userService.deleteUser(deleteConfirm.id);
      toast.success('Staff member removed successfully');
      setDeleteConfirm(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to remove staff member');
    }
  };

  const handleBulkAction = async (action: 'activate' | 'deactivate' | 'delete') => {
    if (selectedUsers.size === 0) { toast.error('No users selected'); return; }
    if (action === 'delete') {
      const ok = await confirm({
        title: 'Delete Staff Members',
        message: `Permanently delete ${selectedUsers.size} selected user${selectedUsers.size > 1 ? 's' : ''}? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    try {
      const promises = Array.from(selectedUsers).map(userId => {
        if (action === 'delete') return userService.deleteUser(userId);
        const user = users.find(u => u.id === userId);
        if (user) return userService.updateUser(userId, { is_active: action === 'activate' });
        return Promise.resolve();
      });
      await Promise.all(promises);
      const labels = { activate: 'activated', deactivate: 'deactivated', delete: 'deleted' };
      toast.success(`${selectedUsers.size} user(s) ${labels[action]} successfully`);
      setSelectedUsers(new Set());
      fetchUsers();
    } catch {
      toast.error(`Failed to ${action} some users`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const textColor = ROLE_TEXT_COLORS[role] || 'text-slate-700';
    const label = ROLE_LABELS[role] || role;
    return <span className={`text-sm font-medium ${textColor}`}>{label}</span>;
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getTimeAgo = (lastLogin: string | null) => {
    if (!lastLogin) return 'Never';
    try { return formatDistanceToNow(new Date(lastLogin), { addSuffix: false }); }
    catch { return 'Unknown'; }
  };

  const toggleSelectAll = () => {
    setSelectedUsers(selectedUsers.size === users.length ? new Set() : new Set(users.map(u => u.id)));
  };
  const toggleSelect = (id: string) => {
    const s = new Set(selectedUsers);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedUsers(s);
  };

  const handleExportCSV = () => {
    const headers = ['Reference #', 'First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Status', 'Last Login'];
    const rows = users.map(u => [
      u.reference_number || 'N/A', u.first_name || '', u.last_name || '', u.email,
      u.phone_number || u.phone || 'N/A', ROLE_LABELS[u.roles?.[0] || ''] || u.roles?.[0] || '',
      u.is_active ? 'Active' : 'Inactive',
      u.last_login_at ? format(new Date(u.last_login_at), 'dd/MM/yyyy HH:mm') : 'Never',
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff_directory_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const limitFrom = (page - 1) * 10 + 1;
  const limitTo = Math.min(page * 10, total);

  return (
    <div>
      {/* Header */}
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Staff Management</h1>
          <p className="text-sm text-slate-500">Manage hospital personnel, roles, and access permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExportCSV} disabled={users.length === 0} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
            <span className="material-icons text-base">download</span> Export CSV
          </button>
          {canEdit && (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-all shadow-sm">
              <span className="material-icons text-base">add</span> Add Staff
            </button>
          )}
        </div>
      </header>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Search & Filters */}
        <div className="p-5 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" placeholder="Search by name, ID, or email..." />
              {searchInput && (
                <button onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <span className="material-icons text-lg">close</span>
                </button>
              )}
            </div>
            <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700">
              <option value="default">Default Order</option>
              <option value="last_login_at">Last Login</option>
              <option value="updated_at">Last Updated</option>
              <option value="created_at">Registration Date</option>
            </select>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'asc' | 'desc')} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700" disabled={sortBy === 'default'}>
              <option value="asc">↑ Ascending</option>
              <option value="desc">↓ Descending</option>
            </select>
            {canEdit && (
            <div className="relative" ref={bulkMenuRef}>
              <button onClick={() => setShowBulkMenu(!showBulkMenu)} disabled={selectedUsers.size === 0 || bulkActionLoading} className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selectedUsers.size > 0 ? 'bg-primary text-white hover:bg-primary/90 border-primary shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'}`}>
                <span className="material-icons text-base">more_horiz</span> Bulk Actions {selectedUsers.size > 0 && `(${selectedUsers.size})`}
              </button>
              {showBulkMenu && selectedUsers.size > 0 && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-slate-200 shadow-lg z-20">
                  <button onClick={() => handleBulkAction('activate')} disabled={bulkActionLoading} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 rounded-t-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                    <span className="material-icons text-sm text-green-600">check_circle</span> Activate Selected
                  </button>
                  <button onClick={() => handleBulkAction('deactivate')} disabled={bulkActionLoading} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50">
                    <span className="material-icons text-sm text-amber-600">block</span> Deactivate Selected
                  </button>
                  <button onClick={() => handleBulkAction('delete')} disabled={bulkActionLoading} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-b-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                    <span className="material-icons text-sm">delete</span> Delete Selected
                  </button>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700">
              <option value="">All Roles</option>
              {availableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
            <select value={departmentFilter} onChange={e => { setDepartmentFilter(e.target.value); setPage(1); }} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700">
              <option value="">All Departments</option>
              <option value="Medical">Medical</option>
              <option value="Nursing">Nursing</option>
              <option value="Pharmacy">Pharmacy</option>
              <option value="Administration">Administration</option>
              <option value="Front Desk">Front Desk</option>
              <option value="Finance">Finance</option>
              <option value="Inventory">Inventory</option>
              <option value="General">General</option>
            </select>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700">
              <option value="">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Active Filters Display */}
          {(roleFilter || departmentFilter || statusFilter) && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500">Active Filters:</span>
              {roleFilter && <button onClick={() => setRoleFilter('')} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200">Role: {ROLE_LABELS[roleFilter] || roleFilter}<span className="material-icons text-sm">close</span></button>}
              {departmentFilter && <button onClick={() => setDepartmentFilter('')} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200">Dept: {departmentFilter}<span className="material-icons text-sm">close</span></button>}
              {statusFilter && <button onClick={() => setStatusFilter('')} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200">Status: {statusFilter}<span className="material-icons text-sm">close</span></button>}
              <button onClick={() => { setRoleFilter(''); setDepartmentFilter(''); setStatusFilter(''); }} className="text-xs text-slate-500 hover:text-slate-700 font-medium underline">Clear All Filters</button>
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-icons text-5xl text-slate-300 mb-3">group_off</span>
            <p className="text-lg font-medium text-slate-500">No staff members found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-12 px-3 py-3.5 sticky left-0 bg-slate-50 z-10">
                    <input type="checkbox" checked={selectedUsers.size === users.length && users.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/30" />
                  </th>
                  <th className="px-3 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Employee ID</th>
                  <th className="px-3 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Staff Name</th>
                  <th className="px-3 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Role</th>
                  <th className="px-3 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Department</th>
                  <th className="px-3 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Contact Info</th>
                  <th className="w-20 px-3 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap sticky right-0 bg-slate-50 z-10">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-3 py-4 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10">
                      <input type="checkbox" checked={selectedUsers.has(user.id)} onChange={() => toggleSelect(user.id)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/30" />
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold font-mono text-slate-700">{user.reference_number || 'N/A'}</span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setViewUser(user)}>
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                          {user.avatar_url ? (
                            <img
                              src={userService.getPhotoUrl(user.avatar_url) || ''}
                              alt={`${user.first_name} ${user.last_name}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) parent.textContent = getInitials(`${user.first_name} ${user.last_name}`);
                              }}
                            />
                          ) : (
                            getInitials(`${user.first_name} ${user.last_name}`)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{`${user.roles?.includes('doctor') ? 'Dr. ' : ''}${user.first_name} ${user.last_name}`}</p>
                          <p className="text-xs text-slate-500 truncate">Last login: {getTimeAgo(user.last_login_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">{getRoleBadge(user.roles?.[0] || '')}</td>
                    <td className="px-3 py-4 whitespace-nowrap"><span className="text-sm text-slate-700">{getDepartment(user.roles?.[0] || '', user.specialization)}</span></td>
                    <td className="px-3 py-4">
                      <div className="text-sm">
                        <p className="text-slate-900 truncate">{user.email}</p>
                        <p className="text-slate-500 truncate">{user.phone_number || user.phone || 'No phone'}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4 sticky right-0 bg-white group-hover:bg-slate-50/50 z-10">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                        <button onClick={() => setEditUser(user)} className="p-1.5 hover:bg-slate-100 rounded transition-colors" title="Edit">
                          <span className="material-icons text-base text-slate-600">edit</span>
                        </button>
                        )}
                        {canEdit && (
                        <button onClick={() => setDeleteConfirm(user)} className="p-1.5 hover:bg-red-50 rounded transition-colors" title="Delete">
                          <span className="material-icons text-base text-red-500">delete</span>
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

        {/* Pagination Footer */}
        {!loading && users.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Showing <span className="font-semibold">{limitFrom}</span> to <span className="font-semibold">{limitTo}</span> of <span className="font-semibold">{total}</span> staff members
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <span className="material-icons text-xl">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <button key={pageNum} onClick={() => setPage(pageNum)} className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${page === pageNum ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'}`}>
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && page < totalPages - 2 && (
                <>
                  <span className="text-slate-400">...</span>
                  <button onClick={() => setPage(totalPages)} className="w-9 h-9 rounded-lg text-sm font-semibold hover:bg-slate-100 text-slate-700 transition-colors">{totalPages}</button>
                </>
              )}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <span className="material-icons text-xl">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Staff Profile */}
      {viewUser && (
        <Drawer title="Staff Profile" onClose={() => setViewUser(null)}>
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold mb-3 overflow-hidden">
              {viewUser.avatar_url ? (
                <img
                  src={userService.getPhotoUrl(viewUser.avatar_url) || ''}
                  alt={`${viewUser.first_name} ${viewUser.last_name}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) parent.textContent = getInitials(`${viewUser.first_name} ${viewUser.last_name}`);
                  }}
                />
              ) : (
                getInitials(`${viewUser.first_name} ${viewUser.last_name}`)
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-900">{`${viewUser.roles?.includes('doctor') ? 'Dr. ' : ''}${viewUser.first_name} ${viewUser.last_name}`}</h3>
            <p className="text-sm text-slate-500 mb-2">@{viewUser.username}</p>
            <div className="flex items-center gap-2">
              {getRoleBadge(viewUser.roles?.[0] || '')}
              <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${viewUser.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {viewUser.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <section>
              <SectionTitle>Contact</SectionTitle>
              <ProfileField icon="email" label="Email" value={viewUser.email} />
              <ProfileField icon="phone" label="Phone" value={viewUser.phone_number || viewUser.phone || 'Not provided'} />
            </section>
            <section>
              <SectionTitle>Professional Info</SectionTitle>
              <ProfileField icon="badge" label="Reference #" value={viewUser.reference_number || 'Not assigned'} />
              <ProfileField icon="business" label="Department" value={getDepartment(viewUser.roles?.[0] || '', viewUser.specialization)} />
              <ProfileField icon="person" label="Username" value={viewUser.username} />
            </section>
            <section>
              <SectionTitle>Employment Details</SectionTitle>
              <ProfileField icon="work" label="Designation" value={viewUser.designation || 'Not set'} />
              <ProfileField icon="event" label="Date of Joining" value={viewUser.date_of_joining ? format(new Date(viewUser.date_of_joining), 'dd MMM yyyy') : 'Not set'} />
              <ProfileField icon="badge" label="Employment Type" value={viewUser.employment_type ? viewUser.employment_type.replace('_', ' ') : 'Not set'} />
            </section>
            <section>
              <SectionTitle>Activity</SectionTitle>
              <ProfileField icon="login" label="Last Login" value={viewUser.last_login_at ? format(new Date(viewUser.last_login_at), 'dd MMM yyyy, HH:mm') : 'Never'} />
              <ProfileField icon="calendar_today" label="Joined" value={format(new Date(viewUser.created_at), 'dd MMM yyyy')} />
              <ProfileField icon="update" label="Updated" value={format(new Date(viewUser.updated_at), 'dd MMM yyyy')} />
            </section>
          </div>
          {canEdit && (
          <div className="flex gap-3 mt-6 pt-4 border-t border-slate-200">
            <button onClick={() => { setViewUser(null); setEditUser(viewUser); }} className="flex-1 px-4 py-2.5 text-sm font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span className="material-icons text-sm">edit</span> Edit Profile
            </button>
            <button onClick={() => { setViewUser(null); setResetUser(viewUser); }} className="flex-1 px-4 py-2.5 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span className="material-icons text-sm">key</span> Reset Password
            </button>
          </div>
          )}
        </Drawer>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Drawer title="Remove Staff Member" onClose={() => setDeleteConfirm(null)}>
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons text-3xl">person_remove</span>
            </div>
            <p className="text-slate-600 mb-1">Are you sure you want to remove</p>
            <p className="font-bold text-slate-900 text-lg">{`${deleteConfirm.first_name} ${deleteConfirm.last_name}`}</p>
            <p className="text-sm text-slate-500">@{deleteConfirm.username}</p>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">Cancel</button>
            <button onClick={handleDelete} className="flex-1 px-4 py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors active:scale-95">Remove</button>
          </div>
        </Drawer>
      )}

      {/* Create Staff Modal */}
      {showCreate && (
        <CreateStaffModal
          paidLeaveUniform={paidLeaveUniform}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); toast.success('Staff member added successfully'); fetchUsers(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {/* Edit Staff Modal */}
      {editUser && (
        <EditStaffModal
          user={editUser}
          paidLeaveUniform={paidLeaveUniform}
          onClose={() => setEditUser(null)}
          onSuccess={() => { setEditUser(null); toast.success('Staff member updated successfully'); fetchUsers(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSuccess={() => { setResetUser(null); toast.success('Password reset successfully'); }}
          onError={(msg) => toast.error(msg)}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────
// Reusable UI Components
// ────────────────────────────────────────
const ProfileField: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
      <span className="material-icons text-sm">{icon}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-700 truncate">{value}</p>
    </div>
  </div>
);


export default StaffDirectory;
