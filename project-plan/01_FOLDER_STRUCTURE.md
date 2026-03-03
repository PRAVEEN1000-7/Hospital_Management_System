# HMS — Complete Project Folder Structure

## Root Structure

```
HMS/
├── docs/                           # Project documentation
│   ├── project-plan/               # This planning directory
│   ├── api-contracts/              # OpenAPI specs (generated)
│   └── architecture/               # Architecture diagrams
│
├── backend/                        # FastAPI Backend
│   ├── alembic/                    # Database migrations
│   │   ├── versions/               # Migration files
│   │   ├── env.py
│   │   └── alembic.ini
│   │
│   ├── app/                        # Application package
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI application entry point
│   │   │
│   │   ├── core/                   # Core infrastructure
│   │   │   ├── __init__.py
│   │   │   ├── config.py           # Pydantic Settings (env loading)
│   │   │   ├── database.py         # Async engine, sessionmaker, Base
│   │   │   ├── security.py         # JWT creation/verification, password hashing
│   │   │   ├── dependencies.py     # FastAPI Depends (get_db, get_current_user)
│   │   │   ├── permissions.py      # RBAC permission checker
│   │   │   ├── exceptions.py       # Custom exception classes
│   │   │   ├── exception_handlers.py # Global exception handlers
│   │   │   ├── middleware.py       # CORS, request logging, rate limiting
│   │   │   ├── pagination.py       # Pagination utilities
│   │   │   ├── redis.py            # Redis client setup
│   │   │   └── events.py           # App startup/shutdown events
│   │   │
│   │   ├── models/                 # SQLAlchemy ORM Models
│   │   │   ├── __init__.py         # Import all models here
│   │   │   ├── base.py             # BaseModel with id, timestamps, soft delete
│   │   │   ├── user.py             # User, Role, Permission, UserRole, RolePermission
│   │   │   ├── patient.py          # Patient, PatientConsent, PatientDocument
│   │   │   ├── doctor.py           # Doctor, DoctorSchedule, DoctorLeave, DoctorFee
│   │   │   ├── appointment.py      # Appointment, AppointmentQueue, AppointmentStatusLog
│   │   │   ├── prescription.py     # Prescription, PrescriptionItem, PrescriptionTemplate, LabOrder
│   │   │   ├── pharmacy.py         # Medicine, MedicineBatch, PharmacyDispensing, PharmacyReturn
│   │   │   ├── optical.py          # OpticalProduct, OpticalPrescription, OpticalOrder, OpticalRepair
│   │   │   ├── billing.py          # Invoice, InvoiceItem, Payment, Refund, CreditNote
│   │   │   ├── insurance.py        # InsurancePolicy, InsuranceClaim, PreAuthorization
│   │   │   ├── inventory.py        # InventoryItem, Supplier, PurchaseOrder, GRN, StockMovement
│   │   │   ├── notification.py     # Notification, NotificationTemplate
│   │   │   ├── hospital.py         # Hospital, Department, HospitalSettings
│   │   │   └── audit.py            # AuditLog
│   │   │
│   │   ├── schemas/                # Pydantic Schemas (Request/Response)
│   │   │   ├── __init__.py
│   │   │   ├── common.py           # PaginationParams, SortParams, ApiResponse, ErrorResponse
│   │   │   ├── auth.py             # LoginRequest, TokenResponse, PasswordChange, etc.
│   │   │   ├── user.py             # UserCreate, UserUpdate, UserResponse, RoleSchema, etc.
│   │   │   ├── patient.py          # PatientCreate, PatientUpdate, PatientResponse, PatientSearch
│   │   │   ├── doctor.py           # DoctorCreate, DoctorResponse, ScheduleSchema, LeaveSchema
│   │   │   ├── appointment.py      # AppointmentCreate, AppointmentResponse, SlotQuery, QueueItem
│   │   │   ├── prescription.py     # PrescriptionCreate, PrescriptionItem, TemplateSchema
│   │   │   ├── pharmacy.py         # MedicineSchema, DispensingCreate, ReturnCreate, CounterSale
│   │   │   ├── optical.py          # OpticalProductSchema, OpticalRxSchema, OrderSchema, RepairSchema
│   │   │   ├── billing.py          # InvoiceCreate, PaymentCreate, RefundCreate, CreditNoteSchema
│   │   │   ├── insurance.py        # PolicyCreate, ClaimCreate, PreAuthRequest
│   │   │   ├── inventory.py        # ItemCreate, SupplierCreate, POCreate, GRNCreate, AdjustmentCreate
│   │   │   ├── notification.py     # NotificationResponse, TemplateCreate
│   │   │   ├── report.py           # RevenueQuery, ReportExportRequest
│   │   │   └── admin.py            # SettingsUpdate, DepartmentCreate, TaxConfigCreate
│   │   │
│   │   ├── api/                    # API Routes (Controllers)
│   │   │   ├── __init__.py
│   │   │   └── v1/                 # API Version 1
│   │   │       ├── __init__.py
│   │   │       ├── router.py       # Aggregates all module routers
│   │   │       ├── auth.py         # /auth/* endpoints
│   │   │       ├── users.py        # /users/* endpoints
│   │   │       ├── patients.py     # /patients/* endpoints
│   │   │       ├── doctors.py      # /doctors/* endpoints
│   │   │       ├── appointments.py # /appointments/* endpoints
│   │   │       ├── prescriptions.py# /prescriptions/* endpoints
│   │   │       ├── pharmacy.py     # /pharmacy/* endpoints
│   │   │       ├── optical.py      # /optical/* endpoints
│   │   │       ├── billing.py      # /billing/* endpoints
│   │   │       ├── insurance.py    # /insurance/* endpoints
│   │   │       ├── inventory.py    # /inventory/* endpoints
│   │   │       ├── reports.py      # /reports/* endpoints
│   │   │       ├── notifications.py# /notifications/* endpoints
│   │   │       └── admin.py        # /admin/* endpoints
│   │   │
│   │   ├── services/               # Business Logic Layer
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py     # Login, token refresh, password reset, MFA
│   │   │   ├── user_service.py     # User CRUD, role assignment
│   │   │   ├── patient_service.py  # Patient registration, search, dedup, consent
│   │   │   ├── doctor_service.py   # Doctor profiles, schedules, leaves, fees
│   │   │   ├── appointment_service.py # Booking, queue mgmt, slot availability, workflow
│   │   │   ├── prescription_service.py # Prescription CRUD, drug interactions, templates
│   │   │   ├── pharmacy_service.py # Dispensing, counter sales, returns, batch tracking
│   │   │   ├── optical_service.py  # Optical products, Rx, orders, repairs
│   │   │   ├── billing_service.py  # Invoice generation, payments, refunds, settlements
│   │   │   ├── insurance_service.py# Policy mgmt, claims, pre-auth
│   │   │   ├── inventory_service.py# Stock mgmt, POs, GRN, alerts, cycle counts
│   │   │   ├── report_service.py   # Revenue analytics, exports
│   │   │   ├── notification_service.py # SMS, Email, WhatsApp, in-app
│   │   │   ├── file_service.py     # File upload, compression, storage
│   │   │   └── pdf_service.py      # PDF generation (invoices, prescriptions, reports)
│   │   │
│   │   ├── repositories/           # Data Access Layer
│   │   │   ├── __init__.py
│   │   │   ├── base.py             # BaseRepository with generic CRUD
│   │   │   ├── user_repo.py
│   │   │   ├── patient_repo.py
│   │   │   ├── doctor_repo.py
│   │   │   ├── appointment_repo.py
│   │   │   ├── prescription_repo.py
│   │   │   ├── pharmacy_repo.py
│   │   │   ├── optical_repo.py
│   │   │   ├── billing_repo.py
│   │   │   ├── insurance_repo.py
│   │   │   ├── inventory_repo.py
│   │   │   ├── report_repo.py
│   │   │   ├── notification_repo.py
│   │   │   └── audit_repo.py
│   │   │
│   │   ├── utils/                  # Utility functions
│   │   │   ├── __init__.py
│   │   │   ├── validators.py       # Phone, email, national ID validators
│   │   │   ├── formatters.py       # Currency, date, number formatting
│   │   │   ├── id_generator.py     # Sequential ID generation (PAT-2026-00001)
│   │   │   ├── file_utils.py       # File type checking, compression
│   │   │   ├── barcode_utils.py    # Barcode/QR generation and parsing
│   │   │   ├── date_utils.py       # Timezone conversion, age calculation
│   │   │   ├── crypto_utils.py     # PII encryption/decryption
│   │   │   └── export_utils.py     # CSV/XLSX export helpers
│   │   │
│   │   └── tasks/                  # Background Tasks (Celery)
│   │       ├── __init__.py
│   │       ├── celery_app.py       # Celery configuration
│   │       ├── notification_tasks.py # Async SMS/Email/WhatsApp sending
│   │       ├── report_tasks.py     # Scheduled report generation
│   │       ├── backup_tasks.py     # Database backup tasks
│   │       └── cleanup_tasks.py    # Expired session/token cleanup
│   │
│   ├── tests/                      # Test suite
│   │   ├── __init__.py
│   │   ├── conftest.py             # Fixtures (test DB, client, auth)
│   │   ├── factories/              # Test data factories (factory_boy)
│   │   │   ├── __init__.py
│   │   │   ├── user_factory.py
│   │   │   ├── patient_factory.py
│   │   │   ├── doctor_factory.py
│   │   │   └── ...
│   │   ├── unit/                   # Unit tests (services, utils)
│   │   │   ├── test_auth_service.py
│   │   │   ├── test_patient_service.py
│   │   │   ├── test_appointment_service.py
│   │   │   ├── test_billing_service.py
│   │   │   ├── test_validators.py
│   │   │   └── ...
│   │   ├── integration/            # Integration tests (API endpoints)
│   │   │   ├── test_auth_api.py
│   │   │   ├── test_patients_api.py
│   │   │   ├── test_appointments_api.py
│   │   │   ├── test_billing_api.py
│   │   │   └── ...
│   │   └── e2e/                    # End-to-end workflow tests
│   │       ├── test_patient_journey.py
│   │       └── test_billing_workflow.py
│   │
│   ├── scripts/                    # Utility scripts
│   │   ├── seed_data.py            # Seed master data, demo data
│   │   ├── create_superadmin.py    # Create initial admin user
│   │   └── generate_openapi.py     # Export OpenAPI JSON
│   │
│   ├── .env.example
│   ├── requirements.txt            # Pinned dependencies
│   ├── requirements-dev.txt        # Dev/test dependencies
│   ├── pyproject.toml              # Project metadata
│   ├── Dockerfile
│   └── docker-compose.yml          # Full stack (DB, Redis, MinIO, Backend)
│
├── frontend/                       # React 19+ Frontend
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── logo.svg
│   │   └── locales/                # i18n translation files
│   │       ├── en/                 # English
│   │       │   ├── common.json     # Shared translations
│   │       │   ├── auth.json       # Auth module
│   │       │   ├── patients.json   # Patient module
│   │       │   ├── doctors.json
│   │       │   ├── appointments.json
│   │       │   ├── prescriptions.json
│   │       │   ├── pharmacy.json
│   │       │   ├── optical.json
│   │       │   ├── billing.json
│   │       │   ├── inventory.json
│   │       │   ├── reports.json
│   │       │   ├── admin.json
│   │       │   └── errors.json     # Error messages
│   │       ├── es/                 # Spanish
│   │       ├── fr/                 # French
│   │       ├── ar/                 # Arabic (RTL)
│   │       ├── hi/                 # Hindi
│   │       ├── pt/                 # Portuguese
│   │       ├── zh/                 # Chinese
│   │       ├── ja/                 # Japanese
│   │       └── de/                 # German
│   │
│   ├── src/
│   │   ├── main.tsx                # React entry point
│   │   ├── App.tsx                 # Application root (providers, router)
│   │   ├── vite-env.d.ts           # Vite type declarations
│   │   │
│   │   ├── config/                 # App configuration
│   │   │   ├── index.ts            # Environment config reader
│   │   │   ├── i18n.ts             # i18n initialization
│   │   │   └── queryClient.ts      # React Query / TanStack Query config
│   │   │
│   │   ├── routes/                 # Routing
│   │   │   ├── index.tsx           # Route definitions
│   │   │   ├── ProtectedRoute.tsx  # Auth guard HOC
│   │   │   ├── RoleGuard.tsx       # Role-based route guard
│   │   │   └── routeConfig.ts      # Route path constants
│   │   │
│   │   ├── layouts/                # Layout components
│   │   │   ├── MainLayout.tsx      # Authenticated layout (sidebar + header + content)
│   │   │   ├── AuthLayout.tsx      # Login/forgot password layout
│   │   │   ├── Sidebar/
│   │   │   │   ├── Sidebar.tsx     # Collapsible sidebar
│   │   │   │   ├── SidebarItem.tsx # Nav item
│   │   │   │   └── sidebarConfig.ts# Menu items per role
│   │   │   ├── Header/
│   │   │   │   ├── Header.tsx      # Top header bar
│   │   │   │   ├── UserMenu.tsx    # Profile dropdown
│   │   │   │   ├── NotificationBell.tsx
│   │   │   │   └── LanguageSwitcher.tsx
│   │   │   └── Footer.tsx
│   │   │
│   │   ├── pages/                  # Page components (one folder per module)
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   ├── ForgotPasswordPage.tsx
│   │   │   │   ├── ResetPasswordPage.tsx
│   │   │   │   └── MFAVerifyPage.tsx
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── DashboardPage.tsx        # Role-based dashboard
│   │   │   │   ├── widgets/
│   │   │   │   │   ├── TodayStats.tsx       # Today's appointments, revenue
│   │   │   │   │   ├── QueueWidget.tsx      # Live queue status
│   │   │   │   │   ├── RevenueChart.tsx     # Revenue trend chart
│   │   │   │   │   ├── LowStockAlert.tsx    # Inventory alerts
│   │   │   │   │   └── RecentPatients.tsx   # Recent registrations
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── patients/
│   │   │   │   ├── PatientListPage.tsx      # List with search, filter, pagination
│   │   │   │   ├── PatientCreatePage.tsx    # Registration form with photo
│   │   │   │   ├── PatientEditPage.tsx      # Edit patient
│   │   │   │   ├── PatientDetailPage.tsx    # Full profile view with tabs
│   │   │   │   └── components/
│   │   │   │       ├── PatientForm.tsx      # Shared create/edit form
│   │   │   │       ├── PhotoCapture.tsx     # Webcam/upload component
│   │   │   │       ├── PatientSearch.tsx    # Quick search component
│   │   │   │       ├── PatientCard.tsx      # Card view for mobile
│   │   │   │       ├── ConsentForm.tsx      # Digital consent
│   │   │   │       └── RegistrationCard.tsx # Printable card
│   │   │   │
│   │   │   ├── doctors/
│   │   │   │   ├── DoctorListPage.tsx
│   │   │   │   ├── DoctorCreatePage.tsx
│   │   │   │   ├── DoctorEditPage.tsx
│   │   │   │   ├── DoctorDetailPage.tsx
│   │   │   │   ├── DoctorSchedulePage.tsx   # Schedule configuration
│   │   │   │   └── components/
│   │   │   │       ├── DoctorForm.tsx
│   │   │   │       ├── ScheduleEditor.tsx   # Weekly schedule grid
│   │   │   │       ├── LeaveManager.tsx     # Leave CRUD
│   │   │   │       └── FeeConfig.tsx        # Fee configuration
│   │   │   │
│   │   │   ├── appointments/
│   │   │   │   ├── AppointmentListPage.tsx
│   │   │   │   ├── AppointmentBookingPage.tsx
│   │   │   │   ├── AppointmentDetailPage.tsx
│   │   │   │   ├── QueueManagementPage.tsx  # Live queue board
│   │   │   │   ├── CalendarViewPage.tsx     # Doctor calendar
│   │   │   │   └── components/
│   │   │   │       ├── BookingForm.tsx
│   │   │   │       ├── SlotPicker.tsx       # Available slot selector
│   │   │   │       ├── QueueBoard.tsx       # Kanban-style queue
│   │   │   │       ├── QueueCard.tsx        # Individual queue item
│   │   │   │       ├── CalendarView.tsx     # Full calendar
│   │   │   │       └── WorkflowTracker.tsx  # Doctor 1→2→3 progress
│   │   │   │
│   │   │   ├── prescriptions/
│   │   │   │   ├── PrescriptionListPage.tsx
│   │   │   │   ├── PrescriptionCreatePage.tsx
│   │   │   │   ├── PrescriptionDetailPage.tsx
│   │   │   │   ├── TemplateManagerPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── PrescriptionForm.tsx
│   │   │   │       ├── MedicineSearch.tsx   # Autocomplete medicine search
│   │   │   │       ├── DosageInput.tsx      # Dosage/frequency selector
│   │   │   │       ├── DrugInteractionAlert.tsx
│   │   │   │       ├── TemplateSelector.tsx
│   │   │   │       ├── PrescriptionPrint.tsx
│   │   │   │       └── VersionHistory.tsx
│   │   │   │
│   │   │   ├── pharmacy/
│   │   │   │   ├── PharmacyDashboardPage.tsx
│   │   │   │   ├── MedicineListPage.tsx
│   │   │   │   ├── MedicineFormPage.tsx
│   │   │   │   ├── DispensingPage.tsx       # Dispense against prescription
│   │   │   │   ├── CounterSalePage.tsx      # OTC counter sale
│   │   │   │   ├── ReturnPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── MedicineForm.tsx
│   │   │   │       ├── DispensingForm.tsx
│   │   │   │       ├── CounterSaleForm.tsx
│   │   │   │       ├── BatchSelector.tsx    # Batch & expiry selection
│   │   │   │       ├── BarcodeScanButton.tsx
│   │   │   │       ├── StockAlerts.tsx
│   │   │   │       └── ReturnForm.tsx
│   │   │   │
│   │   │   ├── optical/
│   │   │   │   ├── OpticalDashboardPage.tsx
│   │   │   │   ├── ProductListPage.tsx
│   │   │   │   ├── ProductFormPage.tsx
│   │   │   │   ├── OpticalRxPage.tsx        # Optical prescription
│   │   │   │   ├── OrderManagementPage.tsx
│   │   │   │   ├── RepairTrackingPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── ProductForm.tsx
│   │   │   │       ├── OpticalRxForm.tsx    # SPH, CYL, AXIS, ADD, PD fields
│   │   │   │       ├── OrderForm.tsx
│   │   │   │       ├── JobTicket.tsx        # Printable job ticket
│   │   │   │       ├── RepairForm.tsx
│   │   │   │       └── LensCalculator.tsx
│   │   │   │
│   │   │   ├── billing/
│   │   │   │   ├── BillingDashboardPage.tsx
│   │   │   │   ├── InvoiceListPage.tsx
│   │   │   │   ├── InvoiceCreatePage.tsx
│   │   │   │   ├── InvoiceDetailPage.tsx
│   │   │   │   ├── PaymentPage.tsx
│   │   │   │   ├── RefundPage.tsx
│   │   │   │   ├── SettlementPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── InvoiceForm.tsx
│   │   │   │       ├── InvoiceItemRow.tsx
│   │   │   │       ├── PaymentForm.tsx      # Multi-mode payment
│   │   │   │       ├── RefundForm.tsx
│   │   │   │       ├── TaxBreakdown.tsx
│   │   │   │       ├── InvoicePrint.tsx     # Printable invoice
│   │   │   │       └── OutstandingList.tsx
│   │   │   │
│   │   │   ├── insurance/
│   │   │   │   ├── PolicyListPage.tsx
│   │   │   │   ├── PolicyFormPage.tsx
│   │   │   │   ├── ClaimListPage.tsx
│   │   │   │   ├── ClaimFormPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── PolicyForm.tsx
│   │   │   │       ├── ClaimForm.tsx
│   │   │   │       ├── PreAuthForm.tsx
│   │   │   │       └── ClaimStatusTracker.tsx
│   │   │   │
│   │   │   ├── inventory/
│   │   │   │   ├── InventoryDashboardPage.tsx
│   │   │   │   ├── ItemListPage.tsx
│   │   │   │   ├── ItemFormPage.tsx
│   │   │   │   ├── SupplierListPage.tsx
│   │   │   │   ├── SupplierFormPage.tsx
│   │   │   │   ├── PurchaseOrderPage.tsx
│   │   │   │   ├── GRNPage.tsx
│   │   │   │   ├── StockAdjustmentPage.tsx
│   │   │   │   ├── CycleCountPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── ItemForm.tsx
│   │   │   │       ├── SupplierForm.tsx
│   │   │   │       ├── POForm.tsx
│   │   │   │       ├── GRNForm.tsx
│   │   │   │       ├── AdjustmentForm.tsx
│   │   │   │       ├── ReorderAlerts.tsx
│   │   │   │       ├── ExpiryAlerts.tsx
│   │   │   │       └── StockMovementLog.tsx
│   │   │   │
│   │   │   ├── reports/
│   │   │   │   ├── ReportsDashboardPage.tsx
│   │   │   │   ├── RevenueReportPage.tsx
│   │   │   │   ├── OPDReportPage.tsx
│   │   │   │   ├── PharmacyReportPage.tsx
│   │   │   │   ├── OpticalReportPage.tsx
│   │   │   │   ├── InventoryReportPage.tsx
│   │   │   │   ├── FinancialReportPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── RevenueChart.tsx
│   │   │   │       ├── DateRangePicker.tsx
│   │   │   │       ├── DepartmentFilter.tsx
│   │   │   │       ├── ExportButton.tsx
│   │   │   │       ├── TrendComparison.tsx  # MoM, YoY
│   │   │   │       └── ReportTable.tsx
│   │   │   │
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboardPage.tsx
│   │   │   │   ├── UserManagementPage.tsx
│   │   │   │   ├── UserFormPage.tsx
│   │   │   │   ├── RoleManagementPage.tsx
│   │   │   │   ├── RoleFormPage.tsx
│   │   │   │   ├── DepartmentPage.tsx
│   │   │   │   ├── HospitalSettingsPage.tsx
│   │   │   │   ├── TaxConfigPage.tsx
│   │   │   │   ├── AuditLogPage.tsx
│   │   │   │   ├── BackupPage.tsx
│   │   │   │   └── components/
│   │   │   │       ├── UserForm.tsx
│   │   │   │       ├── RoleForm.tsx
│   │   │   │       ├── PermissionMatrix.tsx # Checkbox grid for role permissions
│   │   │   │       ├── DepartmentForm.tsx
│   │   │   │       ├── SettingsForm.tsx
│   │   │   │       ├── LogoUpload.tsx
│   │   │   │       ├── TaxConfigForm.tsx
│   │   │   │       └── AuditLogViewer.tsx
│   │   │   │
│   │   │   └── errors/
│   │   │       ├── NotFoundPage.tsx         # 404
│   │   │       ├── ForbiddenPage.tsx        # 403
│   │   │       └── ServerErrorPage.tsx      # 500
│   │   │
│   │   ├── components/                      # Shared reusable components
│   │   │   ├── ui/                          # Base primitives (shadcn/ui style)
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Checkbox.tsx
│   │   │   │   ├── Radio.tsx
│   │   │   │   ├── Textarea.tsx
│   │   │   │   ├── Modal.tsx               # Dialog/modal
│   │   │   │   ├── Drawer.tsx              # Side drawer (mobile)
│   │   │   │   ├── Toast.tsx               # Notification toasts
│   │   │   │   ├── Tooltip.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Tabs.tsx
│   │   │   │   ├── Accordion.tsx
│   │   │   │   ├── Dropdown.tsx
│   │   │   │   ├── Avatar.tsx
│   │   │   │   ├── Spinner.tsx             # Loading spinner
│   │   │   │   ├── Skeleton.tsx            # Loading skeleton
│   │   │   │   ├── Alert.tsx
│   │   │   │   ├── Breadcrumb.tsx
│   │   │   │   ├── Pagination.tsx
│   │   │   │   ├── Switch.tsx
│   │   │   │   ├── DatePicker.tsx
│   │   │   │   ├── TimePicker.tsx
│   │   │   │   ├── FileUpload.tsx
│   │   │   │   └── index.ts               # Barrel export
│   │   │   │
│   │   │   ├── forms/                      # Form patterns
│   │   │   │   ├── FormField.tsx           # Label + input + error wrapper
│   │   │   │   ├── FormSection.tsx         # Fieldset with title
│   │   │   │   ├── PhoneInput.tsx          # International phone input
│   │   │   │   ├── AddressForm.tsx         # Country-adaptive address
│   │   │   │   ├── CurrencyInput.tsx       # Currency-aware number input
│   │   │   │   ├── SearchableSelect.tsx    # Async searchable dropdown
│   │   │   │   └── MultiSelect.tsx
│   │   │   │
│   │   │   ├── tables/
│   │   │   │   ├── DataTable.tsx           # Generic data table with sort/filter/page
│   │   │   │   ├── DataTableToolbar.tsx    # Search + filters bar
│   │   │   │   ├── DataTablePagination.tsx
│   │   │   │   ├── ColumnHeader.tsx        # Sortable column header
│   │   │   │   └── MobileCardList.tsx      # Card list for mobile
│   │   │   │
│   │   │   ├── charts/
│   │   │   │   ├── BarChart.tsx
│   │   │   │   ├── LineChart.tsx
│   │   │   │   ├── PieChart.tsx
│   │   │   │   ├── AreaChart.tsx
│   │   │   │   └── ChartContainer.tsx      # Responsive chart wrapper
│   │   │   │
│   │   │   └── common/
│   │   │       ├── PageHeader.tsx           # Page title + actions
│   │   │       ├── EmptyState.tsx           # No data illustration
│   │   │       ├── ConfirmDialog.tsx        # Confirm action modal
│   │   │       ├── StatusBadge.tsx          # Color-coded status pill
│   │   │       ├── ErrorBoundary.tsx        # React error boundary
│   │   │       ├── LoadingOverlay.tsx
│   │   │       ├── PrintLayout.tsx          # Print-friendly wrapper
│   │   │       └── OfflineIndicator.tsx     # Network status
│   │   │
│   │   ├── hooks/                           # Custom React hooks
│   │   │   ├── useAuth.ts                   # Auth state & actions
│   │   │   ├── usePermission.ts             # Check user permissions
│   │   │   ├── useDebounce.ts               # Debounce values
│   │   │   ├── usePagination.ts             # Pagination state
│   │   │   ├── useMediaQuery.ts             # Responsive breakpoints
│   │   │   ├── useLocalStorage.ts           # LocalStorage wrapper
│   │   │   ├── useWebSocket.ts              # WebSocket for live queue
│   │   │   ├── useNotifications.ts          # Notification polling/WS
│   │   │   ├── useConfirm.ts                # Confirmation dialog hook
│   │   │   ├── useToast.ts                  # Toast notifications
│   │   │   ├── usePrint.ts                  # Print trigger
│   │   │   ├── useFileUpload.ts             # File upload with progress
│   │   │   └── useIntersectionObserver.ts   # Infinite scroll
│   │   │
│   │   ├── services/                        # API service layer
│   │   │   ├── api.ts                       # Axios instance with interceptors
│   │   │   ├── authService.ts
│   │   │   ├── userService.ts
│   │   │   ├── patientService.ts
│   │   │   ├── doctorService.ts
│   │   │   ├── appointmentService.ts
│   │   │   ├── prescriptionService.ts
│   │   │   ├── pharmacyService.ts
│   │   │   ├── opticalService.ts
│   │   │   ├── billingService.ts
│   │   │   ├── insuranceService.ts
│   │   │   ├── inventoryService.ts
│   │   │   ├── reportService.ts
│   │   │   ├── notificationService.ts
│   │   │   └── adminService.ts
│   │   │
│   │   ├── store/                           # Zustand stores
│   │   │   ├── authStore.ts                 # User, token, permissions
│   │   │   ├── uiStore.ts                   # Sidebar open, theme, locale
│   │   │   ├── notificationStore.ts         # Notifications state
│   │   │   └── queueStore.ts                # Live queue state
│   │   │
│   │   ├── types/                           # TypeScript type definitions
│   │   │   ├── index.ts                     # Re-exports
│   │   │   ├── api.ts                       # API response types
│   │   │   ├── auth.ts
│   │   │   ├── user.ts
│   │   │   ├── patient.ts
│   │   │   ├── doctor.ts
│   │   │   ├── appointment.ts
│   │   │   ├── prescription.ts
│   │   │   ├── pharmacy.ts
│   │   │   ├── optical.ts
│   │   │   ├── billing.ts
│   │   │   ├── insurance.ts
│   │   │   ├── inventory.ts
│   │   │   ├── report.ts
│   │   │   ├── notification.ts
│   │   │   └── admin.ts
│   │   │
│   │   ├── utils/                           # Utility functions
│   │   │   ├── formatters.ts                # Date, currency, number formatting
│   │   │   ├── validators.ts                # Client-side validation helpers
│   │   │   ├── phoneUtils.ts                # Phone number formatting/validation
│   │   │   ├── dateUtils.ts                 # Date manipulation
│   │   │   ├── fileUtils.ts                 # File size check, type guards
│   │   │   ├── permissionUtils.ts           # Permission checking helpers
│   │   │   └── cn.ts                        # Tailwind classname merge utility
│   │   │
│   │   ├── constants/                       # Application constants
│   │   │   ├── index.ts
│   │   │   ├── roles.ts                     # Role constants
│   │   │   ├── permissions.ts               # Permission keys
│   │   │   ├── appointmentStatus.ts         # Status enums
│   │   │   ├── paymentModes.ts
│   │   │   ├── countries.ts                 # Country list with codes
│   │   │   ├── currencies.ts                # Currency list
│   │   │   ├── bloodGroups.ts
│   │   │   ├── genders.ts
│   │   │   └── regex.ts                     # Validation patterns
│   │   │
│   │   ├── styles/                          # Global styles
│   │   │   ├── globals.css                  # Tailwind base + global overrides
│   │   │   ├── print.css                    # Print-specific styles
│   │   │   └── rtl.css                      # RTL language overrides
│   │   │
│   │   └── lib/                             # Third-party library wrappers
│   │       ├── axios.ts                     # Axios config (redundant with services/api.ts — pick one)
│   │       ├── dayjs.ts                     # day.js with plugins & locale
│   │       └── webcam.ts                    # Webcam capture wrapper
│   │
│   ├── .env.example
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── nginx/                              # Nginx reverse proxy config
│   ├── nginx.conf
│   └── conf.d/
│       └── default.conf
│
├── docker-compose.yml                  # Full stack orchestration
├── docker-compose.dev.yml              # Development overrides
├── .github/                            # GitHub config
│   ├── workflows/
│   │   ├── ci.yml                      # CI pipeline (lint, test, build)
│   │   ├── cd-staging.yml              # Deploy to staging
│   │   └── cd-production.yml           # Deploy to production
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
│
├── .gitignore
├── .editorconfig
├── README.md
└── Makefile                            # Common commands (make dev, make test, etc.)
```

---

## Key Structural Decisions

### Why This Structure?

1. **Module Isolation**: Each feature (patients, billing, etc.) has its own models, schemas, services, repos, and API routes. Developers can work on different modules without merge conflicts.

2. **Layer Separation**: The Repository → Service → API pattern ensures no business logic leaks into routes and no SQL leaks into services.

3. **Frontend Page-Component Pattern**: Each page folder contains both the page and its specific components. Shared components live in `components/ui/` and `components/common/`.

4. **i18n Per Module**: Translation files split by module so teams can translate independently.

5. **Type Safety**: TypeScript types mirror Pydantic schemas, ensuring frontend-backend contract alignment.

6. **Test Collocation**: Tests mirror the source structure for easy navigation.
