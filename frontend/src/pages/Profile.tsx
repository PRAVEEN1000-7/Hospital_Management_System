import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import { changePasswordSchema } from '../utils/validation';
import { ROLE_LABELS, ROLE_COLORS } from '../utils/constants';
import { useToast } from '../contexts/ToastContext';

type ChangePasswordData = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

const Profile: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<ChangePasswordData>({
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

  const passedCount = strengthChecks.filter(c => c.pass).length;

  const onSubmit = async (data: ChangePasswordData) => {
    try {
      await authService.changePassword(data.current_password, data.new_password);
      toast.success('Password changed successfully');
      reset();
      setShowChangePassword(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to change password');
    }
  };

  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.roles?.[0] || ''] || user.roles?.[0] || '';
  const roleColors = ROLE_COLORS[user.roles?.[0] || ''] || 'bg-slate-100 text-slate-800';
  const fullName = `${user.first_name} ${user.last_name}`;
  const initials = fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero Banner */}
      <div className="bg-primary rounded-t-xl p-8 text-center text-white">
        <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl font-bold">{initials}</span>
        </div>
        <h1 className="text-xl font-bold">{fullName}</h1>
        <span className="inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full bg-white/20 text-white">
          {roleLabel}
        </span>
      </div>

      {/* Details Card */}
      <div className="bg-white rounded-b-xl shadow-sm border border-slate-200 border-t-0">
        {/* Info Grid */}
        <div className="p-6 space-y-4">
          <InfoRow icon="person" label="Username" value={user.username} />
          <InfoRow icon="email" label="Email" value={user.email} />
          <InfoRow icon="shield" label="Role" value={<span className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${roleColors}`}>{roleLabel}</span>} />
          <InfoRow icon="lock" label="Password" value="••••••••" />
        </div>

        <div className="border-t border-slate-200" />

        {/* Change Password Accordion */}
        <div className="p-6">
          <button
            onClick={() => setShowChangePassword(!showChangePassword)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="material-icons text-primary text-lg">lock</span> Change Password
            </span>
            <span className="material-icons text-slate-400 text-lg">
              {showChangePassword ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showChangePassword && (
            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Current Password</label>
                <div className="relative">
                  <input
                    {...register('current_password')}
                    type={showCurrent ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-icons text-lg">{showCurrent ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {errors.current_password && <p className="text-xs text-red-500">{errors.current_password.message}</p>}
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">New Password</label>
                <div className="relative">
                  <input
                    {...register('new_password')}
                    type={showNew ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-icons text-lg">{showNew ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {errors.new_password && <p className="text-xs text-red-500">{errors.new_password.message}</p>}

                {/* Password Strength Meter */}
                {newPassword.length > 0 && (
                  <div className="mt-2">
                    <div className="password-strength-meter flex gap-1">
                      {[0, 1, 2, 3, 4].map(i => (
                        <div
                          key={i}
                          className={`h-full flex-1 rounded-full ${
                            i < passedCount
                              ? passedCount <= 2 ? 'bg-red-400' : passedCount <= 3 ? 'bg-amber-400' : 'bg-primary'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-[11px] font-semibold mt-1 ${
                      passedCount <= 2 ? 'text-red-500' : passedCount <= 3 ? 'text-amber-500' : 'text-primary'
                    }`}>
                      {passedCount <= 2 ? 'Weak password' : passedCount <= 3 ? 'Fair password' : passedCount === 4 ? 'Good password' : 'Strong password'}
                    </p>
                    <div className="mt-2 space-y-1">
                      {strengthChecks.map((check, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`material-icons text-sm ${check.pass ? 'text-emerald-500' : 'text-slate-300'}`}>
                            {check.pass ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <span className={check.pass ? 'text-emerald-600' : 'text-slate-500'}>{check.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Confirm New Password</label>
                <div className="relative">
                  <input
                    {...register('confirm_password')}
                    type={showConfirm ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Re-enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-icons text-lg">{showConfirm ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {errors.confirm_password && <p className="text-xs text-red-500">{errors.confirm_password.message}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowChangePassword(false); reset(); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors disabled:opacity-50 active:scale-95"
                >
                  {isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper component
const InfoRow: React.FC<{ icon: string; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-4">
    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </div>
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  </div>
);

export default Profile;
