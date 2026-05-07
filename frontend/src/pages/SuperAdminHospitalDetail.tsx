import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';

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

const SuperAdminHospitalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'usage'>('overview');

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      const [tenantRes, modulesRes, usageRes] = await Promise.all([
        superAdminApi.getTenant(id!),
        superAdminApi.getTenantModules(id!),
        superAdminApi.getTenantUsage(id!),
      ]);
      
      setTenant(tenantRes.data);
      setModules(modulesRes.data);
      setUsage(usageRes.data);
    } catch (error) {
      console.error('Failed to load tenant data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleModule = async (moduleCode: string, enabled: boolean) => {
    try {
      const updatedModules: Record<string, boolean> = {};
      modules.forEach(m => {
        updatedModules[m.code] = m.code === moduleCode ? enabled : m.is_enabled;
      });
      
      await superAdminApi.configureModules(id!, updatedModules);
      loadData();
    } catch (error) {
      console.error('Failed to update module:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      trialing: 'bg-blue-100 text-blue-800',
      past_due: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
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
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ChevronLeft className="w-5 h-5" />
          Back to Hospitals
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="w-12 h-12 object-contain" />
              ) : (
                <Building2 className="w-8 h-8 text-blue-600" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-gray-500">{tenant.slug}</span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-500">{tenant.code}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(tenant.subscription_status || tenant.status)}
            <Link
              to={`/superadmin/hospitals/${id}/edit`}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Edit className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'modules', label: 'Modules', icon: Package },
            { id: 'usage', label: 'Usage & Limits', icon: CreditCard },
          ].map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId as any)}
              className={`flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tabId
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Contact Information</h3>
                <div className="space-y-2">
                  <p className="text-gray-900">{tenant.email}</p>
                  <p className="text-gray-600">{tenant.phone || 'No phone'}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Address</h3>
                <div className="space-y-1">
                  <p className="text-gray-900">{tenant.address_line_1 || 'No address'}</p>
                  <p className="text-gray-600">
                    {tenant.city}, {tenant.state_province}, {tenant.country}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 mb-4">Subscription</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Current Plan</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">
                    {tenant.plan_code || 'Free'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">
                    {tenant.subscription_status || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Last Updated</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(tenant.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modules Tab */}
        {activeTab === 'modules' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Module Configuration</h3>
              <p className="text-sm text-gray-500">
                Enable or disable features for this hospital
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modules.map((module) => (
                <div
                  key={module.id}
                  className={`border rounded-lg p-4 ${
                    module.is_core ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        module.is_enabled ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <Package className={`w-5 h-5 ${
                          module.is_enabled ? 'text-blue-600' : 'text-gray-400'
                        }`} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {module.name}
                          {module.is_core && (
                            <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                              Core
                            </span>
                          )}
                        </h4>
                        <p className="text-sm text-gray-500">{module.description}</p>
                        <span className="text-xs text-gray-400 capitalize">
                          {module.category}
                        </span>
                        {module.required_modules?.length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">
                            Requires: {module.required_modules.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={module.is_enabled}
                        onChange={(e) => handleToggleModule(module.code, e.target.checked)}
                        disabled={module.is_core}
                        className="sr-only peer"
                      />
                      <div className={`w-11 h-6 rounded-full peer ${
                        module.is_core 
                          ? 'bg-gray-300 cursor-not-allowed' 
                          : 'bg-gray-200 peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\"\"] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600'
                      }`} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Usage & Limits</h3>
            
            <div className="space-y-4">
              {usage.map((item) => (
                <div key={item.resource_type} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 capitalize">
                        {item.resource_type}
                      </h4>
                      <span className="text-xs text-gray-500">{item.period}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {item.current_usage.toLocaleString()}
                      </span>
                      <span className="text-gray-400"> / </span>
                      <span className="text-sm text-gray-500">
                        {item.max_limit?.toLocaleString() || '∞'}
                      </span>
                    </div>
                  </div>
                  
                  {getUsageBar(item.percentage_used)}
                  
                  <p className={`text-xs mt-2 ${
                    item.percentage_used > 90 ? 'text-red-600' :
                    item.percentage_used > 75 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {item.percentage_used.toFixed(1)}% used
                  </p>
                </div>
              ))}
              
              {usage.length === 0 && (
                <p className="text-gray-500 text-center py-8">No usage data available</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        {tenant.status === 'active' ? (
          <button
            onClick={() => {
              if (confirm('Are you sure you want to suspend this hospital?')) {
                superAdminApi.suspendTenant(id!, 'Administrative action').then(() => {
                  loadData();
                });
              }
            }}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            Suspend Hospital
          </button>
        ) : (
          <button
            onClick={() => {
              superAdminApi.activateTenant(id!).then(() => {
                loadData();
              });
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Activate Hospital
          </button>
        )}
      </div>
    </div>
  );
};

export default SuperAdminHospitalDetail;
