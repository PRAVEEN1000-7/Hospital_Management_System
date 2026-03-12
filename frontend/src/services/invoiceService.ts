import api from './api';
import type {
  Invoice, InvoiceListItem, InvoiceCreateData, InvoiceUpdateData,
  InvoiceItem, InvoiceItemCreateData, PaginatedResponse,
} from '../types/billing';

const invoiceService = {
  async list(
    page = 1,
    limit = 10,
    params: {
      search?: string;
      status?: string;
      invoice_type?: string;
      patient_id?: string;
    } = {}
  ): Promise<PaginatedResponse<InvoiceListItem>> {
    const response = await api.get<PaginatedResponse<InvoiceListItem>>('/invoices', {
      params: { page, limit, ...params },
    });
    return response.data;
  },

  async getById(id: string): Promise<Invoice> {
    const response = await api.get<Invoice>(`/invoices/${id}`);
    return response.data;
  },

  async getByPatient(patientId: string, page = 1, limit = 10): Promise<PaginatedResponse<InvoiceListItem>> {
    const response = await api.get<PaginatedResponse<InvoiceListItem>>(`/invoices/patient/${patientId}`, {
      params: { page, limit },
    });
    return response.data;
  },

  async create(data: InvoiceCreateData): Promise<Invoice> {
    const response = await api.post<Invoice>('/invoices', data);
    return response.data;
  },

  async update(id: string, data: InvoiceUpdateData): Promise<Invoice> {
    const response = await api.put<Invoice>(`/invoices/${id}`, data);
    return response.data;
  },

  async issue(id: string): Promise<Invoice> {
    const response = await api.patch<Invoice>(`/invoices/${id}/issue`);
    return response.data;
  },

  async void(id: string): Promise<Invoice> {
    const response = await api.patch<Invoice>(`/invoices/${id}/void`);
    return response.data;
  },

  async addItem(invoiceId: string, data: InvoiceItemCreateData): Promise<InvoiceItem> {
    const response = await api.post<InvoiceItem>(`/invoices/${invoiceId}/items`, data);
    return response.data;
  },

  async removeItem(invoiceId: string, itemId: string): Promise<void> {
    await api.delete(`/invoices/${invoiceId}/items/${itemId}`);
  },
};

export default invoiceService;
