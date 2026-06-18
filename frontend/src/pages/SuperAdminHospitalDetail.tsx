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
  MapPin,
  Mail,
  Shield,
  Calendar,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import userService from '../services/userService';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  code: string;
  email: string;
  phone?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country: string;
  timezone: string;
  default_currency: string;
  status: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  registration_number?: string;
  is_verified: boolean;
  verified_at?: string;
  onboarding_completed: boolean;
  onboarding_step: string;
  admin_user_id?: string;
  admin_username?: string;
  admin_email?: string;
  admin_name?: string;
  created_at: string;
  updated_at: string;
  // Subscription-computed fields
  subscription_status?: string;
  plan_name?: string;
  plan_code?: string;
  current_period_end?: string;
  display_status?: string;
}

interface Subscription {
  id: string;
  status: string;
  trial_ends_at?: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at?: string;
  cancellation_reason?: string;
  billing_email?: string;
  plan_name?: string;
  plan_code?: string;
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

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  clinical:   { label: 'Clinical',    color: 'bg-emerald-100 text-emerald-700' },
  pharmacy:   { label: 'Pharmacy',    color: 'bg-purple-100 text-purple-700' },
  billing:    { label: 'Billing',     color: 'bg-amber-100 text-amber-700' },
  analytics:  { label: 'Analytics',  color: 'bg-sky-100 text-sky-700' },
  operations: { label: 'Operations', color: 'bg-slate-100 text-slate-700' },
  optical:    { label: 'Optical',     color: 'bg-rose-100 text-rose-700' },
};

const categoryOf = (cat: string) =>
  CATEGORY_META[cat?.toLowerCase()] ?? { label: cat, color: 'bg-slate-100 text-slate-600' };

const fmt = (dateStr?: string | null) =>
  dateStr ? new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const InfoRow: React.FC<{ label: string; value?: string | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex justify-between py-2.5 border-b border-slate-100 last:border-0">
    <span className="text-sm text-slate-500">{label}</span>
    <span className={`text-sm font-medium text-slate-900 text-right max-w-[60%] ${mono ? 'font-mono text-xs bg-slate-100 px-2 py-0.5 rounded' : ''}`}>
      {value || '—'}
    </span>
  </div>
);

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="border border-slate-200 rounded-xl p-5">
    <div className="flex items-center gap-2 mb-4">
      <div className="text-slate-400">{icon}</div>
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
    </div>
    {children}
  </div>
);

const SuperAdminHospitalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'usage'>('overview');

  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Reset admin password
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Manual plan activation
  const [allPlans, setAllPlans] = useState<{ id: string; name: string; code: string }[]>([]);
  const [showActivateForm, setShowActivateForm] = useState(false);
  const [activatePlanId, setActivatePlanId] = useState('');
  const [activateStartDate, setActivateStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [activateEndDate, setActivateEndDate] = useState('');
  const [activateNotes, setActivateNotes] = useState('');
  const [isActivating, setIsActivating] = useState(false);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const localModules = modules.map((m) => ({
    ...m,
    is_enabled: m.code in pendingChanges ? pendingChanges[m.code] : m.is_enabled,
    isDirty: m.code in pendingChanges && pendingChanges[m.code] !== m.is_enabled,
  }));

  useEffect(() => {
    if (id) {
      loadData();
      superAdminApi.getPlans().then(res => setAllPlans(res.data || [])).catch(() => {});
    }
  }, [id]);

  const handleActivatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activatePlanId || !activateEndDate) {
      toast.error('Select a plan and set the end date');
      return;
    }
    setIsActivating(true);
    try {
      const res = await superAdminApi.activatePlan(id!, {
        plan_id: activatePlanId,
        start_date: new Date(activateStartDate).toISOString(),
        end_date: new Date(activateEndDate).toISOString(),
        notes: activateNotes || undefined,
      });
      toast.success(res.data.message || 'Plan activated successfully');
      setShowActivateForm(false);
      setActivatePlanId('');
      setActivateEndDate('');
      setActivateNotes('');
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to activate plan');
    } finally {
      setIsActivating(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setIsResettingPassword(true);
    try {
      const res = await superAdminApi.resetAdminPassword(id!, newPassword);
      toast.success(res.data.message || 'Admin password reset successfully');
      setShowResetPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to reset admin password');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tenantRes, modulesRes, usageRes] = await Promise.all([
        superAdminApi.getTenant(id!),
        superAdminApi.getTenantModules(id!),
        superAdminApi.getTenantUsage(id!),
      ]);
      setTenant(tenantRes.data);
      setModules(modulesRes.data);
      setUsage(usageRes.data);

      // Fetch subscription separately — not all tenants have one
      try {
        const subRes = await superAdminApi.getTenantSubscription(id!);
        setSubscription(subRes.data);
      } catch {
        setSubscription(null);
      }
    } catch {
      toast.error('Failed to load hospital data');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const handleToggleModule = (moduleCode: string, enabled: boolean) => {
    setPendingChanges((prev) => ({ ...prev, [moduleCode]: enabled }));
  };

  const handleDiscardChanges = () => setPendingChanges({});

  const handleSaveModules = async () => {
    setIsSaving(true);
    try {
      const fullConfig: Record<string, boolean> = {};
      modules.forEach((m) => {
        fullConfig[m.code] = m.code in pendingChanges ? pendingChanges[m.code] : m.is_enabled;
      });
      await superAdminApi.configureModules(id!, fullConfig);
      toast.success('Module configuration saved. Changes will reflect in the hospital portal immediately.');
      setPendingChanges({});
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save module configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const effectiveStatus = tenant?.subscription_status || tenant?.status || '';

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active:    'bg-green-100 text-green-800',
      trialing:  'bg-blue-100 text-blue-800',
      past_due:  'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
      pending:   'bg-gray-100 text-gray-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    const isOk = ['active', 'trialing'].includes(status);
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {isOk ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  const getUsageBar = (percentage: number) => {
    const color = percentage > 90 ? 'bg-red-500' : percentage > 75 ? 'bg-yellow-500' : 'bg-green-500';
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

  const fullAddress = [
    tenant.address_line_1,
    tenant.address_line_2,
    [tenant.city, tenant.state_province, tenant.postal_code].filter(Boolean).join(', '),
    tenant.country,
  ].filter(Boolean).join('\n');

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
            <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center overflow-hidden">
              {tenant.logo_url ? (
                <img src={userService.getPhotoUrl(tenant.logo_url) || ''} alt={tenant.name} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  Code: {tenant.code}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(effectiveStatus)}
            <Link
              to={`/superadmin/hospitals/${id}/edit`}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              title="Edit hospital"
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
            { id: 'overview', label: 'Overview',      icon: Activity },
            { id: 'modules',  label: 'Modules',       icon: Package,   badge: hasPendingChanges ? Object.keys(pendingChanges).length : 0 },
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

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Contact */}
            <SectionCard title="Contact Information" icon={<Mail className="w-4 h-4" />}>
              <InfoRow label="Email" value={tenant.email} />
              <InfoRow label="Phone" value={tenant.phone} />
              <InfoRow label="Registration No." value={tenant.registration_number} />
            </SectionCard>

            {/* Hospital admin login */}
            <SectionCard title="Hospital Admin Login" icon={<KeyRound className="w-4 h-4" />}>
              <InfoRow label="Username" value={tenant.admin_username || 'Not set'} mono />
              <InfoRow label="Admin Name" value={tenant.admin_name} />
              <InfoRow label="Admin Email" value={tenant.admin_email} />
              <div className="pt-2">
                <button
                  onClick={() => setShowResetPasswordModal(true)}
                  className="text-sm font-semibold text-primary hover:underline flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Reset admin password
                </button>
              </div>
            </SectionCard>

            {/* Address */}
            <SectionCard title="Address & Location" icon={<MapPin className="w-4 h-4" />}>
              <InfoRow label="Address Line 1" value={tenant.address_line_1} />
              {tenant.address_line_2 && <InfoRow label="Address Line 2" value={tenant.address_line_2} />}
              <InfoRow label="City" value={tenant.city} />
              <InfoRow label="State / Province" value={tenant.state_province} />
              <InfoRow label="Postal Code" value={tenant.postal_code} />
              <InfoRow label="Country" value={tenant.country} />
              <InfoRow label="Timezone" value={tenant.timezone} />
            </SectionCard>

            {/* Subscription */}
            <SectionCard title="Subscription" icon={<CreditCard className="w-4 h-4" />}>
              <InfoRow label="Plan" value={tenant.plan_name || tenant.plan_code || 'No plan assigned'} />
              <InfoRow label="Plan Code" value={tenant.plan_code} mono />
              <InfoRow label="Status" value={subscription?.status?.replace('_', ' ') || tenant.subscription_status || '—'} />
              {subscription?.trial_ends_at && <InfoRow label="Trial Ends" value={fmt(subscription.trial_ends_at)} />}
              <InfoRow label="Period Start" value={fmt(subscription?.current_period_start)} />
              <InfoRow label="Period End" value={fmt(subscription?.current_period_end || tenant.current_period_end)} />
              {subscription?.cancel_at_period_end && (
                <div className="mt-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 font-medium">
                  Cancellation scheduled at period end
                  {subscription.cancellation_reason && ` — ${subscription.cancellation_reason}`}
                </div>
              )}
              {!subscription && !tenant.plan_code && (
                <p className="text-sm text-slate-400 italic py-2">No active subscription</p>
              )}

              {/* Manual Plan Activation */}
              {!showActivateForm ? (
                <button
                  onClick={() => setShowActivateForm(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  Activate Plan Manually
                </button>
              ) : (
                <form onSubmit={handleActivatePlan} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Activate Plan</p>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Plan</label>
                    <select
                      value={activatePlanId}
                      onChange={e => setActivatePlanId(e.target.value)}
                      required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Select a plan…</option>
                      {allPlans.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={activateStartDate}
                        onChange={e => setActivateStartDate(e.target.value)}
                        required
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                      <input
                        type="date"
                        value={activateEndDate}
                        onChange={e => setActivateEndDate(e.target.value)}
                        required
                        min={activateStartDate}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
                    <input
                      type="text"
                      value={activateNotes}
                      onChange={e => setActivateNotes(e.target.value)}
                      placeholder="e.g. Cash received on 10 Jun 2026"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isActivating}
                      className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {isActivating ? 'Activating…' : 'Activate Plan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowActivateForm(false); setActivatePlanId(''); setActivateEndDate(''); setActivateNotes(''); }}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </SectionCard>

            {/* System Info */}
            <SectionCard title="System Information" icon={<Shield className="w-4 h-4" />}>
              <InfoRow label="Tenant ID" value={tenant.id} mono />
              <InfoRow label="Slug" value={tenant.slug} mono />
              <InfoRow label="Status" value={tenant.status} />
              <InfoRow label="Verified" value={tenant.is_verified ? `Yes — ${fmt(tenant.verified_at)}` : 'No'} />
              <InfoRow label="Onboarding" value={tenant.onboarding_completed ? 'Completed' : `In progress (${tenant.onboarding_step})`} />
              <InfoRow label="Currency" value={tenant.default_currency} />
              <InfoRow label="Created" value={fmt(tenant.created_at)} />
              <InfoRow label="Last Updated" value={fmt(tenant.updated_at)} />
            </SectionCard>

            {/* Module summary */}
            <SectionCard title="Module Summary" icon={<Package className="w-4 h-4" />}>
              {modules.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-2">No modules configured</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between py-2.5 border-b border-slate-100">
                    <span className="text-sm text-slate-500">Total Modules</span>
                    <span className="text-sm font-medium text-slate-900">{modules.length}</span>
                  </div>
                  <div className="flex justify-between py-2.5 border-b border-slate-100">
                    <span className="text-sm text-slate-500">Enabled</span>
                    <span className="text-sm font-medium text-green-700">
                      {modules.filter((m) => m.is_enabled).length}
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-sm text-slate-500">Disabled</span>
                    <span className="text-sm font-medium text-slate-500">
                      {modules.filter((m) => !m.is_enabled).length}
                    </span>
                  </div>
                </div>
              )}
            </SectionCard>

          </div>
        )}

        {/* ── Modules ── */}
        {activeTab === 'modules' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Module Configuration</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Toggle features for this hospital, then click <strong>Save Changes</strong> to apply.
                </p>
              </div>

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

            <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
              <span>
                Changes take effect immediately after saving. Core modules are always enabled and cannot be disabled.
                Enabling a module will also auto-enable any modules it depends on.
              </span>
            </div>

            {modules.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No modules found. Assign a plan to this hospital first.</p>
              </div>
            ) : (
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
                      {module.isDirty && (
                        <span className="absolute top-3 right-14 text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                          Unsaved
                        </span>
                      )}

                      <div className="flex items-start justify-between gap-3">
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
            )}

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

        {/* ── Usage ── */}
        {activeTab === 'usage' && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-slate-900">Usage & Limits</h3>
            {usage.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No usage data available</p>
            ) : (
              <div className="space-y-4">
                {usage.map((item) => (
                  <div key={item.resource_type} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-slate-900 capitalize">
                          {item.resource_type.replace(/_/g, ' ')}
                        </h4>
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reset Admin Password Modal */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Reset Admin Password</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{tenant?.name}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowResetPasswordModal(false); setNewPassword(''); setConfirmPassword(''); }}
                className="p-2 hover:bg-amber-100 rounded-full transition-colors"
              >
                <XCircle className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                This will immediately change the login password for the primary admin of this hospital. Share the new password with them securely.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none text-sm pr-11"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Re-enter new password"
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none text-sm pr-11 ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-400 bg-red-50'
                        : 'border-slate-200'
                    }`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              </div>
              {/* Sticky footer */}
              <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowResetPasswordModal(false); setNewPassword(''); setConfirmPassword(''); }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword || !newPassword || newPassword !== confirmPassword}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isResettingPassword ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  {isResettingPassword ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {tenant.status === 'active' ? (
          <button
            onClick={async () => {
              const ok = await confirm({
                title: 'Suspend Hospital',
                message: `Are you sure you want to suspend "${tenant.name}"? Staff will lose access immediately.`,
                confirmLabel: 'Suspend',
                variant: 'warning',
              });
              if (!ok) return;
              try {
                await superAdminApi.suspendTenant(id!, 'Administrative action');
                toast.success(`${tenant.name} has been suspended`);
                loadData();
              } catch (err: any) {
                toast.error(err?.response?.data?.detail || 'Failed to suspend hospital');
              }
            }}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors"
          >
            Suspend Hospital
          </button>
        ) : (
          <button
            onClick={async () => {
              try {
                await superAdminApi.activateTenant(id!);
                toast.success(`${tenant.name} has been activated`);
                loadData();
              } catch (err: any) {
                toast.error(err?.response?.data?.detail || 'Failed to activate hospital');
              }
            }}
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