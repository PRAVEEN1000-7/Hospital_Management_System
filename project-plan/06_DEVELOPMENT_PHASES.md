# HMS — Development Phases & Parallel Work Assignment

## Overview

The project is divided into **6 phases over ~16 weeks**. 
Work is organized so **3 teams (or 3+ developers)** can work simultaneously without blocking each other.

### Team Structure
- **Team A (Backend Focus)**: Backend API development
- **Team B (Frontend Focus)**: Frontend UI development  
- **Team C (Full-Stack / Infrastructure)**: Shared services, DevOps, integrations

> All teams use GitHub with feature branches + PRs. Merge to `develop` branch after review. Release from `main`.

---

## Phase 0: Foundation (Week 1–2) — SEQUENTIAL & BLOCKING

> This phase MUST be completed first. Establishes shared contracts and base infrastructure.

### Week 1: Project Setup

| Task | Owner | Dependencies | Deliverable |
|------|-------|-------------|-------------|
| Initialize Git repo, branch strategy, PR template | Team C | None | Repo ready |
| Backend: FastAPI project scaffold (folder structure) | Team A | None | Empty project with main.py |
| Frontend: Vite + React 19 + TypeScript scaffold | Team B | None | Empty project with App.tsx |
| Docker Compose: PostgreSQL + Redis + MinIO | Team C | None | `docker-compose.dev.yml` |
| Database: Alembic setup + initial migration (hospitals, users, roles, permissions tables) | Team A | Docker | Migrations + seed script |
| Backend: Core config (`config.py`, `database.py`, async engine) | Team A | Docker | Settings loading works |
| Backend: Base model (`base.py` with id, timestamps, soft delete) | Team A | Database | Importable BaseModel |
| Backend: Base repository (`base.py` with generic CRUD) | Team A | Base model | Reusable CRUD |
| Backend: APIResponse schema + error response format | Team A | None | `schemas/common.py` |
| Backend: Global exception handlers | Team A | None | `exception_handlers.py` |
| Frontend: Tailwind CSS + shadcn/ui setup | Team B | None | Styles working |
| Frontend: Base UI components (Button, Input, Select, Modal, Toast, Spinner) | Team B | Tailwind | Component library |
| Frontend: Axios instance with interceptors (auth, error, refresh) | Team B | None | `services/api.ts` |
| Frontend: TypeScript types for API responses | Team B | API contract | `types/api.ts` |
| Frontend: Route config + ProtectedRoute + RoleGuard | Team B | None | Routing setup |
| Frontend: i18n setup with `en` base translations | Team B | None | i18n working |
| CI: GitHub Actions pipeline (lint + type check + test) | Team C | All setup | CI green |

### Week 2: Auth System (ALL TEAMS)

| Task | Owner | Dependencies | Deliverable |
|------|-------|-------------|-------------|
| Backend: User model + migration | Team A | Base model | users table |
| Backend: Role, Permission, UserRole, RolePermission models + migration | Team A | User model | RBAC tables |
| Backend: Security utils (JWT create/verify, password hash) | Team A | Config | `security.py` |
| Backend: Auth service (login, refresh, logout, password reset) | Team A | Security utils | `auth_service.py` |
| Backend: Auth API routes (`/auth/*`) | Team A | Auth service | Auth endpoints |
| Backend: `get_current_user` dependency | Team A | JWT | `dependencies.py` |
| Backend: Permission checker dependency | Team A | RBAC models | `permissions.py` |
| Backend: CORS + security headers middleware | Team A | Config | `middleware.py` |
| Backend: Rate limiting (login, forgot-password) | Team A | Redis | Rate limits |
| Backend: Seed script (default roles, permissions, super admin) | Team A | All models | `seed_data.py` |
| Backend: User management service (CRUD, send password via email) | Team A | Auth service | `user_service.py` |
| Backend: User API routes (`/users/*` incl. reset-password, send-password) | Team A | User service | `api/v1/users.py` |
| Frontend: Auth store (Zustand) | Team B | Types | `authStore.ts` |
| Frontend: Login page | Team B | Auth store | Login working |
| Frontend: Forgot password page | Team B | Auth store | Password reset |
| Frontend: MainLayout (sidebar + header) | Team B | Auth | Layout working |
| Frontend: AuthLayout | Team B | None | Auth layout |
| Frontend: Sidebar with role-based menu | Team B | Auth store | Dynamic sidebar |
| Frontend: Header (user menu, notification bell, language switcher) | Team B | UI components | Header |
| Frontend: useAuth, usePermission hooks | Team B | Auth store | Hooks |
| Frontend: Error pages (404, 403, 500) | Team B | Layouts | Error pages |
| Frontend: Admin User CRUD (create user with password, list, edit, deactivate) | Team B | Auth + Layouts | User Mgmt pages |
| Frontend: Send Password & Reset Password dialogs | Team B | User Mgmt | Dialogs |
| Integration test: Login flow end-to-end | Team C | Backend + Frontend | Test passing |

