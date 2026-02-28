# HMS — Use Case Diagrams

This folder contains use case documentation for every development phase of the Hospital Management System.

## Files

| File | Description |
|------|-------------|
| [00_MASTER_USE_CASES.md](00_MASTER_USE_CASES.md) | Complete use case overview across all phases |
| [01_PHASE_0_FOUNDATION.md](01_PHASE_0_FOUNDATION.md) | Phase 0: Authentication & User Management |
| [02_PHASE_1_CORE.md](02_PHASE_1_CORE.md) | Phase 1: Patients, Doctors, Appointments, ID Cards |
| [03_PHASE_2_CLINICAL.md](03_PHASE_2_CLINICAL.md) | Phase 2: Prescriptions, Pharmacy, Optical Store |
| [04_PHASE_3_BILLING.md](04_PHASE_3_BILLING.md) | Phase 3: Billing, Insurance, Inventory |
| [05_PHASE_4_REPORTS_ADMIN.md](05_PHASE_4_REPORTS_ADMIN.md) | Phase 4: Reports, Admin & System Management |

## Diagram Format

All diagrams use **PlantUML** syntax. You can render them using:
- [PlantUML Online Server](https://www.plantuml.com/plantuml/uml)
- VS Code extension: "PlantUML" by jebbs
- IntelliJ built-in PlantUML support
- Copy the `@startuml ... @enduml` block into any PlantUML renderer

## Actors Summary

| Actor | Role | Phases Active |
|-------|------|---------------|
| Super Admin | Full system control, user management | 0, 1, 3, 4 |
| Admin | System administration, department management | 0, 1, 2, 3, 4 |
| Receptionist | Front desk, patient registration, appointments | 1, 3 |
| Doctor | Clinical care, prescriptions, consultations | 1, 2 |
| Nurse | Patient vitals, clinical assistance | 1, 2 |
| Pharmacist | Medicine dispensing, stock management | 2, 3 |
| Cashier | Billing, payments, settlements | 3 |
| Optical Staff | Optical store operations | 2, 3 |
| Inventory Manager | Stock, purchase orders, suppliers | 3 |
| Patient (External) | Receives care, ID cards, notifications | 1, 2, 3 |
