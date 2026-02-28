# HMS — Master Use Case Overview

> A simple, complete overview of every use case across all phases.

---

## Actors

```
┌─────────────────────────────────────────────────────────────┐
│                        HMS ACTORS                           │
├─────────────┬───────────────────────────────────────────────┤
│ Super Admin │ Full system access, user & role management    │
│ Admin       │ Hospital config, departments, approvals       │
│ Receptionist│ Patient registration, appointments, check-in  │
│ Doctor      │ Consultations, prescriptions, referrals       │
│ Nurse       │ Vitals, clinical support                      │
│ Pharmacist  │ Dispensing, medicine catalog, counter sales    │
│ Cashier     │ Billing, payments, refunds, settlements       │
│ Optical Staff│ Optical Rx, orders, repairs                  │
│ Inventory Mgr│ PO, GRN, stock, suppliers                   │
│ Patient     │ External actor — receives services            │
└─────────────┴───────────────────────────────────────────────┘
```

---

## Phase 0 — Foundation (Auth & User Management)

| # | Use Case | Primary Actor |
|---|----------|---------------|
| 0.1 | Login to System | All Users |
| 0.2 | Logout | All Users |
| 0.3 | Refresh Session Token | System (auto) |
| 0.4 | Forgot Password | All Users |
| 0.5 | Change Own Password | All Users |
| 0.6 | View/Edit Own Profile | All Users |
| 0.7 | Create User Account | Super Admin |
| 0.8 | Edit User Account | Super Admin |
| 0.9 | Deactivate/Delete User | Super Admin |
| 0.10 | Reset User Password | Super Admin |
| 0.11 | Send Password via Email | Super Admin |
| 0.12 | Manage Roles & Permissions | Super Admin |
| 0.13 | View Audit Logs | Admin |

---

## Phase 1 — Core (Patients, Doctors, Appointments)

| # | Use Case | Primary Actor |
|---|----------|---------------|
| **Patients** | | |
| 1.1 | Register New Patient | Receptionist |
| 1.2 | Search/Find Patient | Receptionist, Doctor |
| 1.3 | View Patient Profile | Receptionist, Doctor |
| 1.4 | Edit Patient Information | Receptionist |
| 1.5 | Upload Patient Photo | Receptionist |
| 1.6 | Check Duplicate Patient | Receptionist |
| 1.7 | Generate Patient ID Card | Receptionist |
| 1.8 | Download/Print ID Card | Receptionist |
| 1.9 | Email ID Card to Patient | Receptionist |
| 1.10 | Record Patient Consent | Receptionist |
| **Doctors** | | |
| 1.11 | Create Doctor Profile | Admin |
| 1.12 | View Doctor List/Detail | All Staff |
| 1.13 | Edit Doctor Profile | Admin |
| 1.14 | Set Weekly Schedule | Admin, Doctor |
| 1.15 | Manage Doctor Leaves | Admin |
| 1.16 | Set Doctor Fees | Admin |
| 1.17 | Toggle Doctor Availability | Admin |
| **Appointments** | | |
| 1.18 | Book Scheduled Appointment | Receptionist |
| 1.19 | Register Walk-in | Receptionist |
| 1.20 | Register Emergency Visit | Receptionist |
| 1.21 | View Available Slots | Receptionist |
| 1.22 | Check-in Patient | Receptionist |
| 1.23 | View/Manage Queue | Receptionist, Doctor |
| 1.24 | Call Next Patient | Doctor |
| 1.25 | Complete Consultation | Doctor |
| 1.26 | Cancel Appointment | Receptionist |
| 1.27 | Reschedule Appointment | Receptionist |
| 1.28 | Transfer to Another Doctor | Doctor |
| 1.29 | View Today's Summary | Receptionist, Doctor |
| **Dashboard** | | |
| 1.30 | View Dashboard Stats | All Staff |

---

## Phase 2 — Clinical (Prescriptions, Pharmacy, Optical)

| # | Use Case | Primary Actor |
|---|----------|---------------|
| **Prescriptions** | | |
| 2.1 | Create Prescription | Doctor |
| 2.2 | Add Medicine Items to Prescription | Doctor |
| 2.3 | Check Drug Interactions | Doctor (System assists) |
| 2.4 | Use Prescription Template | Doctor |
| 2.5 | Save Prescription Template | Doctor |
| 2.6 | Finalize Prescription | Doctor |
| 2.7 | View/Print Prescription PDF | Doctor, Pharmacist |
| 2.8 | View Prescription History | Doctor |
| 2.9 | Duplicate Prescription for Follow-up | Doctor |
| **Pharmacy** | | |
| 2.10 | View Pending Prescriptions | Pharmacist |
| 2.11 | Dispense Medicine (against Rx) | Pharmacist |
| 2.12 | Counter Sale (OTC, no Rx) | Pharmacist |
| 2.13 | Search Medicine Catalog | Pharmacist, Doctor |
| 2.14 | Add Medicine to Catalog | Pharmacist |
| 2.15 | Scan Barcode to Find Medicine | Pharmacist |
| 2.16 | Process Pharmacy Return | Pharmacist |
| 2.17 | View Low Stock Alerts | Pharmacist |
| 2.18 | View Expiring Items | Pharmacist |
| **Optical Store** | | |
| 2.19 | Create Optical Prescription (Rx) | Doctor |
| 2.20 | Manage Optical Products | Optical Staff |
| 2.21 | Place Optical Order | Optical Staff |
| 2.22 | Track Order Status | Optical Staff |
| 2.23 | Generate Job Ticket (PDF) | Optical Staff |
| 2.24 | Create Repair Entry | Optical Staff |
| 2.25 | Track Repair Status | Optical Staff |

