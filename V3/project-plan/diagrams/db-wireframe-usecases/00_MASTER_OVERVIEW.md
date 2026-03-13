# HMS — Master Use Case Overview (DB Wireframe)

> Complete use case map derived from all 62 database tables across 5 phases.

---

## End-to-End Patient Journey (Use Case Flow)

```
Patient Arrives
      │
      ▼
┌──────────────────────────────────────────────┐
│  PHASE 0: Foundation                         │
│  UC: Login → Manage Hospital → Setup Dept    │
│  UC: Create Users → Assign Roles             │
│  Tables: hospitals, departments, users,      │
│          roles, permissions, hospital_settings│
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│  PHASE 1: Core                               │
│  UC: Register Patient → Generate ID Card     │
│  UC: Setup Doctor Schedule → Book Appt       │
│  UC: Check-In → Enter Queue → Consult        │
│  Tables: patients, doctors, appointments,    │
│          appointment_queue, id_cards          │
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│  PHASE 2: Clinical                           │
│  UC: Write Prescription → Dispense Medicines │
│  UC: Order Lab Tests → Get Results           │
│  UC: Write Optical Rx → Place Optical Order  │
│  UC: Counter Sale (OTC) → Return Medicines   │
│  Tables: prescriptions, medicines, pharmacy, │
│          optical_prescriptions, optical_orders│
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│  PHASE 3: Billing & Inventory                │
│  UC: Generate Invoice → Collect Payment      │
│  UC: Process Refund → Issue Credit Note      │
│  UC: File Insurance Claim → Get Approval     │
│  UC: Create PO → Receive Goods → Update Stock│
│  UC: Adjust Stock → Cycle Count              │
│  Tables: invoices, payments, insurance_claims│
│          purchase_orders, stock_movements     │
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│  PHASE 4: Support                            │
│  UC: Send Notification → View Audit Logs     │
│  UC: Generate Reports → Export Data          │
│  Tables: notifications, notification_queue,  │
│          audit_logs                          │
└──────────────────────────────────────────────┘
```

---

## All Use Cases by Phase

### Phase 0 — Foundation (11 tables)

| ID | Use Case | Primary Actor | Tables Involved |
|----|----------|---------------|-----------------|
| UC-0.1 | Configure Hospital | Super Admin | hospitals |
| UC-0.2 | Manage Hospital Settings | Super Admin | hospital_settings |
| UC-0.3 | Manage Departments | Admin | departments |
| UC-0.4 | Configure Tax Rules | Admin | tax_configurations |
| UC-0.5 | Login / Authenticate | Any User | users, refresh_tokens |
| UC-0.6 | Logout / Revoke Session | Any User | refresh_tokens |
| UC-0.7 | Create User Account | Super Admin | users, password_emails |
| UC-0.8 | Manage User Roles | Super Admin | users, user_roles, roles |
| UC-0.9 | Define Roles & Permissions | Super Admin | roles, permissions, role_permissions |
| UC-0.10 | Reset User Password | Super Admin | users, password_emails |
| UC-0.11 | Change Own Password | Any User | users |
| UC-0.12 | View / Edit Profile | Any User | users |

### Phase 1 — Core (12 tables)

