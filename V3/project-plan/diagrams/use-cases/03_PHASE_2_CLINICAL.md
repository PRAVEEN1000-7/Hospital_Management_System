# Phase 2 — Clinical: Use Cases

> Prescriptions, Pharmacy Dispensing, Optical Store

---

## Actors

| Actor | Description |
|-------|-------------|
| **Doctor** | Creates prescriptions, optical Rx, checks drug interactions |
| **Pharmacist** | Dispenses medicines, manages catalog, handles returns |
| **Optical Staff** | Manages optical products, orders, repairs |
| **Admin** | Approves pharmacy returns |
| **Patient** | Receives medicines, optical products |
| **System** | Drug interaction checks, FEFO batch selection, stock updates |

---

## Use Case Diagram

```plantuml
@startuml Phase_2_Clinical

left to right direction
skinparam packageStyle rectangle
skinparam actorStyle awesome

actor "Doctor" as Doc
actor "Pharmacist" as Pharm
actor "Optical Staff" as Opt
actor "Admin" as Admin
actor "Patient" as Pat

rectangle "Phase 2: Clinical & Pharmacy" {

  rectangle "Prescriptions" {
    usecase "Create Prescription" as UC01
    usecase "Add Medicine Items" as UC02
    usecase "Check Drug Interactions" as UC03
    usecase "Use Prescription Template" as UC04
    usecase "Save as Template" as UC05
    usecase "Finalize Prescription" as UC06
    usecase "View Prescription PDF" as UC07
    usecase "View Prescription History" as UC08
    usecase "Duplicate for Follow-up" as UC09
    usecase "Add Lab Order" as UC10
  }

  rectangle "Pharmacy" {
    usecase "View Pending Prescriptions" as UC11
    usecase "Dispense Medicine" as UC12
    usecase "Select Batch (FEFO)" as UC13
    usecase "Counter Sale (OTC)" as UC14
    usecase "Search Medicine" as UC15
    usecase "Add Medicine to Catalog" as UC16
    usecase "Scan Barcode" as UC17
    usecase "Process Return" as UC18
    usecase "Approve Return" as UC19
    usecase "View Low Stock Alerts" as UC20
    usecase "View Expiring Items" as UC21
    usecase "Update Stock" as UC_STOCK
  }

  rectangle "Optical Store" {
    usecase "Create Optical Rx" as UC22
    usecase "Manage Products" as UC23
    usecase "Place Optical Order" as UC24
    usecase "Update Order Status" as UC25
    usecase "Generate Job Ticket" as UC26
    usecase "Create Repair Entry" as UC27
    usecase "Update Repair Status" as UC28
  }
}

' --- Prescription ---
Doc --> UC01
UC01 ..> UC02 : <<includes>>
UC01 ..> UC03 : <<extends>>
UC01 ..> UC04 : <<extends>>
Doc --> UC05
Doc --> UC06
Doc --> UC07
Doc --> UC08
Doc --> UC09
Doc --> UC10

' --- Pharmacy ---
Pharm --> UC11
Pharm --> UC12
UC12 ..> UC13 : <<includes>>
UC12 ..> UC_STOCK : <<includes>>
Pharm --> UC14
UC14 ..> UC_STOCK : <<includes>>
Pharm --> UC15
Pharm --> UC16
Pharm --> UC17
UC17 ..> UC15 : <<includes>>
Pharm --> UC18
Admin --> UC19
Pharm --> UC20
Pharm --> UC21

Doc --> UC15

' --- Optical ---
Doc --> UC22
Opt --> UC23
Opt --> UC24
Opt --> UC25
Opt --> UC26
Opt --> UC27
Opt --> UC28

@enduml
```

---

## Use Case Descriptions

### Prescriptions

#### UC01: Create Prescription

| Field | Value |
|-------|-------|
| **Actor** | Doctor |
| **Precondition** | Patient has an active appointment (status: With Doctor) |
| **Main Flow** | 1. Doctor opens prescription form from appointment → 2. Enters diagnosis and clinical notes → 3. Adds medicine items (name, dosage, frequency, duration, route, instructions) → 4. System checks for drug interactions between items → 5. If interaction found, shows warning (Doctor can proceed or change) → 6. Adds advice for patient → 7. Saves prescription as draft |
| **Post-condition** | Prescription created, linked to appointment and patient |

#### UC03: Check Drug Interactions

| Field | Value |
|-------|-------|
| **Actor** | System (triggered automatically) |
| **Main Flow** | 1. When doctor adds 2+ medicines → 2. System checks interaction database → 3. If interaction found, shows alert with severity (low/medium/high) and recommendation → 4. Doctor acknowledges and decides to proceed or substitute |

#### UC04: Use Prescription Template

| Field | Value |
|-------|-------|
| **Actor** | Doctor |
| **Main Flow** | 1. Doctor clicks "Use Template" → 2. Selects from saved templates (e.g., "Common Cold", "UTI") → 3. System pre-fills medicine items, dosage, and advice → 4. Doctor can modify before saving |

#### UC06: Finalize Prescription

| Field | Value |
|-------|-------|
| **Actor** | Doctor |
| **Main Flow** | 1. Doctor reviews prescription → 2. Clicks "Finalize" → 3. Prescription is locked (no further edits) → 4. Becomes visible to Pharmacy for dispensing → 5. Version is saved for history |

### Pharmacy

#### UC11: View Pending Prescriptions

