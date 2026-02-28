# Hospital Management System (HMS) — Master Project Plan

## 1. Project Overview

A globally deployable, enterprise-grade Hospital Management System covering patient registration, appointment workflows, prescriptions, pharmacy and optical store operations, billing, inventory, and analytics.

---

## 2. Tech Stack

| Layer          | Technology                                    | Version   |
|----------------|-----------------------------------------------|-----------|
| Frontend       | React (Vite + TypeScript)                     | 19+       |
| UI Library     | Tailwind CSS + shadcn/ui                      | Latest    |
| State Mgmt     | Zustand                                       | Latest    |
| Forms          | React Hook Form + Zod                         | Latest    |
| Tables         | TanStack Table                                | Latest    |
| Charts         | Recharts                                      | Latest    |
| i18n           | react-i18next                                 | Latest    |
| HTTP Client    | Axios                                         | Latest    |
| Backend        | Python FastAPI                                | 0.115+    |
| ORM            | SQLAlchemy 2.0 (async)                        | 2.0+      |
| Migrations     | Alembic                                       | Latest    |
| Validation     | Pydantic v2                                   | 2.0+      |
| Auth           | python-jose (JWT) + passlib (bcrypt)          | Latest    |
| Task Queue     | Celery + Redis                                | Latest    |
| Database       | PostgreSQL                                    | 16+       |
| Caching        | Redis                                         | 7+        |
| File Storage   | MinIO (S3-compatible) / Local FS              | Latest    |
| PDF Generation | WeasyPrint / ReportLab                        | Latest    |
| SMS/Email      | Pluggable (Twilio/AWS SES/SMTP)               | —         |
| Containerization| Docker + Docker Compose                      | Latest    |
| CI/CD          | GitHub Actions                                | —         |
| Monitoring     | Prometheus + Grafana (optional)               | —         |

---

## 3. Architecture Pattern

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTS                              │
│   Browser (React SPA)  │  Mobile (PWA)  │  Tablet       │
└──────────────┬──────────────────────────────┬────────────┘
               │          HTTPS/TLS           │
┌──────────────▼──────────────────────────────▼────────────┐
│                    NGINX / Reverse Proxy                  │
│              (SSL termination, rate limiting)             │
└──────────────┬──────────────────────────────┬────────────┘
               │                              │
