import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';
import {
  UserCircle,
  Mail,
  Shield,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  KeyRound,
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

export const Profile: React.FC = () => {
  const { user } = useAuth();

  // Change password state
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
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent pr-12';

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {/* Profile Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header banner */}
        <div className="h-24 bg-gradient-to-r from-primary-600 to-primary-700" />

        <div className="px-8 pb-8">
          {/* Avatar + name */}
          <div className="flex items-end -mt-10 mb-6">
            <div className="w-20 h-20 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center">
              <UserCircle className="w-16 h-16 text-primary-400" />
            </div>
            <div className="ml-4 mb-1">
              <h2 className="text-xl font-bold text-gray-900">{user.full_name}</h2>
              <span className="inline-block mt-1 px-3 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
              <UserCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Username</p>
                <p className="text-sm font-medium text-gray-900">{user.username}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
              <Mail className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
              <Shield className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Role</p>
                <p className="text-sm font-medium text-gray-900">{ROLE_LABELS[user.role] || user.role}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
              <Lock className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Password</p>
                <p className="text-sm font-medium text-gray-900">••••••••</p>
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
            <KeyRound className="w-5 h-5 text-primary-600 mr-3" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Change Password</p>
              <p className="text-xs text-gray-500">Update your account password</p>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${showPasswordForm ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
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
                          className={`w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0 ${
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
                  className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !form.currentPassword || !form.newPassword || !form.confirmPassword}
                  className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
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
