import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Plus,
  Search,
  Edit,
  Power,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Package,
  X,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  code: string;
  email: string;
  phone: string;
  status: string;
  display_status: string;
  plan_name: string;
  plan_code: string;
  subscription_status: string;
  created_at: string;
}

const SuperAdminHospitals: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const toast = useToast();
  const confirm = useConfirm();
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const loadTenants = async () => {
    try {
      const response = await superAdminApi.getTenants({
        page,
        limit: 10,
        search: searchQuery,
        status: statusFilter,
      });
      setTenants(response.data.data);
      setTotal(response.data.total);
      setTotalPages(response.data.total_pages);
    } catch (error) {
      console.error('Failed to load tenants:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [page, searchQuery, statusFilter]);

  useEffect(() => {
    if (isAssignModalOpen) {
      loadPlans();
    }
  }, [isAssignModalOpen]);

  const loadPlans = async () => {
    try {
      const res = await superAdminApi.getPlans(false);
      const activePlans = res.data.filter((p: any) => p.is_active);
      setPlans(activePlans);
      if (activePlans.length > 0) setSelectedPlanId(activePlans[0].id);
    } catch (err) {
      toast.error('Failed to load plans');
    }
  };

  const handleOpenAssignModal = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTenant || !selectedPlanId) return;

    setIsAssigning(true);
    try {
      await superAdminApi.assignPlan({
        hospital_code: selectedTenant.code,
        plan_id: selectedPlanId,
      });
      toast.success('Plan assigned successfully');
      setIsAssignModalOpen(false);
      loadTenants();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to assign plan');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSuspend = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Suspend Hospital',
      message: `Are you sure you want to suspend "${name}"? Staff will lose access immediately.`,
      confirmLabel: 'Suspend',
      variant: 'warning',
    });
    if (!ok) return;

    try {
      await superAdminApi.suspendTenant(id, 'Administrative suspension');
      toast.success(`${name} has been suspended`);
      loadTenants();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to suspend hospital');
    }
  };

  const handleActivate = async (id: string, name: string) => {
    try {
      await superAdminApi.activateTenant(id);
      toast.success(`${name} has been activated`);
      loadTenants();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to activate hospital');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active:    'bg-green-100 text-green-800',
      trialing:  'bg-blue-100 text-blue-800',
      past_due:  'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
      pending:   'bg-amber-100 text-amber-800',
      cancelled: 'bg-gray-100 text-gray-600',
    };

    const icons: Record<string, React.ElementType> = {
      active:    CheckCircle,
      trialing:  Clock,
      past_due:  AlertCircle,
      suspended: XCircle,
      pending:   Clock,
      cancelled: XCircle,
    };
    
    const Icon = icons[status as keyof typeof icons] || AlertCircle;
    const style = styles[status as keyof typeof styles] || styles.pending;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
        <Icon className="w-3 h-3" />
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  const getPlanBadge = (plan: string) => {
    const styles: Record<string, string> = {
      enterprise: 'bg-purple-100 text-purple-800',
      professional: 'bg-blue-100 text-blue-800',
      starter: 'bg-green-100 text-green-800',
      free: 'bg-gray-100 text-gray-800',
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[plan] || styles.free}`}>
        {plan?.toUpperCase()}
      </span>
    );
  };

  const canAssignPlan = (tenant: Tenant) => {
    const subscriptionStatus = (tenant.subscription_status || '').toLowerCase();
    if (subscriptionStatus && ['trialing', 'active', 'past_due'].includes(subscriptionStatus)) {
      return false;
    }

    return ['pending', 'pending_plan'].includes((tenant.status || '').toLowerCase()) || !subscriptionStatus;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hospitals</h1>
          <p className="text-gray-600 mt-1">
            {total > 0 ? `${total} hospital${total !== 1 ? 's' : ''} on the platform` : 'Manage all hospitals on the platform'}
          </p>
        </div>
        <Link
          to="/superadmin/hospitals/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Hospital
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search hospitals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trial</option>
            <option value="past_due">Past Due</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hospital
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {tenant.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {tenant.slug} • {tenant.code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(tenant.subscription_status || tenant.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getPlanBadge(tenant.plan_code || 'free')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{tenant.email}</div>
                        <div className="text-sm text-gray-500">{tenant.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tenant.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/superadmin/hospitals/${tenant.id}`}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            to={`/superadmin/hospitals/${tenant.id}/edit`}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          {canAssignPlan(tenant) ? (
                            <button
                              onClick={() => handleOpenAssignModal(tenant)}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-xs font-medium"
                              title="Assign Plan"
                            >
                              <Package className="w-4 h-4" />
                              Assign Plan
                            </button>
                          ) : tenant.status === 'active' ? (
                            <button
                              onClick={() => handleSuspend(tenant.id, tenant.name)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Suspend"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivate(tenant.id, tenant.name)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title="Activate"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No hospitals found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {/* Assign Plan Modal */}
      {isAssignModalOpen && selectedTenant && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Assign Plan</h2>
              <button onClick={() => setIsAssignModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            {/* Scrollable body */}
            <form onSubmit={handleAssignSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                <p className="text-sm text-slate-600">
                  Assigning a plan to <span className="font-bold">{selectedTenant.name}</span> (Code: {selectedTenant.code})
                </p>
                <label className="block text-sm font-medium text-slate-700">Select Subscription Plan</label>
                <div className="space-y-3">
                  {plans.map(plan => (
                    <label key={plan.id} className={`flex items-center p-3 border rounded-lg cursor-pointer ${selectedPlanId === plan.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200'}`}>
                      <input
                        type="radio"
                        name="plan"
                        value={plan.id}
                        checked={selectedPlanId === plan.id}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        className="w-4 h-4 text-primary focus:ring-primary border-slate-300 mr-3"
                      />
                      <div>
                        <div className="font-medium text-slate-900">{plan.name}</div>
                        <div className="text-xs text-slate-500">₹{plan.base_price}/mo</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {/* Footer buttons — always visible */}
              <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || !selectedPlanId}
                  className="flex-1 bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {isAssigning ? 'Assigning...' : 'Assign Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminHospitals;
