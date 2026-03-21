# Inventory Management System - Architecture Documentation

**Date:** 21 March 2026  
**Version:** 1.0  
**Status:** Complete Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Database Schema](#database-schema)
4. [Table Relationships](#table-relationships)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Stock Movement Tracking](#stock-movement-tracking)
7. [Integration Points](#integration-points)
8. [API Endpoints](#api-endpoints)

---

## Overview

The Hospital Management System uses a **centralized Products catalog** with distributed stock tracking across multiple tables. This architecture ensures:

- **Single Source of Truth**: Products table is the master catalog
- **Audit Trail**: Every stock change is recorded in stock_movements
- **Batch Tracking**: Medicine batches tracked separately for expiry management
- **Real-time Summary**: Stock summary provides instant overview
- **Alert System**: Automated alerts for low stock and expiring items

---

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[React Frontend]
        StockPage[Stock Overview Page]
        InvPage[Inventory Pages]
        PharmPage[Pharmacy Pages]
    end
    
    subgraph "Backend Layer"
        API[FastAPI Backend]
        ProdService[Products Service]
        InvService[Inventory Service]
        PharmService[Pharmacy Service]
    end
    
    subgraph "Database Layer"
        Products[Products Table]
        StockSum[Stock Summary]
        StockMov[Stock Movements]
        MedBatches[Medicine Batches]
        Alerts[Stock Alerts]
        PO[Purchase Orders]
        GRN[Goods Receipt Notes]
    end
    
    UI --> API
    API --> ProdService
    API --> InvService
    API --> PharmService
    
    ProdService --> Products
    ProdService --> StockSum
    ProdService --> Alerts
    
    InvService --> PO
    InvService --> GRN
    InvService --> StockMov
    
    PharmService --> MedBatches
    PharmService --> StockMov
```

---

## Database Schema

### Core Tables Overview

```mermaid
erDiagram
    hospitals ||--o{ products : "owns"
    hospitals ||--o{ stock_summary : "tracks"
    hospitals ||--o{ stock_alerts : "monitors"
    hospitals ||--o{ stock_movements : "audits"
    
    products ||--|| stock_summary : "has"
    products ||--o{ stock_alerts : "generates"
    products ||--o{ stock_movements : "tracked_in"
    
    suppliers ||--o{ purchase_orders : "receives"
    purchase_orders ||--o{ purchase_order_items : "contains"
    purchase_orders ||--o{ goods_receipt_notes : "fulfilled_by"
    goods_receipt_notes ||--o{ grn_items : "contains"
    
    medicines ||--o{ medicine_batches : "has_batches"
    medicine_batches ||--o{ stock_movements : "generates"
```

---

## Table Relationships

### Complete Entity Relationship Diagram

```mermaid
erDiagram
    %% === MASTER TABLES ===
    hospitals {
        UUID id PK
        VARCHAR name
        VARCHAR code
    }
    
    suppliers {
        UUID id PK
        UUID hospital_id FK
        VARCHAR name
        VARCHAR code
    }
    
    %% === PRODUCT CATALOG ===
    products {
        UUID id PK
        UUID hospital_id FK
        VARCHAR product_name
        VARCHAR generic_name
        VARCHAR category
        VARCHAR sku
        UUID supplier_id FK
        NUMERIC purchase_price
        NUMERIC selling_price
        INTEGER min_stock_level
        BOOLEAN is_active
    }
    
    %% === MEDICINE TABLE (Pharmacy Specific) ===
    medicines {
        UUID id PK
        UUID hospital_id FK
        VARCHAR name
        VARCHAR generic_name
        VARCHAR category
        VARCHAR strength
        NUMERIC selling_price
        INTEGER reorder_level
    }
    
    %% === STOCK TRACKING ===
    stock_summary {
        UUID id PK
        UUID product_id FK
        INTEGER total_stock
        INTEGER available_stock
        INTEGER reserved_stock
        NUMERIC total_value
        BOOLEAN is_low_stock
        BOOLEAN is_expiring_soon
    }
    
    medicine_batches {
        UUID id PK
        UUID medicine_id FK
        VARCHAR batch_number
        DATE expiry_date
        INTEGER current_quantity
        NUMERIC purchase_price
        NUMERIC selling_price
    }
    
    stock_movements {
        UUID id PK
        UUID hospital_id FK
        VARCHAR item_type
        UUID item_id
        VARCHAR movement_type
        INTEGER quantity
        INTEGER balance_after
        UUID performed_by FK
    }
    
    %% === PROCUREMENT ===
    purchase_orders {
        UUID id PK
        UUID hospital_id FK
        VARCHAR po_number
        UUID supplier_id FK
        VARCHAR status
        UUID approved_by FK
    }
    
    purchase_order_items {
        UUID id PK
        UUID purchase_order_id FK
        VARCHAR item_type
        UUID item_id
        INTEGER quantity_ordered
        NUMERIC unit_price
    }
    
    goods_receipt_notes {
        UUID id PK
        UUID hospital_id FK
        VARCHAR grn_number
        UUID purchase_order_id FK
        VARCHAR status
        UUID verified_by FK
    }
    
    grn_items {
        UUID id PK
        UUID grn_id FK
        VARCHAR item_type
        UUID item_id
        VARCHAR batch_number
        DATE expiry_date
        INTEGER quantity_accepted
    }
    
    %% === ALERTS ===
    stock_alerts {
        UUID id PK
        UUID product_id FK
        VARCHAR alert_type
        VARCHAR severity
        BOOLEAN is_resolved
    }
    
    %% === RELATIONSHIPS ===
    hospitals ||--o{ products : "owns"
    hospitals ||--o{ medicines : "owns"
    hospitals ||--o{ suppliers : "has"
    
    products ||--|| stock_summary : "1-to-1"
    products ||--o{ stock_alerts : "generates"
    
    medicines ||--o{ medicine_batches : "has"
    
    suppliers ||--o{ purchase_orders : "receives"
    purchase_orders ||--o{ purchase_order_items : "contains"
    purchase_orders ||--o{ goods_receipt_notes : "fulfilled_by"
    goods_receipt_notes ||--o{ grn_items : "contains"
    
    grn_items }o--o{ medicine_batches : "creates"
    medicine_batches ||--o{ stock_movements : "generates"
```

---

## Data Flow Diagrams

### Flow 1: Procurement to Stock (Purchase Order → GRN → Stock In)

```mermaid
sequenceDiagram
    participant IM as Inventory Manager
    participant API as Backend API
    participant PO as Purchase Orders
    participant GRN as Goods Receipt
    participant SM as Stock Movement
    participant SS as Stock Summary
    participant MB as Medicine Batches
    
    IM->>API: Create Purchase Order
    API->>PO: Save PO with items
    PO-->>IM: PO Created (draft)
    
    IM->>API: Submit PO for Approval
    API->>PO: Update status=submitted
    
    Note over PO: Admin Approval Required
    
    IM->>API: Create GRN (against PO)
    API->>GRN: Save GRN with batch details
    GRN->>MB: Create medicine batches
    MB-->>GRN: Batches created
    
    IM->>API: Verify & Accept GRN
    API->>GRN: Update status=accepted
    API->>SM: Create stock_in movement
    SM->>SM: Update balance_after
    SM->>SS: Sync stock summary
    SS->>SS: Update total_stock, available_stock
    
    Note over SS: Stock now available for dispensing
```

### Flow 2: Pharmacy Dispensing (Stock Out)

```mermaid
sequenceDiagram
    participant P as Pharmacist
    participant API as Backend API
    participant MB as Medicine Batches
    participant SM as Stock Movement
    participant SS as Stock Summary
    participant SA as Stock Alerts
    
    P->>API: Dispense Prescription
    API->>MB: Query batches (FIFO)
    MB-->>API: Return batches by expiry
    
    loop For each medicine
        API->>MB: Update current_quantity
        MB->>MB: Deduct dispensed qty
        API->>SM: Create dispensing movement
        SM->>SM: Calculate balance_after
    end
    
    API->>SS: Update stock summary
    SS->>SS: Recalculate totals
    
    SS->>SS: Check if below reorder_level
    alt Stock below threshold
        SS->>SA: Create low_stock alert
        SA-->>P: Show alert in dashboard
    end
```

### Flow 3: Stock Adjustment (Manual Correction)

```mermaid
sequenceDiagram
    participant IM as Inventory Manager
    participant API as Backend API
    participant SA as Stock Adjustment
    participant SM as Stock Movement
    participant SS as Stock Summary
    
    IM->>API: Request Stock Adjustment
    API->>SA: Create adjustment (pending)
    
    Note over SA: Requires Admin Approval
    
    IM->>API: Submit for Approval
    API->>SA: Update status=submitted
    
    Note over SA: Admin reviews & approves
    
    IM->>API: Approve Adjustment
    API->>SA: Update status=approved
    API->>SM: Create adjustment movement
    SM->>SM: Record quantity change
    SM->>SS: Trigger summary sync
    SS->>SS: Update stock levels
```

### Flow 4: Cycle Count Process

```mermaid
sequenceDiagram
    participant IM as Inventory Manager
    participant API as Backend API
    participant CC as Cycle Count
    participant CCI as Cycle Count Items
    participant SM as Stock Movement
    participant SS as Stock Summary
    
    IM->>API: Initiate Cycle Count
    API->>CC: Create cycle count record
    CC-->>IM: Count number generated
    
    IM->>API: Enter Physical Count
    API->>CCI: Save counted_quantity
    API->>CCI: Calculate variance
    Note over CCI: variance = counted - system
    
    IM->>API: Verify & Submit Count
    API->>CC: Update status=verified
    
    alt Variance found
        API->>SM: Create adjustment movement
        SM->>SS: Update stock summary
        SS->>SS: Correct system quantities
    end
```

---

## Stock Movement Tracking

### Movement Types and Their Impact

```mermaid
graph LR
    subgraph "IN Movements (+)"
        IN1[IN_PURCHASE<br/>GRN Receipt]
        IN2[IN_RETURN<br/>Patient Return]
        IN3[IN_ADJUSTMENT<br/>Found Stock]
        IN4[IN_TRANSFER<br/>From Other Location]
    end
    
    subgraph "OUT Movements (-)"
        OUT1[OUT_SALE<br/>Counter Sale]
        OUT2[OUT_DISPENSING<br/>Prescription]
        OUT3[OUT_EXPIRY<br/>Expired Items]
        OUT4[OUT_DAMAGE<br/>Damaged Items]
        OUT5[OUT_TRANSFER<br/>To Other Location]
        OUT6[OUT_ADJUSTMENT<br/>Write-off]
    end
    
    subgraph "Stock Summary"
        SS[Real-time Balance]
    end
    
    IN1 --> SS
    IN2 --> SS
    IN3 --> SS
    IN4 --> SS
    
    OUT1 --> SS
    OUT2 --> SS
    OUT3 --> SS
    OUT4 --> SS
    OUT5 --> SS
    OUT6 --> SS
```

### Movement Type Reference Table

| Movement Type | Code | Direction | Trigger | Example |
|--------------|------|-----------|---------|---------|
| **Purchase Receipt** | `stock_in` | + | GRN Accepted | Received 100 units from supplier |
| **Sale** | `sale` | - | Counter Sale | OTC sale to patient |
| **Dispensing** | `dispensing` | - | Prescription Fill | Dispensed against Rx |
| **Return** | `return` | + | Patient Return | Unused medicine returned |
| **Adjustment In** | `adjustment` | + | Stock Found | Found during audit |
| **Adjustment Out** | `adjustment` | - | Stock Write-off | Damaged/lost items |
| **Expiry** | `expired` | - | Expired Batch | Past expiry date |
| **Damage** | `damaged` | - | Quality Check | Found damaged |
| **Transfer Out** | `transfer` | - | Inter-branch Transfer | Sent to branch hospital |
| **Transfer In** | `transfer` | + | Inter-branch Transfer | Received from main hospital |

---

## Integration Points

### How Tables Link Together

```mermaid
graph TB
    subgraph "Product Master"
        P[products<br/>Central Catalog]
        M[medicines<br/>Pharmacy Specific]
    end
    
    subgraph "Stock Tracking"
        SS[stock_summary<br/>Real-time Levels]
        MB[medicine_batches<br/>Batch-level Tracking]
        SM[stock_movements<br/>Audit Trail]
    end
    
    subgraph "Procurement"
        PO[purchase_orders]
        POI[purchase_order_items]
        GRN[goods_receipt_notes]
        GRNI[grn_items]
    end
    
    subgraph "Alerts"
        SA[stock_alerts<br/>Low Stock/Expiry]
    end
    
    P -->|1-to-1| SS
    P -->|Links via| M
    M -->|Has many| MB
    MB -->|Generates| SM
    SM -->|Updates| SS
    
    PO -->|Has many| POI
    PO -->|Fulfilled by| GRN
    GRN -->|Has many| GRNI
    GRNI -->|Creates| MB
    GRNI -->|Generates| SM
    
    SS -->|Triggers| SA
```

### Product-to-Medicine Linking Strategy

The system uses **two complementary tables** for medicine tracking:

```mermaid
graph LR
    subgraph "Products Table (Inventory)"
        P[products<br/>- All hospital products<br/>- Medicines, Optical, Surgical<br/>- Equipment, Laboratory<br/>- Central catalog for stock]
    end
    
    subgraph "Medicines Table (Pharmacy)"
        M[medicines<br/>- Prescription-specific data<br/>- Dosage forms<br/>- Pharmacy formulary<br/>- Clinical information]
    end
    
    subgraph "Linking Strategy"
        L[Link via:<br/>1. generic_name<br/>2. hospital_id<br/>3. Manual product_id FK<br/>   (if medicine created from product)]
    end
    
    P --> L
    M --> L
```

**Best Practice**: When creating a medicine, also create a corresponding product record for unified stock tracking.

---

## API Endpoints

### Products & Stock Management

```mermaid
graph TB
    subgraph "Product CRUD"
        GET1[GET /products<br/>List products]
        GET2[GET /products/{id}<br/>Get product details]
        POST1[POST /products<br/>Create product]
        PUT1[PUT /products/{id}<br/>Update product]
        DEL1[DELETE /products/{id}<br/>Delete product]
    end
    
    subgraph "Stock Overview"
        DASH[GET /stock/dashboard<br/>Dashboard stats]
        OVER[GET /stock/overview<br/>Stock overview]
        LOW[GET /stock/low-stock<br/>Low stock items]
        EXP[GET /stock/expiring<br/>Expiring items]
        SYNC[POST /stock/sync<br/>Sync summary]
    end
    
    subgraph "Alerts"
        ALERT_GET[GET /alerts<br/>List alerts]
        ALERT_POST[POST /alerts<br/>Create alert]
        ALERT_RES[PUT /alerts/{id}/resolve<br/>Resolve alert]
        ALERT_ACK[PUT /alerts/{id}/acknowledge<br/>Acknowledge alert]
    end
```

### Complete Endpoint Reference

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| **Products** |
| GET | `/api/v1/inventory/products` | List all products | inventory_manager, admin |
| GET | `/api/v1/inventory/products/{id}` | Get product with stock | inventory_manager, admin, pharmacist |
| POST | `/api/v1/inventory/products` | Create new product | inventory_manager, admin |
| PUT | `/api/v1/inventory/products/{id}` | Update product | inventory_manager, admin |
| DELETE | `/api/v1/inventory/products/{id}` | Soft delete product | admin |
| **Stock** |
| GET | `/api/v1/inventory/stock/dashboard` | Dashboard statistics | inventory_manager, admin, pharmacist |
| GET | `/api/v1/inventory/stock/overview` | Stock overview with filters | inventory_manager, admin, pharmacist |
| GET | `/api/v1/inventory/stock/low-stock` | Low stock items | inventory_manager, admin, pharmacist |
| GET | `/api/v1/inventory/stock/expiring` | Expiring items | inventory_manager, admin, pharmacist |
| POST | `/api/v1/inventory/stock/sync` | Sync stock summary | inventory_manager, admin |
| **Alerts** |
| GET | `/api/v1/inventory/alerts` | List stock alerts | inventory_manager, admin, pharmacist |
| POST | `/api/v1/inventory/alerts` | Create manual alert | inventory_manager, admin |
| PUT | `/api/v1/inventory/alerts/{id}/resolve` | Resolve alert | inventory_manager, admin |
| PUT | `/api/v1/inventory/alerts/{id}/acknowledge` | Acknowledge alert | inventory_manager, admin, pharmacist |

---

## Stock Consistency & Data Integrity

### How Stock is Kept Consistent

```mermaid
sequenceDiagram
    participant App as Application
    participant DB as Database
    participant Trig as Triggers
    participant Sync as Sync Logic
    
    App->>DB: Start Transaction
    App->>DB: Insert/Update medicine_batches
    
    Note over DB: Batch quantity changed
    
    App->>DB: Insert stock_movements
    DB->>Sync: Detect movement
    
    Sync->>Sync: Calculate new balance
    Sync->>DB: Update stock_summary
    DB->>DB: Recalculate totals
    
    Sync->>Sync: Check thresholds
    alt Below reorder level
        Sync->>DB: Insert stock_alerts
    end
    
    alt Expiring within 90 days
        Sync->>DB: Update is_expiring_soon
    end
    
    App->>DB: Commit Transaction
    
    Note over App: Stock summary now consistent
```

### Consistency Rules

1. **Every batch change creates a movement**
   - No direct batch updates without audit trail
   
2. **Stock summary is auto-synced**
   - Triggered after every movement
   - Uses weighted average for cost calculation
   
3. **Alerts are auto-generated**
   - Low stock: When `available_stock <= reorder_level`
   - Expiring soon: When `earliest_expiry <= 90 days`
   
4. **No negative stock allowed**
   - Validated before dispensing/sale
   - Returns error if insufficient stock

---

## Views for Reporting

### Pre-built Database Views

#### 1. `v_product_medicine_link`
Links products with medicines for unified reporting.

```sql
SELECT 
    p.product_name,
    m.strength,
    m.unit_of_measure,
    ss.available_stock,
    ss.total_value
FROM products p
JOIN medicines m ON p.generic_name = m.generic_name
JOIN stock_summary ss ON p.id = ss.product_id;
```

#### 2. `v_product_stock_movements`
Aggregates stock movements by product and type.

```sql
SELECT 
    product_name,
    movement_type,
    SUM(quantity) as total_qty,
    SUM(quantity * unit_cost) as total_value
FROM v_product_stock_movements
GROUP BY product_name, movement_type;
```

#### 3. `v_inventory_dashboard`
Provides real-time inventory KPIs.

```sql
SELECT 
    total_products,
    total_medicines,
    total_inventory_value,
    low_stock_products,
    expiring_soon_products,
    active_alerts
FROM v_inventory_dashboard;
```

---

## File Structure

```
backend/
├── app/
│   ├── models/
│   │   ├── products.py          # Product, StockSummary, StockAlert
│   │   ├── inventory.py         # PO, GRN, StockMovement, Adjustment
│   │   └── pharmacy.py          # MedicineBatch, PharmacySale
│   ├── schemas/
│   │   └── products.py          # Pydantic schemas
│   ├── services/
│   │   ├── products_service.py  # Product & stock business logic
│   │   └── inventory_service.py # Procurement & movement logic
│   └── routers/
│       └── products.py          # API endpoints
│
database_hole/
├── 01_schema.sql                # Base schema
├── 02_seed_data.sql             # Initial seed data
├── 04_inventory_seed.sql        # Inventory sample data
├── 06_products_master_table.sql # Products table creation
└── 07_seed_products.sql         # Products seed data (this file)
```

---

## Quick Reference: Stock Tracking Flow

```mermaid
graph TB
    Start[Stock Event] --> GRN{GRN Accepted?}
    GRN -->|Yes| CreateBatch[Create Medicine Batch]
    CreateBatch --> MovIn[Create stock_in Movement]
    MovIn --> Sync[Update Stock Summary]
    
    GRN -->|No| Dispense{Dispensing/Sale?}
    Dispense -->|Yes| ReduceBatch[Reduce Batch Quantity]
    ReduceBatch --> MovOut[Create dispensing/sale Movement]
    MovOut --> Sync
    
    Dispense -->|No| Adj{Adjustment?}
    Adj -->|Yes| CreateMov[Create adjustment Movement]
    CreateMov --> Sync
    
    Sync --> Check{Check Thresholds}
    Check -->|Low Stock| Alert1[Create Low Stock Alert]
    Check -->|Expiring| Alert2[Create Expiry Alert]
    Check -->|Normal| End[Stock Updated]
    
    Alert1 --> End
    Alert2 --> End
```

---

## Summary

The HMS Inventory system provides:

✅ **Centralized Product Catalog** - Single source of truth for all items  
✅ **Real-time Stock Tracking** - Updated on every transaction  
✅ **Complete Audit Trail** - Every movement recorded  
✅ **Batch-level Expiry Tracking** - FIFO dispensing  
✅ **Automated Alerts** - Low stock and expiry notifications  
✅ **Multi-category Support** - Medicines, Optical, Surgical, Equipment, Laboratory  
✅ **Segregation of Duties** - GRN creator cannot verify  
✅ **Integration Ready** - Links with Pharmacy, Procurement, Sales  

---

**Documentation Version:** 1.0  
**Last Updated:** 21 March 2026  
**Maintained By:** Development Team
