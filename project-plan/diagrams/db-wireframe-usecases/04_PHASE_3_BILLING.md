# Phase 3 — Billing & Inventory: Use Cases & Wireframe Flow

> **Tables (19):** invoices, invoice_items, payments, refunds, credit_notes, daily_settlements, insurance_providers, insurance_policies, insurance_claims, pre_authorizations, suppliers, purchase_orders, purchase_order_items, goods_receipt_notes, grn_items, stock_movements, stock_adjustments, cycle_counts, cycle_count_items
> **Focus:** Billing, Payments, Insurance, Inventory Management

---

## Eraser.io Use Case Diagram

Copy the code below into [eraser.io](https://app.eraser.io) → Diagram as Code:

```eraser
// =============================================================================
// PHASE 3: BILLING & INVENTORY — USE CASE DIAGRAM
// =============================================================================

// Actors
Cashier [icon: credit-card, color: yellow]
Receptionist [icon: clipboard, color: blue]
Admin [icon: user-check, color: orange]
Inventory Manager [icon: box, color: brown]
Pharmacist [icon: package, color: cyan]
System [icon: cpu, color: gray]

// ─────────────────────────────────────────────
// Billing & Payments
// ─────────────────────────────────────────────

Generate Invoice [icon: file-text, color: yellow] {
  description: "Create bill for consultation, pharmacy, optical, or combined services"
}

Collect Payment [icon: credit-card, color: yellow] {
  description: "Receive cash/card/UPI/online payment against invoice"
}

Process Refund [icon: rotate-ccw, color: yellow] {
  description: "Return money for billing errors, service not provided, patient request"
}

Issue Credit Note [icon: file-minus, color: yellow] {
  description: "Issue store credit instead of cash refund, with expiry date"
}

Close Daily Settlement [icon: check-square, color: yellow] {
  description: "Cashier tallies cash/card/online collections at end of day"
}

Verify Daily Settlement [icon: check-circle, color: yellow] {
  description: "Manager verifies cashier's settlement totals"
}

// ─────────────────────────────────────────────
// Insurance
// ─────────────────────────────────────────────

Register Insurance Provider [icon: shield, color: pink] {
  description: "Add empanelled insurance company with contact details"
}

Add Patient Insurance Policy [icon: file-text, color: pink] {
  description: "Record policy number, coverage, deductible, copay for a patient"
}

File Insurance Claim [icon: clipboard, color: pink] {
  description: "Submit claim to insurer with invoice, track approval/rejection"
}

Request Pre Authorization [icon: check, color: pink] {
  description: "Get prior approval from insurer before expensive treatment"
}

// ─────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────

Manage Suppliers [icon: truck, color: brown] {
  description: "Add/edit supplier details, payment terms, lead time, rating"
}

Create Purchase Order [icon: clipboard, color: brown] {
  description: "Order medicines/optical products from supplier, get approval"
}

Receive Goods GRN [icon: inbox, color: brown] {
  description: "Verify delivery against PO, check quality, create medicine batches"
}

Track Stock Movements [icon: trending-up, color: brown] {
  description: "Auto-log every stock in/out: receipt, sale, return, adjustment"
}

Adjust Stock [icon: sliders, color: brown] {
  description: "Manual correction when physical count differs from system"
}

Conduct Cycle Count [icon: refresh-cw, color: brown] {
  description: "Physical inventory audit: count items, compare with system, record variance"
}

// ─────────────────────────────────────────────
// Relationships
// ─────────────────────────────────────────────

Cashier > Generate Invoice
Cashier > Collect Payment
Cashier > Process Refund
Cashier > Close Daily Settlement
Cashier > File Insurance Claim

Admin > Process Refund
Admin > Issue Credit Note
Admin > Verify Daily Settlement
Admin > Register Insurance Provider

Receptionist > Add Patient Insurance Policy
Receptionist > Request Pre Authorization

Inventory Manager > Manage Suppliers
Inventory Manager > Create Purchase Order
Inventory Manager > Receive Goods GRN
Inventory Manager > Adjust Stock
Inventory Manager > Conduct Cycle Count

System > Track Stock Movements
```

---

## Use Case Descriptions

### UC-3.1: Generate Invoice
| Field | Detail |
|-------|--------|
| **Actor** | Cashier |
| **Tables** | `invoices`, `invoice_items`, `tax_configurations` |
| **Precondition** | Service delivered (consultation, pharmacy dispensing, optical order) |
| **Main Flow** | 1. System auto-creates invoice from service events:<br>&nbsp;&nbsp;&nbsp;• Consultation → `invoice_type` = "opd"<br>&nbsp;&nbsp;&nbsp;• Pharmacy sale → `invoice_type` = "pharmacy"<br>&nbsp;&nbsp;&nbsp;• Optical order → `invoice_type` = "optical"<br>&nbsp;&nbsp;&nbsp;• Multiple → `invoice_type` = "combined"<br>2. For each item: description, quantity, unit_price, discount, tax<br>3. Tax calculated from `tax_configurations` (rate at invoice time)<br>4. Subtotal − discount + tax = total_amount<br>5. `invoice_number` generated (INV-2026-00001)<br>6. Status = "issued", `balance_amount` = `total_amount` |
| **Postcondition** | Invoice ready for payment collection |

### UC-3.2: Collect Payment
| Field | Detail |
|-------|--------|
| **Actor** | Cashier |
| **Tables** | `payments`, `invoices` |
| **Main Flow** | 1. Find invoice by number or patient<br>2. Select payment mode: cash, card, UPI, bank_transfer, online, cheque, insurance<br>3. Enter amount (can be partial — multiple payments allowed per invoice)<br>4. Record payment reference (transaction ID, cheque number)<br>5. System generates `payment_number` (PAY-2026-00001)<br>6. Update invoice: `paid_amount` += payment, `balance_amount` recalculated<br>7. If `balance_amount` = 0 → status = "paid"<br>8. If `balance_amount` > 0 → status = "partially_paid"<br>9. `received_by` = current cashier |

### UC-3.3: Process Refund
| Field | Detail |
|-------|--------|
| **Actor** | Cashier, Admin |
| **Tables** | `refunds`, `payments`, `invoices` |
| **Main Flow** | 1. Find invoice and original payment<br>2. Cashier initiates refund with reason (service_not_provided, billing_error, patient_request)<br>3. Status = "pending" → Admin approves → "approved" → processed<br>4. Refund mode noted (same as payment or different)<br>5. Payment reference recorded for reconciliation<br>6. Invoice `paid_amount` adjusted accordingly |

### UC-3.4: Issue Credit Note
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `credit_notes`, `invoices` |
| **Main Flow** | 1. Instead of cash refund, issue store credit<br>2. Create credit note: amount, reason, original invoice reference<br>3. Set `valid_until` expiry date<br>4. Status = "issued"<br>5. When patient returns: apply credit to new invoice<br>&nbsp;&nbsp;&nbsp;→ `applied_to_invoice_id` set, status = "applied"<br>6. Unused credits expire → status = "expired" |

### UC-3.5: Close Daily Settlement
| Field | Detail |
|-------|--------|
| **Actor** | Cashier |
| **Tables** | `daily_settlements` |
| **Main Flow** | 1. At end of shift, cashier initiates settlement<br>2. System tallies: total_cash, total_card, total_online, total_other<br>3. Calculates: total_collected, total_refunds, net_amount<br>4. Cashier physically counts cash and confirms totals<br>5. Status = "closed"<br>6. Settlement date = today, one per cashier per day |

### UC-3.6: Verify Daily Settlement
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `daily_settlements` |
| **Main Flow** | 1. Admin reviews cashier's closed settlement<br>2. Compares system totals with physical counts<br>3. If match → status = "verified", `verified_by` = admin<br>4. If mismatch → notes added, investigation triggered |

### UC-3.7: Register Insurance Provider
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `insurance_providers` |
| **Main Flow** | 1. Enter provider name, code, contact person, phone, email, address<br>2. Set `is_active` = true<br>3. Provider appears in policy creation dropdowns |

### UC-3.8: Add Patient Insurance Policy
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `insurance_policies` |
| **Main Flow** | 1. Select patient and insurance provider<br>2. Enter: policy_number, group_number, member_id, plan_name<br>3. Set: coverage_type (individual/family), coverage_amount, deductible, copay_percent<br>4. Set: effective_from, effective_to<br>5. Mark `is_primary` (secondary insurance covers remainder)<br>6. Patient can have multiple policies |

### UC-3.9: File Insurance Claim
| Field | Detail |
|-------|--------|
| **Actor** | Cashier |
| **Tables** | `insurance_claims`, `invoices`, `insurance_policies` |
| **Main Flow** | 1. Select patient's invoice and active insurance policy<br>2. Calculate: claim_amount (total − deductible − copay)<br>3. Attach supporting documents (Rx, lab reports, discharge summary)<br>4. Generate `claim_number` (CLM-2026-00001)<br>5. Submit to insurer → status = "submitted"<br>6. Insurer responds → "approved" / "partially_approved" / "rejected"<br>7. `approved_amount` recorded, invoice linked via `insurance_claim_id` |

### UC-3.10: Request Pre-Authorization
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `pre_authorizations`, `insurance_policies` |
| **Main Flow** | 1. Before expensive treatment, request pre-approval from insurer<br>2. Enter: service description, estimated cost<br>3. Status = "requested"<br>4. Insurer responds with auth_number and approved_amount<br>5. Must use within valid_from → valid_to dates |

### UC-3.11: Manage Suppliers
| Field | Detail |
|-------|--------|
| **Actor** | Inventory Manager |
| **Tables** | `suppliers` |
| **Main Flow** | 1. Add supplier: name, code, contact, phone, email, address<br>2. Set: tax_id (for input credit), payment_terms ("Net 30")<br>3. Record: lead_time_days for delivery planning<br>4. Rate: 1.0-5.0 performance score<br>5. Deactivate underperforming suppliers |

### UC-3.12: Create Purchase Order
| Field | Detail |
|-------|--------|
| **Actor** | Inventory Manager |
| **Tables** | `purchase_orders`, `purchase_order_items` |
| **Main Flow** | 1. Select supplier<br>2. Add items: item_type (medicine/optical_product), item_id, quantity, unit_price<br>3. System calculates line totals and PO total with tax<br>4. Generate `po_number` (PO-2026-00001)<br>5. Set expected_delivery_date<br>6. Status = "draft" → admin approves → "submitted" to supplier<br>7. Triggered when stock falls below `reorder_level` |

### UC-3.13: Receive Goods (GRN)
| Field | Detail |
|-------|--------|
| **Actor** | Inventory Manager |
| **Tables** | `goods_receipt_notes`, `grn_items`, `medicine_batches` |
| **Main Flow** | 1. Delivery arrives → select PO being fulfilled<br>2. Generate `grn_number` (GRN-2026-00001)<br>3. For each item: record quantity_received, batch_number, expiry_date<br>4. Quality check: quantity_accepted vs quantity_rejected<br>5. Rejection reason noted for rejects<br>6. For medicines: new `medicine_batches` row created per batch with:<br>&nbsp;&nbsp;&nbsp;→ batch_number, manufactured_date, expiry_date, purchase_price, initial_quantity<br>7. PO status updated to "partially_received" or "received"<br>8. Stock movement logged automatically |
| **Postcondition** | New stock available for dispensing |

### UC-3.14: Track Stock Movements
| Field | Detail |
|-------|--------|
| **Actor** | System (automatic) |
| **Tables** | `stock_movements` |
| **Main Flow** | Every stock change auto-creates an immutable log entry:<br>• **stock_in** → GRN receipt<br>• **sale/dispensing** → pharmacy dispense<br>• **return** → pharmacy return (restock)<br>• **adjustment** → manual stock adjustment<br>• **expired** → daily job marks expired batches<br>• **damaged** → write-off<br>Each entry: quantity (+ or −), `balance_after`, unit_cost, performed_by |

### UC-3.15: Adjust Stock
| Field | Detail |
|-------|--------|
| **Actor** | Inventory Manager |
| **Tables** | `stock_adjustments` |
| **Main Flow** | 1. Physical count doesn't match system<br>2. Create adjustment: increase, decrease, or write_off<br>3. Specify: item, batch, quantity, reason<br>4. Status = "pending" → Admin approves → "approved"<br>5. Approved adjustment triggers `stock_movement` entry<br>6. Batch quantity updated accordingly |

### UC-3.16: Conduct Cycle Count
| Field | Detail |
|-------|--------|
| **Actor** | Inventory Manager |
| **Tables** | `cycle_counts`, `cycle_count_items` |
| **Main Flow** | 1. Schedule physical inventory audit (monthly/quarterly)<br>2. Generate `count_number`, set count_date<br>3. For each product: record `system_quantity` (expected) and `counted_quantity` (actual)<br>4. System calculates `variance` (counted − system)<br>5. Record `variance_reason` for discrepancies<br>6. Status: in_progress → completed → verified by manager<br>7. Variances may trigger stock adjustments |

---

## Data Flow: Consultation → Invoice → Payment

```
Appointment completed (Phase 1)
        │
        ▼
┌─ invoices ───────────────────────────┐
│  invoice_number: INV-2026-00001      │
│  invoice_type: "opd"                 │
│  patient_id, appointment_id         │
│  status: "issued"                    │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ invoice_items ──────────────────────┐
│  item_type: "consultation"           │
│  description: "Dr. Smith Consult"    │
│  unit_price: $150, tax: $27          │
│  total_price: $177                   │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ payments ───────────────────────────┐
│  payment_number: PAY-2026-00001      │
│  amount: $177, mode: "card"          │
│  reference: "TXN-ABC123"            │
│  received_by: cashier_user_id        │
│  status: "completed"                 │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ invoices (updated) ─────────────────┐
│  paid_amount: $177                   │
│  balance_amount: $0                  │
│  status: "paid"                      │
└──────────────────────────────────────┘
```

## Data Flow: Purchase Order → GRN → Stock

```
Stock falls below reorder level
        │
        ▼
┌─ purchase_orders ────────────────────┐
│  po_number: PO-2026-00001            │
│  supplier: MedCo Pharma              │
│  status: "draft" → "submitted"       │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ purchase_order_items ───────────────┐
│  Paracetamol 500mg × 1000           │
│  Amoxicillin 250mg × 500            │
│  unit_price, total_price             │
└───────────┬──────────────────────────┘
            │ Delivery arrives
            ▼
┌─ goods_receipt_notes ────────────────┐
│  grn_number: GRN-2026-00001          │
│  receipt_date, supplier_invoice_num  │
│  status: "pending" → "accepted"      │
└───────────┬──────────────────────────┘
            │
            ├──────────────────────────┐
            ▼                          ▼
┌─ grn_items ──────────┐  ┌─ medicine_batches ─────────┐
│  qty_received: 1000   │  │  batch: "BT-2026-A01"      │
│  qty_accepted: 990    │  │  expiry: 2027-06-15         │
│  qty_rejected: 10     │  │  initial_qty: 990           │
│  rejection_reason:    │  │  current_qty: 990           │
│    "Damaged packaging"│  │  purchase_price: $0.05      │
└──────────────────────┘  └───────────┬────────────────┘
                                      │
                                      ▼
                          ┌─ stock_movements ───────────┐
                          │  movement_type: "stock_in"   │
                          │  reference: GRN-2026-00001   │
                          │  quantity: +990               │
                          │  balance_after: 1490         │
                          └─────────────────────────────┘
```

## Data Flow: Insurance Claim

```
Patient has insurance policy
        │
        ▼
┌─ insurance_policies ─────────────────┐
│  provider: "Star Health"             │
│  coverage: $50,000                   │
│  deductible: $500, copay: 20%        │
└───────────┬──────────────────────────┘
            │
            ▼ (Pre-Auth if needed)
┌─ pre_authorizations ─────────────────┐
│  service: "Cardiac Consultation"     │
│  estimated_cost: $2,000              │
│  auth_number: "PA-9876"              │
│  approved_amount: $1,800             │
└───────────┬──────────────────────────┘
            │ Treatment delivered
            ▼
┌─ invoices ───────────────────────────┐
│  total_amount: $2,000                │
│  Patient pays copay (20% = $400)     │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ insurance_claims ───────────────────┐
│  claim_number: CLM-2026-00001        │
│  claim_amount: $1,600                │
│  status: submitted → under_review    │
│        → approved (or rejected)      │
│  approved_amount: $1,600             │
│  → Invoice balance settled           │
└──────────────────────────────────────┘
```
