import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import userService from '../services/userService';
import type { UserData } from '../types/user';
import { ROLE_TEXT_COLORS, ROLE_LABELS } from '../utils/constants';
import { useToast } from '../contexts/ToastContext';
import {
  Drawer as Modal, CreateStaffModal, EditStaffModal, ResetPasswordModal,
} from '../components/staff/StaffModals';

const UserManagement: React.FC = () => {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [resetUser, setResetUser] = useState<UserData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserData | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getUsers(page, 15, search);
      setUsers(res.data);
      setTotalPages(res.total_pages);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Sync search state from URL when global header search updates it.
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    if (urlSearch !== search) {
      setSearch(urlSearch);
      setPage(1);
    }
  }, [searchParams, search]);

  // Keep URL query in sync with page-level search box.
  useEffect(() => {
    if (search) {
      setSearchParams({ search }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [search, setSearchParams]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await userService.deleteUser(deleteConfirm.id);
      toast.success('User deleted successfully');
      setDeleteConfirm(null);
      fetchUsers();
    } catch {
      toast.error('Failed to delete user');
    }
  };

  const getRoleBadge = (role: string) => {
    const textColor = ROLE_TEXT_COLORS[role] || 'text-gray-700';
    const label = ROLE_LABELS[role] || role;
    return <span className={`text-sm font-medium ${textColor}`}>{label}</span>;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 text-sm">Manage staff accounts, roles and access permissions.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-all shadow-md active:scale-95"
        >
          <span className="material-icons text-lg">add</span> Add User
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <span className="material-icons text-lg">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Consultation Fee</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-500">
                    <span className="material-icons text-4xl text-slate-300 mb-2">group_off</span>
                    <p className="text-lg font-medium">No users found</p>
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs overflow-hidden flex-shrink-0">
                          {user.avatar_url ? (
                            <img 
                              src={userService.getPhotoUrl(user.avatar_url) || ''} 
                              alt={`${user.first_name} ${user.last_name}`} 
                              className="w-full h-full object-cover" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  parent.innerHTML = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
                                }
                              }}
                            />
                          ) : (
                            `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()
                          )}
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{`${user.roles?.includes('doctor') ? 'Dr. ' : ''}${user.first_name} ${user.last_name}`}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{user.email}</td>
                    <td className="px-6 py-4">{getRoleBadge(user.roles?.[0] || '')}</td>
                    <td className="px-6 py-4 text-sm">
                      {user.roles?.includes('doctor') ? (
                        user.consultation_fee ? (
                          <span className="font-semibold text-slate-700">₹{Number(user.consultation_fee).toLocaleString()}</span>
                        ) : (
                          <span className="text-amber-600 text-xs font-semibold">Not set</span>
                        )
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {user.last_login_at ? format(new Date(user.last_login_at), 'dd MMM yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditUser(user)}
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-icons text-lg">edit</span>
                        </button>
                        <button
                          onClick={() => setResetUser(user)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                          title="Reset Password"
                        >
                          <span className="material-icons text-lg">key</span>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(user)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <span className="material-icons text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
            <span className="text-sm text-slate-500">Page <span className="font-bold text-slate-900">{page}</span> of <span className="font-bold text-slate-900">{totalPages}</span></span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <span className="material-icons text-lg">chevron_left</span>
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <span className="material-icons text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <Modal title="Delete User" onClose={() => setDeleteConfirm(null)}>
          <p className="text-slate-600 mb-6">
            Are you sure you want to delete <strong>{`${deleteConfirm.roles?.includes('doctor') ? 'Dr. ' : ''}${deleteConfirm.first_name} ${deleteConfirm.last_name}`}</strong> ({deleteConfirm.username})?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors active:scale-95">Delete</button>
          </div>
        </Modal>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <CreateStaffModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); toast.success('User created successfully'); fetchUsers(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {/* Edit User Modal */}
      {editUser && (
        <EditStaffModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={() => { setEditUser(null); toast.success('User updated successfully'); fetchUsers(); }}
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

export default UserManagement;
