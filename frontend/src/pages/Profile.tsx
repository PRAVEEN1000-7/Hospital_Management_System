import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';
import {
  UserCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  KeyRound,
  AtSign,
  ChevronDown,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  staff: 'Staff',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
  inventory_manager: 'Inventory Manager',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin: 'bg-orange-100 text-orange-700',
  doctor: 'bg-blue-100 text-blue-700',
  nurse: 'bg-teal-100 text-teal-700',
  staff: 'bg-gray-100 text-gray-700',
  receptionist: 'bg-purple-100 text-purple-700',
  pharmacist: 'bg-green-100 text-green-700',
  cashier: 'bg-yellow-100 text-yellow-700',
  inventory_manager: 'bg-indigo-100 text-indigo-700',
};

export const Profile: React.FC = () => {
  const { user } = useAuth();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const passwordRequirements = [
    { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
    { label: 'One digit', test: (p: string) => /\d/.test(p) },
    { label: 'One special character', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirm password do not match');
      return;
    }

    const allPassed = passwordRequirements.every((r) => r.test(form.newPassword));
    if (!allPassed) {
      setError('New password does not meet all requirements');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.changePassword(form.currentPassword, form.newPassword);
      setSuccess(result.message || 'Password changed successfully!');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setShowPasswordForm(false), 2000);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; '));
      } else {
        setError('Failed to change password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent pr-12 transition-colors';

  if (!user) return null;

  const roleBadgeClass = ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {/* Profile Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Header banner */}
        <div className="relative h-36 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-t-xl overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-1/3 w-24 h-24 bg-white/5 rounded-full translate-y-1/2" />
          <div className="absolute top-4 left-8 w-12 h-12 bg-white/5 rounded-full" />
        </div>

        {/* Avatar + Name — positioned to overlap banner bottom */}
        <div className="flex flex-col items-center -mt-14 pb-6">
          <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-lg flex items-center justify-center">
            <UserCircle className="w-16 h-16 text-primary-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mt-3">{user.full_name}</h2>
          <span className={`mt-1.5 px-3 py-1 rounded-full text-xs font-semibold ${roleBadgeClass}`}>
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </div>

        {/* Details grid */}
        <div className="px-8 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <AtSign className="w-4 h-4 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 font-medium">Username</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{user.username}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 font-medium">Email</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 font-medium">Password</p>
                <p className="text-sm font-semibold text-gray-900">••••••••</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => {
            setShowPasswordForm(!showPasswordForm);
            setError('');
            setSuccess('');
          }}
          className="w-full flex items-center justify-between px-8 py-5 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center">
            <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center mr-3">
              <KeyRound className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Change Password</p>
              <p className="text-xs text-gray-500">Update your account password</p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showPasswordForm ? 'rotate-180' : ''}`}
          />
        </button>

        {showPasswordForm && (
          <div className="px-8 pb-8 border-t border-gray-100">
            {success && (
              <div className="mt-5 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                <p className="text-sm text-green-800">{success}</p>
              </div>
            )}
            {error && (
              <div className="mt-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              {/* Current Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={form.currentPassword}
                    onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                    className={inputClass}
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={form.newPassword}
                    onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                    className={inputClass}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.newPassword && (
                  <div className="mt-2 space-y-1">
                    {passwordRequirements.map((req, idx) => (
                      <div key={idx} className="flex items-center text-xs">
                        <div
                          className={`w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0 transition-colors ${
                            req.test(form.newPassword) ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        />
                        <span className={req.test(form.newPassword) ? 'text-green-700' : 'text-gray-500'}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className={inputClass}
                    placeholder="Re-enter new password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.confirmPassword && form.newPassword !== form.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
                )}
                {form.confirmPassword && form.newPassword === form.confirmPassword && form.confirmPassword.length > 0 && (
                  <p className="mt-1 text-sm text-green-600 flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" /> Passwords match
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    setError('');
                    setSuccess('');
                  }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !form.currentPassword || !form.newPassword || !form.confirmPassword}
                  className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Changing...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
