import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, formatDistanceToNow } from 'date-fns';
import userService from '../services/userService';
import type { UserData, UserCreateData, UserUpdateData } from '../types/user';
import { ROLE_TEXT_COLORS, ROLE_LABELS, COUNTRIES } from '../utils/constants';
import { useToast } from '../contexts/ToastContext';

// ---------- Schemas ----------
const staffCreateSchema = z.object({
  username: z.string().min(3, 'Min 3 characters').max(50, 'Max 50 characters').regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores'),
  email: z.string().email('Invalid email'),
  first_name: z.string().min(1, 'Required').max(100),
  last_name: z.string().min(1, 'Required').max(100),
  phone_number: z.string().optional(),
  country_code: z.string().optional(),
  role: z.string().min(1, 'Select a role'),
  password: z.string().optional(),
  confirm_password: z.string().optional(),
  auto_generate_password: z.boolean().optional(),
}).refine(data => {
  // Only validate password if auto-generate is not enabled
  if (data.auto_generate_password) return true;
  
  // If not auto-generating, password is required and must meet criteria
  if (!data.password || data.password.length < 8) return false;
  if (!/[A-Z]/.test(data.password)) return false;
  if (!/[a-z]/.test(data.password)) return false;
  if (!/[0-9]/.test(data.password)) return false;
  if (!/[^A-Za-z0-9]/.test(data.password)) return false;
  
  return true;
}, {
  message: "Password must be at least 8 characters with uppercase, lowercase, digit, and special character",
  path: ['password'],
}).refine(data => {
  // Only validate password match if not auto-generating
  if (data.auto_generate_password) return true;
  return data.password === data.confirm_password;
}, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

const staffEditSchema = z.object({
  email: z.string().email('Invalid email'),
  first_name: z.string().min(1, 'Required').max(100),
  last_name: z.string().min(1, 'Required').max(100),
  phone_number: z.string().optional(),
  country_code: z.string().optional(),
  role: z.string().min(1, 'Required'),
  is_active: z.boolean(),
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

// Helper function to get default department based on role
const getDepartment = (role: string): string => {
  const deptMap: Record<string, string> = {
    doctor: 'Medical',
    nurse: 'Nursing',
    pharmacist: 'Pharmacy',
    receptionist: 'Front Desk',
    cashier: 'Finance',
    inventory_manager: 'Inventory',
    admin: 'Administration',
    super_admin: 'Administration',
  };
  return deptMap[role] || 'General';
};

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
      
      // Apply filters
      if (roleFilter) {
        filtered = filtered.filter(u => u.roles?.[0] === roleFilter);
      }
      if (departmentFilter) {
        filtered = filtered.filter(u => {
          const dept = getDepartment(u.roles?.[0] || '');
          return dept.toLowerCase() === departmentFilter.toLowerCase();
        });
      }
      if (statusFilter) {
        const isActive = statusFilter === 'active';
        filtered = filtered.filter(u => u.is_active === isActive);
      }
      
      // Client-side sorting
      if (sortBy !== 'default') {
        filtered.sort((a, b) => {
          let aVal: any = a[sortBy as keyof UserData];
          let bVal: any = b[sortBy as keyof UserData];
          
          // Handle null/undefined
          if (aVal === null || aVal === undefined) return sortOrder === 'asc' ? 1 : -1;
          if (bVal === null || bVal === undefined) return sortOrder === 'asc' ? -1 : 1;
          
          // Convert to comparable values
          if (sortBy === 'created_at' || sortBy === 'updated_at' || sortBy === 'last_login_at') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
          } else if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          } else if (typeof aVal === 'boolean') {
            aVal = aVal ? 1 : 0;
            bVal = bVal ? 1 : 0;
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

  // Dynamic search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 500);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput]);

  // Close bulk menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(event.target as Node)) {
        setShowBulkMenu(false);
      }
    };

    if (showBulkMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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

  const handleBulkActivate = async () => {
    if (selectedUsers.size === 0) {
      toast.error('No users selected');
      return;
    }
    
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    
    try {
      const promises = Array.from(selectedUsers).map(userId => {
        const user = users.find(u => u.id === userId);
        if (user) {
          return userService.updateUser(userId, { ...user, is_active: true });
        }
        return Promise.resolve();
      });
      
      await Promise.all(promises);
      toast.success(`${selectedUsers.size} user(s) activated successfully`);
      setSelectedUsers(new Set());
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to activate some users');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedUsers.size === 0) {
      toast.error('No users selected');
      return;
    }
    
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    
    try {
      const promises = Array.from(selectedUsers).map(userId => {
        const user = users.find(u => u.id === userId);
        if (user) {
          return userService.updateUser(userId, { ...user, is_active: false });
        }
        return Promise.resolve();
      });
      
      await Promise.all(promises);
      toast.success(`${selectedUsers.size} user(s) deactivated successfully`);
      setSelectedUsers(new Set());
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to deactivate some users');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) {
      toast.error('No users selected');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete ${selectedUsers.size} user(s)? This action cannot be undone.`)) {
      return;
    }
    
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    
    try {
      const promises = Array.from(selectedUsers).map(userId => {
        return userService.deleteUser(userId);
      });
      await Promise.all(promises);
      toast.success(`${selectedUsers.size} user(s) deleted successfully`);
      setSelectedUsers(new Set());
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to delete some users');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const textColor = ROLE_TEXT_COLORS[role] || 'text-slate-700';
    const label = ROLE_LABELS[role] || role;
    return <span className={`text-sm font-medium ${textColor}`}>{label}</span>;
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getTimeAgo = (lastLogin: string | null) => {
    if (!lastLogin) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastLogin), { addSuffix: false });
    } catch {
      return 'Unknown';
    }
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedUsers);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedUsers(newSet);
  };

  const handleExportCSV = () => {
    const headers = ['Reference #', 'First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Status', 'Last Login'];
    const rows = users.map(u => [
      u.reference_number || 'N/A',
      u.first_name || '',
      u.last_name || '',
      u.email,
      u.phone_number || 'N/A',
      ROLE_LABELS[u.roles?.[0] || ''] || u.roles?.[0] || '',
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
          <button
            onClick={handleExportCSV}
            disabled={users.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <span className="material-icons text-base">download</span> Export CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-all shadow-sm"
          >
            <span className="material-icons text-base">add</span> Add Staff
          </button>
        </div>
      </header>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Search & Filters */}
        <div className="p-5 border-b border-slate-200">
          {/* Search and Action Row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                placeholder="Search by name, ID, or email..."
              />
              {searchInput && (
                <button
                  onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-icons text-lg">close</span>
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700"
            >
              <option value="default">Default Order</option>
              <option value="created_at">Registration Date</option>
              <option value="reference_number">Reference #</option>
              <option value="first_name">First Name</option>
              <option value="last_name">Last Name</option>
              <option value="email">Email</option>
              <option value="role">Role</option>
              <option value="phone_number">Phone</option>
              <option value="is_active">Status</option>
              <option value="last_login_at">Last Login</option>
              <option value="updated_at">Last Updated</option>
            </select>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700"
              disabled={sortBy === 'default'}
            >
              <option value="asc">↑ Ascending</option>
              <option value="desc">↓ Descending</option>
            </select>
            <div className="relative" ref={bulkMenuRef}>
              <button
                onClick={() => {
                  setShowBulkMenu(!showBulkMenu);
                }}
                disabled={selectedUsers.size === 0 || bulkActionLoading}
                className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedUsers.size > 0 
                    ? 'bg-primary text-white hover:bg-primary/90 border-primary shadow-sm' 
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <span className="material-icons text-base">more_horiz</span> 
                Bulk Actions {selectedUsers.size > 0 && `(${selectedUsers.size})`}
              </button>
              {showBulkMenu && selectedUsers.size > 0 && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-slate-200 shadow-lg z-20">
                  <button 
                    onClick={handleBulkActivate}
                    disabled={bulkActionLoading}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 rounded-t-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-icons text-sm text-green-600">check_circle</span>
                    Activate Selected
                  </button>
                  <button 
                    onClick={handleBulkDeactivate}
                    disabled={bulkActionLoading}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-icons text-sm text-amber-600">block</span>
                    Deactivate Selected
                  </button>
                  <button 
                    onClick={handleBulkDelete}
                    disabled={bulkActionLoading}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-b-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">delete</span>
                    Delete Selected
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700"
            >
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
            <select
              value={departmentFilter}
              onChange={e => { setDepartmentFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700"
            >
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
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-medium text-slate-700"
            >
              <option value="">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
          
          {/* Active Filters Display */}
          {(roleFilter || departmentFilter || statusFilter) && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500">Active Filters:</span>
              {roleFilter && (
                <button
                  onClick={() => setRoleFilter('')}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                >
                  Role: {ROLE_LABELS[roleFilter] || roleFilter}
                  <span className="material-icons text-sm">close</span>
                </button>
              )}
              {departmentFilter && (
                <button
                  onClick={() => setDepartmentFilter('')}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200"
                >
                  Dept: {departmentFilter}
                  <span className="material-icons text-sm">close</span>
                </button>
              )}
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter('')}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200"
                >
                  Status: {statusFilter}
                  <span className="material-icons text-sm">close</span>
                </button>
              )}
              <button
                onClick={() => {
                  setRoleFilter('');
                  setDepartmentFilter('');
                  setStatusFilter('');
                }}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium underline"
              >
                Clear All Filters
              </button>
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
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === users.length && users.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/30"
                    />
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
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => toggleSelect(user.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/30"
                      />
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold font-mono text-slate-700">{user.reference_number || 'N/A'}</span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden">
                          {user.avatar_url ? (
                            <img src={userService.getPhotoUrl(user.avatar_url) || ''} alt={`${user.first_name} ${user.last_name}`} className="w-full h-full object-cover" />
                          ) : (
                            getInitials(`${user.first_name} ${user.last_name}`)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{`${user.first_name} ${user.last_name}`}</p>
                          <p className="text-xs text-slate-500 truncate">
                            Last login: {getTimeAgo(user.last_login_at)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">{getRoleBadge(user.roles?.[0] || '')}</td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{getDepartment(user.roles?.[0] || '')}</span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-sm">
                        <p className="text-slate-900 truncate">{user.email}</p>
                        <p className="text-slate-500 truncate">{user.phone_number || 'No phone'}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4 sticky right-0 bg-white group-hover:bg-slate-50/50 z-10">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditUser(user)}
                          className="p-1.5 hover:bg-slate-100 rounded transition-colors"
                          title="Edit"
                        >
                          <span className="material-icons text-base text-slate-600">edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(user)}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
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
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-icons text-xl">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      page === pageNum
                        ? 'bg-primary text-white'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && page < totalPages - 2 && (
                <>
                  <span className="text-slate-400">...</span>
                  <button
                    onClick={() => setPage(totalPages)}
                    className="w-9 h-9 rounded-lg text-sm font-semibold hover:bg-slate-100 text-slate-700 transition-colors"
                  >
                    {totalPages}
                  </button>
                </>
              )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-icons text-xl">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Staff Profile Modal */}
      {viewUser && (
        <Drawer title="Staff Profile" onClose={() => setViewUser(null)}>
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold mb-3 overflow-hidden">
              {viewUser.avatar_url ? (
                <img src={userService.getPhotoUrl(viewUser.avatar_url) || ''} alt={`${viewUser.first_name} ${viewUser.last_name}`} className="w-full h-full object-cover" />
              ) : (
                getInitials(`${viewUser.first_name} ${viewUser.last_name}`)
              )}
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
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Contact</h3>
              </div>
              <ProfileField icon="email" label="Email" value={viewUser.email} />
              <ProfileField icon="phone" label="Phone" value={viewUser.phone_number || 'Not provided'} />
            </section>
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Professional Info</h3>
              </div>
              <ProfileField icon="badge" label="Reference #" value={viewUser.reference_number || 'Not assigned'} />
              <ProfileField icon="business" label="Department" value={getDepartment(viewUser.roles?.[0] || '')} />
              <ProfileField icon="person" label="Username" value={viewUser.username} />
            </section>
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Activity</h3>
              </div>
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

      {/* Delete Confirm Modal */}
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

// ---------- Side Drawer ----------
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

// ---------- Profile Field ----------
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

// ---------- Field Wrapper ----------
const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-slate-700">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

// ---------- Create Staff Modal ----------
const CreateStaffModal: React.FC<{ onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ onClose, onSuccess, onError }) => {
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CreateFormData>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: {
      country_code: '+91',
    },
  });

  const email = watch('email', '');
  const password = watch('password', '');
  const firstName = watch('first_name', '');
  const lastName = watch('last_name', '');
  const autoGenPassword = watch('auto_generate_password', false);
  const selectedRole = watch('role', '');

  // Department is auto-derived from role via getDepartment() — no form field needed

  // Auto-generate username from email
  React.useEffect(() => {
    if (email && email.includes('@')) {
      const suggestedUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      setValue('username', suggestedUsername);
    }
  }, [email, setValue]);
  
  const fullName = `${firstName} ${lastName}`.trim();
  
  const strengthChecks = [
    { label: '8+ characters', pass: (password || '').length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password || '') },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password || '') },
    { label: 'Contains digit', pass: /[0-9]/.test(password || '') },
    { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password || '') },
  ];
  const passedCount = strengthChecks.filter(c => c.pass).length;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPhotoError('');

    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setPhotoError('Please upload a JPG, PNG, or GIF image');
      return;
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      setPhotoError('Image size must be less than 2MB');
      return;
    }

    setPhotoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const getInitials = (name: string) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '';
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const generatePassword = () => {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    // Ensure at least one of each type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    // Fill remaining with random
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    // Shuffle
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  };

  const onSubmit = async (data: CreateFormData) => {
    try {
      let finalPassword = data.password || '';
      if (data.auto_generate_password) {
        finalPassword = generatePassword();
      }

      const payload: UserCreateData = {
        username: data.username,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
        password: finalPassword,
        phone_number: data.phone_number,
      };
      
      // Create user first
      const createdUser = await userService.createUser(payload);
      
      // Upload photo if selected
      if (photoFile && createdUser.id) {
        try {
          await userService.uploadPhoto(createdUser.id, photoFile);
        } catch (photoErr: any) {
          // Don't fail the whole operation if photo upload fails
          toast.error('User created but photo upload failed');
        }
      }
      
      onSuccess();
    } catch (err: any) {
      onError(err?.response?.data?.detail || 'Failed to create staff member');
    }
  };

  return (
    <Drawer title="Add New Staff Member" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-6">Fill in the details to create a hospital staff profile.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Profile Photo */}
        <section className="flex flex-col items-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-slate-400">
                  {getInitials(fullName)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold text-slate-700 mb-1">Profile Photo</p>
            <p className="text-xs text-slate-500 mb-2">JPG, PNG or GIF. Max size 2MB.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handlePhotoClick}
              className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              CHANGE PHOTO
            </button>
            {photoError && <p className="text-xs text-red-500 mt-2">{photoError}</p>}
          </div>
        </section>
        {/* Personal Information */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Information</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" error={errors.first_name?.message}>
              <input {...register('first_name')} className="input-field" placeholder="e.g. Sarah" />
            </Field>
            <Field label="Last Name" error={errors.last_name?.message}>
              <input {...register('last_name')} className="input-field" placeholder="e.g. Jenkins" />
            </Field>
          </div>
          <Field label="Email Address" error={errors.email?.message}>
            <input {...register('email')} type="email" className="input-field" placeholder="sarah.j@hospital.com" />
          </Field>
          <Field label="Username (for login)" error={errors.username?.message}>
            <input {...register('username')} className="input-field" placeholder="Auto-filled from email" />
            <p className="text-xs text-slate-500 mt-1">Used for logging into the system</p>
          </Field>
          <Field label="Phone Number" error={errors.phone_number?.message}>
            <div className="flex gap-2">
              <select {...register('country_code')} className="input-field w-28">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.phoneCode}>{c.phoneCode}</option>
                ))}
              </select>
              <input {...register('phone_number')} className="input-field flex-1" placeholder="1234567890" />
            </div>
          </Field>
        </section>

        {/* Professional Info */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Professional Info</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Field label="System Role (Job Function)" error={errors.role?.message}>
              <select {...register('role')} className="input-field">
                <option value="">Select role</option>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </Field>
          </div>
        </section>

        {/* Security */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Security &amp; Status</h3>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-700">Set Password</p>
            </div>
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
              <Field label="Password" error={errors.password?.message}>
                <div className="relative">
                  <input {...register('password')} type={showPassword ? 'text' : 'password'} className="input-field pr-10" placeholder="••••••••••••••" />
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
              <Field label="Confirm Password" error={errors.confirm_password?.message}>
                <input {...register('confirm_password')} type="password" className="input-field" placeholder="Re-enter password" />
              </Field>
            </>
          )}
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-[2] px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
            <span className="material-icons text-sm">save</span>
            {isSubmitting ? 'Saving...' : 'Save Staff Member'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};

// ---------- Edit Staff Modal ----------
const EditStaffModal: React.FC<{ user: UserData; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ user, onClose, onSuccess, onError }) => {
  const toast = useToast();
  const [photoPreview, setPhotoPreview] = useState<string>(user.avatar_url ? userService.getPhotoUrl(user.avatar_url) || '' : '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<EditFormData>({
    resolver: zodResolver(staffEditSchema),
    defaultValues: {
      email: user.email,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone_number: user.phone_number || '',
      country_code: '+91',
      role: user.roles?.[0] || '',
      is_active: user.is_active,
    },
  });

  const firstName = watch('first_name', user.first_name || '');
  const lastName = watch('last_name', user.last_name || '');
  const selectedRole = watch('role', user.roles?.[0] || '');
  const fullName = `${firstName} ${lastName}`.trim();

  // Track role changes
  React.useEffect(() => {
    // Role changed - could trigger UI updates if needed
  }, [selectedRole, setValue]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPhotoError('');

    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setPhotoError('Please upload a JPG, PNG, or GIF image');
      return;
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      setPhotoError('Image size must be less than 2MB');
      return;
    }

    setPhotoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
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
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone_number: data.phone_number,
        role: data.role,
        is_active: data.is_active,
      };
      await userService.updateUser(user.id, payload);
      
      // Upload photo if selected
      if (photoFile) {
        try {
          await userService.uploadPhoto(user.id, photoFile);
          toast.success('Staff member and photo updated successfully!');
        } catch (photoErr: any) {
          toast.warning('Staff updated, but photo upload failed');
        }
      }
      
      onSuccess();
    } catch (err: any) {
      onError(err?.response?.data?.detail || 'Failed to update staff member');
    }
  };

  return (
    <Drawer title="Edit Staff Member" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Profile Photo */}
        <section className="flex flex-col items-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-slate-400">
                  {getInitials(fullName)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold text-slate-700 mb-1">Profile Photo</p>
            <p className="text-xs text-slate-500 mb-2">JPG, PNG or GIF. Max size 2MB.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handlePhotoClick}
              className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              CHANGE PHOTO
            </button>
            {photoError && <p className="text-xs text-red-500 mt-2">{photoError}</p>}
          </div>
        </section>
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Information</h3>
          </div>
          <Field label="Username">
            <input value={user.username} disabled className="input-field bg-slate-100 cursor-not-allowed" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" error={errors.first_name?.message}>
              <input {...register('first_name')} className="input-field" placeholder="e.g. Sarah" />
            </Field>
            <Field label="Last Name" error={errors.last_name?.message}>
              <input {...register('last_name')} className="input-field" placeholder="e.g. Jenkins" />
            </Field>
          </div>
          <Field label="Email" error={errors.email?.message}>
            <input {...register('email')} type="email" className="input-field" />
          </Field>
          <Field label="Phone Number" error={errors.phone_number?.message}>
            <div className="flex gap-2">
              <select {...register('country_code')} className="input-field w-28">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.phoneCode}>{c.phoneCode}</option>
                ))}
              </select>
              <input {...register('phone_number')} className="input-field flex-1" placeholder="1234567890" />
            </div>
          </Field>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Professional Info</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="System Role (Job Function)" error={errors.role?.message}>
              <select {...register('role')} className="input-field">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Reference #">
              <input 
                value={user.reference_number || 'Not assigned'} 
                disabled 
                className="input-field bg-slate-100 cursor-not-allowed" 
              />
              <p className="text-xs text-slate-500 mt-1">Auto-generated, cannot be changed</p>
            </Field>
          </div>
        </section>

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
          <button type="submit" disabled={isSubmitting} className="flex-[2] px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
            <span className="material-icons text-sm">save</span>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};

// ---------- Reset Password Modal ----------
const ResetPasswordModal: React.FC<{ user: UserData; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ user, onClose, onSuccess, onError }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetFormData) => {
    try {
      await userService.resetPassword(user.id, { new_password: data.new_password });
      onSuccess();
    } catch (err: any) {
      onError(err?.response?.data?.detail || 'Failed to reset password');
    }
  };

  return (
    <Drawer title={`Reset Password — ${user.first_name} ${user.last_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Security</h3>
          </div>
          <Field label="New Password" error={errors.new_password?.message}>
            <input {...register('new_password')} type="password" className="input-field" placeholder="Enter new password" />
          </Field>
          <Field label="Confirm Password" error={errors.confirm_password?.message}>
            <input {...register('confirm_password')} type="password" className="input-field" placeholder="Re-enter password" />
          </Field>
        </section>
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-[2] px-4 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
            <span className="material-icons text-sm">key</span>
            {isSubmitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};

export default StaffDirectory;
