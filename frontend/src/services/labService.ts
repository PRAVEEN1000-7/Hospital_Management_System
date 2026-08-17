import api from './api';
import type {
  LabTest, LabTestCreateData, LabTestListResponse,
  LabTestPanel, LabTestPanelCreateData, LabTestPanelListResponse,
  LabOrder, LabOrderCreateData, LabResultEntryData, LabOrderItemTestUpdateData,
  LabOrderItemBillingUpdateData,
  LabQueueEntry, LabQueueStatus, LabSale, LabDashboard,
  LabBillingListResponse,
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

  /** Deactivates the test (hides it from new orders) — history referencing
   * it is untouched. See permanentlyDeleteTest for a full removal. */
  async deleteTest(id: string): Promise<void> {
    await api.delete(`/lab/tests/${id}`);
  },

  /** Completely removes the catalog entry. Backend rejects this with a 409
   * if the test has ever been used in a lab order — deactivate it instead
   * in that case. */
  async permanentlyDeleteTest(id: string): Promise<void> {
    await api.delete(`/lab/tests/${id}/permanent`);
  },

  // ═══ Test packages (named bundles, e.g. "MHC — Master Health Checkup") ═══
  async getPanels(activeOnly = true): Promise<LabTestPanel[]> {
    const res = await api.get<LabTestPanelListResponse>('/lab/panels', { params: { active_only: activeOnly } });
    return res.data.data;
  },

  async createPanel(data: LabTestPanelCreateData): Promise<LabTestPanel> {
    const res = await api.post<LabTestPanel>('/lab/panels', data);
    return res.data;
  },

  async updatePanel(id: string, data: Partial<LabTestPanelCreateData>): Promise<LabTestPanel> {
    const res = await api.put<LabTestPanel>(`/lab/panels/${id}`, data);
    return res.data;
  },

  /** Deactivates the package (hides it from the doctor's picker) — history
   * of past orders that used its member tests is untouched. */
  async deletePanel(id: string): Promise<void> {
    await api.delete(`/lab/panels/${id}`);
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

  /** Lab-staff/admin only — 409s if the order has already been billed. */
  async deleteOrder(id: string): Promise<void> {
    await api.delete(`/lab/orders/${id}`);
  },

  async updateQueueStatus(orderId: string, queueStatus: LabQueueStatus): Promise<LabQueueEntry> {
    const res = await api.put<LabQueueEntry>(`/lab/orders/${orderId}/queue-status`, { queue_status: queueStatus });
    return res.data;
  },

  async getOrCreateSale(orderId: string): Promise<LabSale> {
    const res = await api.post<LabSale>(`/lab/orders/${orderId}/sale`);
    return res.data;
  },

  /** Collects a payment against a lab order's bill. `amountPaid` is the
   * amount being collected in THIS call (not the cumulative total) — call
   * this again with a smaller amount later to collect the remaining
   * balance. Can be called any number of times until the order is fully paid. */
  async markSalePaid(orderId: string, amountPaid: number, paymentMethod?: string, paymentReference?: string): Promise<LabSale> {
    const res = await api.put<LabSale>(`/lab/sales/${orderId}/mark-paid`, {
      amount_paid: amountPaid, payment_method: paymentMethod, payment_reference: paymentReference || undefined,
    });
    return res.data;
  },

  // ═══ Billing worklist ═══
  async getBilling(
    page = 1, limit = 20, search = '', paymentStatus = '', dateFrom = '', dateTo = '',
  ): Promise<LabBillingListResponse> {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    if (paymentStatus) params.payment_status = paymentStatus;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get<LabBillingListResponse>('/lab/billing', { params });
    return res.data;
  },

  async recordResult(orderId: string, itemId: string, data: LabResultEntryData): Promise<LabOrder> {
    const res = await api.put<LabOrder>(`/lab/orders/${orderId}/items/${itemId}/result`, data);
    return res.data;
  },

  /** Swaps which catalog test an order item bills for — 409s if the report
   * is finalized or any payment has already been collected against the
   * order (see backend lab_service.update_lab_order_item_test). */
  async updateItemTest(orderId: string, itemId: string, labTestId: string): Promise<LabOrder> {
    const data: LabOrderItemTestUpdateData = { lab_test_id: labTestId };
    const res = await api.put<LabOrder>(`/lab/orders/${orderId}/items/${itemId}/test`, data);
    return res.data;
  },

  /** Sets the actual billed amount (and an optional billing-only display
   * name) for one order item. Catalog test price is always ₹0 — this is
   * the only place a lab order's price is ever set. 409s under the same
   * edit-boundary rule as updateItemTest (finalized report, or any payment
   * already collected against the order). */
  async updateItemBilling(orderId: string, itemId: string, price: number, billedName?: string): Promise<LabOrder> {
    const data: LabOrderItemBillingUpdateData = { price, billed_name: billedName || undefined };
    const res = await api.put<LabOrder>(`/lab/orders/${orderId}/items/${itemId}/billing`, data);
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
