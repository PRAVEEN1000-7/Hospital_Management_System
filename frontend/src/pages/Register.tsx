import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientSchema, type PatientFormData } from '../utils/validation';
import {
  TITLE_OPTIONS, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS,
  RELATIONSHIP_OPTIONS, COUNTRIES, STATE_COUNTRY_MAP,
  getStatesForCountry, getPostalLabel, getPhoneCode
} from '../utils/constants';
import patientService from '../services/patientService';
import { useToast } from '../contexts/ToastContext';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      country_code: '+91',
      country: 'India',
      emergency_contact_country_code: '+91',
    },
  });

  const watchCountry = watch('country');
  const watchState = watch('state');

  useEffect(() => {
    if (watchState && STATE_COUNTRY_MAP[watchState]) {
      const mappedCountry = STATE_COUNTRY_MAP[watchState];
      if (mappedCountry !== watchCountry) {
        setValue('country', mappedCountry);
      }
    }
  }, [watchState, watchCountry, setValue]);

  useEffect(() => {
    if (watchCountry) {
      const phoneCode = getPhoneCode(watchCountry);
      setValue('country_code', phoneCode);
    }
  }, [watchCountry, setValue]);

  const states = getStatesForCountry(watchCountry || 'India');
  const postalLabel = getPostalLabel(watchCountry || 'India');

  const onSubmit = async (data: PatientFormData) => {
    try {
      const result = await patientService.createPatient(data);
      toast.success(`Patient registered successfully! PRN: ${result.prn}`);
      setTimeout(() => navigate('/patients'), 2000);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string | Array<{ msg: string }> } } };
      const detail = axiosError.response?.data?.detail;
      if (Array.isArray(detail)) {
        toast.error(detail.map((d) => d.msg).join(', '));
      } else {
        toast.error(detail || 'Failed to register patient');
      }
    }
  };

  const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200';
  const selectClass = 'w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer';
  const labelClass = 'text-sm font-medium text-slate-700 mb-1.5 block';
  const errorClass = 'mt-1 text-xs text-red-500';

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <span className="material-icons">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">person_add</span>
              Patient Registration
            </h1>
            <p className="text-slate-500 text-sm">Fill in the patient details to create a new record.</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Section 1: Personal Details */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Title <span className="text-red-500">*</span></label>
              <select {...register('title')} className={selectClass}>
                <option value="">Select title</option>
                {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {errors.title && <p className={errorClass}>{errors.title.message}</p>}
            </div>
            <div>
              <label className={labelClass}>First Name <span className="text-red-500">*</span></label>
              <input {...register('first_name')} className={inputClass} placeholder="First name" />
              {errors.first_name && <p className={errorClass}>{errors.first_name.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Last Name <span className="text-red-500">*</span></label>
              <input {...register('last_name')} className={inputClass} placeholder="Last name" />
              {errors.last_name && <p className={errorClass}>{errors.last_name.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Gender <span className="text-red-500">*</span></label>
              <select {...register('gender')} className={selectClass}>
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {errors.gender && <p className={errorClass}>{errors.gender.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Date of Birth <span className="text-red-500">*</span></label>
              <input {...register('date_of_birth')} type="date" className={inputClass} />
              {errors.date_of_birth && <p className={errorClass}>{errors.date_of_birth.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Blood Group <span className="text-red-500">*</span></label>
              <select {...register('blood_group')} className={selectClass}>
                <option value="">Select blood group</option>
                {BLOOD_GROUP_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              {errors.blood_group && <p className={errorClass}>{errors.blood_group.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input {...register('email')} type="email" className={inputClass} placeholder="patient@example.com" />
              {errors.email && <p className={errorClass}>{errors.email.message}</p>}
            </div>
          </div>
        </div>

        {/* Section 2: Contact Details */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Contact Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Country Code <span className="text-red-500">*</span></label>
              <select {...register('country_code')} className={selectClass}>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.phoneCode}>
                    {c.phoneCode} ({c.name})
                  </option>
                ))}
              </select>
              {errors.country_code && <p className={errorClass}>{errors.country_code.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Mobile Number <span className="text-red-500">*</span></label>
              <input {...register('mobile_number')} type="tel" className={inputClass} placeholder="9876543210" />
              {errors.mobile_number && <p className={errorClass}>{errors.mobile_number.message}</p>}
            </div>
          </div>
        </div>

        {/* Section 3: Address */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Address</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}>Address Line 1 <span className="text-red-500">*</span></label>
              <input {...register('address_line1')} className={inputClass} placeholder="Street address" />
              {errors.address_line1 && <p className={errorClass}>{errors.address_line1.message}</p>}
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}>Address Line 2</label>
              <input {...register('address_line2')} className={inputClass} placeholder="Apartment, suite, etc." />
            </div>
            <div>
              <label className={labelClass}>State / Province</label>
              {states.length > 0 ? (
                <select {...register('state')} className={selectClass}>
                  <option value="">Select state</option>
                  {states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input {...register('state')} className={inputClass} placeholder="State or province" />
              )}
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input {...register('city')} className={inputClass} placeholder="City" />
            </div>
            <div>
              <label className={labelClass}>{postalLabel}</label>
              <input {...register('pin_code')} className={inputClass} placeholder={postalLabel} />
              {errors.pin_code && <p className={errorClass}>{errors.pin_code.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <select {...register('country')} className={selectClass}>
                {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Emergency Contact */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-[2px] bg-amber-400/40 rounded-full"></span>
            <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wider">Emergency Contact</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Contact Name</label>
              <input {...register('emergency_contact_name')} className={inputClass} placeholder="Emergency contact name" />
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              <select {...register('emergency_contact_relationship')} className={selectClass}>
                <option value="">Select relationship</option>
                {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Country Code</label>
              <select {...register('emergency_contact_country_code')} className={selectClass}>
                <option value="">Select code</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.phoneCode}>{c.phoneCode} ({c.name})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Contact Mobile</label>
              <input {...register('emergency_contact_mobile')} type="tel" className={inputClass} placeholder="Emergency contact number" />
              {errors.emergency_contact_mobile && <p className={errorClass}>{errors.emergency_contact_mobile.message}</p>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-all flex items-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Registering...
              </>
            ) : (
              <>
                <span className="material-icons text-lg">person_add</span>
                Register Patient
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Register;
