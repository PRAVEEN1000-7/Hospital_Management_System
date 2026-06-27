# Business Requirements Document
## Hospital Management System — Queue Display | Prescription | Pharmacy | Opthal Billing
**Version:** 1.1 | **Date:** June 2025 | **Status:** Draft for Review
**Prepared By:** Meena Srinivasan | **Client:** Balaji Eye Foundation / Balaji Health Foundation

---

## Legend

| Badge | Meaning |
|-------|---------|
| `[NEW MODULE]` | Entirely new feature being added to the system |
| `[CHANGE]` | Enhancement or modification to an existing module |
| `[PLUG & PLAY]` | Optional column/feature — enabled/disabled via Customization Settings |

---

## Table of Contents

1. [Document Overview](#1-document-overview)
2. [Register Patient — Patient History Block [CHANGE]](#2-register-patient--patient-history-block-change)
3. [Queue Display Module [NEW MODULE]](#3-queue-display-module-new-module)
4. [Prescription Module — Changes [CHANGE]](#4-prescription-module--changes-change)
5. [Pharmacy Module [NEW MODULE]](#5-pharmacy-module-new-module)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Opthal Billing [NEW MODULE]](#7-opthal-billing-new-module)
8. [Assumptions & Dependencies](#8-assumptions--dependencies)
9. [Open Items & Decisions Required](#9-open-items--decisions-required)
10. [Revision History](#10-revision-history)

---

## 1. Document Overview

### 1.1 Purpose

This BRD captures the functional requirements for three additional modules of the Hospital Management System:
- **Queue Display** — new module
- **Prescription** — enhancement
- **Pharmacy** — new module

It also documents enhancements to the **Register Patient** module. This document is the authoritative reference for development, testing, and stakeholder review.

### 1.2 Scope

| Module | Type | Summary |
|--------|------|---------|
| Register Patient | `[CHANGE]` | Add Patient History block (Reason for Visit, Symptoms, Blood Sugar) with data flow to Prescription |
| Queue Display | `[NEW MODULE]` | New module placed below Walk-in Queue, above Doctor Schedule |
| Prescription | `[CHANGE]` | Header changes, print selection, Opthal toggle, patient history auto-fill |
| Pharmacy | `[NEW MODULE]` | Two submodules: Pharmacy Queue and Pharmacy Billing |

---

## 2. Register Patient — Patient History Block `[CHANGE]`

### 2.1 Overview

The Register Patient module currently collects basic demographic and contact details. This enhancement adds a **"Patient History"** section to capture clinical context at registration. Data entered here automatically pre-populates the Prescription form when the patient is seen by a doctor.

### 2.2 Navigation Placement

- **Module:** Register Patient
- **Block Position:** Add "Patient History" block **after** existing patient demographic fields

### 2.3 Patient History Block — Fields

| # | Field Name | Type | Description / Notes |
|---|-----------|------|---------------------|
| 1 | **Reason for Visit** | Text (free-text) | **Mandatory.** Free-text entry for the primary reason the patient has come to the hospital. |
| 2 | **Symptoms** | Multi-select Dropdown + Free-text | Both editable and dropdown. Pre-defined symptom list (see §2.4). Patient can select multiple and/or type custom symptoms. |
| 3 | **Blood Sugar** | Numeric + Unit Dropdown | **Optional.** Enter blood sugar reading. Unit options: `mg/dL`, `mmol/L`. |

### 2.4 Symptom Dropdown Values

The following values shall be available in the Symptoms multi-select dropdown. Users may also type custom values.

| Symptom Options | Symptom Options |
|----------------|----------------|
| Itching | Eye Injury |
| Irritation | Eye Pressure |
| Distance Vision (Both Eyes) | Watering |
| Near Vision (Both Eyes) | Glaucoma |
| Redness | Diabetic Retinopathy |
| Swelling | *(Custom — user-typed entry)* |
| Delgium | |
| Cataract | |

### 2.5 Data Flow to Prescription

All Patient History fields captured at registration shall automatically populate the corresponding sections in the Prescription module when the patient record is opened by a doctor.

| Source (Register Patient) | → | Destination (Prescription) | Editable? |
|--------------------------|---|---------------------------|-----------|
| Patient Name | → | Patient Name (Header) | Yes |
| Age | → | Age (Header) | Yes |
| Contact Number | → | Contact Number (Header) | Yes |
| Place | → | Place (Header) | Yes |
| Blood Sugar | → | Patient History > Blood Sugar | Yes |
| Symptoms (selected) | → | Patient History > Symptoms | Yes |
| Reason for Visit | → | Clinical Notes (pre-filled) | Yes |

### 2.6 Functional Requirements

| Req ID | Requirement | Priority | Notes |
|--------|------------|---------|-------|
| RP-01 | A "Patient History" block shall be added to the Register Patient form below existing demographic fields. | High | UI layout change |
| RP-02 | The block shall contain three fields: Reason for Visit, Symptoms, and Blood Sugar. | High | |
| RP-03 | Symptoms field shall support both dropdown selection (multi-select) and free-text entry. | High | Hybrid input |
| RP-04 | Blood Sugar field shall accept numeric input with a unit selector (mg/dL / mmol/L). | Medium | |
| RP-05 | All Patient History data shall flow automatically to the Prescription module when the patient record is opened. | High | Data binding |
| RP-06 | Doctor shall be able to edit pre-filled Patient History fields within the Prescription form. | Medium | |

---

## 3. Queue Display Module `[NEW MODULE]`

### 3.1 Overview

The Queue Display module provides a **real-time, publicly visible screen** showing the token/queue numbers currently being served across different counters — Doctors, Pharmacy, and Ophthalmology. Designed to be displayed on a large monitor in the waiting area.

### 3.2 Navigation Placement

| Position | Module |
|----------|--------|
| Above | Walk-in Queue |
| **→ INSERT HERE** | **Queue Display** `[NEW]` |
| Below | Doctor Schedule |

### 3.3 Screen Layout

The Queue Display screen shows a multi-column table. Each column represents one counter/department. Token numbers currently queued (or being served) appear in rows below the header.

> Columns marked with `*` are `[PLUG & PLAY]` — optional, enabled/disabled through Customization Settings.

**Sample Display Layout:**

| DOCTOR NAME 1 | DOCTOR NAME 2 * | PHARMACY * | OPTHAL * |
|:---:|:---:|:---:|:---:|
| 17 | 10 | 6 | 3 |
| 18 | 11 | 7 | 4 |
| 19 | 12 | 8 | 5 |
| 20 | 13 | 9 | |
| 21 | 14 | | |
| 22 | 15 | | |
| 23 | 16 | | |
| 24 | | | |
| 25 | | | |

### 3.4 Column Configuration — Plug & Play

| Column | Type | Notes |
|--------|------|-------|
| Doctor Name 1 | **Fixed** | Always displayed. Column header shows the assigned doctor's name. |
| Doctor Name 2 | `[PLUG & PLAY]` | Optional second doctor queue. Enable in Customization Settings. |
| Pharmacy | `[PLUG & PLAY]` | Shows pharmacy waiting numbers. Links to Pharmacy Queue module. |
| Opthal | `[PLUG & PLAY]` | Shows ophthalmology waiting numbers. Enable if opthal dept. is active. |

### 3.5 Functional Requirements

| Req ID | Requirement | Priority | Notes |
|--------|------------|---------|-------|
| QD-01 | A new Queue Display module shall be added to the navigation menu, positioned below Walk-in Queue and above Doctor Schedule. | High | |
| QD-02 | The display shall show a multi-column table with token/queue numbers per counter in real time. | High | Auto-refresh |
| QD-03 | Doctor Name 1 column shall always be present and cannot be removed. | High | |
| QD-04 | Doctor Name 2, Pharmacy, and Opthal columns shall be plug-and-play — toggled via Customization Settings. | High | Config screen |
| QD-05 | Column headers shall display the configured department/doctor name, not hard-coded labels. | Medium | |
| QD-06 | The display shall auto-refresh at a configurable interval (default: **10 seconds**). | Medium | Refresh rate |
| QD-07 | Queue numbers shall be sorted in ascending order within each column. | Medium | |
| QD-08 | The screen shall be optimized for large display monitors (full-screen/kiosk mode). | Low | TV display |

---

## 4. Prescription Module — Changes `[CHANGE]`

### 4.1 Overview

The Prescription module is an existing feature. This section captures the enhancements required:
- Updated header with institution push-buttons
- Patient history auto-fill from registration
- Opthal toggle that conditionally shows an eye diagram
- Smart print — prints only the sections the doctor has filled in

### 4.2 Header — Changes

| # | Element | Details |
|---|---------|---------|
| 1 | **Hospital Name & Address** | Centered at top. Pulled from system settings. |
| 2 | **Hospital Logo** | Left-aligned. Image uploaded in system settings. |
| 3 | **Doctor Name & Qualification** | Left side below logo. |
| 4 | **Date** | Right-aligned, same row as Doctor Name. |
| 5 | **Institution Selector (Push Buttons)** | Two highlighted buttons: `BALAJI EYE FOUNDATION` and `BALAJI HEALTH FOUNDATION` (customizable per client). Selecting one changes the header context/letterhead. |

### 4.3 Patient Information Section

Auto-populated from patient registration; editable by doctor.

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | Name | Text (auto-filled) | From patient registration |
| 2 | Age | Number (auto-filled) | From patient registration |
| 3 | Contact Number | Phone (auto-filled) | From patient registration |
| 4 | Place | Text (auto-filled) | From patient registration |

### 4.4 Patient History Section (Auto-Populated)

Pre-filled from registration data. Doctor may edit any field.

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | Blood Sugar | Numeric (auto-filled) | Pre-filled from Patient History in registration. Editable. |
| 2 | Symptoms | Multi-select + Free-text (auto-filled) | Pre-filled from registration. Editable. Same dropdown list as registration. |

### 4.5 Opthal Toggle

A push button labelled **"OPTHAL"** shall be available on the prescription form. It is an optional add-on — if needed, doctor adds it; otherwise it does not appear.

| State | Behaviour |
|-------|-----------|
| **Add Opthal** | Section label changes to "Opthal Notes". An eye diagram image is inserted in the top-right corner of the section. Opthal-specific symptom dropdown is active: Itching, Irritation, Distance Vision, Near Vision, Redness, Swelling, Delgium, Cataract, Eye Injury, Eye Pressure, Watering, Glaucoma, Diabetic Retinopathy. |

### 4.6 Prescription Sections (Full Form — In Order)

| # | Section | Content |
|---|---------|---------|
| 1 | **Header** | Hospital name, logo, doctor name, qualification, date, institution push-buttons |
| 2 | **Patient Information** | Name, Age, Contact Number, Place |
| 3 | **Patient History** | Blood Sugar, Symptoms (auto-filled from registration) |
| 4 | **Diagnosis & Medicines** | Diagnosis field; Medicine table: Medicine Name, Dosage, Frequency, Duration, Qty, Route |
| 5 | **Clinical Notes** | Conditional: Clinical Notes text area |
| 6 | **Opthal** | Appears only when "Add Opthal" is selected |
| 7 | **Advice** | Free-text: diet, exercise, follow-up instructions |

### 4.7 Print Behaviour (Smart Print)

The print function shall **only print sections that have been filled in** by the doctor. Empty/untouched sections shall be suppressed.

| Section | Print Rule |
|---------|-----------|
| Header | **Always printed** |
| Patient Information | **Always printed** |
| Clinical Notes | Suppressed if empty |
| Opthal | Suppressed if not added / empty |
| Advice | Suppressed if empty |
| Eye Diagram | Printed in top-right of Opthal section if Opthal is active |

### 4.8 Functional Requirements

| Req ID | Requirement | Priority | Notes |
|--------|------------|---------|-------|
| RX-01 | Prescription header shall show: Hospital Name & Address (center), Hospital Logo (left), Doctor Name & Qualification (left), Date (right). | High | Header redesign |
| RX-02 | Two push-buttons `BALAJI EYE FOUNDATION` and `BALAJI HEALTH FOUNDATION` shall appear in the header to switch institution context. | High | Institution toggle |
| RX-03 | Patient Information fields (Name, Age, Contact, Place) shall auto-populate from patient registration. | High | |
| RX-04 | Patient History fields (Blood Sugar, Symptoms) shall auto-populate from patient registration. | High | Data flow |
| RX-05 | An "OPTHAL" push-button shall toggle the Clinical Notes section into Opthal mode. | High | |
| RX-06 | When Opthal is ON, an eye diagram shall appear in the top-right corner of the Opthal section. | High | Conditional UI |
| RX-07 | When Opthal is OFF, the section shall display as standard "Clinical Notes" text area. | High | |
| RX-08 | The print function shall suppress any section that is empty (not filled by doctor). | High | Smart print |
| RX-09 | The Medicines table shall support columns: Medicine Name, Dosage, Frequency, Duration (with unit), Qty, Route. | Medium | |
| RX-10 | Doctor shall be able to add multiple medicine rows. | Medium | |

---

## 5. Pharmacy Module `[NEW MODULE]`

### 5.1 Overview

The Pharmacy module manages the dispensing workflow — tracking patients waiting to collect medicines and processing/printing pharmacy bills.

**Submodules:**
- **Pharmacy Queue** — tracks patients waiting at the pharmacy counter
- **Pharmacy Billing** — processes medicine dispensing and generates billing receipts

### 5.2 Navigation Placement

- **Module:** Pharmacy (new top-level module)
- **Submodules:** Pharmacy Queue | Pharmacy Billing

### 5.3 Shared Header (Both Submodules)

Both Pharmacy submodule screens and all printed documents shall share the same header structure:

| # | Element | Details |
|---|---------|---------|
| 1 | Hospital Name & Address | Centered at top |
| 2 | Hospital Logo | Left-aligned |
| 3 | Doctor Name & Qualification | Left side below logo |
| 4 | Date | Right-aligned on the same row as Doctor Name |
| 5 | Institution Push-Buttons | `BALAJI EYE FOUNDATION` and `BALAJI HEALTH FOUNDATION` (customizable per client — same as Prescription header) |

---

### 5.4 Submodule A: Pharmacy Queue

Displays a list of patients currently waiting to collect their medicines. Patients are added automatically when a doctor submits a prescription with medicines, or manually by pharmacy staff.

#### 5.4.1 Queue Display Fields

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | Token / Queue No. | Auto-generated | Sequential number assigned when patient enters the pharmacy queue |
| 2 | Doctor Name | Text (auto) | Prescribing doctor's name |
| 3 | Status | Dropdown | `Waiting` / `Being Served` / `Collected` |
| 4 | Time In | Timestamp (auto) | Time patient was added to the queue |

#### 5.4.2 Queue Actions

| Action | Description |
|--------|------------|
| **Call Next** | Advance the queue; mark next patient as "Being Served" |
| **Mark Collected** | Mark patient as medicines collected; remove from active queue |
| **View Prescription** | Open read-only prescription linked to the patient |
| **Manual Add** | Add a walk-in pharmacy patient not in the system |

#### 5.4.3 Functional Requirements

| Req ID | Requirement | Priority | Notes |
|--------|------------|---------|-------|
| PQ-01 | The Pharmacy Queue shall display all patients currently waiting for medicines. | High | |
| PQ-02 | Patients shall be automatically added to the queue when a prescription with medicines is submitted. | High | Auto-enqueue |
| PQ-03 | Pharmacy staff shall be able to manually add a patient to the queue. | Medium | |
| PQ-04 | Staff shall be able to update patient status: Waiting / Being Served / Collected. | High | |
| PQ-05 | The queue token number shall be visible on the Queue Display screen (§3). | High | Linked to QD |
| PQ-06 | Staff shall be able to view the linked prescription from within the queue screen. | Medium | |

---

### 5.5 Submodule B: Pharmacy Billing

Enables pharmacy staff to process the sale of medicines and generate a billing receipt.

#### 5.5.1 Input Fields (Patient & Payment — auto-flow from prescription)

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | Name | Text | Patient name. Searched from existing records or entered manually. |
| 2 | Patient Registration Number | Number | Flows from Registration Directory |
| 3 | Age | Number | Patient age |
| 4 | Phone Number | Phone | Patient contact number |
| 5 | Cash / UPI / Bank Transfer | Currency | Amount tendered. System calculates balance/change. |
| 6 | Consultation Fee | Currency | Automatically flows to billing as first line item |
| 7 | Discount (optional) | Currency | Deducted from sub-total if entered |

#### 5.5.2 Output Fields — Bill Line Items

One row per medicine dispensed:

| S.No | Product Name | Quantity | Pack | Batch | Expiry Date | Amount |
|------|-------------|----------|------|-------|-------------|--------|
| 1 | Consultation Fee | - | - | - | - | 100.00 |
| 2 | Eye Drop Sample | 2 | 5ml | B001 | 12/2026 | 150.00 |
| 3 | Antibiotic Tablet | 2 | 10s | B002 | 06/2027 | 100.00 |
| | | | | | **Sub Total** | 350.00 |
| | | | | | **Discount** | 50.00 |
| | | | | | **Total** | 300.00 |
| | | | | | **Cash Received** | 500.00 |
| | | | | | **Balance Returned** | 200.00 |

#### 5.5.3 Bill Summary

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | Sub-Total | Calculated | Sum of all line item amounts |
| 2 | Discount | Numeric | Manual or system-applied discount (% or flat) |
| 3 | Total Amount | Calculated | Sub-total minus discount |
| 4 | Cash Received | Numeric | Amount entered by cashier |
| 5 | Balance / Change | Calculated | Cash Received minus Total Amount |

#### 5.5.4 Print Behaviour

Pharmacy bill printout shall include:
- Full header (Hospital Name, Logo, Doctor, Date, Institution)
- Patient Information: Name, Age, Phone Number
- Itemised medicine table: S.No, Product Name, Quantity, Pack, Batch, Expiry Date, Amount
- Bill summary: Sub-Total, Discount (if any), Total Amount
- Cash Received and Balance/Change

#### 5.5.5 Functional Requirements

| Req ID | Requirement | Priority | Notes |
|--------|------------|---------|-------|
| PB-01 | The Pharmacy Billing screen shall accept inputs: Patient Name, Age, Phone Number, Cash. | High | |
| PB-02 | The billing output table shall display: S.No, Product Name, Pack, Batch, Expiry Date, Amount. | High | Bill table |
| PB-03 | Medicines from a linked prescription shall auto-populate the billing table. | High | Prescription link |
| PB-04 | Pharmacy staff shall be able to add or remove line items manually. | Medium | |
| PB-05 | System shall calculate Sub-Total, Total, and Change automatically. | High | Auto-calc |
| PB-06 | Bill shall be printable and include all items specified in §5.5.4. | High | |
| PB-07 | Expiry dates of medicines shall be visible on the bill for patient awareness. | Medium | |
| PB-08 | Institution push-buttons shall switch the bill header between Balaji Eye Foundation and Balaji Health Foundation. | High | Institution toggle |

---

## 6. Non-Functional Requirements

| Req ID | Requirement | Priority | Notes |
|--------|------------|---------|-------|
| NF-01 | Queue Display shall refresh automatically — configurable interval (default **10 seconds**) — without requiring manual page reload. | High | Performance |
| NF-02 | All data flowing between modules (Registration → Prescription → Pharmacy) shall be consistent and real-time. | High | Data integrity |
| NF-03 | Plug & Play column configuration shall not require code changes — managed entirely through Customization Settings UI. | High | Configurability |
| NF-04 | Print layout shall adapt to content — no blank pages or blank sections shall be printed. | Medium | Print quality |
| NF-05 | Queue Display screen shall render correctly on large monitors (TV/kiosk mode, minimum **1920×1080**). | Medium | Display |
| NF-06 | All modules shall be accessible only to users with appropriate role permissions. | High | Security |

---

## 7. Opthal Billing `[NEW MODULE]`

### 7.1 Overview

The Opthal Billing screen enables pharmacy staff to process the sale of opticals and generate a billing receipt.

### 7.2 Navigation Placement

Part of the Pharmacy module (or standalone — to be confirmed).

### 7.3 Input Fields (Patient & Payment — auto-flow from prescription)

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | Name | Text | Searched from existing records or entered manually |
| 2 | Patient Registration Number | Number | Flows from Registration Directory |
| 3 | Age | Number | Patient age |
| 4 | Phone Number | Phone | Patient contact number |
| 5 | Cash / UPI / Bank Transfer | Currency | Amount tendered. System calculates balance/change. |
| 6 | Advance Payment (optional) | Currency | Deducted from sub-total if entered |
| 7 | Discount (optional) | Currency | Deducted from sub-total if entered |

**Push Buttons:** `Add Lens` | `Add Frame`

### 7.4 Output Fields — Bill Line Items

One row per optical item dispensed.

> **Note:** A **Partially Paid / Fully Paid** tracker shall be included, showing: Name, Registration Number, Amount.

| S.No | Optical Name | Quantity | Amount |
|------|-------------|----------|--------|
| 1 | Lens | 2 | 150.00 |
| 2 | Frame | 2 | 100.00 |
| | | **Sub Total** | 350.00 |
| | | **Discount** | 50.00 |
| | | **Advance Amount Paid** | 100.00 |
| | | **Remaining Amount** | 200.00 |

> **Special Note:** Optical prescription details shall be printed separately as **free text**, to be filled by Optical staff.

### 7.5 Bill Summary

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | Sub-Total | Calculated | Sum of all line item amounts |
| 2 | Discount | Numeric | Manual or system-applied discount (% or flat) |
| 3 | Total Amount | Calculated | Sub-total minus discount |
| 4 | Advance Amount | Numeric | Initial amount paid in advance |
| 5 | Cash Received | Numeric | Amount entered by cashier |
| 6 | Balance / Change | Calculated | Cash Received minus Total Amount |

### 7.6 Print Behaviour

Opthal Bill printout shall include:
- Full header (Hospital Name, Logo, Doctor, Date, Institution)
- Patient Information: Name, Age, Phone Number
- Itemised optical table: S.No, Product Name, Quantity, Amount
- Bill summary: Sub-Total, Discount (if any), Total Amount, Advance Amount
- Cash Received and Balance/Change
- Separate free-text section for optical staff to fill manually

### 7.7 Functional Requirements

| Req ID | Requirement | Priority | Notes |
|--------|------------|---------|-------|
| OB-01 | The Opthal Billing screen shall accept inputs: Patient Name, Registration Number, Age, Phone Number, Cash, Advance Payment, Discount. | High | |
| OB-02 | The billing output table shall display: S.No, Item, Quantity, Amount. | High | Bill table |
| OB-03 | `Add Lens` and `Add Frame` push buttons shall add respective line items to the billing table. | High | |
| OB-04 | Pharmacy staff shall be able to add or remove line items manually. | Medium | |
| OB-05 | System shall calculate Sub-Total, Total, Advance, and Remaining Amount automatically. | High | Auto-calc |
| OB-06 | A Partially Paid / Fully Paid tracker shall show patient Name, Registration Number, and Amount. | High | |
| OB-07 | Bill shall be printable and include all items specified in §7.6. | High | |
| OB-08 | Optical prescription section shall be printed as free text for optical staff to fill. | High | Separate print section |
| OB-09 | Institution push-buttons shall switch the bill header between Balaji Eye Foundation and Balaji Health Foundation. | High | Institution toggle |

---

## 8. Assumptions & Dependencies

- Institution settings (Hospital Name, Logo, Doctor details) are pre-configured in **System Settings** before use.
- Patient registration always precedes prescription; **PRN (Patient Record Number)** links all modules.
- Pharmacy module integrates with the existing **medicine/inventory master** for product name, pack, batch, and expiry data.
- Queue token numbers are generated and managed by the existing **Walk-in Queue** module and fed into Queue Display and Pharmacy Queue.
- The **eye diagram image** for the Opthal section is provided by the client or design team and uploaded as a system asset.
- `BALAJI EYE FOUNDATION` and `BALAJI HEALTH FOUNDATION` are the two institution profiles; each has its own logo and address stored in system settings.

---

## 9. Open Items & Decisions Required

| # | Open Item | Owner | Target Date |
|---|-----------|-------|-------------|
| 1 | Confirm Queue Display auto-refresh interval (default proposed: 10 seconds) | Client | TBD |
| 2 | Provide eye diagram image asset for Opthal section | Client / Design | TBD |
| 3 | Confirm medicine master/inventory integration scope for Pharmacy Billing | Dev + Client | TBD |
| 4 | Confirm whether Pharmacy Queue token = Walk-in Queue token or separate sequence | Client | TBD |
| 5 | Confirm Blood Sugar unit default (mg/dL or mmol/L) | Client | TBD |

---

## 10. Revision History

| Version | Date | Author | Change Summary |
|---------|------|--------|---------------|
| 1.0 | June 2025 | Meena Srinivasan | Initial draft |
| 1.1 | June 2025 | Meena Srinivasan | Added Opthal Billing module |

---

*CONFIDENTIAL | Internal Use Only*
*End of Document — BRD HMS v1.1*