| Field | Value |
|-------|-------|
| **Actor** | Pharmacist |
| **Main Flow** | 1. Pharmacist opens Pharmacy Dashboard → 2. Sees list of finalized prescriptions awaiting dispensing → 3. Each entry shows patient name, doctor, number of items → 4. Clicks to start dispensing |

#### UC12: Dispense Medicine (against Rx)

| Field | Value |
|-------|-------|
| **Actor** | Pharmacist |
| **Precondition** | Prescription is finalized |
| **Main Flow** | 1. Pharmacist opens prescription → 2. For each medicine item: selects batch (FEFO — First Expiry First Out) → 3. System validates: batch not expired, sufficient stock → 4. Enters quantity dispensed → 5. Can substitute if allowed (records original) → 6. Confirms dispensing → 7. System auto-reduces batch stock → 8. Creates dispensing record with billing info → 9. Status updated to "Dispensed" |
| **Exception** | If stock insufficient → shows alert, pharmacist can partially dispense |

#### UC14: Counter Sale (OTC)

| Field | Value |
|-------|-------|
| **Actor** | Pharmacist |
| **Precondition** | No prescription needed (over-the-counter sale) |
| **Main Flow** | 1. Pharmacist clicks "Counter Sale" → 2. Optionally links to patient or enters customer name/phone → 3. Searches and adds medicines → 4. Selects batch, enters quantity → 5. System calculates total → 6. Confirms sale → 7. Stock reduced, record created |

#### UC18: Process Pharmacy Return

| Field | Value |
|-------|-------|
| **Actor** | Pharmacist |
| **Main Flow** | 1. Pharmacist clicks "Return" → 2. Finds original dispensing record → 3. Selects items to return + quantity → 4. Enters return reason → 5. Submits for approval → 6. Admin approves → 7. Stock restored, credit note generated |

### Optical Store

#### UC22: Create Optical Rx

| Field | Value |
|-------|-------|
| **Actor** | Doctor (Ophthalmologist) |
| **Main Flow** | 1. Doctor opens optical Rx form → 2. Selects patient → 3. Enters measurements: Right eye (SPH, CYL, AXIS, ADD) + Left eye → 4. Enters PD (pupillary distance) → 5. Adds notes/recommendations → 6. Saves Rx |
| **Validation** | SPH: -25 to +25 (step 0.25), CYL: -10 to +10, AXIS: 0-180, ADD: 0-4, PD: 50-80mm |

#### UC24: Place Optical Order

| Field | Value |
|-------|-------|
| **Actor** | Optical Staff |
| **Main Flow** | 1. Optical Staff opens patient's optical Rx → 2. Selects frame + lens products from catalog → 3. Enters customization details (lens type, coating, tint) → 4. System calculates total → 5. Creates order with status "Ordered" → 6. Can generate job ticket PDF for lab |

#### UC27: Create Repair Entry

| Field | Value |
|-------|-------|
| **Actor** | Optical Staff |
| **Main Flow** | 1. Customer brings item for repair → 2. Staff creates repair entry: item description, issue, estimated cost → 3. Status set to "Received" → 4. Updates status as repair progresses (In Progress → Ready → Delivered) |

---

## Flow: Prescription → Pharmacy Dispensing

```
Doctor                System              Pharmacist           Stock
  │                      │                    │                  │
  │── Create Rx ────────▶│                    │                  │
  │── Add medicines ────▶│                    │                  │
  │                      │── Check drug       │                  │
  │                      │   interactions ────│                  │
  │◀── Warning (if any) ─│                    │                  │
  │── Finalize Rx ──────▶│                    │                  │
  │                      │── Notify pharmacy ▶│                  │
  │                      │                    │                  │
  │                      │                    │── View pending ──│
  │                      │                    │── Open Rx ───────│
  │                      │                    │                  │
  │                      │                    │── Select batch ─▶│
  │                      │                    │   (FEFO order)   │
  │                      │                    │◀── Batch info ──│
  │                      │                    │                  │
  │                      │                    │── Dispense ─────▶│
  │                      │                    │                  │── Reduce stock
  │                      │                    │                  │
  │                      │── Create billing ──│                  │
  │                      │   record           │                  │
```

---

## Flow: Optical Rx → Order → Job Ticket

```
Doctor              System              Optical Staff
  │                    │                    │
  │── Create          │                    │
  │   Optical Rx ────▶│                    │
  │   (SPH, CYL,      │                    │
  │    AXIS, PD)       │                    │
  │                    │                    │
  │                    │                    │── View Rx ────────▶
  │                    │                    │── Select frame ───▶
  │                    │                    │── Select lens ────▶
  │                    │                    │── Place order ────▶
  │                    │── Generate         │
  │                    │   job ticket PDF ──│
  │                    │                    │
  │                    │                    │── Update status:
  │                    │                    │   Ordered → In Lab
  │                    │                    │   → Ready → Delivered
```

---

## Flow: Counter Sale (OTC without Rx)

```
Walk-in Customer      Pharmacist            System             Stock
  │                      │                    │                  │
  │── Requests medicine ▶│                    │                  │
  │                      │── Search medicine ▶│                  │
  │                      │   (or scan barcode)│                  │
  │                      │◀── Results ────────│                  │
  │                      │                    │                  │
  │                      │── Select batch ───▶│                  │
  │                      │── Enter quantity ──▶│                  │
  │                      │                    │── Validate stock ▶│
  │                      │                    │◀── OK ───────────│
  │                      │                    │                  │
  │                      │── Confirm sale ───▶│                  │
  │                      │                    │── Reduce stock ──▶│
  │                      │                    │── Create record ──│
  │◀── Receipt ──────────│                    │                  │
```
