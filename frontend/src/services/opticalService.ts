import api from './api';
import type {
  OpticalProduct, OpticalProductCreateData, OpticalProductListResponse,
  OpticalBatch, OpticalBatchCreateData,
  OpticalPrescription, OpticalPrescriptionCreateData, OpticalPrescriptionListResponse,
  OpticalSale, OpticalSaleCreateData, OpticalSaleListResponse,
  OpticalStockAdjustment, OpticalStockAdjustmentCreate,
  OpticalDashboard,
  OpticalQueueEntry, OpticalQueueStatus,
} from '../types/optical';

export interface PendingOpticalPrescription {
  id: string;
  prescription_number: string;
  status: 'finalized' | 'dispensed';
  patient_name: string;
  patient_reference_number?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  patient_phone?: string | null;
  doctor_name: string;
  doctor_specialization?: string | null;
  finalized_at: string;
  created_at: string;
}

export interface OpticalSalesTrendPoint {
  date: string;
  sales: number;
  orders_count: number;
}

export interface TopOpticalProduct {
  name: string;
  product_id: string;
  quantity_sold: number;
  revenue: number;
  category: string | null;
}

export const opticalService = {

  // ═══ Dashboard ═══
  async getDashboard(): Promise<OpticalDashboard> {
    const res = await api.get<OpticalDashboard>('/optical/dashboard');
    return res.data;
  },

  async getSalesTrend(days = 30): Promise<OpticalSalesTrendPoint[]> {
    const res = await api.get<OpticalSalesTrendPoint[]>('/optical/analytics/sales-trend', { params: { days } });
    return res.data;
  },

  async getTopProducts(days = 30, limit = 10): Promise<TopOpticalProduct[]> {
    const res = await api.get<TopOpticalProduct[]>('/optical/analytics/top-products', { params: { days, limit } });
    return res.data;
  },

  // ═══ Products ═══
  async getProducts(
    page = 1, limit = 20, search = '', category = '', activeOnly = true
  ): Promise<OpticalProductListResponse> {
    const params: Record<string, string | number | boolean> = { page, limit, active_only: activeOnly };
    if (search) params.search = search;
    if (category) params.category = category;
    const res = await api.get<OpticalProductListResponse>('/optical/products', { params });
    return res.data;
  },

  async getProduct(id: string): Promise<OpticalProduct> {
    const res = await api.get<OpticalProduct>(`/optical/products/${id}`);
    return res.data;
  },

  async createProduct(data: OpticalProductCreateData): Promise<OpticalProduct> {
    const res = await api.post<OpticalProduct>('/optical/products', data);
    return res.data;
  },

  async updateProduct(id: string, data: Partial<OpticalProductCreateData>): Promise<OpticalProduct> {
    const res = await api.put<OpticalProduct>(`/optical/products/${id}`, data);
    return res.data;
  },

  async deleteProduct(id: string): Promise<void> {
    await api.delete(`/optical/products/${id}`);
  },

  // ═══ Batches ═══
  async getBatches(productId: string, activeOnly = true): Promise<OpticalBatch[]> {
    const res = await api.get<OpticalBatch[]>(`/optical/products/${productId}/batches`, {
      params: { active_only: activeOnly },
    });
    return res.data;
  },

  async createBatch(data: OpticalBatchCreateData): Promise<OpticalBatch> {
    const res = await api.post<OpticalBatch>('/optical/batches', data);
    return res.data;
  },

  async updateBatch(id: string, data: Partial<OpticalBatchCreateData>): Promise<OpticalBatch> {
    const res = await api.put<OpticalBatch>(`/optical/batches/${id}`, data);
    return res.data;
  },

  // ═══ Eye Prescriptions ═══
  async getPendingPrescriptions(
    page = 1,
    limit = 20,
    status = '',
    search = '',
  ): Promise<{ total: number; page: number; limit: number; total_pages: number; data: PendingOpticalPrescription[] }> {
    const params: Record<string, string | number> = { page, limit };
    if (status) params.status = status;
    if (search) params.search = search;
    const res = await api.get('/optical/prescriptions/pending', { params });
    return res.data;
  },

  async getPrescriptions(
    page = 1, limit = 20, patientId = '', doctorId = ''
  ): Promise<OpticalPrescriptionListResponse> {
    const params: Record<string, string | number> = { page, limit };
    if (patientId) params.patient_id = patientId;
    if (doctorId) params.doctor_id = doctorId;
    const res = await api.get<OpticalPrescriptionListResponse>('/optical/prescriptions', { params });
    return res.data;
  },

  async getPrescription(id: string): Promise<OpticalPrescription> {
    const res = await api.get<OpticalPrescription>(`/optical/prescriptions/${id}`);
    return res.data;
  },

  async createPrescription(data: OpticalPrescriptionCreateData): Promise<OpticalPrescription> {
    const res = await api.post<OpticalPrescription>('/optical/prescriptions', data);
    return res.data;
  },

  async updatePrescription(id: string, data: Partial<OpticalPrescriptionCreateData>): Promise<OpticalPrescription> {
    const res = await api.put<OpticalPrescription>(`/optical/prescriptions/${id}`, data);
    return res.data;
  },

  async finalizePrescription(id: string): Promise<OpticalPrescription> {
    const res = await api.post<OpticalPrescription>(`/optical/prescriptions/${id}/finalize`);
    return res.data;
  },

  async getPrescriptionPdfUrl(id: string): Promise<string> {
    const res = await api.get(`/optical/prescriptions/${id}/pdf`, { responseType: 'text' });
    return res.data;
  },

  // ═══ Sales ═══
  async getSales(
    page = 1, limit = 20, search = '', dateFrom = '', dateTo = '', saleStatus = ''
  ): Promise<OpticalSaleListResponse> {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (saleStatus) params.sale_status = saleStatus;
    const res = await api.get<OpticalSaleListResponse>('/optical/sales', { params });
    return res.data;
  },

  async getSale(id: string): Promise<OpticalSale> {
    const res = await api.get<OpticalSale>(`/optical/sales/${id}`);
    return res.data;
  },

  async createSale(data: OpticalSaleCreateData): Promise<OpticalSale> {
    const res = await api.post<OpticalSale>('/optical/sales', data);
    return res.data;
  },

  // ═══ Dispensing Queue ═══
  async getQueue(): Promise<OpticalQueueEntry[]> {
    const res = await api.get<OpticalQueueEntry[]>('/optical/queue');
    return res.data;
  },

  async updateQueueStatus(saleId: string, queueStatus: OpticalQueueStatus): Promise<OpticalQueueEntry> {
    const res = await api.put<OpticalQueueEntry>(`/optical/queue/${saleId}/status`, { queue_status: queueStatus });
    return res.data;
  },

  // ═══ Stock Adjustments ═══
  async getStockAdjustments(productId?: string): Promise<OpticalStockAdjustment[]> {
    const params: Record<string, string> = {};
    if (productId) params.product_id = productId;
    const res = await api.get<OpticalStockAdjustment[]>('/optical/stock-adjustments', { params });
    return res.data;
  },

  async createStockAdjustment(data: OpticalStockAdjustmentCreate): Promise<OpticalStockAdjustment> {
    const res = await api.post<OpticalStockAdjustment>('/optical/stock-adjustments', data);
    return res.data;
  },
};

export default opticalService;
