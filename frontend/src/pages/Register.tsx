import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { patientSchema, PatientFormData } from '../utils/validation';
import { patientService } from '../services/patientService';
import {
  TITLE_OPTIONS,
  GENDER_OPTIONS,
  BLOOD_GROUP_OPTIONS,
  COUNTRIES,
  COUNTRY_CODE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  getStatesForCountry,
  getPostalCodeLabel,
  getPhoneCodeForCountry,
  STATE_COUNTRY_MAP,
} from '../utils/constants';
import { ArrowLeft, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      country_code: '+91',
      emergency_contact_country_code: '+91',
      country: 'India',
    },
  });

  const selectedState = watch('state');
  const selectedCountry = watch('country');

  // Get states for the selected country
  const availableStates = selectedCountry ? getStatesForCountry(selectedCountry) : [];
  const postalCodeLabel = selectedCountry ? getPostalCodeLabel(selectedCountry) : 'Postal Code';

  // Auto-populate country when state changes (reverse lookup)
  React.useEffect(() => {
    if (selectedState && STATE_COUNTRY_MAP[selectedState]) {
      const mappedCountry = STATE_COUNTRY_MAP[selectedState];
      if (mappedCountry !== selectedCountry) {
        setValue('country', mappedCountry);
      }
    }
  }, [selectedState, setValue, selectedCountry]);

  // Auto-update phone country code when country changes
  React.useEffect(() => {
    if (selectedCountry) {
      const phoneCode = getPhoneCodeForCountry(selectedCountry);
      if (phoneCode) {
        setValue('country_code', phoneCode);
      }
    }
  }, [selectedCountry, setValue]);

  const onSubmit = async (data: PatientFormData) => {
    setError('');
    setIsLoading(true);

    try {
      // Clean up empty strings to undefined for optional fields
      const cleanedData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value === '' ? undefined : value])
      );
      await patientService.createPatient(cleanedData as any);
      setSuccess(true);
      reset();

      setTimeout(() => {
        navigate('/patients');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-2';

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center text-primary-600 hover:text-primary-700 mb-6"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        Back to Dashboard
      </button>

      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center mb-8">
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mr-4">
            <UserPlus className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patient Registration</h1>
            <p className="text-gray-600">Enter patient details below. PRN will be auto-generated.</p>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3" />
            <p className="text-sm text-green-800">Patient registered successfully! Redirecting...</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Personal Details */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Personal Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              {/* Title */}
              <div className="md:col-span-1">
                <label className={labelClass}>
                  Title <span className="text-red-500">*</span>
                </label>
                <select {...register('title')} className={inputClass}>
                  <option value="">Select</option>
                  {TITLE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                )}
              </div>

              {/* First Name */}
              <div className="md:col-span-2">
                <label className={labelClass}>
                  First Name <span className="text-red-500">*</span>
                </label>
                <input {...register('first_name')} className={inputClass} placeholder="First name" />
                {errors.first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>

              {/* Last Name */}
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input {...register('last_name')} className={inputClass} placeholder="Last name" />
                {errors.last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>

              {/* Gender */}
              <div className="md:col-span-1">
                <label className={labelClass}>
                  Gender <span className="text-red-500">*</span>
                </label>
                <select {...register('gender')} className={inputClass}>
                  <option value="">Select</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {errors.gender && (
                  <p className="mt-1 text-sm text-red-600">{errors.gender.message}</p>
                )}
              </div>

              {/* Date of Birth */}
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input {...register('date_of_birth')} type="date" className={inputClass} />
                {errors.date_of_birth && (
                  <p className="mt-1 text-sm text-red-600">{errors.date_of_birth.message}</p>
                )}
              </div>

              {/* Blood Group */}
              <div className="md:col-span-2">
                <label className={labelClass}>Blood Group</label>
                <select {...register('blood_group')} className={inputClass}>
                  <option value="">Select blood group</option>
                  {BLOOD_GROUP_OPTIONS.map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
                {errors.blood_group && (
                  <p className="mt-1 text-sm text-red-600">{errors.blood_group.message}</p>
                )}
              </div>

              {/* Email */}
              <div className="md:col-span-2">
                <label className={labelClass}>Email</label>
                <input
                  {...register('email')}
                  type="email"
                  className={inputClass}
                  placeholder="email@example.com"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Contact Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              {/* Country Code */}
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Country Code <span className="text-red-500">*</span>
                </label>
                <select {...register('country_code')} className={inputClass}>
                  {COUNTRY_CODE_OPTIONS.map((cc) => (
                    <option key={cc.code} value={cc.code}>{cc.label}</option>
                  ))}
                </select>
                {errors.country_code && (
                  <p className="mt-1 text-sm text-red-600">{errors.country_code.message}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div className="md:col-span-4">
                <label className={labelClass}>
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('mobile_number')}
                  type="tel"
                  className={inputClass}
                  placeholder="9876543210"
                />
                {errors.mobile_number && (
                  <p className="mt-1 text-sm text-red-600">{errors.mobile_number.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Address
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              <div className="md:col-span-6">
                <label className={labelClass}>
                  Address Line 1 <span className="text-red-500">*</span>
                </label>
                <input {...register('address_line1')} className={inputClass} placeholder="Street address" />
                {errors.address_line1 && (
                  <p className="mt-1 text-sm text-red-600">{errors.address_line1.message}</p>
                )}
              </div>

              <div className="md:col-span-6">
                <label className={labelClass}>Address Line 2</label>
                <input
                  {...register('address_line2')}
                  className={inputClass}
                  placeholder="Apartment, suite, etc."
                />
              </div>

              {/* State - filtered by country */}
              <div className="md:col-span-2">
                <label className={labelClass}>State / Province</label>
                {availableStates.length > 0 ? (
                  <select {...register('state')} className={inputClass}>
                    <option value="">Select state</option>
                    {availableStates.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input {...register('state')} className={inputClass} placeholder="State / Province" />
                )}
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>City</label>
                <input {...register('city')} className={inputClass} placeholder="City" />
              </div>

              <div className="md:col-span-1">
                <label className={labelClass}>{postalCodeLabel}</label>
                <input {...register('pin_code')} className={inputClass} placeholder="Postal code" />
                {errors.pin_code && (
                  <p className="mt-1 text-sm text-red-600">{errors.pin_code.message}</p>
                )}
              </div>

              {/* Country - auto-populated from state, also manually selectable */}
              <div className="md:col-span-1">
                <label className={labelClass}>Country</label>
                <select {...register('country')} className={inputClass}>
                  <option value="">Select</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              Emergency Contact
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              <div className="md:col-span-3">
                <label className={labelClass}>Contact Name</label>
                <input
                  {...register('emergency_contact_name')}
                  className={inputClass}
                  placeholder="Emergency contact name"
                />
              </div>

              <div className="md:col-span-3">
                <label className={labelClass}>Relationship</label>
                <select {...register('emergency_contact_relationship')} className={inputClass}>
                  <option value="">Select relationship</option>
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {errors.emergency_contact_relationship && (
                  <p className="mt-1 text-sm text-red-600">{errors.emergency_contact_relationship.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Country Code</label>
                <select {...register('emergency_contact_country_code')} className={inputClass}>
                  {COUNTRY_CODE_OPTIONS.map((cc) => (
                    <option key={cc.code} value={cc.code}>{cc.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className={labelClass}>Contact Mobile</label>
                <input
                  {...register('emergency_contact_mobile')}
                  type="tel"
                  className={inputClass}
                  placeholder="9876543210"
                />
                {errors.emergency_contact_mobile && (
                  <p className="mt-1 text-sm text-red-600">{errors.emergency_contact_mobile.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4 pt-6 border-t">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
