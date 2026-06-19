import React, { useEffect, useState } from 'react';
import {
  Building2,
  Search,
  Package,
  Plus,
  Edit,
  Users,
  AlertCircle,
  X,
  Save,
  Trash2,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface Module {
  id: string;
  code: string;
  name: string;
  category: string;
  is_core: boolean;
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

interface HospitalOption {
  id: string;
  name: string;
  code: string;
  status: string;
  subscription_status?: string;
  plan_code?: string;
}

const SuperAdminPlans: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [assignPlan, setAssignPlan] = useState<Plan | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [selectedHospitalCode, setSelectedHospitalCode] = useState('');
  const [isLoadingHospitals, setIsLoadingHospitals] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [usedPlanCodes, setUsedPlanCodes] = useState<Set<string>>(new Set());
  const [planCounts, setPlanCounts] = useState<Record<string, number>>({});
  const [isDeletingPlanId, setIsDeletingPlanId] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isAssignModalOpen || !assignPlan) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadHospitals(hospitalSearch);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isAssignModalOpen, assignPlan, hospitalSearch]);

  useEffect(() => {
    if (!isAssignModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseAssignModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAssignModalOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [plansRes, modulesRes, tenantsRes] = await Promise.all([
        superAdminApi.getPlans(true),
        superAdminApi.getModules(),
        superAdminApi.getTenants({ page: 1, limit: 500 }),
      ]);
      setPlans(plansRes.data.sort((a: Plan, b: Plan) => a.sort_order - b.sort_order));
      setModules(modulesRes.data);

      const codes = new Set<string>(
        (tenantsRes.data.data || [])
          .map((t: HospitalOption) => t.plan_code)
          .filter(Boolean) as string[]
      );
      setUsedPlanCodes(codes);

      // Count how many hospitals are currently enrolled on each plan.
      const counts: Record<string, number> = {};
      (tenantsRes.data.data || []).forEach((t: HospitalOption) => {
        if (t.plan_code) counts[t.plan_code] = (counts[t.plan_code] || 0) + 1;
      });
      setPlanCounts(counts);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load plans or modules');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePlan = async (plan: Plan) => {
    const ok = await confirm({
      title: 'Delete Plan',
      message: `Delete "${plan.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setIsDeletingPlanId(plan.id);
    try {
      await superAdminApi.deletePlan(plan.id);
      toast.success(`Plan "${plan.name}" deleted`);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete plan');
    } finally {
      setIsDeletingPlanId(null);
    }
  };

  const loadHospitals = async (search = '') => {
    setIsLoadingHospitals(true);
    try {
      const hospitalsRes = await superAdminApi.getTenants({
        page: 1,
        limit: 50,
        search: search || undefined,
      });

      const hospitalData = (hospitalsRes.data.data || []).filter((hospital: HospitalOption) => {
        const subscriptionStatus = hospital.subscription_status?.toLowerCase();
        return !subscriptionStatus || !['trialing', 'active', 'past_due'].includes(subscriptionStatus);
      });

      setHospitals(hospitalData);

      if (!hospitalData.some((hospital: HospitalOption) => hospital.code === selectedHospitalCode)) {
        setSelectedHospitalCode(hospitalData[0]?.code || '');
      }
    } catch (error) {
      console.error('Failed to load hospitals:', error);
      toast.error('Failed to load hospitals');
    } finally {
      setIsLoadingHospitals(false);
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

    if (!editingPlan.code.trim()) {
      toast.error('Plan code is required');
      return;
    }
    if (!editingPlan.name.trim()) {
      toast.error('Plan name is required');
      return;
    }

    setIsSaving(true);
    try {
      const { id, ...rest } = editingPlan;
      const payload = {
        ...rest,
        code: rest.code.trim().toLowerCase().replace(/\s+/g, '-'),
        name: rest.name.trim(),
        base_price: isNaN(rest.base_price) ? 0 : rest.base_price,
        max_users: rest.max_users ?? null,
        max_patients: rest.max_patients ?? null,
        max_storage_gb: rest.max_storage_gb ?? null,
        max_appointments_monthly: rest.max_appointments_monthly ?? null,
      };

      if (id) {
        await superAdminApi.updatePlan(id, payload);
        toast.success('Plan updated successfully');
      } else {
        await superAdminApi.createPlan(payload);
        toast.success('New plan created successfully');
      }
      setEditingPlan(null);
      loadData();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join(' · ')
          : 'Failed to save plan';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenAssignModal = (plan: Plan) => {
    setAssignPlan(plan);
    setSelectedHospitalCode('');
    setHospitalSearch('');
    setHospitals([]);
    setIsAssignModalOpen(true);
    setTimeout(() => {
      void loadHospitals('');
    }, 0);
  };

  const handleCloseAssignModal = () => {
    setIsAssignModalOpen(false);
    setAssignPlan(null);
    setHospitals([]);
    setHospitalSearch('');
    setSelectedHospitalCode('');
  };

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignPlan || !selectedHospitalCode) {
      return;
    }

    setIsAssigning(true);
    try {
      await superAdminApi.assignPlan({
        hospital_code: selectedHospitalCode,
        plan_id: assignPlan.id,
      });
      toast.success(`Assigned ${assignPlan.name} to the selected hospital`);
      handleCloseAssignModal();
    } catch (error: any) {
      console.error('Failed to assign plan:', error);
      toast.error(error.response?.data?.detail || 'Failed to assign plan to hospital');
    } finally {
      setIsAssigning(false);
    }
  };

  const coreModuleIds = modules.filter((m) => m.is_core).map((m) => m.id);

  const withCoreModules = (included: string[]) =>
    Array.from(new Set([...coreModuleIds, ...included]));

  const handleCreateNew = () => {
    const newPlan: Plan = {
      id: '',
      code: '',
      name: '',
      description: '',
      billing_cycle: 'monthly',
      base_price: 0,
      currency: 'INR',
      max_users: 10,
      max_patients: 1000,
      max_storage_gb: 5,
      max_appointments_monthly: 500,
      features_enabled: {},
      modules_included: coreModuleIds,
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
            Manage pricing tiers, feature limits, module availability, and assign plans to a created hospital
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

            <form id="plan-editor-form" onSubmit={handleSavePlan} className="flex-1 overflow-y-auto p-6 space-y-8">
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
                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">₹</span>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          className="w-full pl-7 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          value={isNaN(editingPlan.base_price) ? '' : editingPlan.base_price}
                          onFocus={(e) => {
                            if (editingPlan.base_price === 0) {
                              setEditingPlan({ ...editingPlan, base_price: NaN });
                              e.target.value = '';
                            } else {
                              e.target.select();
                            }
                          }}
                          onBlur={() => {
                            if (isNaN(editingPlan.base_price)) {
                              setEditingPlan({ ...editingPlan, base_price: 0 });
                            }
                          }}
                          onChange={(e) => setEditingPlan({ ...editingPlan, base_price: e.target.value === '' ? NaN : parseFloat(e.target.value) })}
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
                  {[...modules].sort((a, b) => Number(b.is_core) - Number(a.is_core)).map((module) => {
                    const isCore = module.is_core;
                    const isChecked = editingPlan.modules_included.includes(module.id);
                    return (
                      <label
                        key={module.id}
                        className={`flex items-start gap-3 p-4 border rounded-xl transition-all ${
                          isCore
                            ? 'border-primary/30 bg-primary/5 cursor-not-allowed'
                            : isChecked
                            ? 'border-primary bg-primary/5 ring-1 ring-primary cursor-pointer'
                            : 'border-slate-100 hover:border-slate-200 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary border-slate-300"
                          checked={isChecked}
                          disabled={isCore}
                          onChange={(e) => {
                            const newModules = e.target.checked
                              ? withCoreModules([...editingPlan.modules_included, module.id])
                              : editingPlan.modules_included.filter((m) => m !== module.id);
                            setEditingPlan({ ...editingPlan, modules_included: newModules });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 capitalize">{module.name.replace(/_/g, ' ')}</p>
                            {isCore && (
                              <span className="shrink-0 px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded uppercase tracking-wide">
                                Core
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 uppercase">{module.category}</p>
                        </div>
                      </label>
                    );
                  })}
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
                type="submit"
                form="plan-editor-form"
                disabled={isSaving}
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
                <span className="text-3xl font-bold">₹{plan.base_price}</span>
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

              {/* Modules — show only the extra (non-core) modules added to this plan.
                  Core modules are included in every plan by default and are hidden here. */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add-on Modules</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const extraModules = plan.modules_included
                      .map((moduleId) => modules.find(m => m.id === moduleId))
                      .filter((m): m is Module => Boolean(m) && !m.is_core);
                    return extraModules.length > 0 ? (
                      extraModules.map((module) => (
                        <span
                          key={module.id}
                          className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase rounded border border-slate-200"
                        >
                          {module.name.replace(/_/g, ' ')}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No add-on modules — core modules only</span>
                    );
                  })()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setEditingPlan({ ...plan, modules_included: withCoreModules(plan.modules_included) })}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit Plan
                </button>
                <button
                  onClick={() => handleOpenAssignModal(plan)}
                  disabled={!plan.is_active}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={plan.is_active ? 'Assign this plan to a hospital' : 'Activate this plan before assigning'}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Assign Hospital
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

              {/* Delete — only when no hospital is assigned to this plan */}
              {!usedPlanCodes.has(plan.code) && (
                <div className="pt-2">
                  <button
                    onClick={() => handleDeletePlan(plan)}
                    disabled={isDeletingPlanId === plan.id}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeletingPlanId === plan.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 animate-spin rounded-full" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Delete Plan
                  </button>
                </div>
              )}

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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {(planCounts[plan.code] || 0)} {(planCounts[plan.code] || 0) === 1 ? 'hospital' : 'hospitals'} enrolled
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Assign Plan to Hospital Modal */}
      {isAssignModalOpen && assignPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          onClick={handleCloseAssignModal}
          role="presentation"
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-plan-title"
          >
            <div className="shrink-0 flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">Plan Assignment</p>
                <h2 id="assign-plan-title" className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                  Assign this plan to a hospital
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Pick one hospital, confirm the plan, and close the modal with Esc or the backdrop.
                </p>
              </div>
              <button
                onClick={handleCloseAssignModal}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close assign plan modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAssignPlan} className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[1.1fr_1.4fr]">
              <aside className="border-b border-slate-100 bg-slate-50/70 p-6 lg:border-b-0 lg:border-r lg:overflow-y-auto lg:custom-scrollbar">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Package className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Selected Plan</p>
                      <h3 className="mt-1 text-xl font-bold text-slate-900">{assignPlan.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {assignPlan.code} • ₹{assignPlan.base_price}/{assignPlan.billing_cycle}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {assignPlan.is_active ? 'Active plan' : 'Inactive plan'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {assignPlan.is_public ? 'Public' : 'Internal'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Users</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatLimit(assignPlan.max_users)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Patients</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatLimit(assignPlan.max_patients)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Appointments</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatLimit(assignPlan.max_appointments_monthly)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Storage</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatLimit(assignPlan.max_storage_gb)} GB</div>
                    </div>
                  </div>
                </div>
              </aside>

              <section className="flex min-h-0 flex-col p-6">
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700">Search hospital</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={hospitalSearch}
                      onChange={(e) => setHospitalSearch(e.target.value)}
                      placeholder="Type a hospital name or code"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Only hospitals without an active subscription are shown.</span>
                    <span>{hospitals.length} available</span>
                  </div>
                </div>

                <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                  {isLoadingHospitals ? (
                    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-500">
                      Loading hospitals...
                    </div>
                  ) : hospitals.length === 0 ? (
                    <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                      <Users className="h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">No assignable hospitals found</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Try a different search term, or create a new hospital and assign a plan later.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {hospitals.map((hospital) => {
                        const selected = hospital.code === selectedHospitalCode;
                        return (
                          <button
                            key={hospital.id}
                            type="button"
                            onClick={() => setSelectedHospitalCode(hospital.code)}
                            className={`w-full rounded-2xl border p-4 text-left transition-all ${
                              selected
                                ? 'border-primary bg-primary/5 ring-4 ring-primary/10'
                                : 'border-slate-200 bg-white hover:border-primary/40 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h4 className="truncate text-sm font-bold text-slate-900">
                                  {hospital.name}
                                </h4>
                                <p className="mt-1 text-xs text-slate-500">Code: {hospital.code}</p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                                {hospital.status}
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                              <span>{hospital.subscription_status || 'No active subscription'}</span>
                              <span className={selected ? 'font-semibold text-primary' : ''}>
                                {selected ? 'Selected' : 'Select'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t border-slate-100 pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleCloseAssignModal}
                      className="rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isAssigning || !selectedHospitalCode}
                      className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAssigning ? 'Assigning...' : `Assign ${assignPlan.name}`}
                    </button>
                  </div>
                </div>
              </section>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminPlans;