**Phase 0 Exit Criteria:**
- ✅ Auth login/logout/refresh works end-to-end
- ✅ RBAC permission checking works
- ✅ Super Admin can create users with password and send via email
- ✅ Super Admin can reset passwords and send to users
- ✅ Layout renders correctly with role-based sidebar
- ✅ CI pipeline passes
- ✅ Docker Compose brings up full stack

---

## Phase 1: Core Modules (Week 3–6) — PARALLEL ⚡

> After Phase 0, teams can work independently on isolated modules.

### Team A (Backend): Patient + Doctor + Appointments

**Week 3–4: Patients & Doctors**
| Task | Deliverable |
|------|-------------|
| Patient model + migration | `models/patient.py` |
| Patient schemas (Create, Update, Response, Search) | `schemas/patient.py` |
| Patient repository | `patient_repo.py` |
| Patient service (CRUD, search, dedup, photo, consent) | `patient_service.py` |
| Patient API routes (all 18+ endpoints) | `api/v1/patients.py` |
| Phone/email validators | `utils/validators.py` |
| ID generator (HMS 12-digit format) | `utils/id_generator.py` |
| ID sequence service (per hospital/dept/month) | `services/id_sequence_service.py` |
| Doctor model + migration | `models/doctor.py` |
| Doctor schemas | `schemas/doctor.py` |
| Doctor repository | `doctor_repo.py` |
| Doctor service (CRUD, schedule, leaves, fees) | `doctor_service.py` |
| Doctor API routes | `api/v1/doctors.py` |
| File upload service (photo storage) | `services/file_service.py` |
| Unit tests for patient & doctor services | `tests/unit/` |
| Integration tests for patient & doctor APIs | `tests/integration/` |

**Week 5–6: Appointments + ID Cards**
| Task | Deliverable |
|------|-------------|
| ID Card model + migration | `models/id_card.py` |
| ID Card service (generate front/back, PDF, email) | `id_card_service.py` |
| ID Card API routes (generate, download, print, email) | `api/v1/id_cards.py` |
| Patient ID card endpoints | In `api/v1/patients.py` |
| Staff ID card endpoints | In `api/v1/users.py` |
| ID card PDF template (WeasyPrint) | In `pdf_service.py` |
| QR code generation util | `utils/qr_utils.py` |

**Week 5–6: Appointments**
| Task | Deliverable |
|------|-------------|
| Appointment model + migration | `models/appointment.py` |
| Appointment schemas (Create, Slots, Queue) | `schemas/appointment.py` |
| Appointment repository | `appointment_repo.py` |
| Appointment service (booking, slots, queue, workflow) | `appointment_service.py` |
| Slot availability calculation | In appointment_service |
| Queue management logic | In appointment_service |
| Doctor 1→2→3 transfer workflow | In appointment_service |
| Appointment API routes (all 18+ endpoints) | `api/v1/appointments.py` |
| Date/timezone utilities | `utils/date_utils.py` |
| WebSocket for queue updates | `ws/queue.py` |
| Tests | `tests/` |

