/**
 * Mock data for analytics panels that are in development.
 * DEV-only — will be replaced by real API calls once modules are built.
 */
import { format, subDays, startOfMonth, addMonths } from 'date-fns';
import type {
  DashboardSummary,
  DailyRevenue,
  MonthlyRevenue,
  DepartmentRevenue,
  PharmacySales,
  TopSellingMedicine,
  OpticalSales,
  StockStatus,
  InventoryAging,
  CollectionReport,
  OutstandingDues,
  TaxSummary,
  ScheduledReport,
} from '../types/analytics.types';

// ── Helpers ──────────────────────────────────────────────────────────────

const rand = (min: number, max: number) =>
  Math.round(min + Math.random() * (max - min));

const today = new Date();

// ── Dashboard Summary (KPI mock) ─────────────────────────────────────────

export const mockDashboardSummary: DashboardSummary = {
  total_revenue: 487520,
  opd_patients_today: 73,
  pending_prescriptions: 12,
  low_stock_items: 8,
  outstanding_dues: 124300,
  revenue_change_pct: 12.5,
  opd_change_pct: -3.2,
  prescriptions_change_pct: 18.0,
  stock_change_pct: -25.0,
  dues_change_pct: 5.4,
};

// ── Daily Revenue (30 days) ──────────────────────────────────────────────

export const mockDailyRevenue: DailyRevenue[] = Array.from({ length: 30 }, (_, i) => {
  const day = subDays(today, 29 - i);
  return {
    date: format(day, 'yyyy-MM-dd'),
    opd: rand(8000, 25000),
    pharmacy: rand(5000, 18000),
    optical: rand(2000, 10000),
    total: 0,
  };
}).map((d) => ({ ...d, total: d.opd + d.pharmacy + d.optical }));

// ── Monthly Revenue (12 months) ──────────────────────────────────────────

export const mockMonthlyRevenue: MonthlyRevenue[] = Array.from({ length: 12 }, (_, i) => {
  const month = addMonths(startOfMonth(today), i - 11);
  return {
    month: format(month, 'MMM'),
    opd: rand(200000, 600000),
    pharmacy: rand(150000, 400000),
    optical: rand(60000, 200000),
    total: 0,
  };
}).map((d) => ({ ...d, total: d.opd + d.pharmacy + d.optical }));

// ── Department Revenue ───────────────────────────────────────────────────

export const mockDepartmentRevenue: DepartmentRevenue[] = [
  { department: 'General Medicine', revenue: 185000, percentage: 38, color: '#137fec' },
  { department: 'Pediatrics',       revenue: 92000,  percentage: 19, color: '#10b981' },
  { department: 'Orthopedics',      revenue: 78000,  percentage: 16, color: '#f59e0b' },
  { department: 'Dermatology',      revenue: 68000,  percentage: 14, color: '#8b5cf6' },
  { department: 'ENT',              revenue: 64520,  percentage: 13, color: '#ef4444' },
];

// ── Pharmacy Sales (30 days) ─────────────────────────────────────────────

export const mockPharmacySales: PharmacySales[] = Array.from({ length: 30 }, (_, i) => {
  const day = subDays(today, 29 - i);
  return {
    date: format(day, 'yyyy-MM-dd'),
    sales: rand(5000, 20000),
    prescriptions_filled: rand(15, 60),
  };
});

// ── Top Selling Medicines ────────────────────────────────────────────────

export const mockTopMedicines: TopSellingMedicine[] = [
  { name: 'Paracetamol 500mg',   quantity_sold: 1250, revenue: 18750,  category: 'Analgesic' },
  { name: 'Amoxicillin 250mg',   quantity_sold: 890,  revenue: 31150,  category: 'Antibiotic' },
  { name: 'Omeprazole 20mg',     quantity_sold: 720,  revenue: 21600,  category: 'Antacid' },
  { name: 'Cetirizine 10mg',     quantity_sold: 650,  revenue: 9750,   category: 'Antihistamine' },
  { name: 'Metformin 500mg',     quantity_sold: 580,  revenue: 14500,  category: 'Antidiabetic' },
  { name: 'Atorvastatin 10mg',   quantity_sold: 510,  revenue: 17850,  category: 'Statin' },
  { name: 'Azithromycin 500mg',  quantity_sold: 430,  revenue: 25800,  category: 'Antibiotic' },
  { name: 'Pantoprazole 40mg',   quantity_sold: 380,  revenue: 15200,  category: 'Antacid' },
];

// ── Optical Sales (30 days) ──────────────────────────────────────────────

