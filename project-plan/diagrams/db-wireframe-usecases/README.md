# HMS — DB Wireframe Use Cases

> Use cases derived from the database schema & wireframe design for each phase.
> Each file includes an **eraser.io use-case diagram** (copy-paste into [eraser.io](https://eraser.io)) and a simple use-case description table.

---

## Files

| # | File | Phase | Tables | Focus |
|---|------|-------|--------|-------|
| 0 | [00_MASTER_OVERVIEW.md](./00_MASTER_OVERVIEW.md) | All | 62 | Complete use case map across all phases |
| 1 | [01_PHASE_0_FOUNDATION.md](./01_PHASE_0_FOUNDATION.md) | 0 | 11 | Hospital config, Auth, RBAC, User Management |
| 2 | [02_PHASE_1_CORE.md](./02_PHASE_1_CORE.md) | 1 | 12 | Patients, Doctors, Appointments, Queue, ID Cards |
| 3 | [03_PHASE_2_CLINICAL.md](./03_PHASE_2_CLINICAL.md) | 2 | 16 | Prescriptions, Pharmacy, Optical Store |
| 4 | [04_PHASE_3_BILLING.md](./04_PHASE_3_BILLING.md) | 3 | 19 | Billing, Payments, Insurance, Inventory |
| 5 | [05_PHASE_4_SUPPORT.md](./05_PHASE_4_SUPPORT.md) | 4 | 4 | Notifications, Audit Logs, Reports |

---

## Actors Summary

| Actor | Description | Active In |
|-------|-------------|-----------|
| **Super Admin** | Full system access, hospital config, user management | Phase 0, 4 |
| **Admin** | Hospital-level admin — departments, settings, reports | Phase 0, 3, 4 |
| **Receptionist** | Patient registration, appointment booking, check-in | Phase 1 |
| **Doctor** | Consultation, prescriptions, optical Rx, schedules | Phase 1, 2 |
| **Nurse** | Queue management, patient assistance | Phase 1 |
| **Pharmacist** | Dispensing, returns, medicine catalog, stock | Phase 2, 3 |
| **Optical Staff** | Optical orders, repairs, product catalog | Phase 2, 3 |
| **Cashier** | Billing, payments, refunds, daily settlement | Phase 3 |
| **Inventory Manager** | Purchase orders, GRN, stock adjustments, cycle counts | Phase 3 |
| **Patient** | Receives care, gets ID card, pays bills | Phase 1, 2, 3 |
| **System** | Automated jobs — expiry checks, notifications, audit | Phase 4 |

---

## How to Use the Eraser.io Diagrams

1. Go to [eraser.io](https://app.eraser.io)
2. Create a new diagram → select **"Diagram as Code"**
3. Copy the code block from any phase file (inside the `eraser` code fence)
4. Paste into the eraser.io editor
5. The use-case diagram will render automatically
