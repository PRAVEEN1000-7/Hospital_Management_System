# Products & Stock Management Implementation

## Overview

This implementation adds a **centralized Products catalog** and **Stock Overview** system to the Hospital Management System, addressing the following requirements:

1. **Centralized Product Tracking**: All products (medicine, optical, surgical, equipment, etc.) are now tracked in a unified catalog
2. **Stock Overview Dashboard**: Real-time visibility into stock levels, values, and alerts
3. **Segregation of Duties**: GRN creator cannot verify the same GRN
4. **Stock Alerts**: Automated alerts for low stock, expiring items, etc.

---

## Database Changes

### New Tables Created

#### 1. `products` - Centralized Product Catalog
Stores all product information across categories.

**Columns:**
- `id` (UUID, PK) - Unique identifier
- `hospital_id` (UUID, FK) - Hospital reference
- `product_name` (VARCHAR) - Product name
- `generic_name` (VARCHAR) - Generic/chemical name
- `brand_name` (VARCHAR) - Brand name
- `category` (VARCHAR) - Category: medicine, optical, surgical, equipment, laboratory, disposable, other
- `subcategory` (VARCHAR) - Sub-category
- `sku` (VARCHAR) - Stock keeping unit
- `barcode` (VARCHAR) - Barcode number
- `manufacturer` (VARCHAR) - Manufacturer name
- `supplier_id` (UUID, FK) - Preferred supplier
- `purchase_price` (NUMERIC) - Purchase price
- `selling_price` (NUMERIC) - Selling price
- `mrp` (NUMERIC) - Maximum retail price
- `tax_percentage` (NUMERIC) - Tax percentage
- `unit_type` (VARCHAR) - Unit: tablet, capsule, bottle, box, piece, etc.
- `pack_size` (INTEGER) - Pack size
- `min_stock_level` (INTEGER) - Minimum stock level
- `max_stock_level` (INTEGER) - Maximum stock level
- `reorder_level` (INTEGER) - Reorder point
- `storage_conditions` (TEXT) - Storage requirements
- `shelf_life_days` (INTEGER) - Shelf life in days
- `requires_refrigeration` (BOOLEAN) - Refrigeration required
- `is_hazardous` (BOOLEAN) - Hazardous material
- `is_narcotic` (BOOLEAN) - Narcotic substance
- `requires_prescription` (BOOLEAN) - Prescription required
- `is_active` (BOOLEAN) - Active status
- `is_deleted` (BOOLEAN) - Soft delete flag
- `created_by`, `updated_by` (UUID, FK) - Audit fields
- `created_at`, `updated_at` (TIMESTAMP) - Timestamps

#### 2. `stock_summary` - Real-time Stock Levels
Aggregated stock information for each product.

**Columns:**
- `id` (UUID, PK)
- `hospital_id` (UUID, FK)
- `product_id` (UUID, FK, UNIQUE) - Product reference
- `total_stock` (INTEGER)
- `available_stock` (INTEGER)
- `reserved_stock` (INTEGER)
- `damaged_stock` (INTEGER)
- `expired_stock` (INTEGER)
- `total_batches` (INTEGER)
- `earliest_expiry` (DATE)
- `avg_cost_price` (NUMERIC)
- `total_value` (NUMERIC)
- `is_low_stock` (BOOLEAN)
- `is_expiring_soon` (BOOLEAN)
- `last_movement_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

#### 3. `stock_alerts` - Stock Alerts
Alerts for low stock, expiring items, etc.

**Columns:**
- `id` (UUID, PK)
- `hospital_id` (UUID, FK)
- `product_id` (UUID, FK)
- `alert_type` (VARCHAR) - low_stock, expiring_soon, expired, overstocked, near_expiry
- `severity` (VARCHAR) - low, medium, high, critical
- `title` (VARCHAR)
- `message` (TEXT)
- `current_stock` (INTEGER)
- `threshold_stock` (INTEGER)
- `expiry_date` (DATE)
- `days_until_expiry` (INTEGER)
- `is_resolved` (BOOLEAN)
- `resolved_at`, `resolved_by` - Resolution info
- `acknowledged_at`, `acknowledged_by` - Acknowledgment info
- `created_at` (TIMESTAMP)

### GRN Segregation of Duties

Added trigger `trg_grn_segregation` on `goods_receipt_notes` table:
- Prevents the same user from creating and verifying a GRN
- Enforced at database level for all new/updated GRNs
- Existing GRNs are grandfathered (not affected)

---

## Backend Implementation

### New Files Created

#### Models (`backend/app/models/products.py`)
- `Product` - Product catalog model
- `StockSummary` - Stock summary model
- `StockAlert` - Stock alert model

#### Schemas (`backend/app/schemas/products.py`)
- `ProductCreate`, `ProductUpdate`, `ProductResponse`, `ProductWithStockResponse`
- `StockSummaryResponse`
- `StockAlertCreate`, `StockAlertUpdate`, `StockAlertResponse`
- `StockDashboardResponse`
- `LowStockItemResponse`, `ExpiringItemResponse`

#### Service (`backend/app/services/products_service.py`)
Functions:
- `create_product()`, `get_product()`, `list_products()`, `update_product()`, `delete_product()`
- `get_stock_dashboard()` - Dashboard statistics
- `get_stock_overview()` - Stock overview with filters
- `get_low_stock_items()` - Low stock items
- `get_expiring_items()` - Expiring items
- `create_stock_alert()`, `list_stock_alerts()`, `resolve_alert()`, `acknowledge_alert()`
- `sync_stock_summary()` - Sync stock with movements

#### Routes (`backend/app/routers/products.py`)
Endpoints:
- `GET /api/v1/inventory/products` - List products
- `GET /api/v1/inventory/products/{id}` - Get product with stock
- `POST /api/v1/inventory/products` - Create product
- `PUT /api/v1/inventory/products/{id}` - Update product
- `DELETE /api/v1/inventory/products/{id}` - Delete product
- `GET /api/v1/inventory/stock/dashboard` - Stock dashboard
- `GET /api/v1/inventory/stock/overview` - Stock overview
- `GET /api/v1/inventory/stock/low-stock` - Low stock items
- `GET /api/v1/inventory/stock/expiring` - Expiring items
- `POST /api/v1/inventory/stock/sync` - Sync stock summary
- `GET /api/v1/inventory/alerts` - List alerts
- `POST /api/v1/inventory/alerts` - Create alert
- `PUT /api/v1/inventory/alerts/{id}/resolve` - Resolve alert
- `PUT /api/v1/inventory/alerts/{id}/acknowledge` - Acknowledge alert

---

## Frontend Implementation

### New Files Created

#### Types (`frontend/src/types/products.ts`)
TypeScript interfaces for all product and stock entities.

#### Service (`frontend/src/services/productsService.ts`)
API client for all product and stock operations.

#### Pages

**StockOverviewPage (`frontend/src/pages/inventory/StockOverviewPage.tsx`)**
Features:
- Dashboard with 8 key metrics (total products, stock value, alerts, etc.)
- 4 tabs: Overview, Low Stock, Expiring, Alerts
- Filters: Search, Category, Low Stock Only
- Real-time stock levels and values
- Color-coded alerts by severity
- Resolve/Acknowledge actions for alerts
- Pagination support

### Navigation Updates

Added "Stock Overview" link to inventory navigation menu for:
- super_admin
- admin
- inventory_manager
- pharmacist

---

## API Endpoints Summary

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory/products` | List products |
| GET | `/api/v1/inventory/products/{id}` | Get product details |
| POST | `/api/v1/inventory/products` | Create product |
| PUT | `/api/v1/inventory/products/{id}` | Update product |
| DELETE | `/api/v1/inventory/products/{id}` | Delete product |