┌──────────────▼────────┐   ┌─────────────────▼───────────┐
│   React SPA (Static)  │   │   FastAPI Backend            │
│   Served via Nginx    │   │   /api/v1/*                  │
│                       │   │                              │
│   - Pages             │   │   ┌──────────────────────┐   │
│   - Components        │   │   │  API Layer (Routes)  │   │
│   - Hooks             │   │   ├──────────────────────┤   │
│   - Services          │   │   │  Service Layer       │   │
│   - State (Zustand)   │   │   ├──────────────────────┤   │
│   - i18n              │   │   │  Repository Layer    │   │
│                       │   │   ├──────────────────────┤   │
│                       │   │   │  Models (SQLAlchemy) │   │
│                       │   │   └──────────┬───────────┘   │
└───────────────────────┘   └──────────────┼───────────────┘
                                           │
                    ┌──────────────────────┬┼──────────────────────┐
                    │                      ││                      │
            ┌───────▼──────┐    ┌──────────▼▼──┐    ┌─────────────▼──┐
            │  PostgreSQL  │    │    Redis      │    │   MinIO / S3   │
            │  (Primary DB)│    │ (Cache+Queue) │    │ (File Storage) │
            └──────────────┘    └───────────────┘    └────────────────┘
```

### Layered Architecture (Backend)

```
API Layer (Routes/Controllers)
    ↓ Depends on
Service Layer (Business Logic)
    ↓ Depends on
Repository Layer (Data Access)
    ↓ Depends on
Models (SQLAlchemy ORM)
    ↓ Maps to
PostgreSQL Database
```

**Rules:**
- API layer ONLY handles HTTP concerns (request parsing, response formatting, status codes)
- Service layer contains ALL business logic, validation, and orchestration
- Repository layer handles ONLY database queries (CRUD)
- Models define the database schema
- Schemas (Pydantic) define API request/response shapes — separate from DB models

---

## 4. Global Design Principles

### 4.1 Internationalization (i18n)
- All user-facing strings externalized to JSON translation files
- Support for RTL languages (Arabic, Hebrew, Urdu)
- Date/time stored as UTC in DB, displayed in user's timezone
- Phone numbers stored in E.164 format (+CountryCodeNumber)
- Currency configurable per hospital (ISO 4217 codes)
- Address fields flexible for any country format
- Number formatting via `Intl.NumberFormat`
- Date formatting via `date-fns` with locale support

### 4.2 Multi-Tenancy Readiness
- `hospital_id` foreign key on all operational tables
- Hospital-level configuration (logo, name, address, tax rules, currency)
- Isolation of data per hospital

### 4.3 HMS 12-Digit ID System (PRN / Staff Reference Number)

All patients and staff (doctors, nurses, pharmacists, receptionists, etc.) are assigned a **12-character auto-generated reference number** that serves as their universal identifier across every module.

**Format:** `[HH][G][YY][M][C][#####]`
| Segment | Len | Description |
|---------|-----|-------------|
| HH | 2 | Hospital code (HC, HA, HM...) |
| G | 1 | Gender (M/F/O/N/U) |
| YY | 2 | Registration year (last 2 digits) |
| M | 1 | Registration month (1-9, A=Oct, B=Nov, C=Dec) |
| C | 1 | Checksum (validation character) |
| ##### | 5 | Auto-generated sequence (starts from project-defined first number) |

**Key Principles:**
- **Project-defined start number:** The first sequence number is configured in `hospital_settings` (e.g., start at 00001 or 10000). All subsequent numbers auto-increment.
- **Cross-module mapping:** This ID is the primary key for patient/staff lookup in appointments, prescriptions, billing, pharmacy, optical, inventory, and reports.
- **Instant decode:** Hospital, role/gender, date, and department are readable from the ID itself.
- **Soft ID Card:** A modern, attractive ID card (front: holder info + photo + QR; back: hospital details) can be generated, downloaded as PDF, emailed, or printed.

See `id-number-format` file for full specification with department codes, color coding, and capacity calculations.

### 4.4 Audit & Compliance
- Every CUD (Create/Update/Delete) operation logged to `audit_logs` table
- Soft deletes everywhere (is_deleted flag + deleted_at timestamp)
- Version history for critical records (prescriptions, invoices)
- PII fields encrypted at rest where required

### 4.5 Responsive Design
- Mobile-first approach with Tailwind breakpoints:
  - `sm`: 640px (mobile landscape)
  - `md`: 768px (tablet portrait)
  - `lg`: 1024px (tablet landscape / small laptop)
  - `xl`: 1280px (desktop)
  - `2xl`: 1536px (large desktop)
- Collapsible sidebar on mobile/tablet
- Touch-friendly tap targets (min 44x44px)
- Data tables switch to card view on mobile

### 4.6 Error Handling Strategy
- Standardized API error response format
- Global error boundary in React
- Form-level and field-level validation with user-friendly messages
- All error messages are i18n keys (translatable)
- Network error detection with retry logic
- Session expiry detection with redirect to login

### 4.7 Performance
- Database query optimization with indexes
- API response pagination (cursor-based for large datasets)
- Redis caching for frequently accessed data (doctor schedules, master data)
- Frontend code splitting per route (React.lazy)
- Image compression on upload
- Debounced search inputs

---

## 5. Naming & Coding Conventions

### Backend (Python/FastAPI)
- **Files**: `snake_case.py`
- **Classes**: `PascalCase`
- **Functions/Variables**: `snake_case`
- **Constants**: `UPPER_SNAKE_CASE`
- **API routes**: `kebab-case` in URLs, `snake_case` in code
- **DB tables**: `snake_case` plural (`patients`, `invoices`)
- **DB columns**: `snake_case`

### Frontend (React/TypeScript)
- **Files**: `PascalCase.tsx` for components, `camelCase.ts` for utils/hooks
- **Components**: `PascalCase`
- **Hooks**: `useCamelCase`
- **Variables/Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase` (prefix with `I` only for interfaces that are contracts)
- **CSS classes**: Tailwind utility classes (no custom CSS unless absolutely necessary)

### Git
- **Branch naming**: `feature/HMS-{ticket}-short-description`, `bugfix/HMS-{ticket}-description`
- **Commit messages**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **PR reviews**: Minimum 1 approval required

---

## 6. Environment Variables

### Backend (.env)
```env
# App
APP_NAME=HMS
APP_ENV=development  # development | staging | production
APP_DEBUG=true
APP_VERSION=1.0.0
SECRET_KEY=<random-256-bit-key>
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DATABASE_URL=postgresql+asyncpg://hms_user:password@localhost:5432/hms_db
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET_KEY=<random-256-bit-key>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# File Storage
STORAGE_BACKEND=local  # local | s3 | minio
STORAGE_LOCAL_PATH=./uploads
S3_BUCKET_NAME=hms-uploads
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Email
EMAIL_BACKEND=smtp  # smtp | ses | console
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@hospital.com

# SMS
SMS_BACKEND=console  # twilio | sns | console
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# CORS
CORS_ORIGINS=http://localhost:5173

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json
```

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_APP_NAME=Hospital Management System
VITE_APP_VERSION=1.0.0
VITE_DEFAULT_LOCALE=en
VITE_DEFAULT_CURRENCY=USD
VITE_DEFAULT_TIMEZONE=UTC
VITE_DEFAULT_COUNTRY=US
VITE_ENABLE_MFA=false
VITE_MAX_FILE_SIZE_MB=5
VITE_SUPPORTED_IMAGE_TYPES=image/jpeg,image/png
VITE_SESSION_TIMEOUT_MINUTES=30
```

---

## 7. Cross-Cutting Concerns

### 7.1 Standardized API Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Patient created successfully",
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "phone_number",
        "message": "Invalid phone number format",
        "code": "INVALID_FORMAT"
      }
    ]
  }
}
```

### 7.2 Error Codes Catalog

| Code                      | HTTP Status | Description                          |
|---------------------------|-------------|--------------------------------------|
| VALIDATION_ERROR          | 400         | Request validation failed            |
| INVALID_CREDENTIALS       | 401         | Wrong email/password                 |
| TOKEN_EXPIRED             | 401         | JWT token expired                    |
| TOKEN_INVALID             | 401         | JWT token malformed                  |
| ACCOUNT_LOCKED            | 403         | Too many failed attempts             |
| ACCOUNT_DISABLED          | 403         | Account deactivated                  |
| PERMISSION_DENIED         | 403         | Insufficient permissions             |
| RESOURCE_NOT_FOUND        | 404         | Entity not found                     |
| DUPLICATE_ENTRY           | 409         | Unique constraint violation          |
| CONFLICT                  | 409         | Business rule conflict               |
| FILE_TOO_LARGE            | 413         | Upload exceeds max size              |
| UNSUPPORTED_FILE_TYPE     | 415         | File type not allowed                |
| RATE_LIMIT_EXCEEDED       | 429         | Too many requests                    |
| INTERNAL_ERROR            | 500         | Unexpected server error              |
| SERVICE_UNAVAILABLE       | 503         | Dependent service down               |
| SLOT_UNAVAILABLE          | 409         | Appointment slot taken               |
| PRESCRIPTION_FINALIZED    | 409         | Cannot edit finalized prescription   |
| INSUFFICIENT_STOCK        | 409         | Not enough inventory                 |
| INVOICE_ALREADY_PAID      | 409         | Invoice is already settled           |
| PATIENT_DUPLICATE         | 409         | Patient with same phone/ID exists    |
| DOCTOR_UNAVAILABLE        | 409         | Doctor on leave or unavailable       |
| BATCH_EXPIRED             | 409         | Medicine batch has expired           |

---

*Next: See `01_FOLDER_STRUCTURE.md` for complete project folder structure.*
