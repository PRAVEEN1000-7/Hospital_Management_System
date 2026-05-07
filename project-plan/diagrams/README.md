# HMS — Database Diagrams (Eraser.io)

> Enterprise-grade entity-relationship diagrams for the Hospital Management System.  
> Paste the contents of any `.eraser` file into [eraser.io](https://app.eraser.io/) → **Entity Relationship** diagram type to render.

---

## Diagram Index

| # | File | Description | Tables |
|---|------|-------------|--------|
| 00 | `00_MASTER_ER_DIAGRAM.eraser` | **Complete ER diagram** — All 40+ tables with full relationships | All |
| 01 | `01_PHASE_0_FOUNDATION.eraser` | **Phase 0: Foundation** (Week 1–2) — Hospital config, Auth, RBAC | 11 tables |
| 02 | `02_PHASE_1_CORE.eraser` | **Phase 1: Core Modules** (Week 3–6) — Patients, Doctors, Appointments, ID Cards | 16 tables |
| 03 | `03_PHASE_2_CLINICAL.eraser` | **Phase 2: Clinical & Pharmacy** (Week 7–9) — Prescriptions, Pharmacy, Optical | 22 tables |
| 04 | `04_PHASE_3_BILLING.eraser` | **Phase 3: Billing & Inventory** (Week 10–12) — Invoices, Insurance, Inventory | 25 tables |
| 05 | `05_PHASE_4_SUPPORT.eraser` | **Phase 4: Reports & Support** (Week 13–14) — Notifications, Audit | 10 tables |
| 06 | `06_ID_CARD_SYSTEM.eraser` | **ID Card System Detail** — HMS 12-digit ID generation, card lifecycle, password emails | 12 tables |

---

## How to Use

1. Open [app.eraser.io](https://app.eraser.io/)
2. Create a new diagram → select **Entity Relationship**
3. Copy the contents of any `.eraser` file
4. Paste into the code editor on the left
5. The ER diagram renders automatically on the right

---

## Table Coverage by Phase

### Phase 0: Foundation (11 tables)
- `hospitals`, `departments`, `hospital_settings`, `tax_configurations`
- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- `refresh_tokens`, `password_emails`

### Phase 1: Core (12 new tables)
- `patients`, `patient_consents`, `patient_documents`
- `doctors`, `doctor_schedules`, `doctor_leaves`, `doctor_fees`
- `appointments`, `appointment_status_log`, `appointment_queue`
- `id_sequences`, `id_cards`

### Phase 2: Clinical & Pharmacy (16 new tables)
- `prescriptions`, `prescription_items`, `prescription_templates`, `prescription_versions`, `lab_orders`
- `medicines`, `medicine_batches`, `pharmacy_dispensing`, `pharmacy_dispensing_items`, `pharmacy_returns`, `pharmacy_return_items`
- `optical_products`, `optical_prescriptions`, `optical_orders`, `optical_order_items`, `optical_repairs`

### Phase 3: Billing & Inventory (15 new tables)
- `invoices`, `invoice_items`, `payments`, `refunds`, `credit_notes`, `daily_settlements`
- `insurance_providers`, `insurance_policies`, `insurance_claims`, `pre_authorizations`
- `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_receipt_notes`, `grn_items`
- `stock_movements`, `stock_adjustments`, `cycle_counts`, `cycle_count_items`

### Phase 4: Support (4 new tables)
- `notifications`, `notification_templates`, `notification_queue`
- `audit_logs`

---

## Relationship Legend

| Symbol | Meaning |
|--------|---------|
| `A.id < B.a_id` | One-to-many: A has many B |
| `A.id - B.a_id` | One-to-one: A has one B |
| `A.id <> B.a_id` | Many-to-many (via join table) |

---

## Color Coding

| Color | Section |
|-------|---------|
| 🔵 Blue | Hospital & Configuration |
| 🟢 Green | Users & RBAC |
| 🔴 Red | Patients |
| 🟣 Purple | Doctors |
| 🟠 Orange | Appointments |
| 🟢 Teal | Prescriptions |
| 🔵 Cyan | Pharmacy / Medicines |
| 🟣 Indigo | Optical Store |
| 🟡 Yellow | Billing & Payments |
| 🩷 Pink | Insurance |
| 🟤 Brown | Inventory |
| ⚪ Gray | Notifications & Audit |
| 💚 Emerald | ID Card System |
