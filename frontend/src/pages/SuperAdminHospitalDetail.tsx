import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  ChevronLeft,
  Edit,
  CheckCircle,
  XCircle,
  Package,
  CreditCard,
  Activity,
  AlertCircle,
  Save,
  RotateCcw,
  Info,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  code: string;
  email: string;
  phone: string;
  address_line_1: string;
  city: string;
  state_province: string;
  country: string;
  status: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  created_at: string;
  updated_at: string;
  subscription_status: string;
  plan_name: string;
  plan_code: string;
}

interface Module {
  id: string;
  module_id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  is_enabled: boolean;
  is_core: boolean;
  icon: string;
  required_modules: string[];
}

interface Usage {
  resource_type: string;
  current_usage: number;
  max_limit: number | null;
  percentage_used: number;
  period: string;
}

// Category display config
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  clinical:    { label: 'Clinical',    color: 'bg-emerald-100 text-emerald-700' },
  pharmacy:    { label: 'Pharmacy',    color: 'bg-purple-100 text-purple-700' },
  billing:     { label: 'Billing',     color: 'bg-amber-100 text-amber-700' },
  analytics:   { label: 'Analytics',  color: 'bg-sky-100 text-sky-700' },
  operations:  { label: 'Operations', color: 'bg-slate-100 text-slate-700' },
  optical:     { label: 'Optical',     color: 'bg-rose-100 text-rose-700' },
};

const categoryOf = (cat: string) =>
  CATEGORY_META[cat?.toLowerCase()] ?? { label: cat, color: 'bg-slate-100 text-slate-600' };

const SuperAdminHospitalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'usage'>('overview');

  // Pending module changes: { moduleCode: newEnabledState }
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  // Merge server state with pending local changes for display
  const localModules = modules.map((m) => ({
    ...m,
    is_enabled: m.code in pendingChanges ? pendingChanges[m.code] : m.is_enabled,
    isDirty: m.code in pendingChanges && pendingChanges[m.code] !== m.is_enabled,
  }));

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const loadData = useCallback(async () => {
    try {
      const [tenantRes, modulesRes, usageRes] = await Promise.all([
        superAdminApi.getTenant(id!),
        superAdminApi.getTenantModules(id!),
        superAdminApi.getTenantUsage(id!),
      ]);
      setTenant(tenantRes.data);
      setModules(modulesRes.data);
      setUsage(usageRes.data);
    } catch {
      toast.error('Failed to load hospital data');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // Toggle only updates local pending state — no API call yet
  const handleToggleModule = (moduleCode: string, enabled: boolean) => {
    setPendingChanges((prev) => ({ ...prev, [moduleCode]: enabled }));
  };

  const handleDiscardChanges = () => {
    setPendingChanges({});
  };

  const handleSaveModules = async () => {
    setIsSaving(true);
    try {
      // Build full config: pending changes override server state
      const fullConfig: Record<string, boolean> = {};
      modules.forEach((m) => {
        fullConfig[m.code] = m.code in pendingChanges ? pendingChanges[m.code] : m.is_enabled;
      });

      await superAdminApi.configureModules(id!, fullConfig);
      toast.success('Module configuration saved. Changes will reflect in the hospital portal immediately.');
      setPendingChanges({});
      await loadData();
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to save module configuration';
      toast.error(detail);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active:   'bg-green-100 text-green-800',
      trialing: 'bg-blue-100 text-blue-800',
      past_due: 'bg-yellow-100 text-yellow-800',
      suspended:'bg-red-100 text-red-800',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {status === 'active' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {status.toUpperCase()}
      </span>
    );
  };

  const getUsageBar = (percentage: number) => {
    let color = 'bg-green-500';
    if (percentage > 75) color = 'bg-yellow-500';
    if (percentage > 90) color = 'bg-red-500';
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-600">Hospital not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/superadmin/hospitals')}
          className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors mb-4 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Hospitals
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="w-12 h-12 object-contain" />
              ) : (
                <Building2 className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-slate-500 text-sm">{tenant.slug}</span>
                <span className="text-slate-300">•</span>
                <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{tenant.code}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(tenant.subscription_status || tenant.status)}
            <Link
              to={`/superadmin/hospitals/${id}/edit`}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Edit className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-8">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'modules',  label: 'Modules',  icon: Package,  badge: hasPendingChanges ? Object.keys(pendingChanges).length : 0 },
            { id: 'usage',    label: 'Usage & Limits', icon: CreditCard },
          ].map(({ id: tabId, label, icon: Icon, badge }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId as any)}
              className={`flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tabId
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge ? (
                <span className="ml-1 bg-amber-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2">Contact Information</h3>
                <div className="space-y-1">
                  <p className="text-slate-900">{tenant.email}</p>
                  <p className="text-slate-600 text-sm">{tenant.phone || '—'}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2">Address</h3>
                <div className="space-y-1">
                  <p className="text-slate-900">{tenant.address_line_1 || 'No address on file'}</p>
                  <p className="text-slate-600 text-sm">
                    {[tenant.city, tenant.state_province, tenant.country].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-slate-500 mb-4">Subscription</h3>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Current Plan', value: tenant.plan_code || 'Free' },
                  { label: 'Status', value: tenant.subscription_status || 'N/A' },
                  { label: 'Created', value: new Date(tenant.created_at).toLocaleDateString() },
                  { label: 'Last Updated', value: new Date(tenant.updated_at).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-4">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-sm font-semibold text-slate-900 capitalize mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modules Tab */}
        {activeTab === 'modules' && (
          <div className="space-y-5">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Module Configuration</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Toggle features for this hospital, then click <strong>Save Changes</strong> to apply.
                </p>
              </div>

              {/* Save / Discard — only visible when there are pending changes */}
              {hasPendingChanges && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-amber-600 font-medium">
                    {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveModules}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {isSaving ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
              <span>
                Changes take effect immediately after saving. Core modules are always enabled and cannot be disabled.
                Enabling a module will also auto-enable any modules it depends on.
              </span>
            </div>

            {/* Module grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {localModules.map((module) => {
                const cat = categoryOf(module.category);
                return (
                  <div
                    key={module.id}
                    className={`relative border rounded-xl p-4 transition-all ${
                      module.is_core
                        ? 'border-primary/25 bg-primary/5'
                        : module.isDirty
                        ? 'border-amber-300 bg-amber-50/50 shadow-sm'
                        : module.is_enabled
                        ? 'border-slate-200 bg-white'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    {/* Dirty indicator */}
                    {module.isDirty && (
                      <span className="absolute top-3 right-14 text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                        Unsaved
                      </span>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      {/* Module info */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${module.is_enabled ? 'bg-primary/10' : 'bg-slate-100'}`}>
                          <Package className={`w-5 h-5 ${module.is_enabled ? 'text-primary' : 'text-slate-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-slate-900 text-sm">{module.name}</h4>
                            {module.is_core && (
                              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                Core
                              </span>
                            )}
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${cat.color}`}>
                              {cat.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{module.description}</p>
                          {module.required_modules?.length > 0 && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              Requires:{' '}
                              <span className="font-medium text-slate-500">
                                {module.required_modules.join(', ')}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Toggle */}
                      <label className={`relative inline-flex items-center shrink-0 ${module.is_core ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={module.is_enabled}
                          onChange={(e) => handleToggleModule(module.code, e.target.checked)}
                          disabled={module.is_core}
                          className="sr-only peer"
                        />
                        <div
                          className={`w-11 h-6 rounded-full transition-colors ${
                            module.is_core
                              ? 'bg-primary/40 cursor-not-allowed'
                              : `bg-slate-200 peer-checked:bg-primary
                                 peer-focus:ring-2 peer-focus:ring-primary/30
                                 after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                                 after:bg-white after:border after:border-slate-300 after:rounded-full
                                 after:h-5 after:w-5 after:transition-all
                                 peer-checked:after:translate-x-full peer-checked:after:border-white`
                          }`}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sticky save bar — appears at the bottom when dirty */}
            {hasPendingChanges && (
              <div className="sticky bottom-0 left-0 right-0 -mx-6 -mb-6 px-6 py-4 bg-white border-t border-amber-200 flex items-center justify-between rounded-b-xl shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                <p className="text-sm text-amber-700 font-medium">
                  You have {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length > 1 ? 's' : ''}.
                  Save to apply them to the hospital portal.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveModules}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 font-semibold"
                  >
                    {isSaving ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-slate-900">Usage & Limits</h3>
            <div className="space-y-4">
              {usage.map((item) => (
                <div key={item.resource_type} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900 capitalize">{item.resource_type}</h4>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{item.period}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-slate-900">{item.current_usage.toLocaleString()}</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-sm text-slate-500">{item.max_limit?.toLocaleString() ?? '∞'}</span>
                    </div>
                  </div>
                  {getUsageBar(item.percentage_used)}
                  <p className={`text-xs mt-2 font-medium ${
                    item.percentage_used > 90 ? 'text-red-600' :
                    item.percentage_used > 75 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {item.percentage_used.toFixed(1)}% used
                  </p>
                </div>
              ))}
              {usage.length === 0 && (
                <p className="text-slate-500 text-center py-8">No usage data available</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {tenant.status === 'active' ? (
          <button
            onClick={() => {
              if (confirm('Are you sure you want to suspend this hospital?')) {
                superAdminApi.suspendTenant(id!, 'Administrative action').then(loadData);
              }
            }}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors"
          >
            Suspend Hospital
          </button>
        ) : (
          <button
            onClick={() => superAdminApi.activateTenant(id!).then(loadData)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
          >
            Activate Hospital
          </button>
        )}
      </div>
    </div>
  );
};

export default SuperAdminHospitalDetail;