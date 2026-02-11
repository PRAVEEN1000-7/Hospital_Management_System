import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Building2, Edit3, Save, X, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { hospitalService } from '../services/hospitalService';
import { Hospital, HospitalUpdate } from '../types/hospital';

export const HospitalProfile: React.FC = () => {
  const navigate = useNavigate();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HospitalUpdate>();

  useEffect(() => {
    fetchHospital();
  }, []);

  const fetchHospital = async () => {
    setLoading(true);
    try {
      const data = await hospitalService.getHospitalFull();
      setHospital(data);
      reset(data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        navigate('/hospital-setup');
      } else {
        setError('Failed to load hospital details');
      }
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: HospitalUpdate) => {
    setError('');
    setSuccess('');
    
    try {
      const updated = await hospitalService.updateHospital(data);
      setHospital(updated);
      setEditing(false);
      setSuccess('Hospital details updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update hospital details');
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setError('');

    try {
      await hospitalService.uploadLogo(file);
      await fetchHospital();
      setSuccess('Logo uploaded successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!window.confirm('Are you sure you want to delete the hospital logo?')) return;

    try {
      await hospitalService.deleteLogo();
      await fetchHospital();
      setSuccess('Logo deleted successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete logo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!hospital) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Building2 className="w-8 h-8 text-primary-600 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hospital Profile</h1>
            <p className="text-gray-600 mt-1">View and manage hospital information</p>
          </div>
        </div>

        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Edit3 className="w-5 h-5 mr-2" />
            Edit Details
          </button>
        )}
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          ✓ {success}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Logo Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hospital Logo</h2>
        <div className="flex items-start space-x-6">
          <div className="flex-shrink-0">
            {hospital.logo_path ? (
              <img
                src={hospitalService.getLogoUrl()}
                alt="Hospital Logo"
                className="w-32 h-32 object-contain border border-gray-200 rounded-lg"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-32 h-32 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>

          <div className="flex-1">
            <p className="text-sm text-gray-600 mb-4">
              Upload a hospital logo (JPG, PNG, SVG). Maximum size: 2MB. This logo will appear on patient ID cards and reports.
            </p>
            <div className="flex space-x-3">
              <label className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                <Upload className="w-5 h-5 mr-2" />
                {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/svg+xml"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>

              {hospital.logo_path && (
                <button
                  onClick={handleDeleteLogo}
                  className="flex items-center px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-5 h-5 mr-2" />
                  Delete Logo
                </button>
              )}
            </div>
            {hospital.logo_filename && (
              <p className="text-sm text-gray-500 mt-2">
                Current: {hospital.logo_filename} ({hospital.logo_size_kb} KB)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-8">
        {/* Basic Information */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          {!editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Hospital Name:</span>
                <p className="font-medium">{hospital.hospital_name}</p>
              </div>
              <div>
                <span className="text-gray-600">Hospital Code:</span>
                <p className="font-medium">{hospital.hospital_code || '-'}</p>
              </div>
              <div>
                <span className="text-gray-600">Type:</span>
                <p className="font-medium">{hospital.hospital_type || '-'}</p>
              </div>
              <div>
                <span className="text-gray-600">Registration Number:</span>
                <p className="font-medium">{hospital.registration_number || '-'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hospital Name *</label>
                <input
                  type="text"
                  {...register('hospital_name', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hospital Code</label>
                <input
                  type="text"
                  {...register('hospital_code')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  {...register('hospital_type')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="General">General Hospital</option>
                  <option value="Multi-speciality">Multi-speciality</option>
                  <option value="Eye">Eye Hospital</option>
                  <option value="Dental">Dental Clinic</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                <input
                  type="text"
                  {...register('registration_number')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Contact Information */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
          {!editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Primary Phone:</span>
                <p className="font-medium">{hospital.primary_phone}</p>
              </div>
              <div>
                <span className="text-gray-600">Secondary Phone:</span>
                <p className="font-medium">{hospital.secondary_phone || '-'}</p>
              </div>
              <div>
                <span className="text-gray-600">Email:</span>
                <p className="font-medium">{hospital.email}</p>
              </div>
              <div>
                <span className="text-gray-600">Website:</span>
                <p className="font-medium">{hospital.website || '-'}</p>
              </div>
              <div className="md:col-span-2">
                <span className="text-gray-600">Emergency Hotline:</span>
                <p className="font-medium">{hospital.emergency_hotline || '-'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Phone *</label>
                <input
                  type="tel"
                  {...register('primary_phone', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Phone</label>
                <input
                  type="tel"
                  {...register('secondary_phone')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  {...register('email', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input
                  type="url"
                  {...register('website')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Hotline</label>
                <input
                  type="tel"
                  {...register('emergency_hotline')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Address */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
          {!editing ? (
            <div className="text-sm">
              <p className="font-medium">{hospital.address_line1}</p>
              {hospital.address_line2 && <p className="font-medium">{hospital.address_line2}</p>}
              <p className="font-medium">
                {hospital.city}, {hospital.state} - {hospital.pin_code}
              </p>
              <p className="font-medium">{hospital.country}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 *</label>
                <input
                  type="text"
                  {...register('address_line1', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                <input
                  type="text"
                  {...register('address_line2')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                <input
                  type="text"
                  {...register('city', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <input
                  type="text"
                  {...register('state', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN Code *</label>
                <input
                  type="text"
                  {...register('pin_code', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                <input
                  type="text"
                  {...register('country', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Legal Information */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Legal & Tax Information</h2>
          {!editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">GST Number:</span>
                <p className="font-medium">{hospital.gst_number || '-'}</p>
              </div>
              <div>
                <span className="text-gray-600">PAN Number:</span>
                <p className="font-medium">{hospital.pan_number || '-'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                <input
                  type="text"
                  {...register('gst_number')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  maxLength={15}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                <input
                  type="text"
                  {...register('pan_number')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  maxLength={10}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {editing && (
          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                reset(hospital);
                setError('');
              }}
              className="flex items-center px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X className="w-5 h-5 mr-2" />
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Save className="w-5 h-5 mr-2" />
              Save Changes
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
