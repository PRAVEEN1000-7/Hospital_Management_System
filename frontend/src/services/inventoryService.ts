import api from './api';
import type {
  Supplier, SupplierCreate, SupplierUpdate,
  PurchaseOrder, PurchaseOrderCreate,
  GoodsReceiptNote, GRNCreate,
  StockMovement, StockAdjustment, StockAdjustmentCreate,
  CycleCount, CycleCountCreate,
  InventoryDashboardData, LowStockItem, ExpiringItem,
  PaginatedResponse,
} from '../types/inventory';

const inventoryService = {
  // ── Dashboard ──────────────────────────────────────────────────────────
  async getDashboard(): Promise<InventoryDashboardData> {
    const res = await api.get<InventoryDashboardData>('/inventory/dashboard');
    return res.data;
  },
  async getLowStock(limit = 20): Promise<LowStockItem[]> {
    const res = await api.get<LowStockItem[]>('/inventory/low-stock', { params: { limit } });
    return res.data;
  },
  async getExpiringItems(days = 90): Promise<ExpiringItem[]> {
    const res = await api.get<ExpiringItem[]>('/inventory/expiring', { params: { days } });
    return res.data;
  },

  // ── Suppliers ──────────────────────────────────────────────────────────
  async getSuppliers(page = 1, limit = 10, search = '', is_active?: boolean): Promise<PaginatedResponse<Supplier>> {
    const params: Record<string, string | number | boolean> = { page, limit };
    if (search) params.search = search;
    if (is_active !== undefined) params.is_active = is_active;
    const res = await api.get<PaginatedResponse<Supplier>>('/inventory/suppliers', { params });
    return res.data;
  },
  async getSupplier(id: string): Promise<Supplier> {
    const res = await api.get<Supplier>(`/inventory/suppliers/${id}`);
    return res.data;
  },
  async createSupplier(data: SupplierCreate): Promise<Supplier> {
    const res = await api.post<Supplier>('/inventory/suppliers', data);
    return res.data;
  },
  async updateSupplier(id: string, data: SupplierUpdate): Promise<Supplier> {
    const res = await api.put<Supplier>(`/inventory/suppliers/${id}`, data);
    return res.data;
  },
  async deleteSupplier(id: string): Promise<void> {
    await api.delete(`/inventory/suppliers/${id}`);
  },

  // ── Purchase Orders ────────────────────────────────────────────────────
  async getPurchaseOrders(
    page = 1, limit = 10,
    filters?: { status?: string; supplier_id?: string; search?: string },
  ): Promise<PaginatedResponse<PurchaseOrder>> {
    const params: Record<string, string | number> = { page, limit };
    if (filters?.status) params.status = filters.status;
    if (filters?.supplier_id) params.supplier_id = filters.supplier_id;
    if (filters?.search) params.search = filters.search;
    const res = await api.get<PaginatedResponse<PurchaseOrder>>('/inventory/purchase-orders', { params });
    return res.data;
  },
  async getPurchaseOrder(id: string): Promise<PurchaseOrder> {
    const res = await api.get<PurchaseOrder>(`/inventory/purchase-orders/${id}`);
    return res.data;
  },
  async createPurchaseOrder(data: PurchaseOrderCreate): Promise<PurchaseOrder> {
    const res = await api.post<PurchaseOrder>('/inventory/purchase-orders', data);
    return res.data;
  },
  async updatePurchaseOrder(id: string, data: { status?: string; notes?: string; expected_delivery_date?: string }): Promise<PurchaseOrder> {
    const res = await api.put<PurchaseOrder>(`/inventory/purchase-orders/${id}`, data);
    return res.data;
  },

  // ── Goods Receipt Notes ────────────────────────────────────────────────
  async getGRNs(
    page = 1, limit = 10,
    filters?: { status?: string; supplier_id?: string; search?: string },
  ): Promise<PaginatedResponse<GoodsReceiptNote>> {
    const params: Record<string, string | number> = { page, limit };
    if (filters?.status) params.status = filters.status;
    if (filters?.supplier_id) params.supplier_id = filters.supplier_id;
    if (filters?.search) params.search = filters.search;
    const res = await api.get<PaginatedResponse<GoodsReceiptNote>>('/inventory/grns', { params });
    return res.data;
  },
  async getGRN(id: string): Promise<GoodsReceiptNote> {
    const res = await api.get<GoodsReceiptNote>(`/inventory/grns/${id}`);
    return res.data;
  },
  async createGRN(data: GRNCreate): Promise<GoodsReceiptNote> {
    const res = await api.post<GoodsReceiptNote>('/inventory/grns', data);
    return res.data;
  },
  async updateGRN(id: string, data: { status?: string; notes?: string }): Promise<GoodsReceiptNote> {
    const res = await api.put<GoodsReceiptNote>(`/inventory/grns/${id}`, data);
    return res.data;
  },

  // ── Stock Movements ────────────────────────────────────────────────────
  async getStockMovements(
    page = 1, limit = 10,
    filters?: { item_type?: string; item_id?: string; movement_type?: string },
  ): Promise<PaginatedResponse<StockMovement>> {
    const params: Record<string, string | number> = { page, limit };
    if (filters?.item_type) params.item_type = filters.item_type;
    if (filters?.item_id) params.item_id = filters.item_id;
    if (filters?.movement_type) params.movement_type = filters.movement_type;
    const res = await api.get<PaginatedResponse<StockMovement>>('/inventory/stock-movements', { params });
    return res.data;
  },

  // ── Stock Adjustments ──────────────────────────────────────────────────
  async getAdjustments(page = 1, limit = 10, status?: string): Promise<PaginatedResponse<StockAdjustment>> {
    const params: Record<string, string | number> = { page, limit };
    if (status) params.status = status;
    const res = await api.get<PaginatedResponse<StockAdjustment>>('/inventory/adjustments', { params });
    return res.data;
  },
  async createAdjustment(data: StockAdjustmentCreate): Promise<StockAdjustment> {
    const res = await api.post<StockAdjustment>('/inventory/adjustments', data);
    return res.data;
  },
  async approveAdjustment(id: string, status: 'approved' | 'rejected'): Promise<StockAdjustment> {
    const res = await api.put<StockAdjustment>(`/inventory/adjustments/${id}/approve`, { status });
    return res.data;
  },

  // ── Cycle Counts ───────────────────────────────────────────────────────
  async getCycleCounts(page = 1, limit = 10, status?: string): Promise<PaginatedResponse<CycleCount>> {
    const params: Record<string, string | number> = { page, limit };
    if (status) params.status = status;
    const res = await api.get<PaginatedResponse<CycleCount>>('/inventory/cycle-counts', { params });
    return res.data;
  },
  async getCycleCount(id: string): Promise<CycleCount> {
    const res = await api.get<CycleCount>(`/inventory/cycle-counts/${id}`);
    return res.data;
  },
  async createCycleCount(data: CycleCountCreate): Promise<CycleCount> {
    const res = await api.post<CycleCount>('/inventory/cycle-counts', data);
    return res.data;
  },
  async updateCycleCount(id: string, data: { status?: string; notes?: string }): Promise<CycleCount> {
    const res = await api.put<CycleCount>(`/inventory/cycle-counts/${id}`, data);
    return res.data;
  },
};

export default inventoryService;
