import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, differenceInYears } from 'date-fns';
import patientService from '../services/patientService';
import type { Patient } from '../types/patient';

const PatientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const data = await patientService.getPatient(Number(id));
        setPatient(data);
      } catch {
        setError('Patient not found');
      } finally {
        setLoading(false);
      }
    };
    fetchPatient();
  }, [id]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const updatedPatient = await patientService.uploadPhoto(Number(id), file);
      setPatient(updatedPatient);
    } catch {
      setError('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-5xl text-red-300 mb-4">error_outline</span>
        <p className="text-lg font-bold text-slate-900">{error || 'Patient not found'}</p>
        <button onClick={() => navigate('/patients')} className="mt-4 text-primary hover:underline text-sm font-semibold">
          Back to patients
        </button>
      </div>
    );
  }

  const age = differenceInYears(new Date(), new Date(patient.date_of_birth));
  const photoUrl = patientService.getPhotoUrl(patient.photo_url);
  const initials = `${patient.first_name[0]}${patient.last_name[0]}`.toUpperCase();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <button onClick={() => navigate('/patients')} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors">
          <span className="material-icons text-lg">arrow_back</span>
          <span className="text-sm font-semibold">Back to Patients</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/patients/${id}/id-card`)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors active:scale-95"
          >
            <span className="material-icons text-lg">badge</span>
            View ID Card
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
          <span className="material-icons text-red-500">error</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-primary rounded-t-xl p-6 md:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-white/20 border-4 border-white/30 flex items-center justify-center">
              {photoUrl ? (
                <img src={photoUrl} alt={patient.full_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-white/80">{initials}</span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <span className="material-icons text-white">camera_alt</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-bold">{patient.full_name || `${patient.title} ${patient.first_name} ${patient.last_name}`}</h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20">
                <span className="material-icons text-xs">tag</span> {patient.prn}
              </span>
              <span className="text-sm text-white/80">{patient.gender}</span>
              <span className="text-sm text-white/80">DOB: {format(new Date(patient.date_of_birth), 'dd MMM yyyy')} ({age} yrs)</span>
              {patient.blood_group && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/80">
                  <span className="material-icons text-xs">water_drop</span> {patient.blood_group}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Sections */}
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 divide-y divide-slate-100">
        {/* Personal Information */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Information</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoItem icon="person" label="Title" value={patient.title} />
            <InfoItem icon="badge" label="First Name" value={patient.first_name} />
            <InfoItem icon="badge" label="Last Name" value={patient.last_name} />
            <InfoItem icon="wc" label="Gender" value={patient.gender} />
            <InfoItem icon="cake" label="Date of Birth" value={format(new Date(patient.date_of_birth), 'dd MMM yyyy')} />
            <InfoItem icon="water_drop" label="Blood Group" value={patient.blood_group || '—'} />
          </div>
        </div>

        {/* Contact Information */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Contact Information</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem icon="phone" label="Mobile" value={`${patient.country_code} ${patient.mobile_number}`} />
            <InfoItem icon="email" label="Email" value={patient.email || '—'} />
          </div>
        </div>

        {/* Address */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Address</h2>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-lg">location_on</span>
            </div>
            <p className="text-sm text-slate-700 pt-2">
              {[patient.address_line1, patient.address_line2, patient.city, patient.state, patient.pin_code, patient.country]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
        </div>

        {/* Emergency Contact */}
        {patient.emergency_contact_name && (
          <div className="p-6 bg-amber-50/50">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-[2px] bg-amber-400/40 rounded-full"></span>
              <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wider">Emergency Contact</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InfoItem icon="person" label="Name" value={patient.emergency_contact_name} />
              <InfoItem icon="favorite" label="Relationship" value={patient.emergency_contact_relationship || '—'} />
              <InfoItem icon="phone" label="Mobile" value={
                patient.emergency_contact_mobile
                  ? `${patient.emergency_contact_country_code || ''} ${patient.emergency_contact_mobile}`
                  : '—'
              } />
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="p-6 bg-slate-50">
          <div className="flex flex-wrap gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="material-icons text-xs">tag</span> PRN: {patient.prn}</span>
            <span className="flex items-center gap-1"><span className="material-icons text-xs">schedule</span> Created: {format(new Date(patient.created_at), 'dd MMM yyyy, hh:mm a')}</span>
            <span className="flex items-center gap-1"><span className="material-icons text-xs">update</span> Updated: {format(new Date(patient.updated_at), 'dd MMM yyyy, hh:mm a')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoItem: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </div>
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  </div>
);

export default PatientDetail;
