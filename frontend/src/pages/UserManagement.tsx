import React, { useEffect, useState } from 'react';
import { userService } from '../services/userService';
import { UserData, UserCreateData, UserUpdateData } from '../types/user';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, Plus, Pencil, Trash2, KeyRound, Mail, Search,
  ChevronLeft, ChevronRight, X, AlertCircle, CheckCircle, Eye, EyeOff,
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
  { value: 'staff', label: 'Staff' },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  doctor: 'bg-green-100 text-green-800',
  nurse: 'bg-pink-100 text-pink-800',
  receptionist: 'bg-yellow-100 text-yellow-800',
  pharmacist: 'bg-teal-100 text-teal-800',
  cashier: 'bg-orange-100 text-orange-800',
  inventory_manager: 'bg-indigo-100 text-indigo-800',
  staff: 'bg-gray-100 text-gray-800',
};

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState<UserCreateData>({
    username: '', email: '', password: '', full_name: '', role: 'staff',
  });
  const [editForm, setEditForm] = useState<UserUpdateData>({});
  const [passwordForm, setPasswordForm] = useState({ new_password: '', send_email: false });
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await userService.listUsers(page, 10, search || undefined);
      setUsers(response.data);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'super_admin') {
      fetchUsers();
    }
  }, [page]);

  // Access check — after all hooks
  if (currentUser?.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only Super Admins can access User Management.</p>
        </div>
      </div>
    );
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // CREATE USER
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    clearMessages();
    try {
      await userService.createUser(createForm, true);
      setSuccess('User created successfully! Login credentials have been sent to their email.');
      setShowCreateModal(false);
      setCreateForm({ username: '', email: '', password: '', full_name: '', role: 'staff' });
      fetchUsers();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; '));
      } else {
        setError('Failed to create user');
      }
    } finally {
      setFormLoading(false);
    }
  };

  // EDIT USER
  const openEditModal = (user: UserData) => {
    setSelectedUser(user);
    setEditForm({ email: user.email, full_name: user.full_name, role: user.role, is_active: user.is_active });
    setShowEditModal(true);
    clearMessages();
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormLoading(true);
    clearMessages();
    try {
      await userService.updateUser(selectedUser.id, editForm);
      setSuccess('User updated successfully!');
      setShowEditModal(false);
      fetchUsers();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to update user');
    } finally {
      setFormLoading(false);
    }
  };

  // DELETE USER
  const handleDelete = async (user: UserData) => {
    if (!window.confirm(`Are you sure you want to deactivate user "${user.username}"?`)) return;
    clearMessages();
    try {
      await userService.deleteUser(user.id);
      setSuccess(`User "${user.username}" deactivated successfully.`);
      fetchUsers();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to delete user');
    }
  };

  // RESET PASSWORD
  const openPasswordModal = (user: UserData) => {
    setSelectedUser(user);
    setPasswordForm({ new_password: '', send_email: false });
    setShowPasswordModal(true);
    setShowPassword(false);
    clearMessages();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormLoading(true);
    clearMessages();
    try {
      const result = await userService.resetPassword(
        selectedUser.id,
        { new_password: passwordForm.new_password },
        passwordForm.send_email
      );
      setSuccess(result.message + (result.email_sent ? ' (Email sent)' : ''));
      setShowPasswordModal(false);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; '));
      } else {
        setError('Failed to reset password');
      }
    } finally {
      setFormLoading(false);
    }
  };

  // SEND PASSWORD
  const handleSendPassword = async () => {
    if (!selectedUser) return;
    if (!passwordForm.new_password) {
      setError('Please enter a password first');
      return;
    }
    setFormLoading(true);
    clearMessages();
    try {
      const result = await userService.sendPassword(selectedUser.id, {
        new_password: passwordForm.new_password,
      });
      setSuccess(result.message);
      setShowPasswordModal(false);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; '));
      } else {
        setError('Failed to send password');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Users className="w-7 h-7 mr-3 text-primary-600" />
            User Management
          </h1>
          <p className="text-gray-600 mt-1">{total} users in the system</p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); clearMessages(); }}
          className="mt-4 sm:mt-0 flex items-center px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add User
        </button>
      </div>

      {/* Messages */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
          <p className="text-sm text-green-800">{success}</p>
          <button onClick={() => setSuccess('')} className="ml-auto text-green-600 hover:text-green-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-600 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Search by username, name, or email..."
          />
        </div>
      </form>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Full Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{user.full_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 hidden md:table-cell">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-800'}`}>
                        {user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button onClick={() => openEditModal(user)} className="p-1.5 text-gray-500 hover:text-primary-600" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => openPasswordModal(user)} className="p-1.5 text-gray-500 hover:text-yellow-600" title="Reset Password">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          disabled={user.id === currentUser?.id}
                          className="p-1.5 text-gray-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
            <div className="flex space-x-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== CREATE USER MODAL ===== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Create New User</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
                <input className={inputClass} value={createForm.username}
                  onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="johndoe" required minLength={3} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input className={inputClass} value={createForm.full_name}
                  onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="John Doe" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                <input className={inputClass} type="email" value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@hospital.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input className={inputClass} type={showPassword ? 'text' : 'password'}
                    value={createForm.password}
                    onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 chars, 1 upper, 1 lower, 1 digit, 1 special" required minLength={8} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role <span className="text-red-500">*</span></label>
                <select className={inputClass} value={createForm.role}
                  onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={formLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {formLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== EDIT USER MODAL ===== */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Edit User: {selectedUser.username}</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input className={inputClass} value={editForm.full_name || ''}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input className={inputClass} type="email" value={editForm.email || ''}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select className={inputClass} value={editForm.role || ''}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-3">
                <input type="checkbox" id="is_active" checked={editForm.is_active ?? true}
                  onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 text-primary-600 rounded" />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Active</label>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={formLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {formLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== PASSWORD RESET MODAL ===== */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Reset Password: {selectedUser.username}</h2>
              <button onClick={() => setShowPasswordModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input className={inputClass} type={showPassword ? 'text' : 'password'}
                    value={passwordForm.new_password}
                    onChange={e => setPasswordForm(f => ({ ...f, new_password: e.target.value }))}
                    placeholder="Min 8 chars, 1 upper, 1 lower, 1 digit, 1 special" required minLength={8} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Must contain: uppercase, lowercase, digit, special character</p>
              </div>
              <div className="flex items-center space-x-3">
                <input type="checkbox" id="send_email_pw" checked={passwordForm.send_email}
                  onChange={e => setPasswordForm(f => ({ ...f, send_email: e.target.checked }))}
                  className="w-4 h-4 text-primary-600 rounded" />
                <label htmlFor="send_email_pw" className="text-sm font-medium text-gray-700">
                  Send password via email to {selectedUser.email}
                </label>
              </div>
              <div className="flex justify-between pt-4 border-t">
                <button type="button" onClick={handleSendPassword} disabled={formLoading || !passwordForm.new_password}
                  className="flex items-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
                  <Mail className="w-4 h-4 mr-2" />
                  {formLoading ? 'Sending...' : 'Set & Email Password'}
                </button>
                <div className="flex space-x-3">
                  <button type="button" onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={formLoading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    {formLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
