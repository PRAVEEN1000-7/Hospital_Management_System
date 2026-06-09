import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, ChevronLeft, Save } from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';

interface FormData {
  name: string;
  email: string;
  phone: string;
  address_line_1: string;
  city: string;
  state_province: string;
  country: string;
  status: string;
}

const SuperAdminHospitalEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    address_line_1: '',
    city: '',
    state_province: '',
    country: 'USA',
    status: 'pending',
  });

  useEffect(() => {
    if (!id) return;

    const loadTenant = async () => {
      try {
        const res = await superAdminApi.getTenant(id);
        const tenant = res.data;
        setFormData({
          name: tenant.name || '',
          email: tenant.email || '',
          phone: tenant.phone || '',
          address_line_1: tenant.address_line_1 || '',
          city: tenant.city || '',
          state_province: tenant.state_province || '',
          country: tenant.country || 'USA',
          status: tenant.status || 'pending',
        });
      } catch (error) {
        toast.error('Failed to load hospital details');
        navigate('/superadmin/hospitals');
      } finally {
        setIsLoading(false);
      }
    };

    void loadTenant();
  }, [id, navigate, toast]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setIsSaving(true);
    try {
      await superAdminApi.updateTenant(id, formData);
      toast.success('Hospital details updated successfully');
      navigate(`/superadmin/hospitals/${id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update hospital details');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <button
        onClick={() => navigate(`/superadmin/hospitals/${id}`)}
        className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors text-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Hospital Details
      </button>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Hospital Details</h1>
          <p className="text-slate-500 text-sm">Update the hospital profile shown across the control center.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Hospital Information</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hospital Name</label>
            <input
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={formData.phone}
              onChange={(e) => updateField('phone', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={formData.address_line_1}
              onChange={(e) => updateField('address_line_1', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={formData.city}
                onChange={(e) => updateField('city', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={formData.state_province}
                onChange={(e) => updateField('state_province', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Status & Actions</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
              value={formData.status}
              onChange={(e) => updateField('status', e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="rounded-2xl bg-slate-900 p-5 text-white">
            <h3 className="font-bold">Save changes</h3>
            <p className="mt-1 text-sm text-slate-300">These details will update the control center and hospital profile.</p>
            <button
              type="submit"
              disabled={isSaving}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : <><Save className="h-4 w-4" /> Save Changes</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SuperAdminHospitalEdit;