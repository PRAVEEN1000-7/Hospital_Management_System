import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { 
  CreditCard, 
  Package, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowUpCircle
} from 'lucide-react';

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
  features: Record<string, any>;
}

const Subscription: React.FC = () => {
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await api.get('/tenant/subscription');
      setSubscription(response.data);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      toast.error('Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!subscription || subscription.status === 'none') {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900">No Active Subscription</h1>
        <p className="text-slate-500 mt-2">
          Your hospital does not have an active subscription plan. Please contact the platform administrator.
        </p>
      </div>
    );
  }

  const isTrial = subscription.status === 'trialing';
  const isPastDue = subscription.status === 'past_due';
  const isCancelled = subscription.cancel_at_period_end;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="text-primary" />
            Subscription & Billing
          </h1>
          <p className="text-slate-500 mt-1">
            Manage your hospital's subscription plan and usage
          </p>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Current Plan */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              subscription.status === 'active' ? 'bg-green-100 text-green-700' :
              isTrial ? 'bg-blue-100 text-blue-700' :
              isPastDue ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-700'
            }`}>
              {subscription.status}
            </span>
          </div>
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Current Plan</h3>
          <p className="text-2xl font-bold text-slate-900 mt-1 capitalize">
            {subscription.plan.name}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {subscription.plan.description}
          </p>
        </div>

        {/* Renewal Info */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
            {isCancelled ? 'Expires On' : 'Next Renewal'}
          </h3>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {new Date(subscription.current_period_end).toLocaleDateString()}
          </p>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Period ends in {Math.ceil((new Date(subscription.current_period_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days
          </p>
        </div>

        {/* Status Alerts */}
        <div className={`p-6 rounded-xl border shadow-sm ${
          isPastDue ? 'bg-red-50 border-red-100' :
          isCancelled ? 'bg-amber-50 border-amber-100' :
          isTrial ? 'bg-blue-50 border-blue-100' :
          'bg-green-50 border-green-100'
        }`}>
          <div className="flex items-start gap-3">
            {isPastDue ? (
              <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
            ) : isCancelled ? (
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
            )}
            <div>
              <h4 className={`font-bold ${
                isPastDue ? 'text-red-900' :
                isCancelled ? 'text-amber-900' :
                'text-green-900'
              }`}>
                {isPastDue ? 'Payment Required' :
                 isCancelled ? 'Subscription Cancelled' :
                 isTrial ? 'Trial Period' :
                 'Subscription Active'}
              </h4>
              <p className={`text-sm mt-1 ${
                isPastDue ? 'text-red-700' :
                isCancelled ? 'text-amber-700' :
                'text-green-700'
              }`}>
                {isPastDue ? 'Your payment is overdue. Please update your payment method to avoid service interruption.' :
                 isCancelled ? 'Your subscription will end at the end of the current period. You can reactivate anytime.' :
                 isTrial ? `Your free trial ends on ${new Date(subscription.trial_ends_at!).toLocaleDateString()}.` :
                 'Your subscription is active and in good standing. Thank you for using HMS!'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Limits */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Plan Features & Limits</h3>
          <button className="text-primary text-sm font-semibold flex items-center gap-1 hover:underline">
            <ArrowUpCircle className="w-4 h-4" />
            Upgrade Plan
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <LimitCard 
            label="User Accounts" 
            limit={subscription.features.max_users} 
            icon="groups"
          />
          <LimitCard 
            label="Patient Records" 
            limit={subscription.features.max_patients} 
            icon="person"
          />
          <LimitCard 
            label="Monthly Appointments" 
            limit={subscription.features.max_appointments_monthly} 
            icon="calendar_month"
          />
          <LimitCard 
            label="Storage Capacity" 
            limit={subscription.features.max_storage_gb ? `${subscription.features.max_storage_gb} GB` : null} 
            icon="cloud"
          />
        </div>
      </div>

      {/* Enabled Modules */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-900">Active Modules</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-3">
            {Object.entries(subscription.features)
              .filter(([key, value]) => value === true && !key.startsWith('max_'))
              .map(([key]) => (
                <div key={key} className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-100 text-sm font-medium text-slate-700 capitalize">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {key.replace(/_/g, ' ')}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const LimitCard: React.FC<{ label: string; limit: any; icon: string }> = ({ label, limit, icon }) => (
  <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
    <div className="flex items-center gap-3 mb-2">
      <span className="material-symbols-outlined text-slate-400 text-[20px]">{icon}</span>
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-xl font-bold text-slate-900">
      {limit === null ? 'Unlimited' : limit.toLocaleString()}
    </p>
  </div>
);

export default Subscription;
