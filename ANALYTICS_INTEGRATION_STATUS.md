# Analytics Dashboard — Integration Status

> Last updated: March 2026
> Access: **super_admin** and **admin** roles only
> Route: `/analytics`

---

## Architecture Overview

```
Page:     src/pages/analytics/AnalyticsDashboard.tsx    (main page, filter bar, lazy-loads panels)
Store:    src/stores/analyticsStore.ts                  (Zustand – period/date filters)
Hooks:    src/hooks/useAnalyticsQueries.ts              (TanStack Query – 5 min staleTime)
Service:  src/services/reportsApi.ts                    (LIVE vs DEV routing)
Mocks:    src/mocks/analyticsMocks.ts                   (static sample data for DEV panels)
Types:    src/types/analytics.types.ts                  (all interfaces)
```

---

## Panel-by-Panel Status

### ✅ LIVE — Connected to Real Backend APIs

These panels fetch real data from **existing backend endpoints**. They have try/catch fallbacks so the dashboard never breaks.

| Panel | Component | Backend Endpoint | Data Source | Notes |
|-------|-----------|-----------------|-------------|-------|
| **KPI Strip** (partial) | `KPIStrip.tsx` | `GET /reports/appointments/statistics` | `appointmentService.getStats()` | Only **OPD patients** and **OPD change %** are live. Revenue, Rx, stock, dues KPIs still use mock values. |
| **OPD Statistics** — Mini Stats | `OPDPanel.tsx` | `GET /reports/appointments/statistics` | `appointmentService.getStats()` | Returns: total appointments, walk-ins, scheduled, avg wait time, completion rate. **Emergency** and **follow-up** counts return 0 (not tracked separately). |
| **OPD Statistics** — Doctor Table & Chart | `OPDPanel.tsx` | `GET /reports/appointments/enhanced-statistics` | `appointmentService.getEnhancedStats()` | Returns doctor utilization (name, department, completed, cancelled, no-shows). **Avg consultation time** hardcoded to 15 min. **Rating** randomly generated (3.5–5.0). **Revenue** estimated at ₹500 × completed. |

### 🔧 DEV — Using Mock Data (Backend Not Yet Built)

These panels display **sample/static data** with a 600 ms simulated delay. Each logs `console.warn('[HMS Analytics] <Panel> using mock data')` in the browser console and shows an amber **"Under Development"** banner.

| Panel | Component | Mock Data File | What Needs Building |
|-------|-----------|---------------|-------------------|
| **KPI Strip** (partial) | `KPIStrip.tsx` | `analyticsMocks.ts → mockDashboardSummary` | Real revenue total, pending Rx count, low stock count, outstanding dues — need Billing, Pharmacy, Inventory modules |
| **Revenue Overview** — Daily | `RevenuePanel.tsx` | `mockDailyRevenue` (30 days) | `GET /reports/revenue/daily?from=&to=` — needs Billing module with OPD/pharmacy/optical revenue breakdown |
| **Revenue Overview** — Monthly | `RevenuePanel.tsx` | `mockMonthlyRevenue` (12 months) | `GET /reports/revenue/monthly?from=&to=` — same as daily but aggregated |
| **Revenue Overview** — By Department | `RevenuePanel.tsx` | `mockDepartmentRevenue` (5 depts) | `GET /reports/revenue/by-department?from=&to=` — needs billing linked to departments |
| **Pharmacy Sales Trend** | `PharmacyPanel.tsx` | `mockPharmacySales` (30 days) | `GET /reports/pharmacy/sales?from=&to=` — needs Pharmacy module (sales tracking per day) |
| **Top Selling Medicines** | `PharmacyPanel.tsx` | `mockTopMedicines` (8 items) | `GET /reports/pharmacy/top-medicines?limit=10` — needs Pharmacy inventory/dispensing |
| **Optical Sales Breakdown** | `PharmacyPanel.tsx` | `mockOpticalSales` (30 days) | `GET /reports/optical/sales?from=&to=` — needs Optical module (frames, lenses, contacts) |
| **Financial — Collections** | `FinancialPanel.tsx` | `mockCollectionReport` (4 methods) | `GET /reports/financial/collections?from=&to=` — needs Billing with payment method tracking |
| **Financial — Outstanding Dues** | `FinancialPanel.tsx` | `mockOutstandingDues` (5 brackets) | `GET /reports/financial/outstanding` — needs Billing with due date aging |
| **Financial — Tax Summary** | `FinancialPanel.tsx` | `mockTaxSummary` (3 tax types) | `GET /reports/financial/tax-summary?from=&to=` — needs Billing with GST tracking |
| **Inventory — Stock Status** | `InventoryPanel.tsx` | `mockStockStatus` (8 items) | `GET /reports/inventory/stock-status` — needs Inventory module (items, min/max, restock dates) |
| **Inventory — Aging** | `InventoryPanel.tsx` | `mockInventoryAging` (5 ranges) | `GET /reports/inventory/aging` — needs Inventory with purchase date tracking |
| **Export — Quick Export** | `ScheduleExportPanel.tsx` | Returns stub CSV blob | `POST /reports/export` with `{ report_type, format, filters }` — needs report generation service (PDF/CSV/XLSX) |
| **Export — Scheduled Reports** | `ScheduleExportPanel.tsx` | `mockScheduledReports` (3 items) | `GET/POST/DELETE /reports/schedules` — needs cron job service + email integration |

