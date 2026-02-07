import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientService } from '../services/patientService';
import { Patient } from '../types/patient';
import { ArrowLeft, User, Phone, Mail, MapPin, AlertCircle, Droplets, Hash, Heart, CreditCard, Camera, CheckCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8000';

export const PatientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoSuccess, setPhotoSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const data = await patientService.getPatient(Number(id));
        setPatient(data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load patient');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchPatient();
  }, [id]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patient?.id) return;

    // Validate client-side
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, or WebP image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setPhotoUploading(true);
    setError('');
    setPhotoSuccess('');
    try {
      const updated = await patientService.uploadPhoto(patient.id, file);
      setPatient(updated);
      setPhotoSuccess('Photo uploaded successfully!');
      setTimeout(() => setPhotoSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/patients')}
          className="flex items-center text-primary-600 hover:text-primary-700 mb-6"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Patients
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
          <p className="text-red-800">{error || 'Patient not found'}</p>
        </div>
      </div>
    );
  }

  const fullName = patient.full_name || `${patient.title} ${patient.first_name} ${patient.last_name}`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/patients')}
          className="flex items-center text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Patients
        </button>
        <button
          onClick={() => navigate(`/patients/${id}/id-card`)}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          View ID Card
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Photo upload success/error */}
        {photoSuccess && (
          <div className="mx-8 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center">
            <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
            <p className="text-sm text-green-800">{photoSuccess}</p>
          </div>
        )}

        {/* Header */}
        <div className="bg-primary-600 px-8 py-6">
          <div className="flex items-center">
            {/* Patient Photo */}
            <div className="relative group mr-4">
              {patient.photo_url ? (
                <img
                  src={`${API_BASE}${patient.photo_url}`}
                  alt={fullName}
                  className="w-20 h-20 rounded-full object-cover border-3 border-white shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <User className="w-10 h-10 text-white" />
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                title="Upload photo"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              {photoUploading && (
                <div className="absolute inset-0 rounded-full bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{fullName}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white bg-opacity-20 text-white">
                  <Hash className="w-3 h-3 mr-1" />
                  {patient.prn}
                </span>
                <span className="text-primary-100">
                  {patient.gender} |{' '}
                  {new Date(patient.date_of_birth).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                {patient.blood_group && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    <Droplets className="w-3 h-3 mr-1" />
                    {patient.blood_group}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Personal Information */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Title</p>
                <p className="text-sm font-medium text-gray-900">{patient.title}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">First Name</p>
                <p className="text-sm font-medium text-gray-900">{patient.first_name}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Last Name</p>
                <p className="text-sm font-medium text-gray-900">{patient.last_name}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Gender</p>
                <p className="text-sm font-medium text-gray-900">{patient.gender}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Date of Birth</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(patient.date_of_birth).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Blood Group</p>
                <p className="text-sm font-medium text-gray-900">{patient.blood_group || 'Not provided'}</p>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                <Phone className="w-5 h-5 text-gray-500 mr-3" />
                <div>
                  <p className="text-xs text-gray-500">Mobile</p>
                  <p className="text-sm font-medium text-gray-900">
                    {patient.country_code} {patient.mobile_number}
                  </p>
                </div>
              </div>
              <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                <Mail className="w-5 h-5 text-gray-500 mr-3" />
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900">{patient.email || 'Not provided'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
            <div className="flex items-start p-4 bg-gray-50 rounded-lg">
              <MapPin className="w-5 h-5 text-gray-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-900">{patient.address_line1}</p>
                {patient.address_line2 && (
                  <p className="text-sm text-gray-900">{patient.address_line2}</p>
                )}
                <p className="text-sm text-gray-600">
                  {[patient.city, patient.state, patient.pin_code].filter(Boolean).join(', ')}
                </p>
                {patient.country && (
                  <p className="text-sm text-gray-500">{patient.country}</p>
                )}
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          {patient.emergency_contact_name && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-600">Name</p>
                  <p className="text-sm font-medium text-gray-900">{patient.emergency_contact_name}</p>
                </div>
                {patient.emergency_contact_relationship && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center mb-1">
                      <Heart className="w-3 h-3 text-yellow-600 mr-1" />
                      <p className="text-xs text-yellow-600">Relationship</p>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{patient.emergency_contact_relationship}</p>
                  </div>
                )}
                {patient.emergency_contact_mobile && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-600">Mobile</p>
                    <p className="text-sm font-medium text-gray-900">
                      {patient.emergency_contact_country_code || '+91'} {patient.emergency_contact_mobile}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-6 border-t border-gray-200">
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              <span>PRN: {patient.prn}</span>
              <span>Created: {patient.created_at ? new Date(patient.created_at).toLocaleString() : 'N/A'}</span>
              <span>Updated: {patient.updated_at ? new Date(patient.updated_at).toLocaleString() : 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
