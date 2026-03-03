# Phase 2 — Clinical & Pharmacy: Use Cases & Wireframe Flow

> **Tables (16):** prescriptions, prescription_items, prescription_templates, prescription_versions, lab_orders, medicines, medicine_batches, pharmacy_dispensing, pharmacy_dispensing_items, pharmacy_returns, pharmacy_return_items, optical_products, optical_prescriptions, optical_orders, optical_order_items, optical_repairs
> **Focus:** Prescriptions, Pharmacy Dispensing, Optical Store

---

## Eraser.io Use Case Diagram

Copy the code below into [eraser.io](https://app.eraser.io) → Diagram as Code:

```eraser
// =============================================================================
// PHASE 2: CLINICAL & PHARMACY — USE CASE DIAGRAM
// =============================================================================

// Actors
Doctor [icon: stethoscope, color: purple]
Pharmacist [icon: package, color: cyan]
Optical Staff [icon: eye, color: indigo]
Patient [icon: user, color: green]
Admin [icon: user-check, color: orange]

// ─────────────────────────────────────────────
// Prescription Management
// ─────────────────────────────────────────────

Write Prescription [icon: file-text, color: teal] {
  description: "Diagnosis, medicines, dosage, frequency, duration, advice"
}

Use Prescription Template [icon: copy, color: teal] {
  description: "Load saved template, auto-fill medicines and advice"
}

Edit Version Prescription [icon: git-branch, color: teal] {
  description: "Edit finalized Rx, old version saved as JSON snapshot"
}

Finalize Prescription [icon: check-circle, color: teal] {
  description: "Lock Rx for editing, mark ready for pharmacy"
}

Order Lab Tests [icon: activity, color: teal] {
  description: "Order CBC, X-ray, urine test with urgency level"
}

// ─────────────────────────────────────────────
// Pharmacy
// ─────────────────────────────────────────────

Manage Medicine Catalog [icon: package, color: cyan] {
  description: "Add/edit medicines: name, generic, category, price, tax, stock levels"
}

Dispense Prescription [icon: shopping-cart, color: cyan] {
  description: "Fill Rx: select batches (FEFO), calculate totals, hand to patient"
}

Counter Sale OTC [icon: shopping-bag, color: cyan] {
  description: "Sell OTC medicines without prescription (walk-in customer)"
}

Process Pharmacy Return [icon: rotate-ccw, color: cyan] {
  description: "Patient returns medicines, approve refund, optionally restock"
}

// ─────────────────────────────────────────────
// Optical Store
// ─────────────────────────────────────────────

Write Optical Prescription [icon: eye, color: indigo] {
  description: "Record SPH, CYL, AXIS, ADD, VA for both eyes + PD"
}

Manage Optical Products [icon: box, color: indigo] {
  description: "Add frames, lenses, contacts: brand, price, stock, lens specs"
}

Place Optical Order [icon: shopping-bag, color: indigo] {
  description: "Patient picks frame + lenses, create order, track production"
}

Track Optical Order Status [icon: truck, color: indigo] {
  description: "Update: placed → in_progress → quality_check → ready → delivered"
}

Register Optical Repair [icon: tool, color: indigo] {
  description: "Accept broken glasses, estimate cost, track repair to delivery"
}

// ─────────────────────────────────────────────
// Relationships
// ─────────────────────────────────────────────

Doctor > Write Prescription
Doctor > Use Prescription Template
Doctor > Edit Version Prescription
Doctor > Finalize Prescription
Doctor > Order Lab Tests
Doctor > Write Optical Prescription

Pharmacist > Manage Medicine Catalog
Pharmacist > Dispense Prescription
Pharmacist > Counter Sale OTC
Pharmacist > Process Pharmacy Return

Optical Staff > Manage Optical Products
Optical Staff > Place Optical Order
Optical Staff > Track Optical Order Status
Optical Staff > Register Optical Repair

Admin > Manage Medicine Catalog
Admin > Manage Optical Products
```

---

## Use Case Descriptions

### UC-2.1: Write Prescription
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `prescriptions`, `prescription_items` |
| **Precondition** | Patient has an active appointment (status = "with_doctor") |
| **Main Flow** | 1. Doctor enters diagnosis and clinical notes<br>2. Adds medicine lines: medicine name, dosage (500mg), frequency (1-0-1), duration (7 days), route (oral)<br>3. System auto-calculates quantity (dose × frequency × duration)<br>4. Each medicine can link to `medicines` catalog or be free-text<br>5. Sets `allow_substitution` per item (generic OK?)<br>6. Adds advice text ("Rest for 3 days, avoid cold water")<br>7. System generates `prescription_number` (RX-2026-00001)<br>8. Status = "draft" (editable) |
| **Postcondition** | Prescription created, ready to finalize |

### UC-2.2: Use Prescription Template
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `prescription_templates`, `prescriptions` |
| **Main Flow** | 1. Doctor selects from saved templates (e.g., "Common Cold", "Diabetes")<br>2. Template auto-fills: diagnosis, medicine items (names, dosages, frequencies), advice<br>3. Doctor can modify any field before saving<br>4. Template `usage_count` incremented (most-used first in list) |

### UC-2.3: Edit / Version Prescription
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `prescriptions`, `prescription_versions` |
| **Main Flow** | 1. Doctor edits a finalized prescription (e.g., dosage change, allergy found)<br>2. System saves old state as JSON snapshot in `prescription_versions`<br>3. Records `changed_by` and `change_reason` (mandatory)<br>4. Prescription `version` number incremented<br>5. Original version preserved — immutable audit trail |

### UC-2.4: Finalize Prescription
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `prescriptions` |
| **Main Flow** | 1. Doctor reviews all items and advice<br>2. Clicks "Finalize"<br>3. `is_finalized` = true, `finalized_at` set<br>4. Status → "finalized"<br>5. Prescription locked — further edits create new version |

### UC-2.5: Order Lab Tests
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `lab_orders` |
| **Main Flow** | 1. Doctor adds lab tests to prescription (CBC, X-Ray, Urine Analysis)<br>2. Sets test name, code, instructions, urgency (routine/urgent/stat)<br>3. Status = "ordered"<br>4. Lab technician later updates: "collected" → "processing" → "completed" |

### UC-2.6: Manage Medicine Catalog
| Field | Detail |
|-------|--------|
| **Actor** | Pharmacist, Admin |
| **Tables** | `medicines` |
| **Main Flow** | 1. Add new medicine: brand name, generic name, category (tablet/syrup/injection)<br>2. Set: manufacturer, composition, strength, unit_of_measure, units_per_pack<br>3. Set: SKU, barcode, HSN code<br>4. Set: selling_price, purchase_price, tax_config<br>5. Set: reorder_level, max_stock_level, storage instructions<br>6. Mark: requires_prescription (OTC = false), is_controlled |

### UC-2.7: Dispense Prescription
| Field | Detail |
|-------|--------|
| **Actor** | Pharmacist |
| **Tables** | `pharmacy_dispensing`, `pharmacy_dispensing_items`, `medicine_batches` |
| **Precondition** | Prescription exists and is finalized |
| **Main Flow** | 1. Pharmacist scans Rx number or selects from pending list<br>2. For each prescribed item:<br>&nbsp;&nbsp;&nbsp;a. System finds matching `medicines` in catalog<br>&nbsp;&nbsp;&nbsp;b. System selects batch with earliest expiry (FEFO)<br>&nbsp;&nbsp;&nbsp;c. Pharmacist confirms quantity<br>&nbsp;&nbsp;&nbsp;d. If generic substitution → mark `substituted` = true<br>3. System calculates: unit_price × quantity − discount + tax<br>4. Creates `pharmacy_dispensing` with totals<br>5. Deducts `current_quantity` from `medicine_batches`<br>6. Status = "dispensed" (or "partial" if some items out of stock)<br>7. Prescription items marked `is_dispensed` = true |
| **Postcondition** | Medicines handed to patient, stock updated, invoice link ready |

### UC-2.8: Counter Sale (OTC)
| Field | Detail |
|-------|--------|
| **Actor** | Pharmacist |
| **Tables** | `pharmacy_dispensing`, `pharmacy_dispensing_items` |
| **Main Flow** | 1. Walk-in customer requests OTC medicines<br>2. Pharmacist scans barcode or searches by name<br>3. Only `requires_prescription` = false medicines allowed<br>4. Creates dispensing with `sale_type` = "counter_sale"<br>5. `prescription_id` = NULL, `patient_id` = NULL (anonymous)<br>6. Same batch selection and stock deduction as Rx dispensing |

### UC-2.9: Process Pharmacy Return
| Field | Detail |
|-------|--------|
| **Actor** | Pharmacist |
| **Tables** | `pharmacy_returns`, `pharmacy_return_items`, `medicine_batches` |
| **Main Flow** | 1. Patient brings back medicines with dispensing receipt<br>2. Pharmacist finds original dispensing record<br>3. Selects items being returned, enters reason<br>4. Status = "pending" → Manager approves → "approved"<br>5. If `restock` = true → increment `medicine_batches.current_quantity`<br>6. Refund amount calculated from original sale price<br>7. Return items linked back to original `dispensing_item_id` and `batch_id` |

### UC-2.10: Write Optical Prescription
| Field | Detail |
|-------|--------|
| **Actor** | Doctor (Ophthalmologist) |
| **Tables** | `optical_prescriptions` |
| **Main Flow** | 1. Doctor enters eye measurements:<br>&nbsp;&nbsp;&nbsp;Right: SPH, CYL, AXIS, ADD, VA<br>&nbsp;&nbsp;&nbsp;Left: SPH, CYL, AXIS, ADD, VA<br>2. Records PD (pupillary distance): binocular + monocular<br>3. System generates prescription number<br>4. Sets `valid_until` (typically 1-2 years)<br>5. Finalize to lock the Rx |

### UC-2.11: Place Optical Order
| Field | Detail |
|-------|--------|
| **Actor** | Optical Staff |
| **Tables** | `optical_orders`, `optical_order_items`, `optical_products` |
| **Main Flow** | 1. Select patient and their optical prescription<br>2. Patient browses/selects frame from `optical_products` catalog<br>3. System recommends lens type based on Rx (single vision, bifocal, progressive)<br>4. Select lens product, coating (anti-reflective, blue-cut, photochromic)<br>5. Record fitting measurements (segment height, vertex distance)<br>6. Calculate totals: frame + lenses + coatings − discount + tax<br>7. Set `estimated_delivery_date`<br>8. Order status = "placed" |

### UC-2.12: Track Optical Order Status
| Field | Detail |
|-------|--------|
| **Actor** | Optical Staff |
| **Tables** | `optical_orders` |
| **Main Flow** | 1. View orders by status<br>2. Update status progression:<br>&nbsp;&nbsp;&nbsp;placed → in_progress → quality_check → ready → delivered<br>3. On delivery: set `delivered_at` timestamp<br>4. Patient notified when order is ready |

### UC-2.13: Register Optical Repair
| Field | Detail |
|-------|--------|
| **Actor** | Optical Staff |
| **Tables** | `optical_repairs` |
| **Main Flow** | 1. Patient walks in with broken glasses<br>2. Record: item description, issue description<br>3. Estimate repair cost<br>4. Set `estimated_completion` date<br>5. Status: received → in_progress → completed → delivered<br>6. Actual cost may differ from estimate<br>7. Invoice generated on completion |

### UC-2.14: Manage Optical Products
| Field | Detail |
|-------|--------|
| **Actor** | Optical Staff |
| **Tables** | `optical_products` |
| **Main Flow** | 1. Add products: name, category (frame/lens/contact_lens/accessory)<br>2. Set: brand, model, color, material, size, gender target<br>3. Set: SKU, barcode, selling price, purchase price, tax config<br>4. For lenses: set lens_type, lens_index, lens_coating<br>5. Set: current_stock, reorder_level<br>6. Upload product image |

---

## Data Flow: Prescription → Pharmacy Dispensing

```
Doctor writes prescription during consultation
        │
        ▼
┌─ prescriptions ──────────────────────┐
│  diagnosis, clinical_notes, advice   │
│  status = "draft" → "finalized"      │
│  prescription_number: RX-2026-00001  │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ prescription_items ─────────────────┐
│  medicine_name, dosage, frequency    │
│  duration, route, quantity           │
│  allow_substitution: true/false      │
└───────────┬──────────────────────────┘
            │ Rx sent to pharmacy
            ▼
┌─ medicines ──────────────────────────┐
│  Match: prescription item → catalog  │
│  Get: selling_price, tax_config      │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ medicine_batches ───────────────────┐
│  Select: earliest expiry (FEFO)      │
│  Check: current_quantity >= needed   │
│  Deduct: current_quantity -= qty     │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ pharmacy_dispensing ────────────────┐
│  dispensing_number: DISP-2026-00001  │
│  total, discount, tax, net_amount    │
│  dispensed_by, dispensed_at          │
│  → Links to invoices (Phase 3)      │
└──────────────────────────────────────┘
```

## Data Flow: Optical Rx → Order → Delivery

```
Doctor writes optical prescription
        │
        ▼
┌─ optical_prescriptions ──────────────┐
│  Right: SPH -2.50, CYL -0.75, AXIS 90│
│  Left:  SPH -3.00, CYL -0.50, AXIS 85│
│  PD: 62mm                             │
└───────────┬───────────────────────────┘
            │
            ▼
┌─ optical_products (frame) ────────────┐
│  Select: Ray-Ban Aviator, Gold        │
│  Price: $120                          │
└───────────┬───────────────────────────┘
            │
            ▼
┌─ optical_products (lenses) ───────────┐
│  Select: Progressive 1.67 + Blue-cut  │
│  Right lens + Left lens               │
│  Price: $180 + $180                   │
└───────────┬───────────────────────────┘
            │
            ▼
┌─ optical_orders ──────────────────────┐
│  order_number: OPT-2026-00001         │
│  Total: $480 − discount + tax         │
│  Status progression:                  │
│    placed → in_progress →             │
│    quality_check → ready → delivered  │
│  → Links to invoices (Phase 3)        │
└───────────────────────────────────────┘
```

## Data Flow: Pharmacy Return

```
Patient brings back medicines
        │
        ▼
┌─ pharmacy_dispensing ────────────────┐
│  Find: original sale record          │
│  Verify: dispensing_number           │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ pharmacy_returns ───────────────────┐
│  return_number: RET-2026-00001       │
│  reason: "Wrong medicine dispensed"  │
│  status: pending → approved          │
│  approved_by: manager                │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ pharmacy_return_items ──────────────┐
│  Link: dispensing_item_id, batch_id  │
│  quantity returned, refund_amount    │
│  If restock=true:                    │
│    → medicine_batches.current_qty += │
└──────────────────────────────────────┘
```