### Team B (Frontend): Patient + Doctor + Appointment UIs

**Week 3–4: Patient & Doctor Pages**
| Task | Deliverable |
|------|-------------|
| Patient TypeScript types | `types/patient.ts` |
| Patient API service | `services/patientService.ts` |
| PatientListPage (table + search + filter + pagination) | `pages/patients/PatientListPage.tsx` |
| DataTable component (generic, reusable) | `components/tables/DataTable.tsx` |
| DataTableToolbar + Pagination | `components/tables/` |
| MobileCardList component | `components/tables/MobileCardList.tsx` |
| PatientCreatePage (multi-step form) | `pages/patients/PatientCreatePage.tsx` |
| PatientForm (shared create/edit) | `pages/patients/components/PatientForm.tsx` |
| PhotoCapture component (webcam + upload) | `pages/patients/components/PhotoCapture.tsx` |
| PhoneInput component (international) | `components/forms/PhoneInput.tsx` |
| AddressForm component (country-adaptive) | `components/forms/AddressForm.tsx` |
| FormField component | `components/forms/FormField.tsx` |
| PatientEditPage | `pages/patients/PatientEditPage.tsx` |
| PatientDetailPage (tabs: overview, history) | `pages/patients/PatientDetailPage.tsx` |
| ConsentForm component | `pages/patients/components/ConsentForm.tsx` |
| PatientIDCardTab component | `pages/patients/components/IDCardTab.tsx` |
| IDCardPreview component (front + back) | `components/common/IDCardPreview.tsx` |
| IDCardActions (download, email, print, regenerate) | `components/common/IDCardActions.tsx` |
| Doctor types + API service | `types/doctor.ts`, `services/doctorService.ts` |
| DoctorListPage | `pages/doctors/DoctorListPage.tsx` |
| DoctorCreatePage + DoctorForm | `pages/doctors/` |
| DoctorDetailPage | `pages/doctors/DoctorDetailPage.tsx` |
| ScheduleEditor component | `pages/doctors/components/ScheduleEditor.tsx` |
| LeaveManager component | `pages/doctors/components/LeaveManager.tsx` |

**Week 5–6: Appointment Pages**
| Task | Deliverable |
|------|-------------|
| Appointment types + API service | `types/appointment.ts`, `services/appointmentService.ts` |
| AppointmentBookingPage (multi-step) | `pages/appointments/AppointmentBookingPage.tsx` |
| SlotPicker component | `pages/appointments/components/SlotPicker.tsx` |
| AppointmentListPage | `pages/appointments/AppointmentListPage.tsx` |
| QueueManagementPage (Kanban board) | `pages/appointments/QueueManagementPage.tsx` |
| QueueBoard component | `pages/appointments/components/QueueBoard.tsx` |
| QueueCard component | `pages/appointments/components/QueueCard.tsx` |
| CalendarViewPage | `pages/appointments/CalendarViewPage.tsx` |
| WorkflowTracker (Dr 1→2→3 visual) | `pages/appointments/components/WorkflowTracker.tsx` |
| useWebSocket hook (queue updates) | `hooks/useWebSocket.ts` |
| StatusBadge component | `components/common/StatusBadge.tsx` |
| ConfirmDialog component | `components/common/ConfirmDialog.tsx` |
| PageHeader component | `components/common/PageHeader.tsx` |
| EmptyState component | `components/common/EmptyState.tsx` |

### Team C (Full-Stack): Dashboard + Notifications + File Service