---

## Phase 3 — Billing & Inventory

| # | Use Case | Primary Actor |
|---|----------|---------------|
| **Billing** | | |
| 3.1 | Create Invoice | Cashier |
| 3.2 | Add Line Items to Invoice | Cashier |
| 3.3 | Apply Discount | Cashier |
| 3.4 | Calculate Tax | System (auto) |
| 3.5 | Issue (Finalize) Invoice | Cashier |
| 3.6 | Record Payment | Cashier |
| 3.7 | Record Partial Payment | Cashier |
| 3.8 | Generate Invoice PDF | Cashier |
| 3.9 | Generate Payment Receipt | Cashier |
| 3.10 | Request Refund | Cashier |
| 3.11 | Approve Refund | Admin |
| 3.12 | Process Refund | Cashier |
| 3.13 | Create Credit Note | Cashier |
| 3.14 | View Outstanding Dues | Cashier |
| 3.15 | Create Daily Settlement | Cashier |
| 3.16 | Verify Daily Settlement | Admin |
| **Insurance** | | |
| 3.17 | Add Insurance Provider | Admin |
| 3.18 | Create Patient Insurance Policy | Receptionist |
| 3.19 | Submit Insurance Claim | Cashier |
| 3.20 | Track Claim Status | Cashier |
| 3.21 | Request Pre-Authorization | Cashier |
| **Inventory** | | |
| 3.22 | Add Inventory Item | Inventory Manager |
| 3.23 | Add Supplier | Inventory Manager |
| 3.24 | Create Purchase Order | Inventory Manager |
| 3.25 | Approve Purchase Order | Admin |
| 3.26 | Receive Goods (GRN) | Inventory Manager |
| 3.27 | Verify GRN | Inventory Manager |
| 3.28 | Adjust Stock | Inventory Manager |
| 3.29 | Transfer Stock | Inventory Manager |
| 3.30 | View Reorder Alerts | Inventory Manager |
| 3.31 | View Expiry Alerts | Inventory Manager, Pharmacist |
| 3.32 | Conduct Cycle Count | Inventory Manager |

---

## Phase 4 — Reports & Admin

| # | Use Case | Primary Actor |
|---|----------|---------------|
| **Reports** | | |
| 4.1 | View Revenue Report (Daily/Monthly/Yearly) | Admin |
| 4.2 | View Revenue by Department | Admin |
| 4.3 | View OPD Summary Report | Admin |
| 4.4 | View Doctor-wise Report | Admin |
| 4.5 | View Pharmacy Sales Report | Admin, Pharmacist |
| 4.6 | View Optical Sales Report | Admin |
| 4.7 | View Inventory Reports | Admin, Inventory Manager |
| 4.8 | View Financial Reports (Outstanding, Collection) | Admin, Cashier |
| 4.9 | View Tax Summary Report | Admin |
| 4.10 | Export Report (CSV/XLSX/PDF) | Admin |
| 4.11 | Schedule Recurring Report | Admin |
| **Administration** | | |
| 4.12 | Configure Hospital Settings | Admin |
| 4.13 | Upload Hospital Logo | Admin |
| 4.14 | Manage Departments | Admin |
| 4.15 | Configure Tax Rules | Admin |
| 4.16 | View Audit Logs | Admin |
| 4.17 | Export Audit Logs | Admin |
| 4.18 | Generate Staff ID Card | Admin |
| 4.19 | Trigger Manual Backup | Admin |
| 4.20 | View Active Sessions | Admin |
| 4.21 | Force Logout User | Admin |
| 4.22 | Check System Health | Admin |

---

## End-to-End Patient Journey

This flow shows how a patient moves through the entire system:

```
Patient Arrives
      │
      ▼
┌─────────────┐    ┌──────────────┐    ┌───────────────┐
│ Registration │───▶│  ID Card     │───▶│  Appointment  │
│ (Receptionist)│   │  Generated   │    │  Booked       │
└─────────────┘    └──────────────┘    └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │  Check-in     │
                                       │  (Queue Added) │
                                       └───────┬───────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │  Doctor       │
                                       │  Consultation │
                                       └───────┬───────┘
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                      │ Prescription │ │  Referral to │ │   Optical    │
                      │ Written      │ │  Doctor 2    │ │   Rx Written │
                      └──────┬───────┘ └──────────────┘ └──────┬───────┘
                             │                                  │
                             ▼                                  ▼
                      ┌──────────────┐                  ┌──────────────┐
                      │  Pharmacy    │                  │ Optical Order│
                      │  Dispensing  │                  │  Placed      │
                      └──────┬───────┘                  └──────┬───────┘
                             │                                  │
                             └────────────────┬─────────────────┘
                                              ▼
                                      ┌──────────────┐
                                      │   Billing    │
                                      │   Invoice    │
                                      └──────┬───────┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │   Payment    │
                                      │   Receipt    │
                                      └──────────────┘
```

---

## Use Case Relationships

| Relationship | Example |
|-------------|---------|
| **includes** | "Book Appointment" includes "View Available Slots" |
| **includes** | "Dispense Medicine" includes "Check Stock & Expiry" |
| **includes** | "Create Invoice" includes "Calculate Tax" |
| **extends** | "Register Patient" may extend to "Check Duplicate" |
| **extends** | "Book Appointment" may extend to "Register Walk-in" |
| **extends** | "Create Prescription" may extend to "Check Drug Interactions" |
