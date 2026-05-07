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
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';

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
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
}

const SuperAdminPlans: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const response = await superAdminApi.getPlans(true);
      setPlans(response.data.sort((a: Plan, b: Plan) => a.sort_order - b.sort_order));
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePlan = async (plan: Plan) => {
    try {
      await superAdminApi.updatePlan(plan.id, { is_active: !plan.is_active });
      loadPlans();
    } catch (error) {
      console.error('Failed to toggle plan:', error);
    }
  };

  const getPlanColor = (code: string) => {
    const colors: Record<string, string> = {
      free: 'bg-gray-500',
      starter: 'bg-green-500',
      professional: 'bg-blue-500',
      enterprise: 'bg-purple-500',
    };
    return colors[code] || 'bg-blue-500';
  };

  const formatLimit = (value: number | null) => {
    return value === null ? '∞' : value.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          <p className="text-gray-600 mt-1">
            Manage pricing tiers and feature availability
          </p>
        </div>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
          onClick={() => alert('Create plan feature coming soon')}
        >
          <Plus className="w-5 h-5" />
          Add Plan
        </button>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden transition-all ${
              plan.is_active ? 'border-gray-200' : 'border-gray-200 opacity-75'
            }`}
          >
            {/* Plan Header */}
            <div className={`${getPlanColor(plan.code)} p-6 text-white`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <Package className="w-6 h-6 opacity-75" />
              </div>
              <p className="text-white/80 text-sm mt-1 capitalize">{plan.code}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold">${plan.base_price}</span>
                <span className="text-white/80">/{plan.billing_cycle}</span>
              </div>
            </div>

            {/* Plan Details */}
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">{plan.description}</p>

              {/* Limits */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <Users className="w-4 h-4" />
                    Max Users
                  </span>
                  <span className="font-medium">{formatLimit(plan.max_users)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <DollarSign className="w-4 h-4" />
                    Max Patients
                  </span>
                  <span className="font-medium">{formatLimit(plan.max_patients)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <AlertCircle className="w-4 h-4" />
                    Monthly Appointments
                  </span>
                  <span className="font-medium">
                    {formatLimit(plan.max_appointments_monthly)}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-2 mb-6">
                <h4 className="text-xs font-medium text-gray-500 uppercase">Features</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(plan.features_enabled || {})
                    .filter(([_, enabled]) => enabled)
                    .slice(0, 5)
                    .map(([feature]) => (
                      <span
                        key={feature}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded"
                      >
                        <Check className="w-3 h-3" />
                        {feature.replace('_', ' ')}
                      </span>
                    ))}
                  {Object.values(plan.features_enabled || {}).filter(Boolean).length > 5 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      +{Object.values(plan.features_enabled || {}).filter(Boolean).length - 5} more
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t">
                <button
                  onClick={() => setEditingPlan(plan)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleTogglePlan(plan)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    plan.is_active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {plan.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>

              {/* Status Badge */}
              <div className="mt-4 flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                    plan.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {plan.is_active ? 'Active' : 'Inactive'}
                </span>
                {!plan.is_public && (
                  <span className="inline-flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                    Hidden
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Plan Comparison</h2>
          <p className="text-gray-600 text-sm mt-1">
            Side-by-side comparison of all plans
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Feature
                </th>
                {plans.filter(p => p.is_active).map((plan) => (
                  <th
                    key={plan.id}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase"
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">Price</td>
                {plans.filter(p => p.is_active).map((plan) => (
                  <td key={plan.id} className="px-6 py-4 text-center text-sm text-gray-600">
                    ${plan.base_price}/mo
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">Max Users</td>
                {plans.filter(p => p.is_active).map((plan) => (
                  <td key={plan.id} className="px-6 py-4 text-center text-sm text-gray-600">
                    {formatLimit(plan.max_users)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">Max Patients</td>
                {plans.filter(p => p.is_active).map((plan) => (
                  <td key={plan.id} className="px-6 py-4 text-center text-sm text-gray-600">
                    {formatLimit(plan.max_patients)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">Appointments</td>
                {plans.filter(p => p.is_active).map((plan) => (
                  <td key={plan.id} className="px-6 py-4 text-center text-sm text-gray-600">
                    {formatLimit(plan.max_appointments_monthly)}/mo
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">Storage</td>
                {plans.filter(p => p.is_active).map((plan) => (
                  <td key={plan.id} className="px-6 py-4 text-center text-sm text-gray-600">
                    {formatLimit(plan.max_storage_gb)} GB
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminPlans;