---

## Backend Modules Required (Not Yet Built)

To fully integrate the analytics dashboard, the following **backend modules** need to be developed:

### 1. Billing / Revenue Module
**Priority: High**

| Endpoint Needed | Response Shape | Purpose |
|----------------|---------------|---------|
| `GET /reports/revenue/daily` | `DailyRevenue[]` — `{ date, opd, pharmacy, optical, total }` | Revenue Overview daily chart |
| `GET /reports/revenue/monthly` | `MonthlyRevenue[]` — `{ month, opd, pharmacy, optical, total }` | Revenue Overview monthly chart |
| `GET /reports/revenue/by-department` | `DepartmentRevenue[]` — `{ department, revenue, percentage, color }` | Revenue pie chart |
| `GET /reports/financial/collections` | `CollectionReport[]` — `{ method, amount, percentage }` | Collections by payment method |
| `GET /reports/financial/outstanding` | `OutstandingDues[]` — `{ age_bracket, amount, count }` | Aging buckets for unpaid bills |
| `GET /reports/financial/tax-summary` | `TaxSummary[]` — `{ tax_type, taxable_amount, tax_amount, total }` | CGST/SGST/IGST breakdown |

**Database tables needed:** `invoices`, `payments`, `payment_methods`, `tax_entries`

### 2. Pharmacy Module
**Priority: High**

| Endpoint Needed | Response Shape | Purpose |
|----------------|---------------|---------|
| `GET /reports/pharmacy/sales` | `PharmacySales[]` — `{ date, sales, prescriptions_filled }` | Pharmacy trend line chart |
| `GET /reports/pharmacy/top-medicines` | `TopSellingMedicine[]` — `{ name, quantity_sold, revenue, category }` | Top medicines table |

**Database tables needed:** `pharmacy_inventory`, `dispensing_log`, `medicine_categories`

### 3. Optical Module
**Priority: Medium**

| Endpoint Needed | Response Shape | Purpose |
|----------------|---------------|---------|
| `GET /reports/optical/sales` | `OpticalSales[]` — `{ date, frames, lenses, contact_lenses, total }` | Optical stacked bar chart |

**Database tables needed:** `optical_inventory`, `optical_sales`, `frame_catalog`

### 4. Inventory Module
**Priority: Medium**

| Endpoint Needed | Response Shape | Purpose |
|----------------|---------------|---------|
| `GET /reports/inventory/stock-status` | `StockStatus[]` — `{ item_name, category, current_stock, min_stock, max_stock, status, last_restock_date }` | Stock level table with progress bars |
| `GET /reports/inventory/aging` | `InventoryAging[]` — `{ range, item_count, value }` | Aging bar chart |

**Database tables needed:** `inventory_items`, `stock_transactions`, `purchase_orders`

### 5. Report Export & Scheduling Service
**Priority: Low**

| Endpoint Needed | Response Shape | Purpose |
|----------------|---------------|---------|
| `POST /reports/export` | Binary blob (PDF/CSV/XLSX) | Quick export download |
| `GET /reports/schedules` | `ScheduledReport[]` | List scheduled reports |
| `POST /reports/schedules` | `ScheduledReport` | Create new schedule |
| `DELETE /reports/schedules/:id` | 204 | Remove schedule |