| ID | Use Case | Primary Actor | Tables Involved |
|----|----------|---------------|-----------------|
| UC-1.1 | Register New Patient | Receptionist | patients, patient_consents, id_sequences, id_cards |
| UC-1.2 | Upload Patient Documents | Receptionist | patient_documents |
| UC-1.3 | Search / View Patient | Receptionist, Doctor | patients |
| UC-1.4 | Update Patient Info | Receptionist | patients |
| UC-1.5 | Generate Patient ID Card | Receptionist | id_cards, id_sequences, hospital_settings |
| UC-1.6 | Register Doctor Profile | Admin | doctors, users |
| UC-1.7 | Set Doctor Schedule | Doctor, Admin | doctor_schedules |
| UC-1.8 | Apply Doctor Leave | Doctor | doctor_leaves |
| UC-1.9 | Manage Doctor Fees | Admin | doctor_fees |
| UC-1.10 | Book Appointment | Receptionist | appointments, doctor_schedules, doctor_leaves |
| UC-1.11 | Check-In Patient | Receptionist | appointments, appointment_queue, appointment_status_log |
| UC-1.12 | Manage Queue | Nurse, Doctor | appointment_queue, appointment_status_log |
| UC-1.13 | Start / End Consultation | Doctor | appointments, appointment_status_log |
| UC-1.14 | Cancel / Reschedule Appointment | Receptionist | appointments, appointment_status_log |
| UC-1.15 | Transfer to Next Doctor | Doctor | appointments (current_doctor_sequence) |
| UC-1.16 | Book Follow-up | Doctor, Receptionist | appointments (parent_appointment_id) |
| UC-1.17 | Generate Staff ID Card | Admin | id_cards, id_sequences, users |

### Phase 2 — Clinical (16 tables)

| ID | Use Case | Primary Actor | Tables Involved |
|----|----------|---------------|-----------------|
| UC-2.1 | Write Prescription | Doctor | prescriptions, prescription_items |
| UC-2.2 | Use Prescription Template | Doctor | prescription_templates, prescriptions |
| UC-2.3 | Edit / Version Prescription | Doctor | prescriptions, prescription_versions |
| UC-2.4 | Finalize Prescription | Doctor | prescriptions |
| UC-2.5 | Order Lab Tests | Doctor | lab_orders |
| UC-2.6 | Manage Medicine Catalog | Pharmacist | medicines |
| UC-2.7 | Dispense Prescription | Pharmacist | pharmacy_dispensing, pharmacy_dispensing_items, medicine_batches |
| UC-2.8 | Counter Sale (OTC) | Pharmacist | pharmacy_dispensing, pharmacy_dispensing_items |
| UC-2.9 | Process Pharmacy Return | Pharmacist | pharmacy_returns, pharmacy_return_items, medicine_batches |
| UC-2.10 | Write Optical Prescription | Doctor | optical_prescriptions |
| UC-2.11 | Place Optical Order | Optical Staff | optical_orders, optical_order_items, optical_products |
| UC-2.12 | Track Optical Order Status | Optical Staff | optical_orders |
| UC-2.13 | Register Optical Repair | Optical Staff | optical_repairs |
| UC-2.14 | Manage Optical Products | Optical Staff | optical_products |

### Phase 3 — Billing & Inventory (19 tables)

| ID | Use Case | Primary Actor | Tables Involved |
|----|----------|---------------|-----------------|
| UC-3.1 | Generate Invoice | Cashier | invoices, invoice_items |
| UC-3.2 | Collect Payment | Cashier | payments, invoices |
| UC-3.3 | Process Refund | Cashier, Admin | refunds, payments, invoices |
| UC-3.4 | Issue Credit Note | Admin | credit_notes, invoices |
| UC-3.5 | Close Daily Settlement | Cashier | daily_settlements |
| UC-3.6 | Verify Daily Settlement | Admin | daily_settlements |
| UC-3.7 | Register Insurance Provider | Admin | insurance_providers |
| UC-3.8 | Add Patient Insurance Policy | Receptionist | insurance_policies |
| UC-3.9 | File Insurance Claim | Cashier | insurance_claims, invoices, insurance_policies |
| UC-3.10 | Request Pre-Authorization | Receptionist | pre_authorizations, insurance_policies |
| UC-3.11 | Manage Suppliers | Inventory Mgr | suppliers |
| UC-3.12 | Create Purchase Order | Inventory Mgr | purchase_orders, purchase_order_items |
| UC-3.13 | Receive Goods (GRN) | Inventory Mgr | goods_receipt_notes, grn_items, medicine_batches |
| UC-3.14 | Track Stock Movements | System | stock_movements |
| UC-3.15 | Adjust Stock | Inventory Mgr | stock_adjustments |
| UC-3.16 | Conduct Cycle Count | Inventory Mgr | cycle_counts, cycle_count_items |

