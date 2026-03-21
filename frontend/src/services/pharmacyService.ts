import api from './api';
import type {
  Medicine, MedicineCreateData, MedicineListResponse,
  MedicineBatch, BatchCreateData,
  Sale, SaleCreateData, SaleListResponse,
  StockAdjustment, StockAdjustmentCreate,
  PharmacyDashboard,
} from '../types/pharmacy';

// Types for dispensing
export interface PendingPrescription {
  id: string;
  prescription_number: string;
  status: 'finalized' | 'partially_dispensed' | 'dispensed';
  patient_name: string;
  patient_reference_number?: string;
  patient_age?: number;
  patient_gender?: string;
  patient_phone?: string;
  doctor_name: string;
  doctor_specialization?: string;
  finalized_at: string;
  created_at: string;
  total_items: number;
  dispensed_items: number;
  pending_items: number;
  items: PrescriptionItemWithStock[];
}

export interface PrescriptionItemWithStock {
  id: string;
  medicine_id: string;
  medicine_name: string;
  generic_name?: string;
  dosage: string;
  frequency: string;
  quantity: number;
  dispensed_quantity: number;
  is_dispensed: boolean;
  allow_substitution: boolean;
  available_quantity: number;
  available_batches: MedicineBatch[];
}

export interface DispenseItemData {
  prescription_item_id: string;
  medicine_id: string;
  batch_id: string;
  quantity: number;
  unit_price: number;
}

export interface DispensingResult {
  dispensing_id: string;
  dispensing_number: string;
  prescription_id: string;
  prescription_number: string;
  status: string;
  total_amount: number;
  items_dispensed: number;
}

export const pharmacyService = {

  // ═══ Dashboard ═══
  async getDashboard(): Promise<PharmacyDashboard> {
    const res = await api.get<PharmacyDashboard>('/pharmacy/dashboard');
    return res.data;
  },

  // ═══ Medicines ═══
  async getMedicines(
    page = 1, limit = 20, search = '', category = '', activeOnly = true
  ): Promise<MedicineListResponse> {
    const params: Record<string, string | number | boolean> = { page, limit, active_only: activeOnly };
    if (search) params.search = search;
    if (category) params.category = category;
    const res = await api.get<MedicineListResponse>('/pharmacy/medicines', { params });
    return res.data;
  },

  async getMedicine(id: string): Promise<Medicine> {
    const res = await api.get<Medicine>(`/pharmacy/medicines/${id}`);
    return res.data;
  },

  async createMedicine(data: MedicineCreateData): Promise<Medicine> {
    const res = await api.post<Medicine>('/pharmacy/medicines', data);
    return res.data;
  },

  async updateMedicine(id: string, data: Partial<MedicineCreateData>): Promise<Medicine> {
    const res = await api.put<Medicine>(`/pharmacy/medicines/${id}`, data);
    return res.data;
  },

  async deleteMedicine(id: string): Promise<void> {
    await api.delete(`/pharmacy/medicines/${id}`);
  },

  // ═══ Batches ═══
  async getBatches(medicineId: string, activeOnly = true): Promise<MedicineBatch[]> {
    const res = await api.get<MedicineBatch[]>(`/pharmacy/medicines/${medicineId}/batches`, {
      params: { active_only: activeOnly },
    });
    return res.data;
  },

  async createBatch(data: BatchCreateData): Promise<MedicineBatch> {
    const res = await api.post<MedicineBatch>('/pharmacy/batches', data);
    return res.data;
  },

  async updateBatch(id: string, data: Partial<BatchCreateData>): Promise<MedicineBatch> {
    const res = await api.put<MedicineBatch>(`/pharmacy/batches/${id}`, data);
    return res.data;
  },

  // ═══ Sales ═══
  async getSales(
    page = 1, limit = 20, search = '', dateFrom = '', dateTo = ''
  ): Promise<SaleListResponse> {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get<SaleListResponse>('/pharmacy/sales', { params });
    return res.data;
  },

  async getSale(id: string): Promise<Sale> {
    const res = await api.get<Sale>(`/pharmacy/sales/${id}`);
    return res.data;
  },

  async createSale(data: SaleCreateData): Promise<Sale> {
    const res = await api.post<Sale>('/pharmacy/sales', data);
    return res.data;
  },

  // ═══ Stock Adjustments ═══
  async getStockAdjustments(medicineId?: string): Promise<StockAdjustment[]> {
    const params: Record<string, string> = {};
    if (medicineId) params.medicine_id = medicineId;
    const res = await api.get<StockAdjustment[]>('/pharmacy/stock-adjustments', { params });
    return res.data;
  },

  async createStockAdjustment(data: StockAdjustmentCreate): Promise<StockAdjustment> {
    const res = await api.post<StockAdjustment>('/pharmacy/stock-adjustments', data);
    return res.data;
  },

  // ═══ Dispensing (Prescription Queue) ═══
  /**
   * Get pending prescriptions queue for dispensing
   */
  async getPendingPrescriptions(
    page = 1,
    limit = 20,
    statusFilter?: 'pending' | 'partial' | 'dispensed',
    doctorId?: string,
    search?: string
  ): Promise<{ total: number; page: number; limit: number; total_pages: number; data: PendingPrescription[] }> {
    const params: Record<string, string | number> = { page, limit };
    if (statusFilter) params.status = statusFilter;
    if (doctorId) params.doctor_id = doctorId;
    if (search) params.search = search;
    
    const res = await api.get('/pharmacy/prescriptions/pending', { params });
    return res.data;
  },

  /**
   * Get prescription details for dispensing
   */
  async getPrescriptionForDispensing(prescriptionId: string): Promise<PendingPrescription> {
    const res = await api.get(`/pharmacy/prescriptions/${prescriptionId}/dispense-details`);
    return res.data;
  },

  /**
   * Dispense medicines from a prescription
   */
  async dispensePrescription(
    prescriptionId: string,
    items: DispenseItemData[],
    notes?: string
  ): Promise<{ success: boolean; message: string; data: DispensingResult }> {
    const res = await api.post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, {
      items,
      notes,
    });
    return res.data;
  },

  /**
   * Get available batches for a medicine
   */
  async getAvailableBatches(medicineId: string, minQuantity: number = 1): Promise<MedicineBatch[]> {
    const res = await api.get(`/pharmacy/medicines/${medicineId}/available-batches`, {
      params: { min_quantity: minQuantity },
    });
    return res.data.data || [];
  },

  /**
   * Get dispensing record by ID
   */
  async getDispensingRecord(dispensingId: string): Promise<any> {
    const res = await api.get(`/pharmacy/dispensing/${dispensingId}`);
    return res.data;
  },
};

export default pharmacyService;
