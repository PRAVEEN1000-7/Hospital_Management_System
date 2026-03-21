import api from './api';
import type {
  Product, ProductCreate, ProductUpdate, ProductWithStock,
  StockSummary, StockAlert, StockDashboard,
  LowStockItem, ExpiringItem,
  PaginatedResponse,
} from '../types/products';

const productsService = {
  // ── Products ──────────────────────────────────────────────────────────────
  async getProducts(
    page = 1, limit = 20,
    filters?: { category?: string; search?: string; is_active?: boolean },
  ): Promise<PaginatedResponse<Product>> {
    const params: Record<string, string | number | boolean> = { page, limit };
    if (filters?.category) params.category = filters.category;
    if (filters?.search) params.search = filters.search;
    if (filters?.is_active !== undefined) params.is_active = filters.is_active;
    const res = await api.get<PaginatedResponse<Product>>('/inventory/products', { params });
    return res.data;
  },

  async getProduct(id: string): Promise<ProductWithStock> {
    const res = await api.get<ProductWithStock>(`/inventory/products/${id}`);
    return res.data;
  },

  async createProduct(data: ProductCreate): Promise<Product> {
    const res = await api.post<Product>('/inventory/products', data);
    return res.data;
  },

  async updateProduct(id: string, data: ProductUpdate): Promise<Product> {
    const res = await api.put<Product>(`/inventory/products/${id}`, data);
    return res.data;
  },

  async deleteProduct(id: string): Promise<void> {
    await api.delete(`/inventory/products/${id}`);
  },

  // ── Product Search (Typeahead) ────────────────────────────────────────────
  async searchProducts(
    query: string,
    options?: { category?: string; limit?: number },
  ): Promise<Array<{
    id: string;
    label: string;
    sublabel?: string;
    metadata: {
      id: string;
      name: string;
      generic_name?: string;
      category: string;
      subcategory?: string;
      sku?: string;
      barcode?: string;
      manufacturer?: string;
      purchase_price: number;
      selling_price: number;
      mrp: number;
      unit_type: string;
      pack_size: number;
      requires_prescription: boolean;
    };
  }>> {
    const params: Record<string, string | number> = { q: query };
    if (options?.category) params.category = options.category;
    if (options?.limit) params.limit = options.limit;
    const res = await api.get('/inventory/products/search', { params });
    return res.data as Array<{
      id: string;
      label: string;
      sublabel?: string;
      metadata: {
        id: string;
        name: string;
        generic_name?: string;
        category: string;
        subcategory?: string;
        sku?: string;
        barcode?: string;
        manufacturer?: string;
        purchase_price: number;
        selling_price: number;
        mrp: number;
        unit_type: string;
        pack_size: number;
        requires_prescription: boolean;
      };
    }>;
  },

  // ── Stock Overview ────────────────────────────────────────────────────────
  async getStockDashboard(): Promise<StockDashboard> {
    const res = await api.get<StockDashboard>('/inventory/stock/dashboard');
    return res.data;
  },

  async getStockOverview(
    page = 1, limit = 20,
    filters?: { category?: string; search?: string; low_stock_only?: boolean; expiring_only?: boolean },
  ): Promise<PaginatedResponse<StockSummary>> {
    const params: Record<string, string | number | boolean> = { page, limit };
    if (filters?.category) params.category = filters.category;
    if (filters?.search) params.search = filters.search;
    if (filters?.low_stock_only) params.low_stock_only = filters.low_stock_only;
    if (filters?.expiring_only) params.expiring_only = filters.expiring_only;
    const res = await api.get<PaginatedResponse<StockSummary>>('/inventory/stock/overview', { params });
    return res.data;
  },

  async getLowStock(limit = 50): Promise<LowStockItem[]> {
    const res = await api.get<LowStockItem[]>('/inventory/stock/low-stock', { params: { limit } });
    return res.data;
  },

  async getExpiringItems(days = 90, limit = 50): Promise<ExpiringItem[]> {
    const res = await api.get<ExpiringItem[]>('/inventory/stock/expiring', { params: { days, limit } });
    return res.data;
  },

  async syncStockSummary(productId?: string): Promise<{ status: string; message: string }> {
    const res = await api.post('/inventory/stock/sync', { product_id: productId || null });
    return res.data;
  },

  // ── Stock Alerts ──────────────────────────────────────────────────────────
  async getAlerts(
    page = 1, limit = 20,
    filters?: { alert_type?: string; severity?: string; unresolved_only?: boolean },
  ): Promise<PaginatedResponse<StockAlert>> {
    const params: Record<string, string | number | boolean> = { page, limit };
    if (filters?.alert_type) params.alert_type = filters.alert_type;
    if (filters?.severity) params.severity = filters.severity;
    if (filters?.unresolved_only !== undefined) params.unresolved_only = filters.unresolved_only;
    const res = await api.get<PaginatedResponse<StockAlert>>('/inventory/alerts', { params });
    return res.data;
  },

  async createAlert(data: { alert_type: string; severity: string; title: string; message: string }): Promise<StockAlert> {
    const res = await api.post<StockAlert>('/inventory/alerts', data);
    return res.data;
  },

  async resolveAlert(id: string): Promise<StockAlert> {
    const res = await api.put<StockAlert>(`/inventory/alerts/${id}/resolve`, {});
    return res.data;
  },

  async acknowledgeAlert(id: string): Promise<StockAlert> {
    const res = await api.put<StockAlert>(`/inventory/alerts/${id}/acknowledge`, {});
    return res.data;
  },
};

export default productsService;
