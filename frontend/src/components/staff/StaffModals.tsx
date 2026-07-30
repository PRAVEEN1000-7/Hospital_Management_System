import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolverV4 } from '../../utils/zodResolverV4';
import { z } from 'zod';
import userService from '../../services/userService';
import doctorService from '../../services/doctorService';
import employeeService from '../../services/employeeService';
import api from '../../services/api';
import type { UserData, UserCreateData, UserUpdateData } from '../../types/user';
import type { EmployeeProfile, EmploymentType } from '../../types/employee';
import { ROLE_LABELS, COUNTRIES } from '../../utils/constants';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import feLogger from '../../services/loggerService';
import ImageCropModal from '../common/ImageCropModal';

// ────────────────────────────────────────
// Shared schemas — single source of truth for both Staff Directory and
// User Management, so "Add Staff" / "Add User" and their Edit screens can
// never ask a different set of questions again.
// ────────────────────────────────────────
const staffCreateSchema = z.object({
  first_name: z.string()
    .min(1, 'First name is required')
    .max(100, 'Max 100 characters')
    .regex(/^[A-Za-z]+$/, 'Only letters (A–Z) allowed — no numbers, spaces or symbols'),
  last_name: z.string()
    .min(3, 'Last name must be more than 2 letters')
    .max(100, 'Max 100 characters')
    .regex(/^[A-Za-z]+$/, 'Only letters (A–Z) allowed — no numbers, spaces or symbols'),
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
  registration_authority: z.string().optional(),
  experience_years: z.union([z.string(), z.number()]).optional(),
  consultation_fee: z.union([z.string(), z.number()]).optional(),
  follow_up_fee: z.union([z.string(), z.number()]).optional(),
  bio: z.string().optional(),
  department_id: z.string().optional(),
  analytics_enabled: z.boolean().optional(),
  // Employee Details (Workforce Management) — optional, applies to any role,
  // gated on the employee_management module being enabled rather than role.
  designation: z.string().optional(),
  employment_type: z.string().optional(),
  date_of_joining: z.string().optional(),
  paid_leave_entitlement: z.union([z.string(), z.number()]).optional(),
  bank_account_holder_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_branch: z.string().optional(),
  pf_number: z.string().optional(),
  pan_number: z.string().optional(),
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

// Edit intentionally excludes registration_authority / experience_years / bio /
// department_id — the backend's UserUpdate schema doesn't accept them (they're
// create-only fields), so asking for them here would silently do nothing.
const staffEditSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  first_name: z.string().min(1, 'Required').max(100).regex(/^[A-Za-z]+$/, 'Only letters (A–Z) allowed'),
  // Not the stricter >2-letter rule from staffCreateSchema (Bug #39) — this
  // form resends the full record, so keeping it here would lock an existing
  // short-surnamed staff member out of ever being edited again.
  last_name: z.string().min(1, 'Required').max(100).regex(/^[A-Za-z]+$/, 'Only letters (A–Z) allowed'),
  // Not the strict 10-digit rule from staffCreateSchema (same reasoning as
  // last_name above) — some existing staff have a phone number stored with
  // a country-code prefix from before this rule existed; this form resends
  // it unchanged, so enforcing it here would lock them out of every edit.
  phone_number: z.string().optional(),
  country_code: z.string().optional(),
  role: z.string().min(1, 'Required'),
  is_active: z.boolean(),
  specialization: z.string().optional(),
  qualification: z.string().optional(),
  registration_number: z.string().optional(),
  consultation_fee: z.union([z.string(), z.number()]).optional(),
  follow_up_fee: z.union([z.string(), z.number()]).optional(),
  analytics_enabled: z.boolean().optional(),
  // Employee Details — goes through a separate employee_profiles API, not
  // UserUpdate, so (unlike the doctor-only fields above) there's no backend
  // reason to exclude any of these from the edit form.
  department_id: z.string().optional(),
  designation: z.string().optional(),
  employment_type: z.string().optional(),
  date_of_joining: z.string().optional(),
  paid_leave_entitlement: z.union([z.string(), z.number()]).optional(),
  bank_account_holder_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_branch: z.string().optional(),
  pf_number: z.string().optional(),
  pan_number: z.string().optional(),
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

// ────────────────────────────────────────
// Roles — the full set the backend recognizes (schemas/user.py VALID_ROLES).
// Every screen that assigns a role must apply both gates below, or a role
// that requires a disabled module (or super_admin itself) becomes assignable
// from one screen but not the other, like Staff Directory vs User Management
// used to disagree on.
// ────────────────────────────────────────
// 'staff' deliberately excluded (BUG-11): the generic role granted nothing
// beyond Dashboard and confused admins about what it was for. Existing users
// holding it keep working — it just can't be assigned to anyone new.
const ALL_ROLES = [
  'super_admin', 'admin', 'doctor', 'visiting_doctor', 'nurse', 'receptionist',
  'pharmacist', 'optical_staff', 'lab_technician', 'cashier', 'inventory_manager',
  'report_viewer', 'hr_manager',
] as const;

const ROLE_MODULE_REQUIREMENTS: Partial<Record<string, string[]>> = {
  pharmacist:        ['pharmacy'],
  cashier:           ['billing'],
  inventory_manager: ['inventory'],
  optical_staff:     ['optical'],
  lab_technician:    ['lab'],
  report_viewer:     ['analytics'],
  hr_manager:        ['employee_management'],
  // doctor, nurse, receptionist, admin — rely on CORE modules only, always available
};

/** Roles assignable by the current user: module-gated, and super_admin reserved for super_admins. */
export function useAssignableRoles(): string[] {
  const { isModuleEnabled, user } = useAuth();
  const currentUserRoles = user?.roles || [];
  return ALL_ROLES.filter(role => {
    if (role === 'super_admin' && !currentUserRoles.includes('super_admin')) return false;
    const required = ROLE_MODULE_REQUIREMENTS[role];
    if (!required) return true;
    return required.some(mod => isModuleEnabled(mod));
  });
}

/** CSS class for error state on input/select */
export const inputErr = (err: any) => err ? 'input-field-error' : '';

const blockNonAlpha = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (!/^[A-Za-z]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
  }
};

// Blocks the decimal point and exponential-notation characters so whole-number
// fee fields can't end up with a fraction, whether typed or arrowed in.
const blockDecimal = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) {
    e.preventDefault();
  }
};