**Requires:** PDF/Excel generation library, cron/task scheduler, email service

---

## How to Integrate a New Module

When a backend module is ready, follow these steps to switch a panel from DEV → LIVE:

### Step 1: Update `reportsApi.ts`
Replace the mock function with a real API call:
```typescript
// BEFORE (DEV):
async function getPharmacySales(): Promise<PharmacySales[]> {
  warn('PharmacyPanel (sales)');
  await delay();
  return mockPharmacySales;
}

// AFTER (LIVE):
async function getPharmacySales(filters: DashboardFilters): Promise<PharmacySales[]> {
  try {
    const res = await api.get<PharmacySales[]>('/reports/pharmacy/sales', {
      params: { date_from: filters.dateFrom, date_to: filters.dateTo },
    });
    return res.data;
  } catch {
    warn('PharmacySales (fallback)');
    return mockPharmacySales; // or return []
  }
}
```

### Step 2: Update the hook in `useAnalyticsQueries.ts`
If the function now needs `filters`, update the hook:
```typescript
export function usePharmacySales(filters: DashboardFilters) {
  return useQuery({
    queryKey: analyticsKeys.pharmacySales(filters),
    queryFn: () => reportsApi.getPharmacySales(filters),
    staleTime: STALE,
  });
}
```

### Step 3: Update the panel component
- Change `status="development"` to `status="live"` in the `<PanelCard>` props
- Pass `filters` from `useAnalyticsStore` to the hook
- Add `error` / `onRetry` props if desired

### Step 4: Remove unused mocks
Once all panels for a module are live, clean up the corresponding mock data from `analyticsMocks.ts`.

---

## Files Reference

| File | Path | Description |
|------|------|-------------|
| Types | `src/types/analytics.types.ts` | All TypeScript interfaces |
| Mocks | `src/mocks/analyticsMocks.ts` | Static sample data for DEV panels |
| API Service | `src/services/reportsApi.ts` | LIVE/DEV routing, mock delay |
| Query Hooks | `src/hooks/useAnalyticsQueries.ts` | TanStack Query wrappers (5 min stale) |
| Zustand Store | `src/stores/analyticsStore.ts` | Filter state (period, dates) |
| ModuleBadge | `src/components/analytics/shared/ModuleBadge.tsx` | Live/Dev/Coming Soon badge |
| PanelCard | `src/components/analytics/shared/PanelCard.tsx` | Card wrapper (header, skeleton, error, dev banner) |
| KPI Strip | `src/components/analytics/KPIStrip.tsx` | 5 top-level KPI cards |
| Revenue | `src/components/analytics/RevenuePanel.tsx` | Daily/Monthly/Department charts |
| OPD | `src/components/analytics/OPDPanel.tsx` | Stats + doctor chart + table |
| Pharmacy | `src/components/analytics/PharmacyPanel.tsx` | Sales trend + medicines + optical |
| Financial | `src/components/analytics/FinancialPanel.tsx` | Collections + dues + tax |
| Inventory | `src/components/analytics/InventoryPanel.tsx` | Stock table + aging chart |
| Export | `src/components/analytics/ScheduleExportPanel.tsx` | Quick export + scheduled reports |
| Main Page | `src/pages/analytics/AnalyticsDashboard.tsx` | Layout, filters, lazy loading |

---

## Existing Backend Endpoints Used

| Endpoint | Router File | Service Function | Used By |
|----------|-------------|-----------------|---------|
| `GET /reports/appointments/statistics` | `appointment_reports.py` | `get_appointment_stats()` | KPI Strip, OPD Panel |
| `GET /reports/appointments/enhanced-statistics` | `appointment_reports.py` | `get_enhanced_stats()` | OPD Panel (doctor table) |

---

## Quick Summary

| Category | Status | Count |
|----------|--------|-------|
| ✅ LIVE panels (real API) | Connected | 3 (KPI partial, OPD stats, OPD doctors) |
| 🔧 DEV panels (mock data) | Sample data shown | 14 data points across 6 panels |
| 🔴 Backend modules needed | Not started | 5 (Billing, Pharmacy, Optical, Inventory, Export) |
