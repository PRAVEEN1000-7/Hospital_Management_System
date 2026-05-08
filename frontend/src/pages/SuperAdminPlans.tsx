import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Plus,
  Edit,
  Check,
  DollarSign,
  Users,
  AlertCircle,
  X,
  Save,
  ChevronLeft,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';

interface Module {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  billing_cycle: string;
  base_price: number;
  currency: string;
  max_users: number | null;
  max_patients: number | null;
  max_storage_gb: number | null;
  max_appointments_monthly: number | null;
  features_enabled: Record<string, boolean>;
  modules_included: string[];
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
}

const SuperAdminPlans: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [plansRes, modulesRes] = await Promise.all([
        superAdminApi.getPlans(true),
        superAdminApi.getModules()
      ]);
      setPlans(plansRes.data.sort((a: Plan, b: Plan) => a.sort_order - b.sort_order));
      setModules(modulesRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load plans or modules');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePlan = async (plan: Plan) => {
    try {
      await superAdminApi.updatePlan(plan.id, { is_active: !plan.is_active });
      toast.success(`Plan ${plan.is_active ? 'deactivated' : 'activated'} successfully`);
      loadData();
    } catch (error) {
      console.error('Failed to toggle plan:', error);
      toast.error('Failed to update plan status');
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    setIsSaving(true);
    try {
      if (editingPlan.id) {
        await superAdminApi.updatePlan(editingPlan.id, editingPlan);
        toast.success('Plan updated successfully');
      } else {
        await superAdminApi.createPlan(editingPlan);
        toast.success('New plan created successfully');
      }
      setEditingPlan(null);
      loadData();
    } catch (error) {
      console.error('Failed to save plan:', error);
      toast.error('Failed to save plan details');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNew = () => {
    const newPlan: Plan = {
      id: '',
      code: '',
      name: '',
      description: '',
      billing_cycle: 'monthly',
      base_price: 0,
      currency: 'USD',
      max_users: 10,
      max_patients: 1000,
      max_storage_gb: 5,
      max_appointments_monthly: 500,
      features_enabled: {},
      modules_included: [],
      is_public: true,
      is_active: true,
      sort_order: plans.length + 1,
    };
    setEditingPlan(newPlan);
  };

  const getPlanColor = (code: string) => {
    const colors: Record<string, string> = {
      free: 'bg-slate-500',
      starter: 'bg-emerald-500',
      professional: 'bg-primary',
      enterprise: 'bg-indigo-600',
    };
    return colors[code] || 'bg-primary';
  };

  const formatLimit = (value: number | null) => {
    return value === null ? '∞' : value.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="text-primary" />
            Subscription Plans
          </h1>
          <p className="text-slate-500 mt-1">
            Manage pricing tiers, feature limits, and module availability
          </p>
        </div>
        <button
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-all"
          onClick={handleCreateNew}
        >
          <Plus className="w-5 h-5" />
          Add New Plan
        </button>
      </div>

      {/* Plan Editor Modal */}
      {editingPlan && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-900">
                {editingPlan.id ? 'Edit Subscription Plan' : 'Create New Subscription Plan'}
              </h2>
              <button onClick={() => setEditingPlan(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Basic Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        value={editingPlan.name}
                        onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Plan Code (Unique slug)</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        value={editingPlan.code}
                        onChange={(e) => setEditingPlan({ ...editingPlan, code: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                      <textarea
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        rows={3}
                        value={editingPlan.description}
                        onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Pricing & Status</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Base Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                        <input
                          type="number"
                          required
                          className="w-full pl-7 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          value={editingPlan.base_price}
                          onChange={(e) => setEditingPlan({ ...editingPlan, base_price: parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Billing Cycle</label>
                      <select
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        value={editingPlan.billing_cycle}
                        onChange={(e) => setEditingPlan({ ...editingPlan, billing_cycle: e.target.value })}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="lifetime">Lifetime</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-primary focus:ring-primary border-slate-300"
                        checked={editingPlan.is_public}
                        onChange={(e) => setEditingPlan({ ...editingPlan, is_public: e.target.checked })}
                      />
                      <span className="text-sm font-medium text-slate-700">Publicly Visible</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-primary focus:ring-primary border-slate-300"
                        checked={editingPlan.is_active}
                        onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                      />
                      <span className="text-sm font-medium text-slate-700">Active</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Resource Limits */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Resource Quotas</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Max Users</label>
                    <input
                      type="number"
                      placeholder="∞"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={editingPlan.max_users || ''}
                      onChange={(e) => setEditingPlan({ ...editingPlan, max_users: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Max Patients</label>
                    <input
                      type="number"
                      placeholder="∞"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={editingPlan.max_patients || ''}
                      onChange={(e) => setEditingPlan({ ...editingPlan, max_patients: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Max Appointments/mo</label>
                    <input
                      type="number"
                      placeholder="∞"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={editingPlan.max_appointments_monthly || ''}
                      onChange={(e) => setEditingPlan({ ...editingPlan, max_appointments_monthly: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Max Storage (GB)</label>
                    <input
                      type="number"
                      placeholder="∞"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={editingPlan.max_storage_gb || ''}
                      onChange={(e) => setEditingPlan({ ...editingPlan, max_storage_gb: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                </div>
              </div>

              {/* Module Selection */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Included Modules</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {modules.map((module) => (
                    <label key={module.id} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                      editingPlan.modules_included.includes(module.id) 
                        ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                        : 'border-slate-100 hover:border-slate-200'
                    }`}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary border-slate-300"
                        checked={editingPlan.modules_included.includes(module.id)}
                        onChange={(e) => {
                          const newModules = e.target.checked
                            ? [...editingPlan.modules_included, module.id]
                            : editingPlan.modules_included.filter(m => m !== module.id);
                          setEditingPlan({ ...editingPlan, modules_included: newModules });
                        }}
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-900 capitalize">{module.name.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500 uppercase">{module.category}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSavePlan}
                className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Save className="w-4 h-4" />}
                {editingPlan.id ? 'Update Plan' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all group hover:shadow-md ${
              plan.is_active ? '' : 'opacity-75'
            }`}
          >
            {/* Plan Header */}
            <div className={`${getPlanColor(plan.code)} p-6 text-white`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <Package className="w-6 h-6 opacity-75" />
              </div>
              <p className="text-white/80 text-xs font-bold uppercase mt-1 tracking-widest">{plan.code}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold">${plan.base_price}</span>
                <span className="text-white/80 text-sm">/{plan.billing_cycle}</span>
              </div>
            </div>

            {/* Plan Details */}
            <div className="p-6 space-y-6">
              <p className="text-slate-600 text-sm leading-relaxed">{plan.description || 'No description provided.'}</p>

              {/* Limits */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Users className="w-3.5 h-3.5" />
                    Max Users
                  </span>
                  <span className="text-slate-900">{formatLimit(plan.max_users)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className="material-symbols-outlined text-[16px]">person</span>
                    Max Patients
                  </span>
                  <span className="text-slate-900">{formatLimit(plan.max_patients)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-2 text-slate-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Appts/mo
                  </span>
                  <span className="text-slate-900">{formatLimit(plan.max_appointments_monthly)}</span>
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Included Modules</h4>
                <div className="flex flex-wrap gap-1.5">
                  {plan.modules_included.length > 0 ? (
                    plan.modules_included.map((moduleId) => {
                      const module = modules.find(m => m.id === moduleId);
                      return (
                        <span
                          key={moduleId}
                          className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase rounded border border-slate-200"
                        >
                          {module ? module.name.replace(/_/g, ' ') : 'Unknown Module'}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-xs text-slate-400 italic">No modules assigned</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setEditingPlan(plan)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit Plan
                </button>
                <button
                  onClick={() => handleTogglePlan(plan)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                    plan.is_active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  }`}
                >
                  {plan.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                      plan.is_active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {!plan.is_public && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-widest rounded">
                      Internal
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order: {plan.sort_order}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SuperAdminPlans;