**Week 3–4:**
| Task | Deliverable |
|------|-------------|
| Dashboard page (role-based widgets) | `pages/dashboard/DashboardPage.tsx` |
| TodayStats widget | `pages/dashboard/widgets/TodayStats.tsx` |
| RecentPatients widget | `pages/dashboard/widgets/RecentPatients.tsx` |
| Chart components (Bar, Line, Pie) | `components/charts/` |
| Notification model + migration | `models/notification.py` |
| Notification service (in-app) | `services/notification_service.py` |
| Notification API routes | `api/v1/notifications.py` |
| NotificationBell component (frontend) | `layouts/Header/NotificationBell.tsx` |
| useNotifications hook | `hooks/useNotifications.ts` |
| notificationStore (Zustand) | `store/notificationStore.ts` |
| Audit log model + repository | `models/audit.py`, `repositories/audit_repo.py` |
| Audit logging middleware/decorator | `core/middleware.py` |

**Week 5–6:**
| Task | Deliverable |
|------|-------------|
| PDF service (WeasyPrint/ReportLab setup) | `services/pdf_service.py` |
| Patient registration card PDF | Template + generation |
| Notification queue model | `models/notification.py` |
| Celery setup for async tasks | `tasks/celery_app.py` |
| Email notification task | `tasks/notification_tasks.py` |
| SMS notification task (pluggable) | `tasks/notification_tasks.py` |
| QueueWidget (dashboard) | `pages/dashboard/widgets/QueueWidget.tsx` |
| LanguageSwitcher component | `layouts/Header/LanguageSwitcher.tsx` |
| Add Spanish (es) and Arabic (ar) base translations | `public/locales/` |

**Phase 1 Exit Criteria:**
- ✅ Patient CRUD works end-to-end with photo upload
- ✅ 12-digit PRN auto-generated for patients
- ✅ Patient soft ID card generated (front + back)
- ✅ ID card download/email/print works
- ✅ Doctor CRUD with schedule management works
- ✅ Appointment booking with slot selection works
- ✅ Queue management board functional
- ✅ Doctor workflow (1→2→3) transfer works
- ✅ Dashboard shows today's stats
- ✅ Notifications (in-app) working
- ✅ Mobile-responsive tables and forms

---

## Phase 2: Clinical & Pharmacy (Week 7–9) — PARALLEL ⚡

### Team A (Backend): Prescriptions + Pharmacy

| Task | Deliverable |
|------|-------------|
| Prescription model + migration | `models/prescription.py` |
| Prescription schemas | `schemas/prescription.py` |
| Prescription service (CRUD, templates, drug interactions, finalize) | `prescription_service.py` |
| Prescription API routes | `api/v1/prescriptions.py` |
| Template CRUD | In prescription service |
| Version history | In prescription service |
| Medicine model + migration | `models/pharmacy.py` |
| Medicine batch model + migration | In `models/pharmacy.py` |
| Pharmacy schemas | `schemas/pharmacy.py` |
| Pharmacy service (dispense, counter sale, returns, FEFO) | `pharmacy_service.py` |
| Pharmacy API routes | `api/v1/pharmacy.py` |
| Barcode utilities | `utils/barcode_utils.py` |
| Prescription PDF generation | In `pdf_service.py` |
| Tests | All tests |

### Team B (Frontend): Prescription + Pharmacy UIs