### Phase 4 — Support (4 tables)

| ID | Use Case | Primary Actor | Tables Involved |
|----|----------|---------------|-----------------|
| UC-4.1 | Send In-App Notification | System | notifications |
| UC-4.2 | Manage Notification Templates | Admin | notification_templates |
| UC-4.3 | Queue External Notification | System | notification_queue |
| UC-4.4 | Log Audit Entry | System | audit_logs |
| UC-4.5 | View Audit Logs | Super Admin | audit_logs |
| UC-4.6 | Generate Revenue Reports | Admin | invoices, payments, refunds |
| UC-4.7 | Generate Operational Reports | Admin | appointments, patients, pharmacy_dispensing |

---

## Table-to-Use-Case Mapping

| Table | Use Cases |
|-------|-----------|
| hospitals | UC-0.1 |
| hospital_settings | UC-0.2, UC-1.5, UC-1.17 |
| departments | UC-0.3 |
| tax_configurations | UC-0.4, UC-3.1 |
| users | UC-0.5–UC-0.12, UC-1.6, UC-1.17 |
| roles | UC-0.8, UC-0.9 |
| permissions | UC-0.9 |
| user_roles | UC-0.8 |
| role_permissions | UC-0.9 |
| refresh_tokens | UC-0.5, UC-0.6 |
| password_emails | UC-0.7, UC-0.10 |
| patients | UC-1.1–UC-1.5 |
| patient_consents | UC-1.1 |
| patient_documents | UC-1.2 |
| doctors | UC-1.6–UC-1.9 |
| doctor_schedules | UC-1.7, UC-1.10 |
| doctor_leaves | UC-1.8, UC-1.10 |
| doctor_fees | UC-1.9 |
| appointments | UC-1.10–UC-1.16 |
| appointment_status_log | UC-1.11–UC-1.15 |
| appointment_queue | UC-1.11, UC-1.12 |
| id_sequences | UC-1.1, UC-1.5, UC-1.17 |
| id_cards | UC-1.5, UC-1.17 |
| prescriptions | UC-2.1–UC-2.4, UC-2.7 |
| prescription_items | UC-2.1, UC-2.7 |
| prescription_templates | UC-2.2 |
| prescription_versions | UC-2.3 |
| lab_orders | UC-2.5 |
| medicines | UC-2.6, UC-2.7, UC-2.8 |
| medicine_batches | UC-2.7, UC-2.9, UC-3.13 |
| pharmacy_dispensing | UC-2.7, UC-2.8 |
| pharmacy_dispensing_items | UC-2.7, UC-2.8 |
| pharmacy_returns | UC-2.9 |
| pharmacy_return_items | UC-2.9 |
| optical_prescriptions | UC-2.10 |
| optical_orders | UC-2.11, UC-2.12 |
| optical_order_items | UC-2.11 |
| optical_products | UC-2.11, UC-2.14 |
| optical_repairs | UC-2.13 |
| invoices | UC-3.1, UC-3.2, UC-3.3, UC-3.9 |
| invoice_items | UC-3.1 |
| payments | UC-3.2, UC-3.3 |
| refunds | UC-3.3 |
| credit_notes | UC-3.4 |
| daily_settlements | UC-3.5, UC-3.6 |
| insurance_providers | UC-3.7 |
| insurance_policies | UC-3.8, UC-3.9, UC-3.10 |
| insurance_claims | UC-3.9 |
| pre_authorizations | UC-3.10 |
| suppliers | UC-3.11 |
| purchase_orders | UC-3.12, UC-3.13 |
| purchase_order_items | UC-3.12 |
| goods_receipt_notes | UC-3.13 |
| grn_items | UC-3.13 |
| stock_movements | UC-3.14 |
| stock_adjustments | UC-3.15 |
| cycle_counts | UC-3.16 |
| cycle_count_items | UC-3.16 |
| notifications | UC-4.1 |
| notification_templates | UC-4.2 |
| notification_queue | UC-4.3 |
| audit_logs | UC-4.4, UC-4.5 |
