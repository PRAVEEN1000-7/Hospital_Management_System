import api from './api';
import type { Payment, PaymentListItem, PaymentCreateData, PaginatedResponse } from '../types/billing';

const paymentService = {
  async list(
    page = 1,
    limit = 10,
    params: { search?: string; payment_mode?: string; invoice_id?: string; date_from?: string; date_to?: string; date_range?: string } = {}
  ): Promise<PaginatedResponse<PaymentListItem>> {
    const response = await api.get<PaginatedResponse<PaymentListItem>>('/payments', {
      params: { page, limit, ...params },
    });
    return response.data;
  },

  async getByInvoice(invoiceId: string): Promise<PaginatedResponse<PaymentListItem>> {
    const response = await api.get<PaginatedResponse<PaymentListItem>>(`/payments/invoice/${invoiceId}`, {
      params: { limit: 100 },
    });
    return response.data;
  },

  async getById(id: string): Promise<Payment> {
    const response = await api.get<Payment>(`/payments/${id}`);
    return response.data;
  },

  async record(data: PaymentCreateData): Promise<Payment> {
    const response = await api.post<Payment>('/payments', data);
    return response.data;
  },
};

export default paymentService;
