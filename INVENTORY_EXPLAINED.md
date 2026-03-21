# Inventory Management - Simplified Guide

## Overview
The Inventory module tracks all medical supplies, equipment, and products in the hospital. It manages stock levels, movements, and ensures nothing runs out.

---

## Core Parameters

### 1. **Product**
The actual item being tracked (medicine, equipment, supplies).

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | INT | Unique identifier for the product |
| `name` | VARCHAR | Product name (e.g., "Paracetamol 500mg") |
| `category` | VARCHAR | Type (Medicine, Equipment, Consumables) |
| `unit` | VARCHAR | Measurement unit (Tablet, Box, Liter) |
| `min_stock_level` | INT | Minimum quantity before reorder alert |
| `max_stock_level` | INT | Maximum storage capacity |
| `current_stock` | INT | Available quantity right now |
| `price` | DECIMAL | Cost per unit |
| `supplier_id` | INT | Linked supplier for reordering |
| `status` | ENUM | Active/Inactive/Discontinued |

---

### 2. **Stock**
Current inventory state for a product.

| Field | Type | Description |
|-------|------|-------------|
| `stock_id` | INT | Unique stock record ID |
| `product_id` | INT | Linked product |
| `quantity` | INT | Current available quantity |
| `reorder_level` | INT | When to trigger purchase order |
| `location` | VARCHAR | Storage location (Warehouse A, Shelf 3) |
| `batch_number` | VARCHAR | Batch/lot number for tracking |
| `expiry_date` | DATE | Product expiration date |
| `last_updated` | TIMESTAMP | Last modification time |

---

### 3. **Stock Movement**
Tracks every IN/OUT transaction of inventory.

| Field | Type | Description |
|-------|------|-------------|
| `movement_id` | INT | Unique movement record ID |
| `product_id` | INT | Which product moved |
| `movement_type` | ENUM | Type of movement (see below) |
| `quantity` | INT | How many units moved |
| `reference_id` | INT | Linked document (PO ID, GRN ID, Order ID) |
| `reference_type` | VARCHAR | What document type (PO, GRN, Sale, Return) |
| `movement_date` | DATETIME | When the movement happened |
| `user_id` | INT | Who performed the action |
| `notes` | TEXT | Additional comments |

---

## Stock Movement Types

### **IN Movements** (Stock Increases)

| Type | Code | Description | Example |
|------|------|-------------|---------|
| **Purchase** | `IN_PURCHASE` | Stock received from supplier | Received 100 boxes from vendor |
| **Return In** | `IN_RETURN` | Items returned by customer/department | Ward returns unused medicines |
| **Adjustment In** | `IN_ADJUSTMENT` | Manual stock increase (correction) | Found extra stock during audit |
| **Transfer In** | `IN_TRANSFER` | Received from another location | Stock moved from Warehouse B to A |

---

### **OUT Movements** (Stock Decreases)

| Type | Code | Description | Example |
|------|------|-------------|---------|
| **Sale** | `OUT_SALE` | Stock sold to patient/customer | Pharmacy dispenses medicine |
| **Return Out** | `OUT_RETURN` | Items returned to supplier | Defective items sent back |
| **Adjustment Out** | `OUT_ADJUSTMENT` | Manual stock decrease (correction) | Damaged/lost items removed |
| **Transfer Out** | `OUT_TRANSFER` | Sent to another location | Stock sent to branch hospital |
| **Expiry** | `OUT_EXPIRY` | Expired items removed | Medicines past expiry date |
| **Damage** | `OUT_DAMAGE` | Damaged/defective items | Broken equipment removed |

---

## Movement Flow Example

```
PURCHASE ORDER (PO) Created
        ↓
    GRN (Goods Received Note)
        ↓
  Stock Movement: IN_PURCHASE (+100 units)
        ↓
    Current Stock: 100
        ↓
   Pharmacy Request
        ↓
  Stock Movement: OUT_SALE (-20 units)
        ↓
    Current Stock: 80
```

---

## Key Concepts

### **Reorder Level**
When `current_stock <= reorder_level`, system alerts to create a Purchase Order.

### **FIFO (First In, First Out)**
Older batch items are used first to prevent expiry.

### **Batch Tracking**
Each batch has unique ID for traceability (important for recalls).

### **Stock Adjustment**
Manual correction when physical count doesn't match system count.

---

## Common Workflows

### 1. **New Stock Arrival**
```
Purchase Order → GRN → Stock Movement (IN_PURCHASE) → Stock Updated
```

### 2. **Stock Issue**
```
Request → Approval → Stock Movement (OUT_SALE/OUT_ISSUE) → Stock Updated
```

### 3. **Stock Transfer**
```
Transfer Request → OUT_TRANSFER (Source) → IN_TRANSFER (Destination)
```

### 4. **Expiry Handling**
```
Expiry Report → Stock Movement (OUT_EXPIRY) → Stock Updated
```

---

## Reports Available

- **Stock Summary** - Current stock levels
- **Movement History** - All IN/OUT transactions
- **Low Stock Alert** - Items below reorder level
- **Expiry Report** - Items nearing expiration
- **Movement Analysis** - Fast/slow moving items

---

## Quick Reference

| Action | Movement Type | Stock Change |
|--------|---------------|--------------|
| Receive from supplier | `IN_PURCHASE` | + |
| Sell to patient | `OUT_SALE` | - |
| Return to supplier | `OUT_RETURN` | - |
| Return from customer | `IN_RETURN` | + |
| Fix undercount | `IN_ADJUSTMENT` | + |
| Fix overcount | `OUT_ADJUSTMENT` | - |
| Send to another warehouse | `OUT_TRANSFER` | - |
| Receive from another warehouse | `IN_TRANSFER` | + |
| Remove expired items | `OUT_EXPIRY` | - |
| Remove damaged items | `OUT_DAMAGE` | - |

---

## File Structure
```
backend/
├── models/
│   ├── Product.js      # Product definitions
│   ├── Stock.js        # Current stock levels
│   └── StockMovement.js # Movement transactions
├── controllers/
│   ├── inventoryController.js
│   └── stockMovementController.js
└── routes/
    └── inventory.js
```

---

*For detailed implementation, see: `INVENTORY_IMPLEMENTATION_STATUS.md`*
