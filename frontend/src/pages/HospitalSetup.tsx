import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { COUNTRIES } from '../utils/constants';

// Types
interface HospitalData {
  id?: number;
  // Basic Details
  hospital_name: string;
  hospital_code: string;
  registration_number: string;
  established_date: string;
  hospital_type: string;
  facility_admin_name: string;
  facility_admin_phone: string;
  nabh_accreditation: string;
  specialisation: string;
  // Contact
  primary_phone_country_code: string;
  primary_phone: string;
  secondary_phone_country_code: string;
  secondary_phone: string;
  email: string;
  website: string;
  emergency_hotline_country_code: string;
  emergency_hotline: string;
  // Address
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  establishment_location: string;
  // Facility Strength
  number_of_beds: number | string;
  staff_strength: number | string;
  // Legal & Tax (India-specific)
  gst_number: string;
  pan_number: string;
  drug_license_number: string;
  medical_registration_number: string;
  // Operations
  working_hours_start: string;
  working_hours_end: string;
  working_days: string[];
  emergency_24_7: boolean;
  // Metadata
  is_configured?: boolean;
}

const INITIAL_DATA: HospitalData = {
  hospital_name: 'HMS Core',
  hospital_code: '',
  registration_number: '',
  established_date: '',
  hospital_type: '',
  facility_admin_name: '',
  facility_admin_phone: '',
  nabh_accreditation: '',
  specialisation: '',
  primary_phone_country_code: '+91',
  primary_phone: '',
  secondary_phone_country_code: '+91',
  secondary_phone: '',
  email: '',
  website: '',
  emergency_hotline_country_code: '+91',
  emergency_hotline: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  country: 'India',
  pin_code: '',
  establishment_location: '',
  number_of_beds: '',
  staff_strength: '',
  gst_number: '',
  pan_number: '',
  drug_license_number: '',
  medical_registration_number: '',
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  emergency_24_7: false,
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const STEPS = ['Basic Details', 'Facility Information', 'Verification'];

const PRACTICE_TYPES = [
  'General Hospital',
  'Multi-Speciality Hospital',
  'Single Speciality Hospital',
  'Clinic',
  'Nursing Home',
  'Diagnostic Center',
  'Polyclinic',
  'Day Care Center',
  'Dental Clinic',
  'Eye Hospital',
  'Maternity Hospital',
  'Ayurveda Hospital',
  'Homeopathy Hospital',
];

const SPECIALISATIONS = [
  'General Medicine',
  'Cardiology',
  'Orthopedics',
  'Neurology',
  'Oncology',
  'Pediatrics',
  'Gynecology',
  'Dermatology',
  'Ophthalmology',
  'ENT',
  'Urology',
  'Nephrology',
  'Pulmonology',
  'Gastroenterology',
  'Psychiatry',
  'Dental',
  'Multi Speciality',
  'General Surgery',
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Form Components - Memoized to prevent unnecessary re-renders
const FormInput = React.memo<{
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  disabled?: boolean;
  helpText?: string;
  value: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}>(({ label, name, placeholder, required, type = 'text', disabled, helpText, value, onChange, error }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1.5">
      {label}{required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      name={name}
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all
        ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} ${disabled ? 'bg-slate-50 text-slate-500' : ''}`}
    />
    {helpText && <p className="text-xs text-slate-500 mt-1">{helpText}</p>}
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
));

const PhoneInput = React.memo<{
  label: string;
  countryCodeName: string;
  phoneName: string;
  required?: boolean;
  countryCodeValue: string;
  phoneValue: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  error?: string;
}>(({ label, countryCodeName, phoneName, required, countryCodeValue, phoneValue, onChange, error }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1.5">
      {label}{required && <span className="text-red-500">*</span>}
    </label>
    <div className="flex gap-2">
      <select
        name={countryCodeName}
        value={countryCodeValue || '+91'}
        onChange={onChange}
        className="w-28 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      >
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.phoneCode}>{c.phoneCode}</option>
        ))}
      </select>
      <input
        type="text"
        name={phoneName}
        value={phoneValue || ''}
        onChange={onChange}
        placeholder="1234567890"
        className={`flex-1 px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
          ${error ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
      />
    </div>
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
));

const FormSelect = React.memo<{
  label: string;
  name: string;
  options: string[];
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  error?: string;
}>(({ label, name, options, placeholder, required, value, onChange, error }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1.5">
      {label}{required && <span className="text-red-500">*</span>}
    </label>
    <select
      name={name}
      value={value || ''}
      onChange={onChange}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none bg-white
        ${error ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
    >
      <option value="">{placeholder || `-- Select ${label.toLowerCase()} --`}</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
));

const HospitalSetup: React.FC = () => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<HospitalData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Load existing hospital data
  useEffect(() => {
    loadHospitalData();
  }, []);

  const loadHospitalData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hospital/full');
      if (res.data) {
        const d = res.data;
        setFormData({
          ...INITIAL_DATA,
          ...d,
          working_hours_start: d.working_hours_start ? d.working_hours_start.substring(0, 5) : '09:00',
          working_hours_end: d.working_hours_end ? d.working_hours_end.substring(0, 5) : '18:00',
          established_date: d.established_date || '',
          number_of_beds: d.number_of_beds ?? '',
          staff_strength: d.staff_strength ?? '',
          hospital_code: d.hospital_code || '',
          registration_number: d.registration_number || '',
          facility_admin_name: d.facility_admin_name || '',
          facility_admin_phone: d.facility_admin_phone || '',
          nabh_accreditation: d.nabh_accreditation || '',
          specialisation: d.specialisation || '',
          establishment_location: d.establishment_location || '',
          secondary_phone: d.secondary_phone || '',
          secondary_phone_country_code: d.secondary_phone_country_code || '+91',
          website: d.website || '',
          gst_number: d.gst_number || '',
          pan_number: d.pan_number || '',
          drug_license_number: d.drug_license_number || '',
          medical_registration_number: d.medical_registration_number || '',
          emergency_hotline: d.emergency_hotline || '',
          emergency_hotline_country_code: d.emergency_hotline_country_code || '+91',
          address_line2: d.address_line2 || '',
          working_days: d.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        });
        setIsEditMode(true);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('Error loading hospital:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear error on change
    setErrors(prev => {
      if (prev[name]) {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      }
      return prev;
    });
  }, []);

  const handleWorkingDayToggle = (day: string) => {
    setFormData(prev => {
      const currentDays = prev.working_days || [];
      const isSelected = currentDays.includes(day);
      return {
        ...prev,
        working_days: isSelected
          ? currentDays.filter(d => d !== day)
          : [...currentDays, day]
      };
    });
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 0) {
      // Required fields
      if (!formData.hospital_name.trim()) newErrors.hospital_name = 'Hospital name is required';
      if (!formData.hospital_type) newErrors.hospital_type = 'Hospital type is required';
      if (!formData.specialisation) newErrors.specialisation = 'Specialisation is required';
      if (!formData.facility_admin_name.trim()) newErrors.facility_admin_name = 'Admin name is required';
      if (!formData.facility_admin_phone.trim()) newErrors.facility_admin_phone = 'Admin phone is required';
      if (!formData.primary_phone.trim()) newErrors.primary_phone = 'Phone number is required';
      if (!formData.email.trim()) newErrors.email = 'Email is required';
      if (!formData.address_line1.trim()) newErrors.address_line1 = 'Address is required';
      if (!formData.city.trim()) newErrors.city = 'City is required';
      if (!formData.state) newErrors.state = 'State is required';
      if (!formData.country.trim()) newErrors.country = 'Country is required';
      if (!formData.pin_code.trim()) newErrors.pin_code = 'PIN code is required';

      // Format validation
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Invalid email format';
      }
      if (formData.primary_phone && !/^\d{4,15}$/.test(formData.primary_phone)) {
        newErrors.primary_phone = 'Enter 4-15 digits only';
      }
      if (formData.secondary_phone && !/^\d{4,15}$/.test(formData.secondary_phone)) {
        newErrors.secondary_phone = 'Enter 4-15 digits only';
      }
    }

    if (step === 1) {
      if (!formData.number_of_beds && formData.number_of_beds !== 0) {
        newErrors.number_of_beds = 'Number of beds is required';
      }
      if (!formData.staff_strength && formData.staff_strength !== 0) {
        newErrors.staff_strength = 'Staff strength is required';
      }
      
      // India-specific validation
      if (formData.country === 'India') {
        if (formData.gst_number && formData.gst_number.length !== 15) {
          newErrors.gst_number = 'GST must be 15 characters';
        }
        if (formData.pan_number && formData.pan_number.length !== 10) {
          newErrors.pan_number = 'PAN must be 10 characters';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    setSaving(true);

    try {
      const payload: any = {
        hospital_name: formData.hospital_name,
        hospital_code: formData.hospital_code || null,
        registration_number: formData.registration_number || null,
        established_date: formData.established_date || null,
        hospital_type: formData.hospital_type,
        facility_admin_name: formData.facility_admin_name || null,
        facility_admin_phone: formData.facility_admin_phone || null,
        nabh_accreditation: formData.nabh_accreditation || null,
        specialisation: formData.specialisation || null,
        number_of_beds: formData.number_of_beds ? Number(formData.number_of_beds) : null,
        staff_strength: formData.staff_strength ? Number(formData.staff_strength) : null,
        establishment_location: formData.establishment_location || null,
        primary_phone_country_code: formData.primary_phone_country_code,
        primary_phone: formData.primary_phone,
        secondary_phone_country_code: formData.secondary_phone_country_code || null,
        secondary_phone: formData.secondary_phone || null,
        email: formData.email,
        website: formData.website || null,
        emergency_hotline_country_code: formData.emergency_hotline_country_code || null,
        emergency_hotline: formData.emergency_hotline || null,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2 || null,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        pin_code: formData.pin_code,
        gst_number: formData.gst_number || null,
        pan_number: formData.pan_number || null,
        drug_license_number: formData.drug_license_number || null,
        medical_registration_number: formData.medical_registration_number || null,
        working_hours_start: formData.working_hours_start ? formData.working_hours_start + ':00' : null,
        working_hours_end: formData.working_hours_end ? formData.working_hours_end + ':00' : null,
        working_days: formData.working_days,
        emergency_24_7: formData.emergency_24_7,
      };

      if (isEditMode) {
        await api.put('/hospital', payload);
        toast.success('Hospital details updated successfully!');
      } else {
        await api.post('/hospital', payload);
        setIsEditMode(true);
        toast.success('Hospital setup completed successfully!');
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save hospital details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Step tab
  const StepTab: React.FC<{ index: number; label: string }> = ({ index, label }) => {
    const isCompleted = index < currentStep;
    const isActive = index === currentStep;
    return (
      <button
        onClick={() => {
          if (isCompleted || index === currentStep) {
            if (index < currentStep || validateStep(currentStep)) {
              setCurrentStep(index);
            }
          }
        }}
        className={`flex-1 text-center pb-3 text-sm font-semibold border-b-2 transition-all
          ${isActive ? 'border-blue-600 text-blue-600' : isCompleted ? 'border-blue-400 text-blue-500' : 'border-slate-200 text-slate-400'}`}
      >
        {label}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-32">
        <div className="flex items-center gap-3 text-slate-500">
          <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading facility details...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Hospital Details</h1>
        <p className="text-slate-500 text-sm mt-1">
          {isEditMode ? 'Update your facility information' : 'Set up your facility for the first time'}
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Step Tabs */}
        <div className="flex border-b border-slate-100 px-6 pt-4">
          {STEPS.map((label, i) => (
            <StepTab key={label} index={i} label={label} />
          ))}
        </div>

        {/* Content Area */}
        <div className="flex min-h-[520px]">
          {/* Left: Illustration + Step Info */}
          {currentStep < 2 && (
            <div className="hidden lg:flex w-[380px] bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 flex-col items-center justify-center p-10 border-r border-slate-100">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold mb-6 shadow-lg shadow-blue-200">
                {currentStep + 1}
              </div>
              <h2 className="text-xl font-bold text-slate-800 text-center leading-snug mb-3">
                {currentStep === 0
                  ? 'Hey there, tell us a bit about your facility'
                  : "We'd love to know a bit about your Facility strength"}
              </h2>
              <div className="mt-6">
                <div className="w-48 h-48 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center shadow-inner">
                  <span className="material-symbols-outlined text-blue-400" style={{ fontSize: '80px' }}>
                    {currentStep === 0 ? 'apartment' : 'local_hospital'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Right: Form Fields */}
          <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
            {/* STEP 0: Basic Details */}
            {currentStep === 0 && (
              <div className="space-y-5 max-w-lg">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Hospital Information</h3>
                <FormInput label="Hospital Name" name="hospital_name" placeholder="e.g. Manipal Hospital" required value={formData.hospital_name} onChange={handleChange} error={errors.hospital_name} />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormInput label="Hospital Code" name="hospital_code" placeholder="e.g. MH-BLR-01" helpText="Short code for internal use" value={formData.hospital_code} onChange={handleChange} error={errors.hospital_code} />
                  <FormInput label="Registration Number" name="registration_number" placeholder="Registration no." value={formData.registration_number} onChange={handleChange} error={errors.registration_number} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormInput label="Established Date" name="established_date" type="date" value={formData.established_date} onChange={handleChange} error={errors.established_date} />
                  <FormSelect label="Hospital Type" name="hospital_type" options={PRACTICE_TYPES} placeholder="-- Select type --" required value={formData.hospital_type} onChange={handleChange} error={errors.hospital_type} />
                </div>

                <FormSelect label="Specialisation" name="specialisation" options={SPECIALISATIONS} placeholder="-- Select specialisation --" required value={formData.specialisation} onChange={handleChange} error={errors.specialisation} />
                <FormInput label="NABH Accreditation" name="nabh_accreditation" placeholder="e.g. NABH-12345" helpText="Optional certification" value={formData.nabh_accreditation} onChange={handleChange} error={errors.nabh_accreditation} />

                <hr className="border-slate-100 my-4" />
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Facility Admin Contact</h3>
                <FormInput label="Admin Name" name="facility_admin_name" placeholder="e.g. Rakesh Kumar" required value={formData.facility_admin_name} onChange={handleChange} error={errors.facility_admin_name} />
                <FormInput label="Admin Phone" name="facility_admin_phone" placeholder="e.g. 9991828388" required value={formData.facility_admin_phone} onChange={handleChange} error={errors.facility_admin_phone} />

                <hr className="border-slate-100 my-4" />
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Contact Information</h3>
                <PhoneInput label="Primary Phone" countryCodeName="primary_phone_country_code" phoneName="primary_phone" required countryCodeValue={formData.primary_phone_country_code} phoneValue={formData.primary_phone} onChange={handleChange} error={errors.primary_phone} />
                <PhoneInput label="Secondary Phone" countryCodeName="secondary_phone_country_code" phoneName="secondary_phone" countryCodeValue={formData.secondary_phone_country_code} phoneValue={formData.secondary_phone} onChange={handleChange} error={errors.secondary_phone} />
                <FormInput label="Email Address" name="email" placeholder="e.g. manipal@support.com" required type="email" value={formData.email} onChange={handleChange} error={errors.email} />
                <FormInput label="Website" name="website" placeholder="e.g. www.hospital.com" value={formData.website} onChange={handleChange} error={errors.website} />
                <PhoneInput label="Emergency Hotline" countryCodeName="emergency_hotline_country_code" phoneName="emergency_hotline" countryCodeValue={formData.emergency_hotline_country_code} phoneValue={formData.emergency_hotline} onChange={handleChange} error={errors.emergency_hotline} />

                <hr className="border-slate-100 my-4" />
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Address Details</h3>
                <FormInput label="Address Line 1" name="address_line1" placeholder="Street address" required value={formData.address_line1} onChange={handleChange} error={errors.address_line1} />
                <FormInput label="Address Line 2" name="address_line2" placeholder="Landmark, Area (optional)" value={formData.address_line2} onChange={handleChange} error={errors.address_line2} />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormInput label="City" name="city" placeholder="e.g. Bangalore" required value={formData.city} onChange={handleChange} error={errors.city} />
                  <FormSelect label="State" name="state" options={INDIAN_STATES} placeholder="-- Select state --" required value={formData.state} onChange={handleChange} error={errors.state} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormInput label="PIN Code" name="pin_code" placeholder="e.g. 560001" required value={formData.pin_code} onChange={handleChange} error={errors.pin_code} />
                  <FormInput label="Country" name="country" placeholder="e.g. India" required value={formData.country} onChange={handleChange} error={errors.country} />
                </div>

                <FormInput label="Establishment Location" name="establishment_location" placeholder="GPS coordinates or landmark" helpText="Optional location details" value={formData.establishment_location} onChange={handleChange} error={errors.establishment_location} />
              </div>
            )}

            {/* STEP 1: Facility Information */}
            {currentStep === 1 && (
              <div className="space-y-5 max-w-lg">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Facility Strength</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormInput label="Number of Beds" name="number_of_beds" placeholder="e.g. 50" required type="number" value={formData.number_of_beds} onChange={handleChange} error={errors.number_of_beds} />
                  <FormInput label="Staff Strength" name="staff_strength" placeholder="e.g. 100" required type="number" value={formData.staff_strength} onChange={handleChange} error={errors.staff_strength} />
                </div>

                <hr className="border-slate-100 my-4" />
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Operating Hours</h3>
                
                {/* Working Hours */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Working Hours<span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      name="working_hours_start"
                      value={formData.working_hours_start}
                      onChange={handleChange}
                      className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-slate-400 text-sm font-medium">to</span>
                    <input
                      type="time"
                      name="working_hours_end"
                      value={formData.working_hours_end}
                      onChange={handleChange}
                      className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* Working Days */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Working Days<span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleWorkingDayToggle(day)}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                          formData.working_days.includes(day)
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {day.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Select all days when the hospital operates</p>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    name="emergency_24_7"
                    checked={formData.emergency_24_7}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label className="text-sm text-slate-700 font-medium">24/7 Emergency Services Available</label>
                </div>

                {formData.country === 'India' && (
                  <>
                    <hr className="border-slate-100 my-4" />
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Legal & Tax Information (India)</h3>
                    <FormInput 
                      label="GST Number" 
                      name="gst_number" 
                      placeholder="e.g. 22AAAAA0000A1Z5" 
                      helpText="15 characters - Format: 22AAAAA0000A1Z5"
                      value={formData.gst_number}
                      onChange={handleChange}
                      error={errors.gst_number}
                    />
                    <FormInput 
                      label="PAN Number" 
                      name="pan_number" 
                      placeholder="e.g. ABCDE1234F" 
                      helpText="10 characters - Format: ABCDE1234F"
                      value={formData.pan_number}
                      onChange={handleChange}
                      error={errors.pan_number}
                    />
                    <FormInput label="Drug License Number" name="drug_license_number" placeholder="Drug license number" value={formData.drug_license_number} onChange={handleChange} error={errors.drug_license_number} />
                    <FormInput label="Medical Registration Number" name="medical_registration_number" placeholder="Medical registration number" value={formData.medical_registration_number} onChange={handleChange} error={errors.medical_registration_number} />
                  </>
                )}
              </div>
            )}

            {/* STEP 2: Verification / Review */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-blue-500">fact_check</span>
                  <h3 className="text-lg font-bold text-slate-800">Review & Confirm</h3>
                </div>
                <p className="text-sm text-slate-500">Please review all details before saving.</p>

                {/* Hospital Information */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Hospital Information</h4>
                    <button onClick={() => setCurrentStep(0)} className="text-blue-500 text-xs font-semibold hover:underline">Edit</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    <ReviewField label="Hospital Name" value={formData.hospital_name} />
                    <ReviewField label="Hospital Code" value={formData.hospital_code} />
                    <ReviewField label="Registration No." value={formData.registration_number} />
                    <ReviewField label="Established Date" value={formData.established_date} />
                    <ReviewField label="Hospital Type" value={formData.hospital_type} />
                    <ReviewField label="Specialisation" value={formData.specialisation} />
                    <ReviewField label="NABH Accreditation" value={formData.nabh_accreditation} />
                  </div>
                </div>

                {/* Contact Information */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Contact Information</h4>
                    <button onClick={() => setCurrentStep(0)} className="text-blue-500 text-xs font-semibold hover:underline">Edit</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    <ReviewField label="Admin Name" value={formData.facility_admin_name} />
                    <ReviewField label="Admin Phone" value={formData.facility_admin_phone} />
                    <ReviewField label="Primary Phone" value={`${formData.primary_phone_country_code} ${formData.primary_phone}`} />
                    <ReviewField label="Secondary Phone" value={formData.secondary_phone ? `${formData.secondary_phone_country_code} ${formData.secondary_phone}` : ''} />
                    <ReviewField label="Email" value={formData.email} />
                    <ReviewField label="Website" value={formData.website} />
                    <ReviewField label="Emergency Hotline" value={formData.emergency_hotline ? `${formData.emergency_hotline_country_code} ${formData.emergency_hotline}` : ''} />
                  </div>
                </div>

                {/* Address Details */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Address Details</h4>
                    <button onClick={() => setCurrentStep(0)} className="text-blue-500 text-xs font-semibold hover:underline">Edit</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    <ReviewField label="Address" value={[formData.address_line1, formData.address_line2].filter(Boolean).join(', ')} />
                    <ReviewField label="City" value={formData.city} />
                    <ReviewField label="State" value={formData.state} />
                    <ReviewField label="PIN Code" value={formData.pin_code} />
                    <ReviewField label="Country" value={formData.country} />
                    <ReviewField label="Location" value={formData.establishment_location} />
                  </div>
                </div>

                {/* Facility Info */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Facility & Operations</h4>
                    <button onClick={() => setCurrentStep(1)} className="text-blue-500 text-xs font-semibold hover:underline">Edit</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    <ReviewField label="No. of Beds" value={String(formData.number_of_beds)} />
                    <ReviewField label="Staff Strength" value={String(formData.staff_strength)} />
                    <ReviewField label="Working Hours" value={formData.working_hours_start && formData.working_hours_end ? `${formData.working_hours_start} - ${formData.working_hours_end}` : ''} />
                    <ReviewField label="Working Days" value={formData.working_days.join(', ')} />
                    <ReviewField label="24/7 Emergency" value={formData.emergency_24_7 ? 'Yes' : 'No'} />
                    {formData.country === 'India' && (
                      <>
                        <ReviewField label="GST Number" value={formData.gst_number} />
                        <ReviewField label="PAN Number" value={formData.pan_number} />
                        <ReviewField label="Drug License" value={formData.drug_license_number} />
                        <ReviewField label="Medical Reg." value={formData.medical_registration_number} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer with Back/Next/Submit */}
        <div className="flex items-center justify-between px-6 lg:px-8 py-4 border-t border-slate-100 bg-slate-50/60">
          <div>
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                Back
              </button>
            )}
          </div>
          <div>
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow-sm transition-all"
              >
                Next
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    {isEditMode ? 'Update Details' : 'Save & Configure'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Review field component
const ReviewField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span className="text-xs text-slate-400 font-medium">{label}</span>
    <p className="text-sm font-medium text-slate-800 mt-0.5">{value || <span className="text-slate-300 italic">Not provided</span>}</p>
  </div>
);

export default HospitalSetup;