// Digits only for the phone field — letters/symbols can't even be typed,
// and maxLength on the input caps it at exactly 10.
const blockNonDigit = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
  }
};

// ────────────────────────────────────────
// Shared shell components
// ────────────────────────────────────────
export const Drawer: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
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

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
    <h3 className="text-sm font-bold text-primary uppercase tracking-wider">{children}</h3>
  </div>
);

/** Red borders are applied DIRECTLY on each input, not via cloneElement */
export const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
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

const getInitials = (name: string) => {
  if (!name) return '';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const PhotoUpload: React.FC<{
  preview: string;
  onChange: (file: File) => void;
  error: string;
  fallbackInitials: string;
  label: string;
}> = ({ preview, onChange, error, fallbackInitials, label }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('photo.jpg');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFileName(file.name);
    setCropSrc(URL.createObjectURL(file));
  };

  const closeCropper = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropped = (file: File) => {
    onChange(file);
    closeCropper();
  };

  return (
    <section className="flex flex-col items-center">
      <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
        {preview ? <img src={preview} alt="Profile" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-slate-400">{fallbackInitials}</span>}
      </div>
      <div className="mt-3 text-center">
        <p className="text-sm font-semibold text-slate-700 mb-1">Profile Photo</p>
        <p className="text-xs text-slate-500 mb-2">JPG or PNG. Max size 2MB.</p>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" onChange={handlePhotoChange} className="hidden" />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">{label}</button>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} fileName={cropFileName} onCancel={closeCropper} onCropped={handleCropped} />
      )}
    </section>
  );
};

const validatePhoto = (file: File): string => {
  // GIF was previously accepted here but the backend (user_service.save_user_photo,
  // used by both create-staff and edit-staff photo upload) only ever allowed
  // .jpg/.jpeg/.png — a GIF passed this check but then failed server-side
  // after the crop step, with no indication beforehand of why.
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!validTypes.includes(file.type)) return 'Please upload a JPG or PNG image';
  if (file.size > 2 * 1024 * 1024) return 'Image size must be less than 2MB';
  return '';
};