| Task | Deliverable |
|------|-------------|
| Prescription types + API service | `types/prescription.ts`, `services/prescriptionService.ts` |
| PrescriptionCreatePage | `pages/prescriptions/PrescriptionCreatePage.tsx` |
| PrescriptionForm (medicine items, dosage) | Components |
| MedicineSearch autocomplete | `pages/prescriptions/components/MedicineSearch.tsx` |
| DosageInput component | `pages/prescriptions/components/DosageInput.tsx` |
| DrugInteractionAlert | `pages/prescriptions/components/DrugInteractionAlert.tsx` |
| TemplateSelector | `pages/prescriptions/components/TemplateSelector.tsx` |
| PrescriptionListPage | `pages/prescriptions/PrescriptionListPage.tsx` |
| PrescriptionDetailPage | `pages/prescriptions/PrescriptionDetailPage.tsx` |
| VersionHistory component | Components |
| PrescriptionPrint | `pages/prescriptions/components/PrescriptionPrint.tsx` |
| Pharmacy types + API service | `types/pharmacy.ts`, `services/pharmacyService.ts` |
| PharmacyDashboardPage | `pages/pharmacy/PharmacyDashboardPage.tsx` |
| DispensingPage | `pages/pharmacy/DispensingPage.tsx` |
| DispensingForm + BatchSelector | Components |
| CounterSalePage | `pages/pharmacy/CounterSalePage.tsx` |
| MedicineListPage | `pages/pharmacy/MedicineListPage.tsx` |
| MedicineFormPage | `pages/pharmacy/MedicineFormPage.tsx` |
| ReturnPage | `pages/pharmacy/ReturnPage.tsx` |
| BarcodeScanButton | Components |

### Team C (Full-Stack): Optical Store

| Task | Deliverable |
|------|-------------|
| Optical models + migration | `models/optical.py` |
| Optical schemas | `schemas/optical.py` |
| Optical service (products, Rx, orders, repairs) | `optical_service.py` |
| Optical API routes | `api/v1/optical.py` |
| Optical types + API service (frontend) | `types/optical.ts`, `services/opticalService.ts` |
| OpticalDashboardPage | `pages/optical/OpticalDashboardPage.tsx` |
| ProductListPage + ProductFormPage | `pages/optical/` |
| OpticalRxForm (SPH, CYL, AXIS, ADD, PD) | Components |
| OpticalRxPage | `pages/optical/OpticalRxPage.tsx` |
| OrderManagementPage | `pages/optical/OrderManagementPage.tsx` |
| RepairTrackingPage | `pages/optical/RepairTrackingPage.tsx` |
| Job ticket PDF | In `pdf_service.py` |
| Tests | All tests |

**Phase 2 Exit Criteria:**
- ✅ Prescription creation with drug interaction warnings
- ✅ Prescription templates
- ✅ Pharmacy dispensing against prescription
- ✅ Counter sale (OTC)
- ✅ Batch/expiry tracking (FEFO)
- ✅ Pharmacy returns working
- ✅ Optical Rx entry with all measurements
- ✅ Optical order management
- ✅ Repair tracking

---

## Phase 3: Billing & Inventory (Week 10–12) — PARALLEL ⚡

### Team A (Backend): Billing + Insurance

| Task | Deliverable |
|------|-------------|
| Invoice, Payment, Refund, CreditNote models + migration | `models/billing.py` |
| Insurance models + migration | `models/insurance.py` |
| Billing schemas | `schemas/billing.py` |
| Insurance schemas | `schemas/insurance.py` |
| Billing service (invoices, payments, refunds, settlements) | `billing_service.py` |
| Insurance service (policies, claims, pre-auth) | `insurance_service.py` |
| Billing API routes | `api/v1/billing.py` |
| Insurance API routes | `api/v1/insurance.py` |
| Tax calculation logic | In billing_service |
| Invoice PDF generation | In `pdf_service.py` |
| Payment receipt PDF | In `pdf_service.py` |
| Daily settlement logic | In billing_service |
| Tests | All tests |

### Team B (Frontend): Billing + Insurance UIs

