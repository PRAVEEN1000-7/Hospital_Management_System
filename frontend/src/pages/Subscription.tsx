import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';

interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface SubscriptionDetails {
  id: string;
  plan: SubscriptionPlan;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

interface ModuleInfo {
  code: string;
  name: string;
  is_enabled: boolean;
  is_core: boolean;
  category: string;
}

const STATUS_STYLE: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-yellow-100 text-yellow-700',
  expired:  'bg-red-100 text-red-700',
  cancelled:'bg-slate-100 text-slate-500',
  none:     'bg-slate-100 text-slate-500',
};

const CATEGORY_COLOR: Record<string, string> = {
  clinical:   'bg-emerald-100 text-emerald-700',
  pharmacy:   'bg-purple-100 text-purple-700',
  billing:    'bg-amber-100 text-amber-700',
  analytics:  'bg-sky-100 text-sky-700',
  operations: 'bg-slate-100 text-slate-700',
  optical:    'bg-rose-100 text-rose-700',
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

const Subscription: React.FC = () => {
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, modRes] = await Promise.all([
        api.get('/tenant/subscription'),
        api.get('/tenant/modules'),
      ]);
      if (subRes.data?.status && subRes.data.status !== 'none') {
        setSubscription(subRes.data);
      }
      setModules(modRes.data || []);
    } catch {
      toast.error('Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const status = subscription?.status || 'none';
  const statusLabel = status.replace('_', ' ').toUpperCase();
  const statusClass = STATUS_STYLE[status] || 'bg-slate-100 text-slate-500';

  const daysLeft = subscription?.current_period_end
    ? Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / 86_400_000)
    : null;

  const enabledModules = modules.filter(m => m.is_enabled);
  const disabledModules = modules.filter(m => !m.is_enabled);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscription</h1>
        <p className="text-slate-500 text-sm mt-1">Your current plan and active modules</p>
      </div>

      {/* Plan card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Current Plan</p>
            <h2 className="text-xl font-bold text-slate-900">
              {subscription?.plan?.name || 'No plan assigned'}
            </h2>
            {subscription?.plan?.description && (
              <p className="text-sm text-slate-500 mt-0.5">{subscription.plan.description}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Start Date</p>
            <p className="text-sm font-semibold text-slate-800">{fmt(subscription?.current_period_start)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">End Date</p>
            <p className="text-sm font-semibold text-slate-800">{fmt(subscription?.current_period_end)}</p>
          </div>
          {subscription?.trial_ends_at && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Trial Ends</p>
              <p className="text-sm font-semibold text-slate-800">{fmt(subscription.trial_ends_at)}</p>
            </div>
          )}
          {daysLeft !== null && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Days Remaining</p>
              <p className={`text-sm font-bold ${daysLeft <= 7 ? 'text-red-600' : daysLeft <= 30 ? 'text-amber-600' : 'text-green-700'}`}>
                {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'Expired'}
              </p>
            </div>
          )}
        </div>

        {subscription?.cancel_at_period_end && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 font-medium">
            <span className="material-icons text-sm">warning</span>
            This subscription will not renew at the end of the period.
          </div>
        )}

        {!subscription && (
          <div className="flex items-center gap-2 px-3 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
            <span className="material-icons text-base text-slate-400">info</span>
            No active subscription. Please contact your administrator to assign a plan.
          </div>
        )}
      </div>

      {/* Modules */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Modules</h3>

        {modules.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No modules configured yet.</p>
        ) : (
          <div className="space-y-5">
            {enabledModules.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Enabled ({enabledModules.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {enabledModules.map(m => (
                    <div key={m.code} className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50">
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{m.code}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {m.is_core && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase">Core</span>
                        )}
                        {m.category && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${CATEGORY_COLOR[m.category.toLowerCase()] || 'bg-slate-100 text-slate-500'}`}>
                            {m.category}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {disabledModules.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Not Enabled ({disabledModules.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {disabledModules.map(m => (
                    <div key={m.code} className="flex items-center gap-3 px-3 py-2.5 border border-slate-100 rounded-lg bg-white opacity-60">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-500 truncate">{m.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{m.code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-center text-slate-400">
        To upgrade your plan or add modules, please contact your administrator.
      </p>
    </div>
  );
};

export default Subscription;
