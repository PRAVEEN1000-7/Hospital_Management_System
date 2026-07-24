import api from './api';
import type {
  LabTest, LabTestCreateData, LabTestListResponse,
  LabOrder, LabOrderCreateData, LabResultEntryData,
  LabQueueEntry, LabQueueStatus, LabSale, LabDashboard,
  PatientLabResult, LabReferral, LabReferralCreateData,
} from '../types/lab';

export const labService = {

  // ═══ Dashboard ═══
  async getDashboard(): Promise<LabDashboard> {
    const res = await api.get<LabDashboard>('/lab/dashboard');
    return res.data;
  },

  // ═══ Test catalog ═══
  async getTests(
    page = 1, limit = 100, search = '', category = '', activeOnly = true,
  ): Promise<LabTestListResponse> {
    const params: Record<string, string | number | boolean> = { page, limit, active_only: activeOnly };
    if (search) params.search = search;
    if (category) params.category = category;
    const res = await api.get<LabTestListResponse>('/lab/tests', { params });
    return res.data;
  },

  async createTest(data: LabTestCreateData): Promise<LabTest> {
    const res = await api.post<LabTest>('/lab/tests', data);
    return res.data;
  },

  async updateTest(id: string, data: Partial<LabTestCreateData>): Promise<LabTest> {
    const res = await api.put<LabTest>(`/lab/tests/${id}`, data);
    return res.data;
  },

  async deleteTest(id: string): Promise<void> {
    await api.delete(`/lab/tests/${id}`);
  },

  // ═══ Orders ═══
  async createOrder(data: LabOrderCreateData): Promise<LabOrder> {
    const res = await api.post<LabOrder>('/lab/orders', data);
    return res.data;
  },

  async getOrder(id: string): Promise<LabOrder> {
    const res = await api.get<LabOrder>(`/lab/orders/${id}`);
    return res.data;
  },

  async getOrderPdfHtml(id: string): Promise<string> {
    const res = await api.get(`/lab/orders/${id}/pdf`, { responseType: 'text' });
    return res.data;
  },

  async updateQueueStatus(orderId: string, queueStatus: LabQueueStatus): Promise<LabQueueEntry> {
    const res = await api.put<LabQueueEntry>(`/lab/orders/${orderId}/queue-status`, { queue_status: queueStatus });
    return res.data;
  },

  async getOrCreateSale(orderId: string): Promise<LabSale> {
    const res = await api.post<LabSale>(`/lab/orders/${orderId}/sale`);
    return res.data;
  },

  async markSalePaid(orderId: string, amountPaid: number, paymentMethod?: string): Promise<LabSale> {
    const res = await api.put<LabSale>(`/lab/sales/${orderId}/mark-paid`, {
      amount_paid: amountPaid, payment_method: paymentMethod,
    });
    return res.data;
  },

  async recordResult(orderId: string, itemId: string, data: LabResultEntryData): Promise<LabOrder> {
    const res = await api.put<LabOrder>(`/lab/orders/${orderId}/items/${itemId}/result`, data);
    return res.data;
  },

  async finalizeReport(orderId: string): Promise<LabOrder> {
    const res = await api.post<LabOrder>(`/lab/orders/${orderId}/finalize`);
    return res.data;
  },

  // ═══ Queue ═══
  async getQueue(): Promise<LabQueueEntry[]> {
    const res = await api.get<LabQueueEntry[]>('/lab/queue');
    return res.data;
  },

  // ═══ Patient results ═══
  async getPatientResults(patientId: string): Promise<PatientLabResult[]> {
    const res = await api.get<PatientLabResult[]>(`/lab/results/patient/${patientId}`);
    return res.data;
  },

  // ═══ Referrals ═══
  async createReferral(data: LabReferralCreateData): Promise<LabReferral> {
    const res = await api.post<LabReferral>('/lab/referrals', data);
    return res.data;
  },

  async getPatientReferrals(patientId: string): Promise<LabReferral[]> {
    const res = await api.get<LabReferral[]>(`/lab/referrals/patient/${patientId}`);
    return res.data;
  },

  async getReferral(id: string): Promise<LabReferral> {
    const res = await api.get<LabReferral>(`/lab/referrals/${id}`);
    return res.data;
  },
};

export default labService;
