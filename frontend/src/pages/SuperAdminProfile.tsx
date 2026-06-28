import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolverV4 as zodResolver } from '../utils/zodResolverV4';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import { useToast } from '../contexts/ToastContext';
import authService from '../services/authService';
import { changePasswordSchema } from '../utils/validation';

type ChangePasswordData = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

const SuperAdminProfile: React.FC = () => {
  const { admin, isLoading, logout } = useSuperAdmin();
  const toast = useToast();
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
  });

  const newPassword = watch('new_password', '');

  const strengthChecks = [
    { label: 'At least 8 characters', pass: newPassword.length >= 8 },
    { label: 'Contains uppercase letter', pass: /[A-Z]/.test(newPassword) },
    { label: 'Contains lowercase letter', pass: /[a-z]/.test(newPassword) },
    { label: 'Contains a digit', pass: /[0-9]/.test(newPassword) },
    { label: 'Contains special character', pass: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const passedCount = strengthChecks.filter((c) => c.pass).length;

  const strengthColor =
    passedCount <= 1 ? 'bg-red-500' :
    passedCount <= 3 ? 'bg-amber-500' :
    passedCount === 4 ? 'bg-blue-500' :
    'bg-green-500';

  const strengthLabel =
    passedCount <= 1 ? 'Weak' :
    passedCount <= 3 ? 'Fair' :
    passedCount === 4 ? 'Good' :
    'Strong';

  const onSubmit = async (data: ChangePasswordData) => {
    try {
      await authService.changePassword(data.current_password, data.new_password);
      reset();
      setShowChangePassword(false);
      // Changing the password revokes the current session server-side
      // (SECURITY_AUDIT.md C1) — log out deliberately rather than letting
      // the next request fail unexpectedly.
      toast.success('Password changed. Please log in again with your new password.');
      logout();
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to change password');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-36 bg-slate-200 rounded-2xl" />
        <div className="h-48 bg-slate-100 rounded-2xl" />
        <div className="h-32 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  if (!admin) return null;

  const initials = admin.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'SA';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Profile Hero */}
      <div className="bg-gradient-to-br from-primary to-blue-700 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl font-bold text-white border-2 border-white/30 shrink-0">
            {initials}
          </div>
          <div>
            <h2 className="text-2xl font-bold">{admin.full_name}</h2>
            <p className="text-blue-100 mt-0.5">{admin.email}</p>
            <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              Super Administrator
            </span>
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[18px]">badge</span>
          </div>
          <h3 className="font-bold text-slate-900">Account Information</h3>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Full Name
            </label>
            <p className="text-sm font-medium text-slate-900">{admin.full_name}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Username
            </label>
            <p className="text-sm font-medium text-slate-900">{admin.username}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Email Address
            </label>
            <p className="text-sm font-medium text-slate-900">{admin.email}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Account Status
            </label>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              admin.is_active
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${admin.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
              {admin.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-600 text-[18px]">lock</span>
            </div>
            <h3 className="font-bold text-slate-900">Security</h3>
          </div>
          {!showChangePassword && (
            <button
              onClick={() => setShowChangePassword(true)}
              className="px-4 py-2 text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
            >
              Change Password
            </button>
          )}
        </div>

        {showChangePassword ? (
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
            {/* Current Password */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  {...register('current_password')}
                  className="input-field pr-10"
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showCurrent ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {errors.current_password && (
                <p className="text-xs text-red-500 mt-1">{errors.current_password.message}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  {...register('new_password')}
                  className="input-field pr-10"
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showNew ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {errors.new_password && (
                <p className="text-xs text-red-500 mt-1">{errors.new_password.message}</p>
              )}

              {/* Strength meter */}
              {newPassword && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Password strength</span>
                    <span className={`font-semibold ${
                      passedCount <= 1 ? 'text-red-500' :
                      passedCount <= 3 ? 'text-amber-500' :
                      passedCount === 4 ? 'text-blue-500' :
                      'text-green-500'
                    }`}>
                      {strengthLabel}
                    </span>
                  </div>
                  <div className="password-strength-meter">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                      style={{ width: `${(passedCount / 5) * 100}%` }}
                    />
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                    {strengthChecks.map((check) => (
                      <li key={check.label} className={`flex items-center gap-1.5 text-xs ${check.pass ? 'text-green-600' : 'text-slate-400'}`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {check.pass ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                        {check.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  {...register('confirm_password')}
                  className="input-field pr-10"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showConfirm ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {errors.confirm_password && (
                <p className="text-xs text-red-500 mt-1">{errors.confirm_password.message}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowChangePassword(false); reset(); }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting && (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {isSubmitting ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6">
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-500 text-[20px]">password</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Password</p>
                <p className="text-xs text-slate-500">Last changed: unknown</p>
              </div>
              <span className="ml-auto text-slate-400">••••••••</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminProfile;