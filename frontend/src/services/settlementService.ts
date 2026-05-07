import api from './api';
import type { Settlement, SettlementListItem, SettlementCreateData, PaginatedResponse } from '../types/billing';

const settlementService = {
  async list(
    page = 1,
    limit = 10,
    params: { status?: string; date_from?: string; date_to?: string } = {}
  ): Promise<PaginatedResponse<SettlementListItem>> {
    const response = await api.get<PaginatedResponse<SettlementListItem>>('/settlements', {
      params: { page, limit, ...params },
    });
    return response.data;
  },

  async getById(id: string): Promise<Settlement> {
    const response = await api.get<Settlement>(`/settlements/${id}`);
    return response.data;
  },

  async create(data: SettlementCreateData): Promise<Settlement> {
    const response = await api.post<Settlement>('/settlements', data);
    return response.data;
  },

  async close(id: string): Promise<Settlement> {
    const response = await api.patch<Settlement>(`/settlements/${id}/close`);
    return response.data;
  },

  async verify(id: string): Promise<Settlement> {
    const response = await api.patch<Settlement>(`/settlements/${id}/verify`);
    return response.data;
  },
};

export default settlementService;