/** Doctor sub-fields shared by Create (full set) and Edit (backend-editable subset). */
const DoctorFields: React.FC<{
  register: any;
  errors: any;
  specializations: string[];
  variant: 'create' | 'edit';
  departments?: { id: string; name: string }[];
}> = ({ register, errors, specializations, variant, departments }) => (
  <div className={variant === 'create' ? 'space-y-4 mt-2 p-4 bg-blue-50/50 border border-blue-200 rounded-xl' : 'space-y-4'}>
    {variant === 'create' && (
      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
        <span className="material-icons text-sm">medical_services</span> Doctor Details
      </p>
    )}
    <div className="grid grid-cols-2 gap-4">
      <Field label={`Specialization${variant === 'create' ? ' *' : ''}`} error={errors.specialization?.message}>
        <select {...register('specialization')} className={`input-field ${inputErr(errors.specialization)}`}>
          <option value="">Select specialization</option>
          {specializations.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label={`Qualification${variant === 'create' ? ' *' : ''}`} error={errors.qualification?.message}>
        <input {...register('qualification')} className={`input-field ${inputErr(errors.qualification)}`} placeholder="e.g. MBBS, MD" />
      </Field>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <Field label={`Registration Number${variant === 'create' ? ' *' : ''}`} error={errors.registration_number?.message}>
        <input {...register('registration_number')} className={`input-field ${inputErr(errors.registration_number)}`} placeholder="e.g. MCI-12345" />
      </Field>
      {variant === 'create' ? (
        <Field label="License Number">
          <input {...register('registration_authority')} className="input-field" placeholder="e.g. LIC-98765" />
        </Field>
      ) : (
        <Field label="Consultation Fee (₹)" error={errors.consultation_fee?.message}>
          <input {...register('consultation_fee')} type="number" min="0" step="1" className="input-field" placeholder="e.g. 500" onKeyDown={blockDecimal} />
        </Field>
      )}
    </div>
    {variant === 'create' ? (
      <>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Experience (years)">
            <input {...register('experience_years')} type="number" min="0" className="input-field" placeholder="e.g. 10" />
          </Field>
          <Field label="Department">
            <select {...register('department_id')} className="input-field">
              <option value="">Select department</option>
              {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Consultation Fee (₹)">
            <input {...register('consultation_fee')} type="number" min="0" step="1" className="input-field" placeholder="e.g. 500" onKeyDown={blockDecimal} />
          </Field>
          <Field label="Follow-up Fee (₹)">
            <input {...register('follow_up_fee')} type="number" min="0" step="1" className="input-field" placeholder="e.g. 200" onKeyDown={blockDecimal} />
          </Field>
        </div>
        <Field label="Bio">
          <textarea {...register('bio')} className="input-field" rows={2} placeholder="Short professional bio..." />
        </Field>
      </>
    ) : (
      <Field label="Follow-up Fee (₹)" error={errors.follow_up_fee?.message}>
        <input {...register('follow_up_fee')} type="number" min="0" step="1" className="input-field" placeholder="e.g. 200" onKeyDown={blockDecimal} />
      </Field>
    )}
    {/* In-house vs guest doctor — gates the Analytics module (BUG-16). */}
    <label className="flex items-start gap-2.5 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer">
      <input {...register('analytics_enabled')} type="checkbox" className="mt-0.5 w-4 h-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/30" />
      <span>
        <span className="block text-sm font-medium text-slate-800">In-house doctor — allow Analytics access</span>
        <span className="block text-xs text-slate-500 mt-0.5">Untick for guest/visiting doctors; they won't see the Analytics dashboard.</span>
      </span>
    </label>
  </div>
);

/** Employee (HR) sub-fields — gated on the employee_management module being
 * enabled, not on role, since any staff member can be an "employee" (BRD:
 * "employee = an extension of users, applies to any staff member"). Shared
 * by Create and Edit; department_id is the same field DoctorFields uses so a
 * doctor who's also tracked as an employee doesn't get two department pickers. */
const EmployeeFields: React.FC<{
  register: any;
  errors: any;
  departments?: { id: string; name: string }[];
  showDepartment?: boolean;
}> = ({ register, errors, departments, showDepartment = true }) => (
  <div className="space-y-4 mt-2 p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl">
    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
      <span className="material-icons text-sm">badge</span> Employee Details
    </p>
    <div className="grid grid-cols-2 gap-4">
      <Field label="Designation">
        <input {...register('designation')} className="input-field" placeholder="e.g. Staff Nurse" />
      </Field>
      <Field label="Employment Type">
        <select {...register('employment_type')} className="input-field">
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contract">Contract</option>
        </select>
      </Field>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <Field label="Date of Joining">
        <input {...register('date_of_joining')} type="date" className="input-field" />
      </Field>
      {showDepartment && (
        <Field label="Department">
          <select {...register('department_id')} className="input-field">
            <option value="">Select department</option>
            {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      )}
    </div>
    <Field label="Paid Leave Entitlement (days/year)" error={errors.paid_leave_entitlement?.message}>
      <input {...register('paid_leave_entitlement')} type="number" min="0" className="input-field w-1/2" placeholder="e.g. 12" />
    </Field>
    <details className="group">
      <summary className="cursor-pointer text-xs font-semibold text-emerald-700 select-none">Bank &amp; Statutory Details (optional)</summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account Holder Name">
            <input {...register('bank_account_holder_name')} className="input-field" />
          </Field>
          <Field label="Account Number">
            <input {...register('bank_account_number')} className="input-field" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="IFSC Code">
            <input {...register('bank_ifsc')} className="input-field" />
          </Field>
          <Field label="Branch">
            <input {...register('bank_branch')} className="input-field" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="PF Number">
            <input {...register('pf_number')} className="input-field" />
          </Field>
          <Field label="PAN Number">
            <input {...register('pan_number')} className="input-field" />
          </Field>
        </div>
      </div>
    </details>
  </div>
);

// ────────────────────────────────────────
// Create Staff Modal
// ────────────────────────────────────────
export const CreateStaffModal: React.FC<{ onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ onClose, onSuccess, onError }) => {
  const toast = useToast();
  const { isModuleEnabled } = useAuth();
  const isEmployeeModuleEnabled = isModuleEnabled('employee_management');
  const availableRoles = useAssignableRoles();
  const [showPassword, setShowPassword] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailChecking, setEmailChecking] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);
  const passwordTriggerMounted = useRef(false);

  const { register, handleSubmit, watch, setValue, trigger, formState: { errors, isValid, isSubmitting } } = useForm<CreateFormData>({
    resolver: zodResolverV4(staffCreateSchema),
    mode: 'onTouched',
    defaultValues: { first_name: '', last_name: '', email: '', username: '', phone_number: '', country_code: '+91', role: '', password: '', confirm_password: '', auto_generate_password: false, specialization: '', qualification: '', registration_number: '', registration_authority: '', experience_years: '', consultation_fee: '', follow_up_fee: '', bio: '', department_id: '', analytics_enabled: true, designation: '', employment_type: 'full_time', date_of_joining: '', paid_leave_entitlement: '', bank_account_holder_name: '', bank_account_number: '', bank_ifsc: '', bank_branch: '', pf_number: '', pan_number: '' },
  });

  const email = watch('email', '');
  const password = watch('password', '');
  const firstName = watch('first_name', '');
  const lastName = watch('last_name', '');
  const autoGenPassword = watch('auto_generate_password', false);
  const selectedRole = watch('role', '');
  const username = watch('username', '');
  const isDoctorRole = selectedRole === 'doctor';

  useEffect(() => {
    if (!passwordTriggerMounted.current) {
      passwordTriggerMounted.current = true;
      return;
    }
    trigger(['password', 'confirm_password']);
  }, [autoGenPassword, trigger]);

  useEffect(() => {
    if (isDoctorRole) trigger(['specialization', 'qualification', 'registration_number']);
  }, [isDoctorRole, trigger]);

  useEffect(() => {
    if (isDoctorRole) {
      doctorService.getSpecializations().then(setSpecializations).catch(() => {
        setSpecializations([
          'Cardiology', 'Dermatology', 'ENT', 'General Medicine',
          'General Surgery', 'Gynecology', 'Neurology', 'Ophthalmology',
          'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
          'Radiology', 'Urology',
        ]);
      });
      api.get('/departments').then(res => setDepartments(res.data?.data || [])).catch(() => {});
    }
  }, [isDoctorRole]);

  // Auto-generate username in the hospital's standard template (BUG-04):
  // HospitalCode + First2(first name) + First2(last name) + _ + 3-digit
  // per-hospital sequence — the backend owns the sequence so two admins
  // creating staff at the same time can't mint the same number. Debounced,
  // and it always overwrites while typing names since the field is meant to
  // be template-driven (the admin can still hand-edit it afterwards).
  useEffect(() => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (fn.length < 2 || ln.length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const { username: suggested } = await userService.suggestUsername(fn, ln);
        setValue('username', suggested, { shouldValidate: true });
      } catch {
        // Fall back silently — the admin can type a username manually.
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [firstName, lastName, setValue]);

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

  // Debounced email uniqueness check against backend
  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('');
      return;
    }
    setEmailChecking(true);
    const timeout = setTimeout(async () => {
      try {
        const { exists } = await userService.checkEmail(email);
        setEmailError(exists ? 'This email is already registered' : '');
      } catch {
        // Silently fail — backend will validate on submit
      } finally {
        setEmailChecking(false);
      }
    }, 500);
    return () => { clearTimeout(timeout); setEmailChecking(false); };
  }, [email]);

  const fullName = `${firstName} ${lastName}`.trim();

  const strengthChecks = [
    { label: '8+ characters', pass: (password || '').length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password || '') },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password || '') },
    { label: 'Contains digit', pass: /[0-9]/.test(password || '') },
    { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password || '') },
  ];
  const passedCount = strengthChecks.filter(c => c.pass).length;

  const hasErrors = Object.keys(errors).length > 0;
  const isFormReady = isValid && !hasErrors && !usernameError && !usernameChecking && !emailError && !emailChecking;

  const handlePhotoChange = (file: File) => {
    setPhotoError('');
    const err = validatePhoto(file);
    if (err) { setPhotoError(err); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
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

  // Generate the password the moment auto-generate is switched on (and show it
  // in the field below) so the admin can actually read and copy it before
  // saving — previously it was generated invisibly at submit time and no one
  // ever saw what it was. Clear it when the toggle is turned back off.
  useEffect(() => {
    setPasswordCopied(false);
    setGeneratedPassword(autoGenPassword ? generatePassword() : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenPassword]);

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the admin can
      // still select the text manually; nothing to surface here.
    }
  };

  const onSubmit = async (data: CreateFormData) => {
    if (usernameError || emailError) return;
    setIsSaving(true);
    setSubmitError('');
    try {
      let finalPassword = data.password || '';
      // Use exactly the password shown in the field so what the admin copied is
      // what actually gets set (fall back to a fresh one only if somehow empty).
      if (data.auto_generate_password) finalPassword = generatedPassword || generatePassword();

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
        payload.registration_authority = data.registration_authority || undefined;
        payload.experience_years = data.experience_years ? Number(data.experience_years) : undefined;
        payload.consultation_fee = data.consultation_fee ? Math.round(Number(data.consultation_fee)) : undefined;
        payload.follow_up_fee = data.follow_up_fee ? Math.round(Number(data.follow_up_fee)) : undefined;
        payload.bio = data.bio || undefined;
        payload.department_id = data.department_id || undefined;
        payload.analytics_enabled = data.analytics_enabled ?? true;
      }

      const createdUser = await userService.createUser(payload, false);
      feLogger.info('staff_create', `Staff member created: ${data.username} (role=${data.role})`);

      if (photoFile && createdUser.id) {
        try { await userService.uploadPhoto(createdUser.id, photoFile); }
        catch { toast.error('User created but photo upload failed'); }
      }

      // Employee profile is a separate 1:1 resource, created via its own
      // endpoint after the user exists — a failure here must not roll back
      // the already-created user (same non-blocking pattern as photo upload).
      if (isEmployeeModuleEnabled && createdUser.id) {
        try {
          await employeeService.create({
            user_id: createdUser.id,
            designation: data.designation || undefined,
            employment_type: (data.employment_type as EmploymentType) || 'full_time',
            date_of_joining: data.date_of_joining || undefined,
            department_id: !isDoctorRole ? (data.department_id || undefined) : undefined,
            paid_leave_entitlement: data.paid_leave_entitlement ? Number(data.paid_leave_entitlement) : undefined,
            bank_account_holder_name: data.bank_account_holder_name || undefined,
            bank_account_number: data.bank_account_number || undefined,
            bank_ifsc: data.bank_ifsc || undefined,
            bank_branch: data.bank_branch || undefined,
            pf_number: data.pf_number || undefined,
            pan_number: data.pan_number || undefined,
          });
        } catch { toast.error('Staff created, but saving employee details failed'); }
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
        {submitError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <span className="material-icons text-red-500 text-lg mt-0.5">cloud_off</span>
            <div>
              <p className="text-sm font-semibold text-red-700">Server Error</p>
              <p className="text-xs text-red-600 mt-0.5">{submitError}</p>
            </div>
          </div>
        )}

        <PhotoUpload preview={photoPreview} onChange={handlePhotoChange} error={photoError} fallbackInitials={getInitials(fullName)} label="CHANGE PHOTO" />

        <section className="space-y-4">
          <SectionTitle>Personal Information</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name *" error={errors.first_name?.message}>
              <input {...register('first_name')} className={`input-field ${inputErr(errors.first_name)}`} placeholder="e.g. Sarah" autoFocus onKeyDown={blockNonAlpha} />
            </Field>
            <Field label="Last Name *" error={errors.last_name?.message}>
              <input {...register('last_name')} className={`input-field ${inputErr(errors.last_name)}`} placeholder="e.g. Jenkins" onKeyDown={blockNonAlpha} />
            </Field>
          </div>
          <Field label="Email Address *" error={errors.email?.message || emailError}>
            <input {...register('email')} type="email" className={`input-field ${inputErr(errors.email || emailError)}`} placeholder="sarah.j@hospital.com" />
            {emailChecking && <p className="text-xs text-blue-500 mt-1 flex items-center gap-1"><span className="material-icons text-xs animate-spin">sync</span>Checking availability...</p>}
            {!emailChecking && !errors.email && !emailError && email.includes('@') && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><span className="material-icons text-xs">check_circle</span>Email available</p>}
          </Field>
          <Field label="Username (for login) *" error={errors.username?.message || usernameError}>
            <input {...register('username')} className={`input-field ${inputErr(errors.username || usernameError)}`} placeholder="Auto-generated from name (e.g. besasa_001)" />
            {usernameChecking && <p className="text-xs text-blue-500 mt-1 flex items-center gap-1"><span className="material-icons text-xs animate-spin">sync</span>Checking availability...</p>}
            {!usernameChecking && !errors.username && !usernameError && username.length >= 3 && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><span className="material-icons text-xs">check_circle</span>Username available</p>}
          </Field>
          <Field label="Phone Number" error={errors.phone_number?.message}>
            <div className="flex gap-2">
              <select {...register('country_code')} className="input-field w-28">
                {COUNTRIES.map(c => <option key={c.code} value={c.phoneCode}>{c.phoneCode}</option>)}
              </select>
              <input {...register('phone_number')} type="tel" inputMode="numeric" maxLength={10} onKeyDown={blockNonDigit} className={`input-field flex-1 ${inputErr(errors.phone_number)}`} placeholder="1234567890" />
            </div>
          </Field>
        </section>

        <section className="space-y-4">
          <SectionTitle>Professional Info</SectionTitle>
          <Field label="System Role (Job Function) *" error={errors.role?.message}>
            <select {...register('role')} className={`input-field ${inputErr(errors.role)}`}>
              <option value="">Select role</option>
              {availableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
          </Field>
          {isDoctorRole && (
            <DoctorFields register={register} errors={errors} specializations={specializations} variant="create" departments={departments} />
          )}
          {isEmployeeModuleEnabled && (
            <EmployeeFields register={register} errors={errors} departments={departments} showDepartment={!isDoctorRole} />
          )}
        </section>

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
          {autoGenPassword && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Generated Password</p>
                <button
                  type="button"
                  onClick={() => { setGeneratedPassword(generatePassword()); setPasswordCopied(false); }}
                  className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1"
                >
                  <span className="material-icons text-sm">refresh</span> Regenerate
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={generatedPassword}
                  onFocus={e => e.target.select()}
                  className="input-field flex-1 font-mono text-sm bg-white"
                />
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="px-3 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <span className="material-icons text-sm">{passwordCopied ? 'check' : 'content_copy'}</span>
                  {passwordCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Copy this and share it with the staff member — it won't be shown again after saving.
              </p>
            </div>
          )}
          {!autoGenPassword && (
            <>
              <Field label="Password *">
                <div className="relative">
                  <input {...register('password')} type={showPassword ? 'text' : 'password'} className="input-field pr-10" placeholder="••••••••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <span className="material-icons text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {(password || '').length > 0 ? (
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
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Min 8 chars · uppercase · lowercase · number · special char</p>
                )}
              </Field>
              <Field label="Confirm Password *" error={errors.confirm_password?.message}>
                <input {...register('confirm_password')} type="password" className="input-field" placeholder="Re-enter password" />
              </Field>
            </>
          )}
        </section>

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
      </form>
    </Drawer>
  );
};

// ────────────────────────────────────────
// Edit Staff Modal
// ────────────────────────────────────────
export const EditStaffModal: React.FC<{ user: UserData; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ user, onClose, onSuccess, onError }) => {
  const toast = useToast();
  const { isModuleEnabled } = useAuth();
  const isEmployeeModuleEnabled = isModuleEnabled('employee_management');
  const availableRoles = useAssignableRoles();
  const [photoPreview, setPhotoPreview] = useState<string>(user.avatar_url ? userService.getPhotoUrl(user.avatar_url) || '' : '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [employeeProfile, setEmployeeProfile] = useState<EmployeeProfile | null>(null);

  const { register, handleSubmit, watch, reset, getValues, formState: { errors, isSubmitting, isValid } } = useForm<EditFormData>({
    resolver: zodResolverV4(staffEditSchema),
    mode: 'onTouched',
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
      consultation_fee: user.consultation_fee ?? '',
      follow_up_fee: user.follow_up_fee ?? '',
      analytics_enabled: user.analytics_enabled ?? true,
      designation: '',
      employment_type: 'full_time',
      date_of_joining: '',
      department_id: '',
      paid_leave_entitlement: '',
      bank_account_holder_name: '',
      bank_account_number: '',
      bank_ifsc: '',
      bank_branch: '',
      pf_number: '',
      pan_number: '',
    },
  });

  useEffect(() => {
    doctorService.getSpecializations().then(setSpecializations).catch(() => {});
    if (isEmployeeModuleEnabled) {
      api.get('/departments').then(res => setDepartments(res.data?.data || [])).catch(() => {});
      employeeService.getByUserId(user.id).then(profile => {
        setEmployeeProfile(profile);
        if (profile) {
          reset({
            ...getValues(),
            designation: profile.designation || '',
            employment_type: profile.employment_type || 'full_time',
            date_of_joining: profile.date_of_joining || '',
            department_id: profile.department_id || '',
            paid_leave_entitlement: profile.paid_leave_entitlement ?? '',
            bank_account_holder_name: profile.bank_account_holder_name || '',
            bank_account_number: profile.bank_account_number || '',
            bank_ifsc: profile.bank_ifsc || '',
            bank_branch: profile.bank_branch || '',
            pf_number: profile.pf_number || '',
            pan_number: profile.pan_number || '',
          });
        }
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = watch('first_name', user.first_name || '');
  const lastName = watch('last_name', user.last_name || '');
  const fullName = `${firstName} ${lastName}`.trim();
  const selectedRole = watch('role');

  const handlePhotoChange = (file: File) => {
    setPhotoError('');
    const err = validatePhoto(file);
    if (err) { setPhotoError(err); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onSubmit = async (data: EditFormData) => {
    try {
      const payload: UserUpdateData = {
        email: data.email, first_name: data.first_name, last_name: data.last_name,
        phone_number: data.phone_number, role: data.role, is_active: data.is_active,
      };
      if (data.role === 'doctor') {
        payload.specialization = data.specialization;
        payload.qualification = data.qualification;
        payload.registration_number = data.registration_number;
        payload.consultation_fee = data.consultation_fee !== '' && data.consultation_fee != null ? Math.round(Number(data.consultation_fee)) : undefined;
        payload.follow_up_fee = data.follow_up_fee !== '' && data.follow_up_fee != null ? Math.round(Number(data.follow_up_fee)) : undefined;
        payload.analytics_enabled = data.analytics_enabled ?? true;
      }
      feLogger.info('staff_edit', `Updating staff member: ${user.username}`);
      await userService.updateUser(user.id, payload);
      if (photoFile) {
        try { await userService.uploadPhoto(user.id, photoFile); }
        catch { toast.warning('Staff updated, but photo upload failed.'); onSuccess(); return; }
      }

      // Employee profile is a separate 1:1 resource — upsert it after the
      // user update succeeds, same non-blocking pattern as photo upload.
      if (isEmployeeModuleEnabled) {
        const employeeData = {
          designation: data.designation || undefined,
          employment_type: (data.employment_type as EmploymentType) || 'full_time',
          date_of_joining: data.date_of_joining || undefined,
          department_id: data.department_id || undefined,
          paid_leave_entitlement: data.paid_leave_entitlement !== '' && data.paid_leave_entitlement != null ? Number(data.paid_leave_entitlement) : undefined,
          bank_account_holder_name: data.bank_account_holder_name || undefined,
          bank_account_number: data.bank_account_number || undefined,
          bank_ifsc: data.bank_ifsc || undefined,
          bank_branch: data.bank_branch || undefined,
          pf_number: data.pf_number || undefined,
          pan_number: data.pan_number || undefined,
        };
        try {
          if (employeeProfile) {
            await employeeService.update(employeeProfile.id, employeeData);
          } else {
            await employeeService.create({ user_id: user.id, ...employeeData });
          }
        } catch { toast.warning('Staff updated, but saving employee details failed.'); }
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
        <PhotoUpload preview={photoPreview} onChange={handlePhotoChange} error={photoError} fallbackInitials={getInitials(fullName)} label="CHANGE PHOTO" />

        <section className="space-y-4">
          <SectionTitle>Personal Information</SectionTitle>
          <Field label="Username">
            <input value={user.username} disabled className="input-field bg-slate-100 cursor-not-allowed" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" error={errors.first_name?.message}>
              <input {...register('first_name')} className={`input-field ${inputErr(errors.first_name)}`} placeholder="e.g. Sarah" onKeyDown={blockNonAlpha} />
            </Field>
            <Field label="Last Name" error={errors.last_name?.message}>
              <input {...register('last_name')} className={`input-field ${inputErr(errors.last_name)}`} placeholder="e.g. Jenkins" onKeyDown={blockNonAlpha} />
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
              <input {...register('phone_number')} type="tel" inputMode="numeric" maxLength={10} onKeyDown={blockNonDigit} className={`input-field flex-1 ${inputErr(errors.phone_number)}`} placeholder="1234567890" />
            </div>
          </Field>
        </section>

        <section className="space-y-4">
          <SectionTitle>Professional Info</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="System Role (Job Function)" error={errors.role?.message}>
              <select {...register('role')} className={`input-field ${inputErr(errors.role)}`}>
                {availableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </Field>
            <Field label="Reference #">
              <input value={user.reference_number || 'Not assigned'} disabled className="input-field bg-slate-100 cursor-not-allowed" />
              <p className="text-xs text-slate-500 mt-1">Auto-generated, cannot be changed</p>
            </Field>
          </div>
        </section>

        {selectedRole === 'doctor' && (
          <section className="space-y-4">
            <SectionTitle>Doctor Details</SectionTitle>
            <DoctorFields register={register} errors={errors} specializations={specializations} variant="edit" />
          </section>
        )}

        {isEmployeeModuleEnabled && (
          <section className="space-y-4">
            <SectionTitle>Employee Details</SectionTitle>
            <EmployeeFields register={register} errors={errors} departments={departments} />
          </section>
        )}

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
export const ResetPasswordModal: React.FC<{ user: UserData; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void }> = ({ user, onClose, onSuccess, onError }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting, isValid } } = useForm<ResetFormData>({
    resolver: zodResolverV4(resetPasswordSchema),
    mode: 'onTouched',
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
    <Drawer title={`Reset Password — ${user.roles?.includes('doctor') ? 'Dr. ' : ''}${user.first_name} ${user.last_name}`} onClose={onClose}>
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
