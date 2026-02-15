import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import userService from '../services/userService';
import type { UserData, UserCreateData, UserUpdateData } from '../types/user';
import { ROLE_COLORS, ROLE_LABELS } from '../utils/constants';

const userCreateSchema = z.object({
  username: z.string().min(3, 'Min 3 characters').max(50),
  email: z.string().email('Invalid email'),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  phone_number: z.string().optional(),
  employee_id: z.string().optional(),
  department: z.string().optional(),
  role: z.string().min(1, 'Required'),
  password: z.string().min(8, 'Min 8 characters')
    .regex(/[A-Z]/, 'Need uppercase letter')
    .regex(/[a-z]/, 'Need lowercase letter')
    .regex(/[0-9]/, 'Need digit')
    .regex(/[^A-Za-z0-9]/, 'Need special char'),
  confirm_password: z.string(),
}).refine(data => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

const userEditSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email('Invalid email'),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  phone_number: z.string().optional(),
  employee_id: z.string().optional(),
  department: z.string().optional(),
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

type CreateFormData = z.infer<typeof userCreateSchema>;
type EditFormData = z.infer<typeof userEditSchema>;
type ResetFormData = z.infer<typeof resetPasswordSchema>;

const ROLES = [
  'super_admin', 'admin', 'doctor', 'nurse', 'receptionist',
  'pharmacist', 'cashier', 'inventory_manager', 'staff',
];

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await userService.deleteUser(deleteConfirm.id);
      setSuccess('User deleted successfully');
      setDeleteConfirm(null);
      fetchUsers();
    } catch {
      setError('Failed to delete user');
    }
  };

  const getRoleBadge = (role: string) => {
    const colors = ROLE_COLORS[role] || 'bg-gray-100 text-gray-800';
    const label = ROLE_LABELS[role] || role;
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors}`}>{label}</span>;
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

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <span className="material-icons text-lg">error</span> {error}
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><span className="material-icons text-lg">close</span></button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <span className="material-icons text-lg">check_circle</span> {success}
          </div>
          <button onClick={() => setSuccess('')} className="text-emerald-400 hover:text-emerald-600"><span className="material-icons text-lg">close</span></button>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
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
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-500">
                    <span className="material-icons text-4xl text-slate-300 mb-2">group_off</span>
                    <p className="text-lg font-medium">No users found</p>
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{user.full_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">{user.email}</td>
                    <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">
                      {user.last_login ? format(new Date(user.last_login), 'dd MMM yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            Are you sure you want to delete <strong>{deleteConfirm.full_name}</strong> ({deleteConfirm.username})?
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
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); setSuccess('User created successfully'); fetchUsers(); }}
          onError={setError}
        />
      )}

      {/* Edit User Modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={() => { setEditUser(null); setSuccess('User updated successfully'); fetchUsers(); }}
          onError={setError}
        />
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSuccess={() => { setResetUser(null); setSuccess('Password reset successfully'); }}
          onError={setError}
        />
      )}
    </div>
  );
};

// ---------- Modal Shell (Side Drawer) ----------
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
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

// ---------- Create User Modal ----------
const CreateUserModal: React.FC<{ onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ onClose, onSuccess, onError }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateFormData>({
    resolver: zodResolver(userCreateSchema),
  });

  const onSubmit = async (data: CreateFormData) => {
    try {
      const payload: UserCreateData = {
        username: data.username,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name} ${data.last_name}`,
        phone_number: data.phone_number,
        employee_id: data.employee_id,
        department: data.department,
        role: data.role,
        password: data.password,
      };
      await userService.createUser(payload);
      onSuccess();
    } catch (err: any) {
      onError(err?.response?.data?.detail || 'Failed to create user');
    }
  };

  return (
    <Modal title="Add New Staff Member" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-6">Fill in the details to create a staff account.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Info Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Information</h3>
          </div>
          <Field label="Username" error={errors.username?.message}>
            <input {...register('username')} className="input-field" placeholder="Enter username" />
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
            <input {...register('email')} type="email" className="input-field" placeholder="Enter email" />
          </Field>
          <Field label="Phone Number" error={errors.phone_number?.message}>
            <input {...register('phone_number')} className="input-field" placeholder="+1 (555) 000-0000" />
          </Field>
        </section>

        {/* Role Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Professional Info</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role" error={errors.role?.message}>
              <select {...register('role')} className="input-field">
                <option value="">Select role</option>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Employee ID (Auto-generated)" error={errors.employee_id?.message}>
              <input 
                {...register('employee_id')} 
                className="input-field bg-slate-50" 
                placeholder="Auto-generated on creation"
                disabled
              />
              <p className="text-xs text-slate-500 mt-1">Format: ROLE-YYYY-####</p>
            </Field>
          </div>
          <Field label="Department" error={errors.department?.message}>
            <select {...register('department')} className="input-field">
              <option value="">Select department</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Emergency">Emergency (ER)</option>
              <option value="Pharmacy">Main Pharmacy</option>
              <option value="Surgery">Surgery</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="Radiology">Radiology</option>
              <option value="Laboratory">Laboratory</option>
              <option value="Administration">Administration</option>
              <option value="ICU">ICU</option>
              <option value="General Ward">General Ward</option>
            </select>
          </Field>
        </section>

        {/* Security Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Security</h3>
          </div>
          <Field label="Password" error={errors.password?.message}>
            <input {...register('password')} type="password" className="input-field" placeholder="Create password" />
          </Field>
          <Field label="Confirm Password" error={errors.confirm_password?.message}>
            <input {...register('confirm_password')} type="password" className="input-field" placeholder="Re-enter password" />
          </Field>
        </section>

        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-[2] px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
            <span className="material-icons text-sm">save</span>
            {isSubmitting ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------- Edit User Modal ----------
const EditUserModal: React.FC<{ user: UserData; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ user, onClose, onSuccess, onError }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EditFormData>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      username: user.username,
      email: user.email,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone_number: user.phone_number || '',
      employee_id: user.employee_id || '',
      department: user.department || '',
      role: user.role,
      is_active: user.is_active,
    },
  });

  const onSubmit = async (data: EditFormData) => {
    try {
      const payload: UserUpdateData = {
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name} ${data.last_name}`,
        phone_number: data.phone_number,
        employee_id: data.employee_id,
        department: data.department,
        role: data.role,
        is_active: data.is_active,
      };
      await userService.updateUser(user.id, payload);
      onSuccess();
    } catch (err: any) {
      onError(err?.response?.data?.detail || 'Failed to update user');
    }
  };

  return (
    <Modal title="Edit User" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
              <input {...register('first_name')} className="input-field" />
            </Field>
            <Field label="Last Name" error={errors.last_name?.message}>
              <input {...register('last_name')} className="input-field" />
            </Field>
          </div>
          <Field label="Email" error={errors.email?.message}>
            <input {...register('email')} type="email" className="input-field" />
          </Field>
          <Field label="Phone Number" error={errors.phone_number?.message}>
            <input {...register('phone_number')} className="input-field" placeholder="+1 (555) 000-0000" />
          </Field>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Professional Info</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role" error={errors.role?.message}>
              <select {...register('role')} className="input-field">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Employee ID">
              <input 
                value={user.employee_id || 'Not assigned'} 
                disabled 
                className="input-field bg-slate-100 cursor-not-allowed" 
              />
              <p className="text-xs text-slate-500 mt-1">Auto-generated, cannot be changed</p>
            </Field>
          </div>
          <Field label="Department" error={errors.department?.message}>
            <select {...register('department')} className="input-field">
              <option value="">Select department</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Emergency">Emergency (ER)</option>
              <option value="Pharmacy">Main Pharmacy</option>
              <option value="Surgery">Surgery</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="Radiology">Radiology</option>
              <option value="Laboratory">Laboratory</option>
              <option value="Administration">Administration</option>
              <option value="ICU">ICU</option>
              <option value="General Ward">General Ward</option>
            </select>
          </Field>
        </section>

        {/* Status Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <p className="text-sm font-semibold text-slate-800">Active Status</p>
            <p className="text-xs text-slate-500">User will be able to log in when active.</p>
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
    </Modal>
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
    <Modal title={`Reset Password — ${user.username}`} onClose={onClose}>
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
    </Modal>
  );
};

// ---------- Field Wrapper ----------
const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-slate-700">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

export default UserManagement;