| Task | Deliverable |
|------|-------------|
| Billing types + API service | `types/billing.ts`, `services/billingService.ts` |
| Insurance types + API service | `types/insurance.ts`, `services/insuranceService.ts` |
| InvoiceCreatePage | `pages/billing/InvoiceCreatePage.tsx` |
| InvoiceForm + InvoiceItemRow | Components |
| CurrencyInput component | `components/forms/CurrencyInput.tsx` |
| TaxBreakdown component | Components |
| PaymentForm (multi-mode) | `pages/billing/components/PaymentForm.tsx` |
| InvoiceListPage | `pages/billing/InvoiceListPage.tsx` |
| InvoiceDetailPage | `pages/billing/InvoiceDetailPage.tsx` |
| InvoicePrint component | Components |
| RefundPage + RefundForm | `pages/billing/RefundPage.tsx` |
| SettlementPage | `pages/billing/SettlementPage.tsx` |
| OutstandingList | Components |
| PolicyListPage + PolicyForm | `pages/insurance/` |
| ClaimListPage + ClaimForm | `pages/insurance/` |
| ClaimStatusTracker | Components |

### Team C (Full-Stack): Inventory

| Task | Deliverable |
|------|-------------|
| Inventory models (Supplier, PO, GRN, StockMovement, etc.) + migrations | `models/inventory.py` |
| Inventory schemas | `schemas/inventory.py` |
| Inventory service (PO, GRN, movements, alerts, cycle counts) | `inventory_service.py` |
| Inventory API routes | `api/v1/inventory.py` |
| Inventory types + API service (frontend) | `types/inventory.ts`, `services/inventoryService.ts` |
| InventoryDashboardPage | `pages/inventory/InventoryDashboardPage.tsx` |
| ItemListPage + ItemForm | `pages/inventory/` |
| SupplierListPage + SupplierForm | `pages/inventory/` |
| PurchaseOrderPage + POForm | `pages/inventory/` |
| GRNPage + GRNForm | `pages/inventory/` |
| StockAdjustmentPage | `pages/inventory/` |
| CycleCountPage | `pages/inventory/` |
| ReorderAlerts + ExpiryAlerts components | Components |
| StockMovementLog component | Components |
| Tests | All tests |

**Phase 3 Exit Criteria:**
- ✅ Complete billing flow: invoice → payment → receipt
- ✅ Multi-payment mode support
- ✅ Refund with approval workflow
- ✅ Tax calculation per item
- ✅ Invoice PDF generation with hospital branding
- ✅ Insurance policy management
- ✅ Insurance claim submission and tracking
- ✅ Full inventory lifecycle: PO → GRN → Stock → Dispense
- ✅ Stock alerts (low stock, expiry)
- ✅ Cycle count with variance reporting

---

## Phase 4: Reports & Admin (Week 13–14) — PARALLEL ⚡

### Team A (Backend): Reports + Admin

| Task | Deliverable |
|------|-------------|
| Report service (revenue, OPD, pharmacy, optical, inventory) | `report_service.py` |
| Report repository (complex queries, aggregations) | `report_repo.py` |
| Report API routes | `api/v1/reports.py` |
| Export utilities (CSV, XLSX, PDF) | `utils/export_utils.py` |
| Admin API routes (settings, departments, tax config, audit) | `api/v1/admin.py` |
| Hospital settings API | In `admin.py` |
| User management API refinements | In `users.py` |
| Scheduled report task | `tasks/report_tasks.py` |
| Backup task | `tasks/backup_tasks.py` |

### Team B (Frontend): Reports + Admin UIs

