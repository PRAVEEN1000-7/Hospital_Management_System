import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { COUNTRIES } from '../utils/constants';

// Types
interface HospitalData {
  id?: string;
  // Basic Details
  name: string;
  code: string;
  registration_number: string;
  established_date: string;
  hospital_type: string;
  facility_admin_name: string;
  facility_admin_phone: string;
  nabh_accreditation: string;
  specialisation: string;
  // Contact
  phone_country_code: string;
  phone: string;
  secondary_phone_country_code: string;
  secondary_phone: string;
  email: string;
  website: string;
  emergency_hotline_phone_country_code: string;
  emergency_hotline: string;
  // Address
  address_line_1: string;
  address_line_2: string;
  city: string;
  state_province: string;
  country: string;
  postal_code: string;
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
}

const INITIAL_DATA: HospitalData = {
  name: 'HMS Core',
  code: '',
  registration_number: '',
  established_date: '',
  hospital_type: '',
  facility_admin_name: '',
  facility_admin_phone: '',
  nabh_accreditation: '',
  specialisation: '',
  phone_country_code: '+91',
  phone: '',
  secondary_phone_country_code: '+91',
  secondary_phone: '',
  email: '',
  website: '',
  emergency_hotline_phone_country_code: '+91',
  emergency_hotline: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state_province: '',
  country: 'India',
  postal_code: '',
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
  const topRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<HospitalData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // Data exists in DB
  const [isEditing, setIsEditing] = useState(false); // User is actively editing

  // Scroll to top when step changes or when toggling edit mode
  useEffect(() => {
    // Use setTimeout to ensure scroll happens after React renders the new content
    const timer = setTimeout(() => {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(timer);
  }, [currentStep, isEditing]);

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
          code: d.code || '',
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
          emergency_hotline_phone_country_code: d.emergency_hotline_phone_country_code || '+91',
          address_line_2: d.address_line_2 || '',
          working_days: d.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        });
        setIsEditMode(true);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        // Silent fail for non-404 errors
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
      if (!formData.name.trim()) newErrors.name = 'Hospital name is required';
      if (!formData.hospital_type) newErrors.hospital_type = 'Hospital type is required';
      if (!formData.specialisation) newErrors.specialisation = 'Specialisation is required';
      if (!formData.facility_admin_name.trim()) newErrors.facility_admin_name = 'Admin name is required';
      if (!formData.facility_admin_phone.trim()) newErrors.facility_admin_phone = 'Admin phone is required';
      if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
      if (!formData.email.trim()) newErrors.email = 'Email is required';
      if (!formData.address_line_1.trim()) newErrors.address_line_1 = 'Address is required';
      if (!formData.city.trim()) newErrors.city = 'City is required';
      if (!formData.state_province) newErrors.state_province = 'State is required';
      if (!formData.country.trim()) newErrors.country = 'Country is required';
      if (!formData.postal_code.trim()) newErrors.postal_code = 'PIN code is required';

      // Format validation
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Invalid email format';
      }
      if (formData.phone && !/^\d{4,15}$/.test(formData.phone)) {
        newErrors.phone = 'Enter 4-15 digits only';
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
        name: formData.name,
        code: formData.code || null,
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
        phone_country_code: formData.phone_country_code,
        phone: formData.phone,
        secondary_phone_country_code: formData.secondary_phone_country_code || null,
        secondary_phone: formData.secondary_phone || null,
        email: formData.email,
        website: formData.website || null,
        emergency_hotline_phone_country_code: formData.emergency_hotline_phone_country_code || null,
        emergency_hotline: formData.emergency_hotline || null,
        address_line_1: formData.address_line_1,
        address_line_2: formData.address_line_2 || null,
        city: formData.city,
        state_province: formData.state_province,
        country: formData.country,
        postal_code: formData.postal_code,
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
        setIsEditing(false); // Exit editing mode
        setCurrentStep(0); // Reset to first step
      } else {
        await api.post('/hospital', payload);
        setIsEditMode(true);
        setIsEditing(false); // Exit editing mode after first save
        setCurrentStep(0); // Reset to first step
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
    const isPending = index > currentStep;
    
    // For first-time setup: use blue color scheme
    // For editing mode: use green/yellow/red color coding
    const getStepColor = () => {
      if (!isEditMode || !isEditing) {
        // First-time setup or viewing mode - all blue
        if (isCompleted) return { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'text-blue-600', border: 'bg-blue-500' };
        if (isActive) return { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'text-blue-500', border: 'bg-blue-400' };
        return { bg: 'bg-slate-50', text: 'text-slate-400', icon: 'text-slate-400', border: 'bg-slate-300' };
      }
      
      // Edit mode - color coding: Completed = Green, Active = Yellow, Pending = Red
      if (isCompleted) return { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-600', border: 'bg-green-500' };
      if (isActive) return { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: 'text-yellow-600', border: 'bg-yellow-500' };
      return { bg: 'bg-red-50/50', text: 'text-red-400', icon: 'text-red-400', border: 'bg-red-300' };
    };
    
    const colors = getStepColor();
    
    return (
      <button
        onClick={() => {
          if (isCompleted || index === currentStep) {
            if (index < currentStep || validateStep(currentStep)) {
              setCurrentStep(index);
            }
          }
        }}
        className={`flex-1 relative py-4 text-sm font-bold transition-all ${
          isPending ? 'cursor-not-allowed' : 'hover:opacity-80'
        } ${colors.bg}`}
      >
        <div className="flex items-center justify-center gap-2">
          {isCompleted && (
            <span className={`material-symbols-outlined text-lg ${colors.icon}`}>check_circle</span>
          )}
          {isActive && (
            <span className={`material-symbols-outlined text-lg ${colors.icon}`}>radio_button_checked</span>
          )}
          {isPending && (
            <span className={`material-symbols-outlined text-lg ${colors.icon}`}>{isEditMode && isEditing ? 'cancel' : 'circle'}</span>
          )}
          <span className={colors.text}>{label}</span>
        </div>
        <div className={`absolute bottom-0 left-0 right-0 h-1 ${colors.border}`}></div>
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

  // Card Display View - Show when data exists and not editing
  if (isEditMode && !isEditing) {
    return (
      <div ref={topRef} className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">local_hospital</span>
              Hospital Details
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              View and manage your facility information
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span className="text-sm font-semibold">Configured</span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 font-semibold"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              Edit Details
            </button>
          </div>
        </div>

        {/* Display Cards */}
        <div className="space-y-6">
          {/* Hospital Information Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">apartment</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Hospital Information</h2>
                  <p className="text-sm text-slate-500">Basic facility details</p>
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <InfoField label="Hospital Name" value={formData.name} icon="home" />
              <InfoField label="Hospital Code" value={formData.code} icon="qr_code" />
              <InfoField label="Registration No." value={formData.registration_number} icon="badge" />
              <InfoField label="Established Date" value={formData.established_date} icon="calendar_month" />
              <InfoField label="Hospital Type" value={formData.hospital_type} icon="category" />
              <InfoField label="Specialisation" value={formData.specialisation} icon="medical_services" />
              <InfoField label="NABH Accreditation" value={formData.nabh_accreditation} icon="verified" />
            </div>
          </div>

          {/* Contact Information Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-green-600">contact_phone</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Contact Information</h2>
                  <p className="text-sm text-slate-500">Communication details</p>
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <InfoField label="Admin Name" value={formData.facility_admin_name} icon="person" />
              <InfoField label="Admin Phone" value={formData.facility_admin_phone} icon="phone" />
              <InfoField label="Primary Phone" value={`${formData.phone_country_code} ${formData.phone}`} icon="call" />
              <InfoField label="Secondary Phone" value={formData.secondary_phone ? `${formData.secondary_phone_country_code} ${formData.secondary_phone}` : ''} icon="phone_forwarded" />
              <InfoField label="Email" value={formData.email} icon="email" />
              <InfoField label="Website" value={formData.website} icon="language" />
              <InfoField label="Emergency Hotline" value={formData.emergency_hotline ? `${formData.emergency_hotline_phone_country_code} ${formData.emergency_hotline}` : ''} icon="emergency" />
            </div>
          </div>

          {/* Address Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500/10 to-amber-500/5 px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600">location_on</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Address Details</h2>
                  <p className="text-sm text-slate-500">Location information</p>
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <InfoField label="Address Line 1" value={formData.address_line_1} icon="home_pin" />
              <InfoField label="Address Line 2" value={formData.address_line_2} icon="signpost" />
              <InfoField label="City" value={formData.city} icon="location_city" />
              <InfoField label="State" value={formData.state_province} icon="map" />
              <InfoField label="PIN Code" value={formData.postal_code} icon="pin_drop" />
              <InfoField label="Country" value={formData.country} icon="public" />
              <InfoField label="Location" value={formData.establishment_location} icon="location_searching" />
            </div>
          </div>

          {/* Facility & Operations Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500/10 to-purple-500/5 px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-purple-600">local_hospital</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Facility & Operations</h2>
                  <p className="text-sm text-slate-500">Capacity and operational details</p>
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <InfoField label="Number of Beds" value={String(formData.number_of_beds)} icon="bed" />
              <InfoField label="Staff Strength" value={String(formData.staff_strength)} icon="groups" />
              <InfoField label="Working Hours" value={`${formData.working_hours_start} - ${formData.working_hours_end}`} icon="schedule" />
              <InfoField label="Working Days" value={formData.working_days.join(', ')} icon="calendar_today" full />
              <InfoField label="24/7 Emergency" value={formData.emergency_24_7 ? 'Yes' : 'No'} icon="emergency" />
            </div>
          </div>

          {/* Legal & Tax (India only) */}
          {formData.country === 'India' && formData.gst_number && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500/10 to-blue-500/5 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600">gavel</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Legal & Tax Information</h2>
                    <p className="text-sm text-slate-500">Compliance details</p>
                  </div>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoField label="GST Number" value={formData.gst_number} icon="receipt_long" />
                <InfoField label="PAN Number" value={formData.pan_number} icon="credit_card" />
                <InfoField label="Drug License" value={formData.drug_license_number} icon="medication" />
                <InfoField label="Medical Registration" value={formData.medical_registration_number} icon="local_pharmacy" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef} className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600">local_hospital</span>
            Hospital Details
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isEditMode && isEditing ? 'Update your facility information' : 'Set up your facility for the first time'}
          </p>
        </div>
        {isEditMode && isEditing && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span className="text-sm font-semibold">Configured</span>
            </div>
            <button
              onClick={() => {
                setIsEditing(false);
                setCurrentStep(0);
              }}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-lg transition-all border border-slate-200"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Step Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          {STEPS.map((label, i) => (
            <StepTab key={label} index={i} label={label} />
          ))}
        </div>

        {/* Content Area */}
        <div className="p-6 lg:p-8">
          {/* Progress Indicator */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden flex">
              {STEPS.map((_, i) => {
                const isCompleted = i < currentStep;
                const isActive = i === currentStep;
                const stepWidth = `${100 / STEPS.length}%`;
                
                // First-time setup: blue gradient
                // Edit mode: green/yellow/red color coding
                const getBarColor = () => {
                  if (!isEditMode || !isEditing) {
                    if (isCompleted) return 'bg-blue-500';
                    if (isActive) return 'bg-blue-400';
                    return 'bg-slate-200';
                  }
                  
                  if (isCompleted) return 'bg-green-500';
                  if (isActive) return 'bg-yellow-500';
                  return 'bg-red-300';
                };
                
                return (
                  <div
                    key={i}
                    className={`h-full transition-all duration-500 ${getBarColor()}`}
                    style={{ width: stepWidth }}
                  />
                );
              })}
            </div>
            <span className="text-sm font-semibold text-slate-600">
              Step {currentStep + 1} of {STEPS.length}
            </span>
          </div>
          

          {/* Form Content */}
          <div className="max-w-5xl mx-auto">
            {/* STEP 0: Basic Details */}
            {currentStep === 0 && (
              <div className="space-y-6">
                {/* Hospital Information Card */}
                <div className="bg-gradient-to-br from-green-50/50 to-transparent border border-green-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-green-600">apartment</span>
                    <h3 className="text-base font-bold text-slate-800">Hospital Information</h3>
                  </div>
                  <div className="space-y-4">
                    <FormInput label="Hospital Name" name="name" placeholder="e.g. Manipal Hospital" required value={formData.name} onChange={handleChange} error={errors.name} />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormInput label="Hospital Code" name="code" placeholder="e.g. MH-BLR-01" helpText="Short code for internal use" value={formData.code} onChange={handleChange} error={errors.code} />
                      <FormInput label="Registration Number" name="registration_number" placeholder="Registration no." value={formData.registration_number} onChange={handleChange} error={errors.registration_number} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormInput label="Established Date" name="established_date" type="date" value={formData.established_date} onChange={handleChange} error={errors.established_date} />
                      <FormSelect label="Hospital Type" name="hospital_type" options={PRACTICE_TYPES} placeholder="-- Select type --" required value={formData.hospital_type} onChange={handleChange} error={errors.hospital_type} />
                    </div>

                    <FormSelect label="Specialisation" name="specialisation" options={SPECIALISATIONS} placeholder="-- Select specialisation --" required value={formData.specialisation} onChange={handleChange} error={errors.specialisation} />
                    <FormInput label="NABH Accreditation" name="nabh_accreditation" placeholder="e.g. NABH-12345" helpText="Optional certification" value={formData.nabh_accreditation} onChange={handleChange} error={errors.nabh_accreditation} />
                  </div>
                </div>

                {/* Admin Contact Card */}
                <div className="bg-gradient-to-br from-purple-50/50 to-transparent border border-purple-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-purple-600">admin_panel_settings</span>
                    <h3 className="text-base font-bold text-slate-800">Facility Admin Contact</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput label="Admin Name" name="facility_admin_name" placeholder="e.g. Rakesh Kumar" required value={formData.facility_admin_name} onChange={handleChange} error={errors.facility_admin_name} />
                    <FormInput label="Admin Phone" name="facility_admin_phone" placeholder="e.g. 9991828388" required value={formData.facility_admin_phone} onChange={handleChange} error={errors.facility_admin_phone} />
                  </div>
                </div>

                {/* Contact Information Card */}
                <div className="bg-gradient-to-br from-green-50/50 to-transparent border border-green-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-green-600">contact_phone</span>
                    <h3 className="text-base font-bold text-slate-800">Contact Information</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <PhoneInput label="Primary Phone" countryCodeName="phone_country_code" phoneName="phone" required countryCodeValue={formData.phone_country_code} phoneValue={formData.phone} onChange={handleChange} error={errors.phone} />
                      <PhoneInput label="Secondary Phone" countryCodeName="secondary_phone_country_code" phoneName="secondary_phone" countryCodeValue={formData.secondary_phone_country_code} phoneValue={formData.secondary_phone} onChange={handleChange} error={errors.secondary_phone} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormInput label="Email Address" name="email" placeholder="e.g. manipal@support.com" required type="email" value={formData.email} onChange={handleChange} error={errors.email} />
                      <FormInput label="Website" name="website" placeholder="e.g. www.hospital.com" value={formData.website} onChange={handleChange} error={errors.website} />
                    </div>
                    <PhoneInput label="Emergency Hotline" countryCodeName="emergency_hotline_phone_country_code" phoneName="emergency_hotline" countryCodeValue={formData.emergency_hotline_phone_country_code} phoneValue={formData.emergency_hotline} onChange={handleChange} error={errors.emergency_hotline} />
                  </div>
                </div>

                {/* Address Card */}
                <div className="bg-gradient-to-br from-amber-50/50 to-transparent border border-amber-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-amber-600">location_on</span>
                    <h3 className="text-base font-bold text-slate-800">Address Details</h3>
                  </div>
                  <div className="space-y-4">
                    <FormInput label="Address Line 1" name="address_line_1" placeholder="Street address" required value={formData.address_line_1} onChange={handleChange} error={errors.address_line_1} />
                    <FormInput label="Address Line 2" name="address_line_2" placeholder="Landmark, Area (optional)" value={formData.address_line_2} onChange={handleChange} error={errors.address_line_2} />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormInput label="City" name="city" placeholder="e.g. Bangalore" required value={formData.city} onChange={handleChange} error={errors.city} />
                      <FormSelect label="State" name="state_province" options={INDIAN_STATES} placeholder="-- Select state --" required value={formData.state_province} onChange={handleChange} error={errors.state_province} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormInput label="PIN Code" name="postal_code" placeholder="e.g. 560001" required value={formData.postal_code} onChange={handleChange} error={errors.postal_code} />
                      <FormInput label="Country" name="country" placeholder="e.g. India" required value={formData.country} onChange={handleChange} error={errors.country} />
                    </div>

                    <FormInput label="Establishment Location" name="establishment_location" placeholder="GPS coordinates or landmark" helpText="Optional location details" value={formData.establishment_location} onChange={handleChange} error={errors.establishment_location} />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: Facility Information */}
            {currentStep === 1 && (
              <div className="space-y-6">
                {/* Facility Strength Card */}
                <div className="bg-gradient-to-br from-blue-50/50 to-transparent border border-blue-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-blue-600">grid_view</span>
                    <h3 className="text-base font-bold text-slate-800">Facility Strength</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput label="Number of Beds" name="number_of_beds" placeholder="e.g. 50" required type="number" value={formData.number_of_beds} onChange={handleChange} error={errors.number_of_beds} />
                    <FormInput label="Staff Strength" name="staff_strength" placeholder="e.g. 100" required type="number" value={formData.staff_strength} onChange={handleChange} error={errors.staff_strength} />
                  </div>
                </div>

                {/* Operating Hours Card */}
                <div className="bg-gradient-to-br from-purple-50/50 to-transparent border border-purple-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-purple-600">schedule</span>
                    <h3 className="text-base font-bold text-slate-800">Operating Hours</h3>
                  </div>
                  <div className="space-y-4">
                    {/* Working Hours */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
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
                      <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                        {WEEKDAYS.map(day => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleWorkingDayToggle(day)}
                            className={`px-3 py-2.5 text-xs font-bold rounded-lg border transition-all ${
                              formData.working_days.includes(day)
                                ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            {day.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">Select all days when the hospital operates</p>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        name="emergency_24_7"
                        checked={formData.emergency_24_7}
                        onChange={handleChange}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <label className="text-sm text-slate-800 font-semibold">24/7 Emergency Services Available</label>
                        <p className="text-xs text-slate-500 mt-0.5">Enable if emergency services operate round the clock</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legal & Tax Card (India only) */}
                {formData.country === 'India' && (
                  <div className="bg-gradient-to-br from-green-50/50 to-transparent border border-green-100 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-green-600">gavel</span>
                      <h3 className="text-base font-bold text-slate-800">Legal & Tax Information (India)</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormInput label="Drug License Number" name="drug_license_number" placeholder="Drug license number" value={formData.drug_license_number} onChange={handleChange} error={errors.drug_license_number} />
                        <FormInput label="Medical Registration Number" name="medical_registration_number" placeholder="Medical registration number" value={formData.medical_registration_number} onChange={handleChange} error={errors.medical_registration_number} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Verification / Review */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-3 mb-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                  <span className="material-symbols-outlined text-blue-600 text-3xl">fact_check</span>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Review & Confirm</h3>
                    <p className="text-sm text-slate-600">Please review all details before saving</p>
                  </div>
                </div>

                {/* Hospital Information */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center bg-gradient-to-r from-blue-50 to-transparent px-5 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-lg">apartment</span>
                      <h4 className="text-sm font-bold text-slate-800">Hospital Information</h4>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-5">
                    <ReviewField label="Hospital Name" value={formData.name} />
                    <ReviewField label="Hospital Code" value={formData.code} />
                    <ReviewField label="Registration No." value={formData.registration_number} />
                    <ReviewField label="Established Date" value={formData.established_date} />
                    <ReviewField label="Hospital Type" value={formData.hospital_type} />
                    <ReviewField label="Specialisation" value={formData.specialisation} />
                    <ReviewField label="NABH Accreditation" value={formData.nabh_accreditation} />
                  </div>
                </div>

                {/* Contact Information */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center bg-gradient-to-r from-green-50 to-transparent px-5 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-green-600 text-lg">contact_phone</span>
                      <h4 className="text-sm font-bold text-slate-800">Contact Information</h4>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-5">
                    <ReviewField label="Admin Name" value={formData.facility_admin_name} />
                    <ReviewField label="Admin Phone" value={formData.facility_admin_phone} />
                    <ReviewField label="Primary Phone" value={`${formData.phone_country_code} ${formData.phone}`} />
                    <ReviewField label="Secondary Phone" value={formData.secondary_phone ? `${formData.secondary_phone_country_code} ${formData.secondary_phone}` : ''} />
                    <ReviewField label="Email" value={formData.email} />
                    <ReviewField label="Website" value={formData.website} />
                    <ReviewField label="Emergency Hotline" value={formData.emergency_hotline ? `${formData.emergency_hotline_phone_country_code} ${formData.emergency_hotline}` : ''} />
                  </div>
                </div>

                {/* Address Details */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center bg-gradient-to-r from-amber-50 to-transparent px-5 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-lg">location_on</span>
                      <h4 className="text-sm font-bold text-slate-800">Address Details</h4>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-5">
                    <ReviewField label="Address" value={[formData.address_line_1, formData.address_line_2].filter(Boolean).join(', ')} />
                    <ReviewField label="City" value={formData.city} />
                    <ReviewField label="State" value={formData.state_province} />
                    <ReviewField label="PIN Code" value={formData.postal_code} />
                    <ReviewField label="Country" value={formData.country} />
                    <ReviewField label="Location" value={formData.establishment_location} />
                  </div>
                </div>

                {/* Facility Info */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center bg-gradient-to-r from-purple-50 to-transparent px-5 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-purple-600 text-lg">local_hospital</span>
                      <h4 className="text-sm font-bold text-slate-800">Facility & Operations</h4>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-5">
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
        <div className="flex items-center justify-between px-6 lg:px-8 py-5 border-t border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <div>
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-bold rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 transition-all active:scale-95"
              >
                Next Step
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm font-bold rounded-lg hover:from-green-700 hover:to-green-800 shadow-lg shadow-green-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
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
  <div className="group">
    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{label}</span>
    <p className="text-sm font-medium text-slate-900 mt-1.5 group-hover:text-blue-600 transition-colors">
      {value || <span className="text-slate-400 italic font-normal">Not provided</span>}
    </p>
  </div>
);

// Info field component for card display
const InfoField: React.FC<{ label: string; value: string; icon: string; full?: boolean }> = ({ label, value, icon, full }) => (
  <div className={`${full ? 'md:col-span-2 lg:col-span-3' : ''}`}>
    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50/50 border border-slate-100 hover:border-primary/30 hover:bg-primary/5 transition-all group">
      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:border-primary/40 group-hover:bg-primary/10 transition-all">
        <span className="material-symbols-outlined text-slate-400 text-lg group-hover:text-primary transition-colors">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-slate-900 mt-1 break-words">
          {value || <span className="text-slate-400 italic font-normal">Not provided</span>}
        </p>
      </div>
    </div>
  </div>
);

export default HospitalSetup;