### Stock
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory/stock/dashboard` | Dashboard stats |
| GET | `/api/v1/inventory/stock/overview` | Stock overview |
| GET | `/api/v1/inventory/stock/low-stock` | Low stock items |
| GET | `/api/v1/inventory/stock/expiring` | Expiring items |
| POST | `/api/v1/inventory/stock/sync` | Sync stock data |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory/alerts` | List alerts |
| POST | `/api/v1/inventory/alerts` | Create alert |
| PUT | `/api/v1/inventory/alerts/{id}/resolve` | Resolve alert |
| PUT | `/api/v1/inventory/alerts/{id}/acknowledge` | Acknowledge alert |

---

## Usage Guide

### Accessing Stock Overview

1. Log in as admin, inventory_manager, or pharmacist
2. Navigate to **Inventory → Stock Overview**
3. View dashboard metrics at the top
4. Switch between tabs:
   - **Overview**: All products with stock levels
   - **Low Stock**: Items below reorder level
   - **Expiring**: Items expiring within 90 days
   - **Alerts**: Active stock alerts

### Managing Alerts

1. Go to **Alerts** tab
2. Click **Acknowledge** to mark as seen
3. Click **Resolve** when issue is fixed

### Creating Products

Products can be created via API or integrated into existing PO/GRN flows.

---

## Migration Files

- `database_hole/06_products_master_table.sql` - Main migration SQL
- `backend/migrate_products.py` - Python migration runner

Run migration:
```bash
cd backend
python migrate_products.py
```

---

## Files Modified

### Backend
- `backend/app/main.py` - Added products router imports
- `backend/app/models/__init__.py` - (if exists) Register new models

### Frontend
- `frontend/src/App.tsx` - Added StockOverviewPage route
- `frontend/src/components/common/Layout.tsx` - Added navigation link

---

## Next Steps (Recommended)

1. **Products Management Page**: Create full CRUD page for product catalog
2. **Auto-sync on GRN**: Trigger stock summary sync when GRN is accepted
3. **Scheduled Alerts**: Run daily job to generate stock alerts
4. **Batch Tracking**: Integrate with medicine batches for expiry tracking
5. **Reorder Suggestions**: Generate purchase suggestions based on stock levels

---

## Security & Access Control

| Role | Products | Stock Overview | Alerts |
|------|----------|----------------|--------|
| super_admin | Full CRUD | View | Full CRUD |
| admin | Full CRUD | View | Full CRUD |
| inventory_manager | Create/Update/View | View | Create/Resolve |
| pharmacist | View | View | View/Acknowledge |

---

## Troubleshooting

### Stock not updating
Run sync: `POST /api/v1/inventory/stock/sync`

### Missing products in overview
Check `is_active` and `is_deleted` flags

### Alerts not generating
Verify stock_summary sync is running after movements

---

## Database Queries File

See `database_hole/06_products_master_table.sql` for:
- Table creation DDL
- Index definitions
- Trigger for GRN segregation
- View definitions for common queries
