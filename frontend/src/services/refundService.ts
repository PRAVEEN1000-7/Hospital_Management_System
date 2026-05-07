import api from './api';
import type {
  Refund, RefundListItem, RefundCreateData, RefundProcessData, PaginatedResponse
} from '../types/billing';

const refundService = {
  async list(
    page = 1,
    limit = 10,
    params: { status?: string; invoice_id?: string; patient_id?: string } = {}
  ): Promise<PaginatedResponse<RefundListItem>> {
    const response = await api.get<PaginatedResponse<RefundListItem>>('/refunds', {
      params: { page, limit, ...params },
    });
    return response.data;
  },

  async getById(id: string): Promise<Refund> {
    const response = await api.get<Refund>(`/refunds/${id}`);
    return response.data;
  },

  async request(data: RefundCreateData): Promise<Refund> {
    const response = await api.post<Refund>('/refunds', data);
    return response.data;
  },

  async approve(id: string): Promise<Refund> {
    const response = await api.patch<Refund>(`/refunds/${id}/approve`);
    return response.data;
  },

  async reject(id: string, reason?: string): Promise<Refund> {
    const response = await api.patch<Refund>(`/refunds/${id}/reject`, {
      reason_detail: reason,
    });
    return response.data;
  },

  async process(id: string, data?: Partial<RefundProcessData>): Promise<Refund> {
    const response = await api.patch<Refund>(`/refunds/${id}/process`, data || {});
    return response.data;
  },
};

export default refundService;
