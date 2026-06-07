import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronLeft,
  Shield,
  Save,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';

interface FormData {
  name: string;
  email: string;
  admin_email: string;
  admin_username: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_password: string;
  phone: string;
}

const SuperAdminCreateHospital: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    admin_email: '',
    admin_username: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_password: '',
    phone: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await superAdminApi.createTenant({
        ...formData,
      });
      toast.success('Hospital created successfully');
      navigate('/superadmin/hospitals');
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to create hospital';
      toast.error(detail);
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const suggestUsername = () => {
    const base = formData.admin_email.trim().split('@')[0] || formData.name.trim().split(' ').join('').toLowerCase();
    if (!base) return;
    if (!formData.admin_username.trim()) {
      updateField('admin_username', `${base}_${Date.now().toString().slice(-4)}`.toLowerCase());
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/superadmin/hospitals')}
          className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors mb-4 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Hospitals
        </button>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="text-primary" />
          Onboard New Hospital
        </h1>
        <p className="text-slate-500 mt-1">
          Quickly set up a new hospital instance with a dedicated admin account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Form Details */}
        <div className="space-y-8">
          {/* Section 1: Hospital Details */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Hospital Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hospital Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. City General Hospital"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Official Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="contact@hospital.com"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Admin Account */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Primary Administrator
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Admin Email *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@hospital.com"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formData.admin_email}
                  onChange={(e) => updateField('admin_email', e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <label className="block text-sm font-medium text-slate-700">Admin Username *</label>
                  <button
                    type="button"
                    onClick={suggestUsername}
                    className="text-xs font-semibold text-primary hover:text-primary/80"
                  >
                    Suggest username
                  </button>
                </div>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={50}
                  placeholder="e.g. admin_hms01"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formData.admin_username}
                  onChange={(e) => updateField('admin_username', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                />
                <p className="mt-1 text-xs text-slate-500">This is the login username for the primary hospital admin.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="John"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    value={formData.admin_first_name}
                    onChange={(e) => updateField('admin_first_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Doe"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    value={formData.admin_last_name}
                    onChange={(e) => updateField('admin_last_name', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Admin Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={formData.admin_password}
                  onChange={(e) => updateField('admin_password', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Submit */}
        <div className="space-y-8">

          <div className="bg-slate-900 rounded-xl p-6 text-white space-y-4">
            <h3 className="font-bold">Ready to Launch?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
                This will create the hospital instance and generate a unique hospital code. Assign the subscription later from the Subscription Plans page or the hospital list.
              </p>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary hover:bg-primary/90 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white animate-spin rounded-full" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Create Hospital
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SuperAdminCreateHospital;
