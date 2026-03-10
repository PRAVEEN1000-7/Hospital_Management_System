import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolverV4 } from '../utils/zodResolverV4';
import { z } from 'zod';
import { format, formatDistanceToNow } from 'date-fns';
import userService from '../services/userService';
import doctorService from '../services/doctorService';
import type { UserData, UserCreateData, UserUpdateData } from '../types/user';
import { ROLE_TEXT_COLORS, ROLE_LABELS, COUNTRIES } from '../utils/constants';
import { useToast } from '../contexts/ToastContext';
import feLogger from '../services/loggerService';

// ────────────────────────────────────────
// Schemas
// ────────────────────────────────────────
const staffCreateSchema = z.object({
  first_name: z.string()
    .min(1, 'First name is required')
    .max(100, 'Max 100 characters')
    .regex(/^[A-Za-z ]+$/, 'First name can only contain letters — no numbers or special characters'),
  last_name: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Max 100 characters')
    .regex(/^[A-Za-z ]+$/, 'Last name can only contain letters — no numbers or special characters'),
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address (e.g. user@hospital.com)'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Max 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores (no spaces)'),
  phone_number: z.string()
    .optional()
    .refine(val => !val || /^\d{10}$/.test(val), { message: 'Phone must be exactly 10 digits — no letters or special characters' }),
  country_code: z.string().optional(),
  role: z.string().min(1, 'Please select a role'),
  password: z.string().optional(),
  confirm_password: z.string().optional(),
  auto_generate_password: z.boolean().optional(),
  specialization: z.string().optional(),
  qualification: z.string().optional(),
  registration_number: z.string().optional(),
}).superRefine((data, ctx) => {
  // Password validation — only when not auto-generating
  if (!data.auto_generate_password) {
    if (!data.password || data.password.length < 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Password must be at least 8 characters', path: ['password'] });
    } else {
      if (!/[A-Z]/.test(data.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must include an uppercase letter (A-Z)', path: ['password'] });
      if (!/[a-z]/.test(data.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must include a lowercase letter (a-z)', path: ['password'] });
      if (!/[0-9]/.test(data.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must include a number (0-9)', path: ['password'] });
      if (!/[^A-Za-z0-9]/.test(data.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must include a special character (!@#$...)', path: ['password'] });
    }
    if (data.password && data.password !== data.confirm_password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Passwords don't match", path: ['confirm_password'] });
    }
  }
  // Doctor-specific field validation
  if (data.role === 'doctor') {
    if (!data.specialization) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Specialization is required for doctors', path: ['specialization'] });
    if (!data.qualification) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Qualification is required for doctors', path: ['qualification'] });
    if (!data.registration_number) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Registration number is required for doctors', path: ['registration_number'] });
  }
});

const staffEditSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  first_name: z.string().min(1, 'Required').max(100).regex(/^[A-Za-z ]+$/, 'Only letters allowed'),
  last_name: z.string().min(1, 'Required').max(100).regex(/^[A-Za-z ]+$/, 'Only letters allowed'),
  phone_number: z.string().optional().refine(val => !val || /^\d{10}$/.test(val), { message: 'Phone must be exactly 10 digits' }),
  country_code: z.string().optional(),
  role: z.string().min(1, 'Required'),
  is_active: z.boolean(),
  specialization: z.string().optional(),
  qualification: z.string().optional(),
  registration_number: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role === 'doctor') {
    if (!data.specialization) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Specialization is required for doctors', path: ['specialization'] });
    if (!data.qualification) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Qualification is required for doctors', path: ['qualification'] });
    if (!data.registration_number) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Registration number is required for doctors', path: ['registration_number'] });
  }
});

const resetPasswordSchema = z.object({
  new_password: z.string().min(8, 'Min 8 characters')
    .regex(/[A-Z]/, 'Need uppercase letter')
    .regex(/[a-z]/, 'Need lowercase letter')
    .regex(/[0-9]/, 'Need digit')
    .regex(/[^A-Za-z0-9]/, 'Need special char'),
  confirm_password: z.string(),
}).refine(data => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

type CreateFormData = z.infer<typeof staffCreateSchema>;
type EditFormData = z.infer<typeof staffEditSchema>;
type ResetFormData = z.infer<typeof resetPasswordSchema>;

const ROLES = [
  'super_admin', 'admin', 'doctor', 'nurse', 'receptionist',
  'pharmacist', 'cashier', 'inventory_manager', 'staff',
];

/** Returns CSS class for error state on input/select */
const inputErr = (err: any) => err ? 'input-field-error' : '';

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
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
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

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getUsers(page, 10, search);
      let filtered = res.data;

      if (roleFilter) filtered = filtered.filter(u => u.roles?.[0] === roleFilter);
      if (departmentFilter) {
        filtered = filtered.filter(u => {
          const dept = getDepartment(u.roles?.[0] || '', u.specialization);
          return dept.toLowerCase().includes(departmentFilter.toLowerCase());
        });
      }
      if (statusFilter) {
        const isActive = statusFilter === 'active';
        filtered = filtered.filter(u => u.is_active === isActive);
      }

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
    if (action === 'delete' && !window.confirm(`Delete ${selectedUsers.size} user(s)? This cannot be undone.`)) return;
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
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-all shadow-sm">
            <span className="material-icons text-base">add</span> Add Staff
          </button>
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
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700">
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
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
                          {user.avatar_url ? <img src={userService.getPhotoUrl(user.avatar_url) || ''} alt={`${user.first_name} ${user.last_name}`} className="w-full h-full object-cover" /> : getInitials(`${user.first_name} ${user.last_name}`)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{`${user.first_name} ${user.last_name}`}</p>
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
                        <button onClick={() => setEditUser(user)} className="p-1.5 hover:bg-slate-100 rounded transition-colors" title="Edit">
                          <span className="material-icons text-base text-slate-600">edit</span>
                        </button>
                        <button onClick={() => setDeleteConfirm(user)} className="p-1.5 hover:bg-red-50 rounded transition-colors" title="Delete">
                          <span className="material-icons text-base text-red-500">delete</span>
                        </button>
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
              {viewUser.avatar_url ? <img src={userService.getPhotoUrl(viewUser.avatar_url) || ''} alt={`${viewUser.first_name} ${viewUser.last_name}`} className="w-full h-full object-cover" /> : getInitials(`${viewUser.first_name} ${viewUser.last_name}`)}
            </div>
            <h3 className="text-lg font-bold text-slate-900">{`${viewUser.first_name} ${viewUser.last_name}`}</h3>
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
              <SectionTitle>Activity</SectionTitle>
              <ProfileField icon="login" label="Last Login" value={viewUser.last_login_at ? format(new Date(viewUser.last_login_at), 'dd MMM yyyy, HH:mm') : 'Never'} />
              <ProfileField icon="calendar_today" label="Joined" value={format(new Date(viewUser.created_at), 'dd MMM yyyy')} />
              <ProfileField icon="update" label="Updated" value={format(new Date(viewUser.updated_at), 'dd MMM yyyy')} />
            </section>
          </div>
          <div className="flex gap-3 mt-6 pt-4 border-t border-slate-200">
            <button onClick={() => { setViewUser(null); setEditUser(viewUser); }} className="flex-1 px-4 py-2.5 text-sm font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span className="material-icons text-sm">edit</span> Edit Profile
            </button>
            <button onClick={() => { setViewUser(null); setResetUser(viewUser); }} className="flex-1 px-4 py-2.5 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span className="material-icons text-sm">key</span> Reset Password
            </button>
          </div>
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
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); toast.success('Staff member added successfully'); fetchUsers(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {/* Edit Staff Modal */}
      {editUser && (
        <EditStaffModal
          user={editUser}
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
const Drawer: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
    <aside className="bg-white w-full max-w-[500px] h-full shadow-2xl flex flex-col transform transition-transform duration-300" onClick={e => e.stopPropagation()}>
      <header className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
          <span className="material-icons">close</span>
        </button>
      </header>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">{children}</div>
    </aside>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
    <h3 className="text-sm font-bold text-primary uppercase tracking-wider">{children}</h3>
  </div>
);

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

/** Simple field wrapper — red borders are applied DIRECTLY on each input, not via cloneElement */
const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
  <div className="space-y-1.5">
    <label className={`text-sm font-medium ${error ? 'text-red-600' : 'text-slate-700'}`}>{label}</label>
    {children}
    {error && (
      <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
        <span className="material-icons text-xs">error</span>
        {error}
      </p>
    )}
  </div>
);

// ────────────────────────────────────────
// Create Staff Modal
// ────────────────────────────────────────
const CreateStaffModal: React.FC<{ onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ onClose, onSuccess, onError }) => {
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);

  const { register, handleSubmit, watch, setValue, trigger, formState: { errors, isValid, isSubmitting } } = useForm<CreateFormData>({
    resolver: zodResolverV4(staffCreateSchema),
    mode: 'all',
    defaultValues: { first_name: '', last_name: '', email: '', username: '', phone_number: '', country_code: '+91', role: '', password: '', confirm_password: '', auto_generate_password: false, specialization: '', qualification: '', registration_number: '' },
  });

  const email = watch('email', '');
  const password = watch('password', '');
  const firstName = watch('first_name', '');
  const lastName = watch('last_name', '');
  const autoGenPassword = watch('auto_generate_password', false);
  const selectedRole = watch('role', '');
  const username = watch('username', '');

  // Re-trigger validation when auto_generate_password changes (password field becomes optional/required)
  useEffect(() => {
    trigger(['password', 'confirm_password']);
  }, [autoGenPassword, trigger]);

  // Re-trigger doctor fields validation when role changes
  useEffect(() => {
    if (selectedRole === 'doctor') {
      trigger(['specialization', 'qualification', 'registration_number']);
    }
  }, [selectedRole, trigger]);

  // Fetch specializations from DB when role is doctor
  useEffect(() => {
    if (selectedRole === 'doctor') {
      doctorService.getSpecializations().then(setSpecializations).catch(() => {
        setSpecializations([
          'Cardiology', 'Dermatology', 'ENT', 'General Medicine',
          'General Surgery', 'Gynecology', 'Neurology', 'Ophthalmology',
          'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
          'Radiology', 'Urology',
        ]);
      });
    }
  }, [selectedRole]);

  // Auto-generate username from email
  useEffect(() => {
    if (email && email.includes('@')) {
      const suggested = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      setValue('username', suggested, { shouldValidate: true });
    }
  }, [email, setValue]);

  // Debounced username uniqueness check against backend
  useEffect(() => {
    if (!username || username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameError('');
      return;
    }
    setUsernameChecking(true);
    const timeout = setTimeout(async () => {
      try {
        const { exists } = await userService.checkUsername(username);
        setUsernameError(exists ? 'This username is already taken' : '');
      } catch {
        // Silently fail — backend will validate on submit
      } finally {
        setUsernameChecking(false);
      }
    }, 500);
    return () => { clearTimeout(timeout); setUsernameChecking(false); };
  }, [username]);

  const fullName = `${firstName} ${lastName}`.trim();

  const strengthChecks = [
    { label: '8+ characters', pass: (password || '').length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password || '') },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password || '') },
    { label: 'Contains digit', pass: /[0-9]/.test(password || '') },
    { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password || '') },
  ];
  const passedCount = strengthChecks.filter(c => c.pass).length;

  // Determine if the form is ready to submit
  const hasErrors = Object.keys(errors).length > 0;
  const isFormReady = isValid && !hasErrors && !usernameError && !usernameChecking;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPhotoError('');
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) { setPhotoError('Please upload a JPG, PNG, or GIF image'); return; }
    if (file.size > 2 * 1024 * 1024) { setPhotoError('Image size must be less than 2MB'); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const getInitials = (name: string) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '';
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const generatePassword = () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pw = '';
    pw += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    pw += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    pw += '0123456789'[Math.floor(Math.random() * 10)];
    pw += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    for (let i = pw.length; i < 16; i++) pw += charset[Math.floor(Math.random() * charset.length)];
    return pw.split('').sort(() => 0.5 - Math.random()).join('');
  };

  const onSubmit = async (data: CreateFormData) => {
    if (usernameError) return;
    setIsSaving(true);
    setSubmitError('');
    try {
      let finalPassword = data.password || '';
      if (data.auto_generate_password) finalPassword = generatePassword();

      const payload: UserCreateData = {
        username: data.username,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
        password: finalPassword,
        phone_number: data.phone_number,
      };
      if (data.role === 'doctor') {
        payload.specialization = data.specialization;
        payload.qualification = data.qualification;
        payload.registration_number = data.registration_number;
      }

      const createdUser = await userService.createUser(payload, false);
      feLogger.info('staff_create', `Staff member created: ${data.username} (role=${data.role})`);

      if (photoFile && createdUser.id) {
        try { await userService.uploadPhoto(createdUser.id, photoFile); }
        catch { toast.error('User created but photo upload failed'); }
      }

      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let message: string;
      if (Array.isArray(detail)) message = detail.map((d: any) => d.msg || d).join(', ');
      else if (typeof detail === 'string') message = detail;
      else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) message = 'Server is not responding. Please check if the backend is running.';
      else if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) message = 'Cannot connect to server. Please check if the backend is running.';
      else message = 'Failed to create staff member';
      setSubmitError(message);
      onError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Drawer title="Add New Staff Member" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-6">Fill in the details to create a hospital staff profile.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

        {/* Server error banner */}
        {submitError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <span className="material-icons text-red-500 text-lg mt-0.5">cloud_off</span>
            <div>
              <p className="text-sm font-semibold text-red-700">Server Error</p>
              <p className="text-xs text-red-600 mt-0.5">{submitError}</p>
            </div>
          </div>
        )}

        {/* Profile Photo */}
        <section className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
            {photoPreview ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-slate-400">{getInitials(fullName)}</span>}
          </div>
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold text-slate-700 mb-1">Profile Photo</p>
            <p className="text-xs text-slate-500 mb-2">JPG, PNG or GIF. Max size 2MB.</p>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif" onChange={handlePhotoChange} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">CHANGE PHOTO</button>
            {photoError && <p className="text-xs text-red-500 mt-2">{photoError}</p>}
          </div>
        </section>

        {/* ── Personal Information ── */}
        <section className="space-y-4">
          <SectionTitle>Personal Information</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name *" error={errors.first_name?.message}>
              <input {...register('first_name')} className={`input-field ${inputErr(errors.first_name)}`} placeholder="e.g. Sarah" autoFocus />
            </Field>
            <Field label="Last Name *" error={errors.last_name?.message}>
              <input {...register('last_name')} className={`input-field ${inputErr(errors.last_name)}`} placeholder="e.g. Jenkins" />
            </Field>
          </div>
          <Field label="Email Address *" error={errors.email?.message}>
            <input {...register('email')} type="email" className={`input-field ${inputErr(errors.email)}`} placeholder="sarah.j@hospital.com" />
          </Field>
          <Field label="Username (for login) *" error={errors.username?.message || usernameError}>
            <input {...register('username')} className={`input-field ${inputErr(errors.username || usernameError)}`} placeholder="Auto-filled from email" />
            {usernameChecking && <p className="text-xs text-blue-500 mt-1 flex items-center gap-1"><span className="material-icons text-xs animate-spin">sync</span>Checking availability...</p>}
            {!usernameChecking && !errors.username && !usernameError && username.length >= 3 && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><span className="material-icons text-xs">check_circle</span>Username available</p>}
          </Field>
          <Field label="Phone Number" error={errors.phone_number?.message}>
            <div className="flex gap-2">
              <select {...register('country_code')} className="input-field w-28">
                {COUNTRIES.map(c => <option key={c.code} value={c.phoneCode}>{c.phoneCode}</option>)}
              </select>
              <input {...register('phone_number')} className={`input-field flex-1 ${inputErr(errors.phone_number)}`} placeholder="1234567890" />
            </div>
          </Field>
        </section>

        {/* ── Professional Info ── */}
        <section className="space-y-4">
          <SectionTitle>Professional Info</SectionTitle>
          <Field label="System Role (Job Function) *" error={errors.role?.message}>
            <select {...register('role')} className={`input-field ${inputErr(errors.role)}`}>
              <option value="">Select role</option>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
          </Field>
          {selectedRole === 'doctor' && (
            <div className="space-y-4 mt-2 p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-icons text-sm">medical_services</span> Doctor Details
              </p>
              <Field label="Specialization *" error={(errors as any).specialization?.message}>
                <select {...register('specialization')} className={`input-field ${inputErr((errors as any).specialization)}`}>
                  <option value="">Select specialization</option>
                  {specializations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Qualification *" error={(errors as any).qualification?.message}>
                <input {...register('qualification')} className={`input-field ${inputErr((errors as any).qualification)}`} placeholder="e.g. MBBS, MD" />
              </Field>
              <Field label="Registration Number *" error={(errors as any).registration_number?.message}>
                <input {...register('registration_number')} className={`input-field ${inputErr((errors as any).registration_number)}`} placeholder="Medical council reg. number" />
              </Field>
            </div>
          )}
        </section>

        {/* ── Security & Password ── */}
        <section className="space-y-4">
          <SectionTitle>Security &amp; Status</SectionTitle>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-700">Set Password</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-slate-600">Auto-generate</span>
              <div className="relative inline-flex items-center">
                <input {...register('auto_generate_password')} type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-300 peer-checked:bg-primary rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-5 after:h-5 after:shadow-sm after:transition-all peer-checked:after:translate-x-5"></div>
              </div>
            </label>
          </div>
          {!autoGenPassword && (
            <>
              <Field label="Password *" error={errors.password?.message}>
                <div className="relative">
                  <input {...register('password')} type={showPassword ? 'text' : 'password'} className={`input-field pr-10 ${inputErr(errors.password)}`} placeholder="••••••••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <span className="material-icons text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {(password || '').length > 0 && (
                  <div className="mt-2">
                    <div className="password-strength-meter flex gap-1">
                      {[0, 1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-full flex-1 rounded-full ${i < passedCount ? passedCount <= 2 ? 'bg-red-400' : passedCount <= 3 ? 'bg-amber-400' : 'bg-primary' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <p className={`text-[11px] font-semibold mt-1 ${passedCount <= 2 ? 'text-red-500' : passedCount <= 3 ? 'text-amber-500' : 'text-primary'}`}>
                      {passedCount <= 2 ? 'Weak' : passedCount <= 3 ? 'Fair' : passedCount === 4 ? 'Good' : 'Strong'} password
                    </p>
                  </div>
                )}
              </Field>
              <Field label="Confirm Password *" error={errors.confirm_password?.message}>
                <input {...register('confirm_password')} type="password" className={`input-field ${inputErr(errors.confirm_password)}`} placeholder="Re-enter password" />
              </Field>
            </>
          )}
        </section>

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">Cancel</button>
          <button
            type="submit"
            disabled={!isFormReady || isSaving || isSubmitting}
            className="flex-[2] px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            <span className="material-icons text-sm">{isSaving ? 'hourglass_empty' : 'save'}</span>
            {isSaving ? 'Saving...' : 'Save Staff Member'}
          </button>
        </div>

        {/* Inline guide — shows when form has errors and user might be confused */}
        {hasErrors && !isSaving && (
          <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1">
            <span className="material-icons text-xs">info</span>
            Please fix the highlighted errors above to enable the save button
          </p>
        )}
      </form>
    </Drawer>
  );
};

// ────────────────────────────────────────
// Edit Staff Modal
// ────────────────────────────────────────
const EditStaffModal: React.FC<{ user: UserData; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ user, onClose, onSuccess, onError }) => {
  const toast = useToast();
  const [photoPreview, setPhotoPreview] = useState<string>(user.avatar_url ? userService.getPhotoUrl(user.avatar_url) || '' : '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [specializations, setSpecializations] = useState<string[]>([]);

  useEffect(() => {
    doctorService.getSpecializations().then(setSpecializations).catch(() => {});
  }, []);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting, isValid } } = useForm<EditFormData>({
    resolver: zodResolverV4(staffEditSchema),
    mode: 'all',
    defaultValues: {
      email: user.email,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone_number: user.phone_number || user.phone || '',
      country_code: '+91',
      role: user.roles?.[0] || '',
      is_active: user.is_active,
      specialization: user.specialization || '',
      qualification: user.qualification || '',
      registration_number: user.registration_number || '',
    },
  });

  const firstName = watch('first_name', user.first_name || '');
  const lastName = watch('last_name', user.last_name || '');
  const fullName = `${firstName} ${lastName}`.trim();
  const selectedRole = watch('role');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPhotoError('');
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) { setPhotoError('Please upload a JPG, PNG, or GIF image'); return; }
    if (file.size > 2 * 1024 * 1024) { setPhotoError('Image size must be less than 2MB'); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const getInitials = (name: string) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '';
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const onSubmit = async (data: EditFormData) => {
    try {
      const payload: UserUpdateData = {
        email: data.email, first_name: data.first_name, last_name: data.last_name,
        phone_number: data.phone_number, role: data.role, is_active: data.is_active,
      };
      // Include doctor-specific fields when role is doctor
      if (data.role === 'doctor') {
        payload.specialization = data.specialization;
        payload.qualification = data.qualification;
        payload.registration_number = data.registration_number;
      }
      feLogger.info('staff_edit', `Updating staff member: ${user.username}`);
      await userService.updateUser(user.id, payload);
      if (photoFile) {
        try { await userService.uploadPhoto(user.id, photoFile); }
        catch { toast.warning('Staff updated, but photo upload failed.'); onSuccess(); return; }
      }
      feLogger.info('staff_edit', `Staff member updated: ${user.username}`);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const message = Array.isArray(detail) ? detail.map((d: any) => d.msg || d).join(', ') : (typeof detail === 'string' ? detail : 'Failed to update staff member');
      feLogger.error('staff_edit', `Failed to update ${user.username}: ${message}`);
      onError(message);
    }
  };

  return (
    <Drawer title="Edit Staff Member" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Profile Photo */}
        <section className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
            {photoPreview ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-slate-400">{getInitials(fullName)}</span>}
          </div>
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold text-slate-700 mb-1">Profile Photo</p>
            <p className="text-xs text-slate-500 mb-2">JPG, PNG or GIF. Max size 2MB.</p>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif" onChange={handlePhotoChange} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">CHANGE PHOTO</button>
            {photoError && <p className="text-xs text-red-500 mt-2">{photoError}</p>}
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Personal Information</SectionTitle>
          <Field label="Username">
            <input value={user.username} disabled className="input-field bg-slate-100 cursor-not-allowed" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" error={errors.first_name?.message}>
              <input {...register('first_name')} className={`input-field ${inputErr(errors.first_name)}`} placeholder="e.g. Sarah" />
            </Field>
            <Field label="Last Name" error={errors.last_name?.message}>
              <input {...register('last_name')} className={`input-field ${inputErr(errors.last_name)}`} placeholder="e.g. Jenkins" />
            </Field>
          </div>
          <Field label="Email" error={errors.email?.message}>
            <input {...register('email')} type="email" className={`input-field ${inputErr(errors.email)}`} />
          </Field>
          <Field label="Phone Number" error={errors.phone_number?.message}>
            <div className="flex gap-2">
              <select {...register('country_code')} className="input-field w-28">
                {COUNTRIES.map(c => <option key={c.code} value={c.phoneCode}>{c.phoneCode}</option>)}
              </select>
              <input {...register('phone_number')} className={`input-field flex-1 ${inputErr(errors.phone_number)}`} placeholder="1234567890" />
            </div>
          </Field>
        </section>

        <section className="space-y-4">
          <SectionTitle>Professional Info</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="System Role (Job Function)" error={errors.role?.message}>
              <select {...register('role')} className={`input-field ${inputErr(errors.role)}`}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Reference #">
              <input value={user.reference_number || 'Not assigned'} disabled className="input-field bg-slate-100 cursor-not-allowed" />
              <p className="text-xs text-slate-500 mt-1">Auto-generated, cannot be changed</p>
            </Field>
          </div>
        </section>

        {/* Doctor-Specific Fields */}
        {selectedRole === 'doctor' && (
          <section className="space-y-4">
            <SectionTitle>Doctor Details</SectionTitle>
            <Field label="Specialization" error={errors.specialization?.message}>
              <select {...register('specialization')} className={`input-field ${inputErr(errors.specialization)}`}>
                <option value="">Select specialization</option>
                {specializations.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Qualification" error={errors.qualification?.message}>
                <input {...register('qualification')} className={`input-field ${inputErr(errors.qualification)}`} placeholder="e.g. MBBS, MD" />
              </Field>
              <Field label="Registration Number" error={errors.registration_number?.message}>
                <input {...register('registration_number')} className={`input-field ${inputErr(errors.registration_number)}`} placeholder="e.g. MCI-12345" />
              </Field>
            </div>
          </section>
        )}

        {/* Status Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <p className="text-sm font-semibold text-slate-800">Active Status</p>
            <p className="text-xs text-slate-500">Staff will be able to log in when active.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input {...register('is_active')} type="checkbox" className="sr-only peer" />
            <div className="w-12 h-6 bg-slate-300 peer-checked:bg-primary rounded-full transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:w-4 after:h-4 after:shadow-sm after:transition-all peer-checked:after:translate-x-6"></div>
          </label>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">Cancel</button>
          <button type="submit" disabled={isSubmitting || !isValid} className="flex-[2] px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]">
            <span className="material-icons text-sm">save</span>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};

// ────────────────────────────────────────
// Reset Password Modal
// ────────────────────────────────────────
const ResetPasswordModal: React.FC<{ user: UserData; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ user, onClose, onSuccess, onError }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting, isValid } } = useForm<ResetFormData>({
    resolver: zodResolverV4(resetPasswordSchema),
    mode: 'all',
  });

  const onSubmit = async (data: ResetFormData) => {
    try {
      feLogger.info('password_reset', `Resetting password for user: ${user.username}`);
      await userService.resetPassword(user.id, { new_password: data.new_password });
      feLogger.info('password_reset', `Password reset successful for user: ${user.username}`);
      onSuccess();
    } catch (err: any) {
      feLogger.error('password_reset', `Password reset failed for ${user.username}: ${err?.response?.data?.detail || 'unknown error'}`);
      onError(err?.response?.data?.detail || 'Failed to reset password');
    }
  };

  return (
    <Drawer title={`Reset Password — ${user.first_name} ${user.last_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <section className="space-y-4">
          <SectionTitle>Security</SectionTitle>
          <Field label="New Password" error={errors.new_password?.message}>
            <input {...register('new_password')} type="password" className={`input-field ${inputErr(errors.new_password)}`} placeholder="Enter new password" />
          </Field>
          <Field label="Confirm Password" error={errors.confirm_password?.message}>
            <input {...register('confirm_password')} type="password" className={`input-field ${inputErr(errors.confirm_password)}`} placeholder="Re-enter password" />
          </Field>
        </section>
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">Cancel</button>
          <button type="submit" disabled={isSubmitting || !isValid} className="flex-[2] px-4 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]">
            <span className="material-icons text-sm">key</span>
            {isSubmitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};

export default StaffDirectory;