| Task | Deliverable |
|------|-------------|
| ReportsDashboardPage | `pages/reports/ReportsDashboardPage.tsx` |
| RevenueReportPage | `pages/reports/RevenueReportPage.tsx` |
| RevenueChart (Line/Bar with period toggle) | Components |
| DateRangePicker component | `components/ui/DateRangePicker.tsx` |
| OPDReportPage, PharmacyReportPage, OpticalReportPage | Pages |
| InventoryReportPage, FinancialReportPage | Pages |
| ExportButton component (CSV/XLSX/PDF) | Components |
| TrendComparison component (MoM, YoY) | Components |
| AdminDashboardPage | `pages/admin/AdminDashboardPage.tsx` |
| UserManagementPage + UserForm | `pages/admin/` |
| User photo upload for ID card | In UserForm |
| StaffIDCardPage | `pages/admin/StaffIDCardPage.tsx` |
| SendPasswordDialog | `pages/admin/components/SendPasswordDialog.tsx` |
| ResetPasswordDialog | `pages/admin/components/ResetPasswordDialog.tsx` |
| RoleManagementPage + RoleForm | `pages/admin/` |
| PermissionMatrix component | `pages/admin/components/PermissionMatrix.tsx` |
| HospitalSettingsPage | `pages/admin/HospitalSettingsPage.tsx` |
| LogoUpload component | Components |
| TaxConfigPage | `pages/admin/TaxConfigPage.tsx` |
| AuditLogPage + AuditLogViewer | `pages/admin/` |
| BackupPage | `pages/admin/BackupPage.tsx` |
| DepartmentPage | `pages/admin/DepartmentPage.tsx` |

### Team C (Full-Stack): Integration & Polish

| Task | Deliverable |
|------|-------------|
| Integration: Appointment → Prescription → Pharmacy → Billing flow | End-to-end flow |
| Integration: Inventory auto-update on dispensing/sale | Stock sync |
| Dashboard: RevenueChart widget (real data) | Widget |
| Dashboard: LowStockAlert widget | Widget |
| WebSocket: ensure queue real-time works | WS verified |
| Notification: "Prescription ready" notification to patient view | Notification |
| Notification: "Low stock" alert to inventory manager | Notification |
| Print layout component finalization | All prints work |
| Responsive testing & fixes across all pages | Mobile/tablet ready |

**Phase 4 Exit Criteria:**
- ✅ Revenue reports with daily/monthly/yearly views
- ✅ All report exports working (CSV, XLSX, PDF)
- ✅ Department/doctor-wise analytics
- ✅ Admin panel fully functional
- ✅ RBAC user/role management UI
- ✅ Hospital settings configurable
- ✅ Audit logs viewable and filterable
- ✅ End-to-end flow tested

---

## Phase 5: Testing & Security Hardening (Week 15) — ALL TEAMS

| Task | Owner | Deliverable |
|------|-------|-------------|
| Unit test coverage ≥ 80% for services | Team A | Tests |
| Integration test coverage for all API endpoints | Team A | Tests |
| Frontend component tests (React Testing Library) | Team B | Tests |
| E2E test: Complete patient journey | Team C | Cypress/Playwright test |
| E2E test: Complete billing workflow | Team C | Cypress/Playwright test |
| Security: OWASP ZAP scan | Team C | Report + fixes |
| Security: Dependency audit (pip-audit, npm audit) | Team C | Clean audit |
| Performance: Load test (100 concurrent users) | Team C | k6/Locust report |
| Performance: Database query optimization (EXPLAIN) | Team A | Optimized queries |
| Performance: Frontend bundle analysis | Team B | Bundle < 500KB gzipped |
| Accessibility audit (axe-core, manual testing) | Team B | WCAG 2.1 AA compliance |
| Cross-browser testing (Chrome, Edge, Safari, Firefox) | Team B | All browsers work |
| RTL language testing (Arabic) | Team B | RTL layout correct |
| Mobile device testing (iOS Safari, Android Chrome) | Team B | Mobile works |
| API documentation review (OpenAPI spec) | Team A | Complete API docs |
| Error handling audit: every endpoint returns correct HTTP codes | Team A | All codes correct |

---

## Phase 6: Deployment & Go-Live (Week 16) — ALL TEAMS

