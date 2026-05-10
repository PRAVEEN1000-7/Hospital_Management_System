import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Create axios instance with auth header
const api = axios.create({
  baseURL: API_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Let the main auth context handle redirection
    }
    return Promise.reject(error);
  }
);

export const superAdminApi = {
  // Auth
  login: (data: { username: string; password: string }) =>
    api.post('/superadmin/login', data),
  
  getMe: () => api.get('/superadmin/me'),

  // Dashboard
  getDashboardStats: () => api.get('/superadmin/dashboard/stats'),

  // Tenants (Hospitals)
  getTenants: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    api.get('/superadmin/tenants', { params }),
  
  getTenant: (id: string) => api.get(`/superadmin/tenants/${id}`),
  
  createTenant: (data: any) => api.post('/superadmin/tenants', data),
  
  updateTenant: (id: string, data: any) => api.put(`/superadmin/tenants/${id}`, data),
  
  suspendTenant: (id: string, reason: string) =>
    api.post(`/superadmin/tenants/${id}/suspend`, { reason }),
  
  activateTenant: (id: string) =>
    api.post(`/superadmin/tenants/${id}/activate`),

  // Modules
  getModules: (category?: string) =>
    api.get('/superadmin/modules', { params: { category } }),
  
  getTenantModules: (tenantId: string) =>
    api.get(`/superadmin/tenants/${tenantId}/modules`),
  
  configureModules: (tenantId: string, modules: Record<string, boolean>) =>
    api.put(`/superadmin/tenants/${tenantId}/modules`, { modules }),

  // Subscription Plans
  getPlans: (includeInactive?: boolean) =>
    api.get('/superadmin/plans', { params: { include_inactive: includeInactive } }),
  
  createPlan: (data: any) => api.post('/superadmin/plans', data),
  
  updatePlan: (id: string, data: any) => api.put(`/superadmin/plans/${id}`, data),

  assignPlan: (data: { hospital_code: string; plan_id: string; modules?: Record<string, boolean> }) => 
    api.post('/superadmin/plans/assign', data),

  // Subscriptions
  getTenantSubscription: (tenantId: string) =>
    api.get(`/superadmin/tenants/${tenantId}/subscription`),
  
  changePlan: (tenantId: string, newPlanId: string, immediate?: boolean) =>
    api.post(`/superadmin/tenants/${tenantId}/change-plan`, {
      new_plan_id: newPlanId,
      immediate,
    }),
  
  cancelSubscription: (tenantId: string, reason: string, atPeriodEnd?: boolean) =>
    api.post(`/superadmin/tenants/${tenantId}/cancel`, {
      reason,
      at_period_end: atPeriodEnd,
    }),
  
  reactivateSubscription: (tenantId: string, newPlanId?: string) =>
    api.post(`/superadmin/tenants/${tenantId}/reactivate`, { new_plan_id: newPlanId }),

  // Usage & Quotas
  getTenantUsage: (tenantId: string) =>
    api.get(`/superadmin/tenants/${tenantId}/usage`),

  // Audit Logs
  getAuditLogs: (params?: { tenant_id?: string; action?: string; limit?: number }) =>
    api.get('/superadmin/audit-logs', { params }),
};

export default api;