export const mockOpticalSales: OpticalSales[] = Array.from({ length: 30 }, (_, i) => {
  const day = subDays(today, 29 - i);
  const frames = rand(1000, 5000);
  const lenses = rand(2000, 6000);
  const contact_lenses = rand(500, 3000);
  return {
    date: format(day, 'yyyy-MM-dd'),
    frames,
    lenses,
    contact_lenses,
    total: frames + lenses + contact_lenses,
  };
});

// ── Stock Status ─────────────────────────────────────────────────────────

export const mockStockStatus: StockStatus[] = [
  { item_name: 'Paracetamol 500mg',    category: 'Medicine',  current_stock: 5200, min_stock: 1000, max_stock: 10000, status: 'ok',       last_restock_date: '2025-01-10' },
  { item_name: 'Surgical Gloves (L)',   category: 'Consumable', current_stock: 250,  min_stock: 500,  max_stock: 5000,  status: 'low',      last_restock_date: '2025-01-05' },
  { item_name: 'Amoxicillin 250mg',     category: 'Medicine',  current_stock: 80,   min_stock: 200,  max_stock: 3000,  status: 'critical', last_restock_date: '2024-12-20' },
  { item_name: 'Saline 500ml',          category: 'IV Fluid',  current_stock: 1800, min_stock: 500,  max_stock: 3000,  status: 'ok',       last_restock_date: '2025-01-12' },
  { item_name: 'Syringe 5ml',           category: 'Consumable', current_stock: 120,  min_stock: 300,  max_stock: 5000,  status: 'low',      last_restock_date: '2025-01-02' },
  { item_name: 'Bandage Roll',          category: 'Consumable', current_stock: 4500, min_stock: 500,  max_stock: 4000,  status: 'overstock', last_restock_date: '2025-01-08' },
  { item_name: 'Omeprazole 20mg',       category: 'Medicine',  current_stock: 3200, min_stock: 800,  max_stock: 6000,  status: 'ok',       last_restock_date: '2025-01-11' },
  { item_name: 'Face Masks N95',        category: 'PPE',       current_stock: 50,   min_stock: 200,  max_stock: 2000,  status: 'critical', last_restock_date: '2024-12-15' },
];

// ── Inventory Aging ──────────────────────────────────────────────────────

export const mockInventoryAging: InventoryAging[] = [
  { range: '0-30 days',   item_count: 120, value: 245000 },
  { range: '31-60 days',  item_count: 45,  value: 89000 },
  { range: '61-90 days',  item_count: 18,  value: 42000 },
  { range: '91-180 days', item_count: 8,   value: 23000 },
  { range: '180+ days',   item_count: 3,   value: 8500 },
];

// ── Collection Report ────────────────────────────────────────────────────

export const mockCollectionReport: CollectionReport[] = [
  { method: 'Cash',      amount: 195000, percentage: 40, color: '#10b981' },
  { method: 'Card',      amount: 121800, percentage: 25, color: '#137fec' },
  { method: 'UPI',       amount: 107200, percentage: 22, color: '#8b5cf6' },
  { method: 'Insurance', amount: 63520,  percentage: 13, color: '#f59e0b' },
];

// ── Outstanding Dues ─────────────────────────────────────────────────────

export const mockOutstandingDues: OutstandingDues[] = [
  { age_bracket: '0-30 days',   amount: 48000, count: 32 },
  { age_bracket: '31-60 days',  amount: 35200, count: 18 },
  { age_bracket: '61-90 days',  amount: 22100, count: 11 },
  { age_bracket: '91-180 days', amount: 12500, count: 6 },
  { age_bracket: '180+ days',   amount: 6500,  count: 3 },
];

// ── Tax Summary ──────────────────────────────────────────────────────────

export const mockTaxSummary: TaxSummary[] = [
  { tax_type: 'CGST',  taxable_amount: 487520, tax_amount: 43877, total: 531397 },
  { tax_type: 'SGST',  taxable_amount: 487520, tax_amount: 43877, total: 531397 },
  { tax_type: 'IGST',  taxable_amount: 0,      tax_amount: 0,     total: 0 },
];

// ── Scheduled Reports ────────────────────────────────────────────────────

export const mockScheduledReports: ScheduledReport[] = [
  { id: '1', report_type: 'Daily Revenue',     format: 'pdf',  frequency: 'daily',   email: 'admin@hospital.com',  next_run: '2025-01-16T06:00:00Z', is_active: true,  created_at: '2025-01-01' },
  { id: '2', report_type: 'Weekly OPD Summary', format: 'xlsx', frequency: 'weekly',  email: 'admin@hospital.com',  next_run: '2025-01-20T06:00:00Z', is_active: true,  created_at: '2025-01-01' },
  { id: '3', report_type: 'Monthly Financial',  format: 'pdf',  frequency: 'monthly', email: 'finance@hospital.com', next_run: '2025-02-01T06:00:00Z', is_active: false, created_at: '2024-12-15' },
];