| Task | Owner | Deliverable |
|------|-------|-------------|
| Production Docker images optimized | Team C | Slim images |
| Production docker-compose.yml | Team C | Production config |
| Nginx configuration (SSL, compression, caching) | Team C | nginx.conf |
| Database: production migration dry-run | Team A | Verified migration |
| Seed: production master data | Team A | Seed script |
| Create super admin account | Team A | Admin ready |
| Environment: staging deployment | Team C | Staging running |
| UAT testing on staging | All Teams | UAT sign-off |
| Production deployment | Team C | Production live |
| Monitoring: health check endpoints | Team A | `/health`, `/ready` |
| Monitoring: Prometheus metrics (optional) | Team C | Metrics endpoint |
| Documentation: README, deployment guide, user guide | All Teams | Docs complete |
| Post-deployment: smoke testing | All Teams | All good |

---

## Parallel Work Rules (To Avoid Conflicts)

### 1. Module Isolation
Each developer works in their module folder:
```
Developer 1: backend/app/api/v1/patients.py + services/patient_service.py + ...
Developer 2: backend/app/api/v1/pharmacy.py + services/pharmacy_service.py + ...
Developer 3: frontend/src/pages/patients/ + services/patientService.ts + ...
```
These paths DON'T overlap → no merge conflicts.

### 2. Database Migration Naming
Use timestamp-based migration names (Alembic default):
```
2026_02_10_001_create_users_table.py
2026_02_10_002_create_patients_table.py
2026_02_12_001_create_appointments_table.py
```
Rule: **Never modify another developer's migration file.** Create a new migration instead.

### 3. Shared File Protocol
Files that EVERYONE touches (potential conflicts):
- `backend/app/api/v1/router.py` — Add your router import here. Merges are mechanical.
- `backend/app/models/__init__.py` — Add model imports. Mechanical merge.
- `frontend/src/routes/index.tsx` — Add your page routes. Mechanical merge.
- `frontend/src/layouts/Sidebar/sidebarConfig.ts` — Add your menu items.

**Rule**: Only add to these files, never restructure. Use separate lines for easy git merge.

### 4. API Contracts First
Before coding an API:
1. Define the Pydantic schema (request + response) in `schemas/`
2. Define the TypeScript type in `types/`
3. Both teams proceed independently

### 5. Feature Flags
All new modules wrapped in feature flags for gradual rollout:
```python
# config.py
FEATURE_PHARMACY_ENABLED = env.bool("FEATURE_PHARMACY", default=True)
FEATURE_OPTICAL_ENABLED = env.bool("FEATURE_OPTICAL", default=True)
FEATURE_INSURANCE_ENABLED = env.bool("FEATURE_INSURANCE", default=False)
```

### 6. Git Branch Strategy
```
main (production)
  └── develop (integration)
       ├── feature/HMS-001-patient-registration
       ├── feature/HMS-002-doctor-schedule
       ├── feature/HMS-003-appointment-booking
       ├── feature/HMS-010-pharmacy-dispensing
       ├── bugfix/HMS-015-login-lockout
       └── hotfix/HMS-020-critical-security-fix
```

**Review Process:**
1. Developer creates feature branch from `develop`
2. Implements feature with tests
3. Opens PR to `develop`
4. At least 1 reviewer approves
5. CI must pass (lint + tests + build)
6. Squash merge to `develop`
7. Weekly release from `develop` → `main`

---

## Definition of Done (Per Task)

- [ ] Code written and self-reviewed
- [ ] Unit tests written (≥ 80% coverage for services)
- [ ] Integration tests for API endpoints
- [ ] Pydantic validation for all inputs
- [ ] Zod validation for all frontend forms
- [ ] Error handling: correct HTTP status codes + error messages
- [ ] i18n: all user-facing strings use translation keys
- [ ] Responsive: tested on mobile (375px), tablet (768px), desktop (1280px)
- [ ] Accessibility: keyboard navigable, ARIA labels on icons
- [ ] Permission checks: backend + frontend guard
- [ ] Audit logging for CUD operations
- [ ] No TypeScript errors, no ESLint warnings
- [ ] No Python linting errors (ruff/flake8)
- [ ] API documented in OpenAPI (auto from FastAPI)
- [ ] PR approved and CI green
