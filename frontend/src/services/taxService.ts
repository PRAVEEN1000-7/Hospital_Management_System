import api from './api';
import type { TaxConfig, TaxConfigCreateData, PaginatedResponse } from '../types/billing';

const taxService = {
  async list(page = 1, limit = 20, active_only = false): Promise<PaginatedResponse<TaxConfig>> {
    const response = await api.get<PaginatedResponse<TaxConfig>>('/tax-configurations', {
      params: { page, limit, active_only },
    });
    return response.data;
  },

  async getById(id: string): Promise<TaxConfig> {
    const response = await api.get<TaxConfig>(`/tax-configurations/${id}`);
    return response.data;
  },

  async create(data: TaxConfigCreateData): Promise<TaxConfig> {
    const response = await api.post<TaxConfig>('/tax-configurations', data);
    return response.data;
  },

  async update(id: string, data: Partial<TaxConfigCreateData>): Promise<TaxConfig> {
    const response = await api.put<TaxConfig>(`/tax-configurations/${id}`, data);
    return response.data;
  },

  async toggle(id: string): Promise<TaxConfig> {
    const response = await api.patch<TaxConfig>(`/tax-configurations/${id}/toggle`);
    return response.data;
  },
};

export default taxService;
