# Hospital Management System (HMS) — Complete Project Recreation Document

> **Purpose:** This document provides everything needed to recreate the entire Hospital Management System from scratch with a **new UI design** while preserving all existing functionality. It covers architecture, data models, API contracts, business logic, validation rules, and every feature specification in detail.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Design](#4-database-design)
5. [Backend API Specification](#5-backend-api-specification)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Frontend Application Specification](#7-frontend-application-specification)
8. [Feature Specifications](#8-feature-specifications)
9. [Data Validation Rules](#9-data-validation-rules)
10. [Constants & Reference Data](#10-constants--reference-data)
11. [Email & PDF Services](#11-email--pdf-services)
12. [Environment Configuration](#12-environment-configuration)
13. [File Upload Handling](#13-file-upload-handling)
14. [Error Handling Patterns](#14-error-handling-patterns)
15. [Setup & Deployment](#15-setup--deployment)

---

## 1. Project Overview

### What It Is
A full-stack Hospital Management System for patient registration, management, and user administration. The system generates unique Patient Reference Numbers (PRN), supports printable/emailable patient ID cards, and provides role-based access control for 9 user roles.

### Core Capabilities
| Capability | Description |
|---|---|
| **Patient Registration** | Global patient registration with international phone codes, 38+ countries, state/province dropdowns |
| **Patient CRUD** | Full create, read, update, soft-delete with paginated listing and multi-field search |
| **Auto-Generated PRN** | Thread-safe patient reference numbers via PostgreSQL sequence (format: `HMS-000001`) |
| **Patient ID Card** | Printable front+back ID card with PDF generation (client-side via html2canvas+jsPDF), download, print, and email |
| **Patient Photo Upload** | JPEG/PNG/WebP upload (max 5MB), stored on disk, displayed in detail and ID card |
| **User Management** | Super-admin-only CRUD for system users with 9 roles, password reset, credential emailing |
| **JWT Authentication** | Stateless Bearer token auth with bcrypt password hashing |
| **SMTP Email** | Configurable email for sending user credentials and patient ID card PDFs |
| **Audit Trail** | Database-level audit logging via PostgreSQL triggers on the patients table |

---

## 2. Technology Stack

### Backend
| Component | Technology | Version |
|---|---|---|
| Web Framework | FastAPI | 0.109.0 |
| ASGI Server | Uvicorn | 0.27.0 |
| ORM | SQLAlchemy | 2.0.25 |
| Database Driver | psycopg2-binary | 2.9.9 |
| Database | PostgreSQL | 15+ |
| Validation | Pydantic + pydantic-settings | 2.5.3 / 2.1.0 |
| JWT | python-jose[cryptography] | 3.3.0 |
| Password Hashing | bcrypt | 4.0+ |
| File Uploads | python-multipart | 0.0.6 |
| Email Validation | email-validator | 2.1.0 |
| Templating | Jinja2 | 3.1.3 |
| PDF Generation (server) | xhtml2pdf | 0.2.16 |
| Migrations | Alembic | 1.13.1 |
| Testing | pytest + httpx | 7.4.4 / 0.26.0 |

### Frontend
| Component | Technology | Version |
|---|---|---|
| UI Library | React | 19.0.0 |
| Build Tool | Vite | 5.0.11 |
| Language | TypeScript | 5.3.3 |
| CSS Framework | Tailwind CSS | 3.4.1 |
| Routing | react-router-dom | 6.21.3 |
| HTTP Client | Axios | 1.6.5 |
| Form Handling | react-hook-form + @hookform/resolvers | 7.49.3 / 3.3.4 |
| Schema Validation | Zod | 3.22.4 |
| Icons | lucide-react | 0.474.0 |
| PDF Generation (client) | html2canvas + jsPDF | 1.4.1 / 4.1.0 |
| Date Utils | date-fns | 3.2.0 |
| CSS Utilities | clsx + tailwind-merge | 2.1.0 / 2.2.0 |
| PostCSS | PostCSS + autoprefixer | 8.4.33 / 10.4.17 |

---

## 3. Architecture Overview

### Backend Structure
```
backend/
├── app/
│   ├── __init__.py
│   ├── config.py              # Pydantic Settings (env loading)
│   ├── database.py            # SQLAlchemy engine, session, Base
│   ├── dependencies.py        # Auth middleware (JWT extraction, role checks)
│   ├── main.py                # FastAPI app, CORS, routers, exception handlers
│   ├── models/                # SQLAlchemy ORM models
│   │   ├── patient.py         # Patient model + enums
│   │   └── user.py            # User model + UserRole enum
│   ├── routers/               # FastAPI route handlers
│   │   ├── auth.py            # Login, logout, change-password, refresh
│   │   ├── patients.py        # Patient CRUD + photo + email ID card
│   │   └── users.py           # User management (super_admin only)
│   ├── schemas/               # Pydantic request/response schemas
│   │   ├── auth.py            # LoginRequest, TokenResponse, ChangePasswordRequest
│   │   ├── patient.py         # PatientCreate/Update/Response + pagination
│   │   └── user.py            # UserCreate/Update/Response + pagination
│   ├── services/              # Business logic layer
│   │   ├── auth_service.py    # User authentication helpers
│   │   ├── email_service.py   # SMTP email + PDF generation
│   │   ├── patient_service.py # PRN generation, patient CRUD
│   │   └── user_service.py    # User CRUD operations
│   └── utils/                 # Shared utilities
│       ├── security.py        # bcrypt hashing, JWT encode/decode
│       └── validators.py      # Regex validation helpers
├── requirements.txt
├── uploads/                   # Runtime: uploaded photos
│   └── photos/
└── tests/
```

### Frontend Structure
```
frontend/
├── index.html
├── package.json
├── vite.config.ts             # Vite + React plugin, proxy to backend
├── tsconfig.json
├── tailwind.config.js         # Custom primary color palette
├── postcss.config.js
└── src/
    ├── App.tsx                # Root: AuthProvider + Router + Routes
    ├── main.tsx               # ReactDOM.createRoot entry
    ├── index.css              # Tailwind imports + body styles
    ├── vite-env.d.ts          # Env type declarations
    ├── components/
    │   └── common/
    │       ├── Layout.tsx     # App shell: sidebar + header + content
    │       └── ProtectedRoute.tsx  # Auth guard
    ├── contexts/
    │   └── AuthContext.tsx    # Auth state management
    ├── pages/
    │   ├── Login.tsx
    │   ├── Dashboard.tsx
    │   ├── Register.tsx       # Patient registration form
    │   ├── PatientList.tsx    # Paginated patient table
    │   ├── PatientDetail.tsx  # Full patient view + photo upload
    │   ├── PatientIdCard.tsx  # Printable ID card (front+back)
    │   ├── Profile.tsx        # User profile + change password
    │   ├── ChangePassword.tsx # Standalone change password (redirects to Profile)
    │   └── UserManagement.tsx # Super-admin user CRUD
    ├── services/
    │   ├── api.ts             # Axios instance with interceptors
    │   ├── authService.ts     # Auth API + localStorage
    │   ├── patientService.ts  # Patient CRUD + photo + email
    │   └── userService.ts     # User management API
    ├── types/
    │   ├── auth.ts            # LoginCredentials, User, AuthResponse, AuthState
    │   ├── patient.ts         # Patient, PatientListItem, PaginatedResponse
    │   └── user.ts            # UserData, UserCreateData, etc.
    └── utils/
        ├── constants.ts       # Countries, states, phone codes, dropdown options
        └── validation.ts      # Zod schemas for forms
```

### Request Flow
```
Browser → Vite Dev Server (port 3000) → proxy /api → FastAPI (port 8000)
                                                         ↓
                                                   JWT Validation
                                                         ↓
                                                   Router → Service → SQLAlchemy → PostgreSQL
```

---

## 4. Database Design

### 4.1 Entity-Relationship Diagram (Logical)

```
┌─────────────┐       ┌──────────────┐       ┌───────────────┐
│    users     │       │   patients   │       │  audit_logs   │
├─────────────┤       ├──────────────┤       ├───────────────┤
│ id (PK)     │──────<│ created_by   │       │ id (PK)       │
│ username    │──────<│ updated_by   │       │ table_name    │
│ email       │       │ id (PK)      │──────>│ record_id     │
│ password_hash│      │ prn          │       │ action        │
│ full_name   │       │ title        │       │ old_values    │
│ role        │       │ first_name   │       │ new_values    │
│ is_active   │       │ last_name    │       │ user_id (FK)  │
│ last_login  │       │ ...more cols │       │ ip_address    │
│ created_at  │       │ is_active    │       │ created_at    │
│ updated_at  │       │ created_at   │       └───────────────┘
└─────────────┘       │ updated_at   │
                      └──────────────┘
                             │
                      ┌──────────────┐
                      │refresh_tokens│
                      ├──────────────┤
                      │ id (PK)      │
                      │ user_id (FK) │
                      │ token        │
                      │ expires_at   │
                      │ is_revoked   │
                      │ created_at   │
                      └──────────────┘
```

### 4.2 Users Table

```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'staff',
    is_active     BOOLEAN      DEFAULT TRUE,
    last_login    TIMESTAMP,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_role CHECK (role IN (
        'super_admin','admin','doctor','nurse','staff',
        'receptionist','pharmacist','cashier','inventory_manager'
    ))
);
-- Indexes: username, email, role
```

**Roles (9 total):**

| Role | Description |
|---|---|
| `super_admin` | Full system access + user management |
| `admin` | System administration |
| `doctor` | Clinical access |
| `nurse` | Nursing access |
| `receptionist` | Front desk operations |
| `pharmacist` | Pharmacy operations |
| `cashier` | Billing operations |
| `inventory_manager` | Inventory management |
| `staff` | General staff access (default) |

### 4.3 Patients Table

```sql
CREATE TABLE patients (
    id                              SERIAL PRIMARY KEY,
    prn                             VARCHAR(20)  UNIQUE NOT NULL,
    title                           VARCHAR(10)  NOT NULL,
    first_name                      VARCHAR(100) NOT NULL,
    last_name                       VARCHAR(100) NOT NULL,
    date_of_birth                   DATE         NOT NULL,
    gender                          VARCHAR(10)  NOT NULL,
    blood_group                     VARCHAR(5),
    country_code                    VARCHAR(5)   NOT NULL DEFAULT '+91',
    mobile_number                   VARCHAR(15)  UNIQUE NOT NULL,
    email                           VARCHAR(255),
    address_line1                   VARCHAR(255) NOT NULL,
    address_line2                   VARCHAR(255),
    city                            VARCHAR(100),
    state                           VARCHAR(100),
    pin_code                        VARCHAR(10),
    country                         VARCHAR(100) DEFAULT 'India',
    emergency_contact_name          VARCHAR(255),
    emergency_contact_country_code  VARCHAR(5)   DEFAULT '+91',
    emergency_contact_mobile        VARCHAR(15),
    emergency_contact_relationship  VARCHAR(50),
    photo_url                       VARCHAR(500),
    is_active                       BOOLEAN      DEFAULT TRUE,
    created_by                      INTEGER      REFERENCES users(id),
    updated_by                      INTEGER      REFERENCES users(id),
    created_at                      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at                      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
```

**Constraints:**

| Constraint | Rule |
|---|---|
| `chk_title` | `IN ('Mr.','Mrs.','Ms.','Master','Dr.','Prof.','Baby')` |
| `chk_gender` | `IN ('Male','Female','Other')` |
| `chk_blood_group` | `IN ('A+','A-','B+','B-','AB+','AB-','O+','O-') OR NULL` |
| `chk_dob` | `date_of_birth <= CURRENT_DATE` |
| `chk_mobile_format` | `mobile_number ~ '^\d{4,15}$'` |
| `chk_country_code` | `country_code ~ '^\+[0-9]{1,4}$'` |
| `chk_email_format` | Valid email regex OR NULL |
| `chk_pin_code` | `'^[A-Za-z0-9 \-]{3,10}$'` OR NULL |
| `chk_emergency_relationship` | `IN ('Father','Mother','Husband','Wife','Son','Daughter','Brother','Sister','Friend','Guardian','Other') OR NULL` |

**Indexes:** `prn`, `mobile_number`, `email`, `(first_name, last_name)`, `created_at`

### 4.4 PRN Sequence

```sql
CREATE SEQUENCE prn_sequence START WITH 1 INCREMENT BY 1;
```

PRN format: `{PRN_PREFIX}-{6-digit-zero-padded}` → e.g., `HMS-000001`

### 4.5 Audit Logs Table

```sql
CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    table_name  VARCHAR(50)  NOT NULL,
    record_id   INTEGER      NOT NULL,
    action      VARCHAR(20)  NOT NULL,  -- INSERT, UPDATE, DELETE
    old_values  JSONB,
    new_values  JSONB,
    user_id     INTEGER      REFERENCES users(id),
    ip_address  INET,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
```

**Trigger:** Automatically logs all INSERT/UPDATE/DELETE operations on the `patients` table using a `AFTER` trigger.

### 4.6 Refresh Tokens Table

```sql
CREATE TABLE refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER      REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP    NOT NULL,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    is_revoked BOOLEAN      DEFAULT FALSE
);
```

*(Note: Table exists in schema but refresh tokens are not actively used in the current implementation — JWT is stateless.)*

### 4.7 Database Triggers

```sql
-- Auto-update updated_at on row modification
CREATE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Applied to: users, patients

-- Audit trail trigger on patients table
CREATE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_values)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_values)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW));
    END IF;
    RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;
```

---

## 5. Backend API Specification

### Base URL
```
http://localhost:8000/api/v1
```

### 5.1 Authentication Endpoints

#### POST `/auth/login`
- **Auth:** None
- **Request Body:**
  ```json
  { "username": "string", "password": "string" }
  ```
- **Response (200):**
  ```json
  {
    "access_token": "jwt.token.here",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": 1,
      "username": "superadmin",
      "email": "superadmin@hms.com",
      "full_name": "Super Administrator",
      "role": "super_admin"
    }
  }
  ```
- **Errors:** 401 (invalid credentials), 403 (inactive account)
- **Side Effect:** Updates `last_login` timestamp on user record

#### POST `/auth/change-password`
- **Auth:** Bearer token required
- **Request Body:**
  ```json
  { "current_password": "string", "new_password": "string" }
  ```
- **Validation:** New password must have: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char. Must differ from current password.
- **Response (200):** `{ "message": "Password changed successfully" }`
- **Errors:** 400 (wrong current password, same password, weak password)

#### POST `/auth/logout`
- **Auth:** Bearer token required
- **Response (200):** `{ "message": "Successfully logged out" }`
- **Note:** Server-side no-op; client clears token from localStorage

#### POST `/auth/refresh`
- **Auth:** Bearer token required
- **Response (200):**
  ```json
  {
    "access_token": "new.jwt.token",
    "token_type": "bearer",
    "expires_in": 3600
  }
  ```

### 5.2 Patient Endpoints

#### POST `/patients`
- **Auth:** Bearer token required
- **Request Body:**
  ```json
  {
    "title": "Mr.",
    "first_name": "string",
    "last_name": "string",
    "date_of_birth": "YYYY-MM-DD",
    "gender": "Male|Female|Other",
    "blood_group": "A+|A-|B+|B-|AB+|AB-|O+|O-",
    "country_code": "+91",
    "mobile_number": "9876543210",
    "email": "string|null",
    "address_line1": "string",
    "address_line2": "string|null",
    "city": "string|null",
    "state": "string|null",
    "pin_code": "string|null",
    "country": "string|null",
    "emergency_contact_name": "string|null",
    "emergency_contact_country_code": "+91|null",
    "emergency_contact_mobile": "string|null",
    "emergency_contact_relationship": "Father|Mother|...|null"
  }
  ```
- **Response (201):** Full `PatientResponse` object with auto-generated `prn` and `id`
- **Errors:** 400 (duplicate mobile/email), 422 (validation)
- **Logic:** Checks mobile uniqueness, checks email uniqueness (if provided), generates PRN via PostgreSQL sequence, sets `created_by` to current user ID

#### GET `/patients`
- **Auth:** Bearer token required
- **Query Params:**
  - `page` (int, default 1)
  - `limit` (int, default 10, max 100)
  - `search` (string, optional) — searches across `first_name`, `last_name`, `mobile_number`, `email`, `prn`
- **Response (200):**
  ```json
  {
    "total": 42,
    "page": 1,
    "limit": 10,
    "total_pages": 5,
    "data": [
      {
        "id": 1,
        "prn": "HMS-000001",
        "title": "Mr.",
        "first_name": "Praveen",
        "last_name": "S",
        "full_name": "Mr. Praveen S",
        "country_code": "+91",
        "mobile_number": "9876543210",
        "email": "praveen@example.com",
        "city": "Mumbai",
        "blood_group": "O+",
        "created_at": "2026-01-15T10:30:00"
      }
    ]
  }
  ```
- **Search Logic:** Uses `ILIKE` with `OR` across 5 fields. Only returns `is_active = True` patients.

#### GET `/patients/{patient_id}`
- **Auth:** Bearer token required
- **Response (200):** Full `PatientResponse` with all fields
- **Errors:** 404 (not found or inactive)

#### PUT `/patients/{patient_id}`
- **Auth:** Bearer token required
- **Request Body:** Same as create (all fields)
- **Response (200):** Updated `PatientResponse`
- **Errors:** 400 (duplicate mobile/email), 404, 422
- **Logic:** Checks mobile/email uniqueness excluding current patient, sets `updated_by`

#### DELETE `/patients/{patient_id}`
- **Auth:** Bearer token required
- **Response:** 204 No Content
- **Logic:** Soft-delete — sets `is_active = False`, sets `updated_by`

#### POST `/patients/{patient_id}/photo`
- **Auth:** Bearer token required
- **Request:** Multipart form with `photo` file field
- **Validation:** JPEG/PNG/WebP only, max 5MB
- **Logic:** Saves to `uploads/photos/{uuid}.{ext}`, deletes old photo if exists, updates `photo_url` to `/uploads/photos/{filename}`
- **Response (200):** Updated `PatientResponse` with new `photo_url`

#### POST `/patients/{patient_id}/email-id-card`
- **Auth:** Bearer token required
- **Request:** Optional multipart form with `pdf_file` field (frontend-rendered PDF)
- **Logic:** If `pdf_file` provided, emails that PDF. Otherwise generates server-side PDF using xhtml2pdf. Emails to patient's email address.
- **Response (200):** `{ "message": "ID card sent to patient@email.com" }`
- **Errors:** 400 (no email), 500 (SMTP not configured)

### 5.3 User Management Endpoints (Super Admin Only)

All endpoints require `super_admin` role — enforced via `require_super_admin` dependency.

#### GET `/users`
- **Query Params:** `page`, `limit`, `search` (searches username, full_name, email)
- **Response (200):**
  ```json
  {
    "total": 4,
    "page": 1,
    "limit": 10,
    "total_pages": 1,
    "data": [
      {
        "id": 1,
        "username": "superadmin",
        "email": "superadmin@hms.com",
        "full_name": "Super Administrator",
        "role": "super_admin",
        "is_active": true,
        "last_login": "2026-02-15T09:00:00",
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-02-15T09:00:00"
      }
    ]
  }
  ```

#### POST `/users`
- **Query Param:** `send_email` (bool, default true) — sends credentials via email
- **Request Body:**
  ```json
  {
    "username": "string",  // 3-50 chars, alphanumeric+underscore, auto-lowercased
    "email": "string",
    "password": "string",  // 8-128 chars, strong password rules
    "full_name": "string",
    "role": "staff"        // one of 9 valid roles
  }
  ```
- **Response (201):** `UserResponse`
- **Errors:** 400 (duplicate username/email), 422 (validation)

#### GET `/users/{user_id}`
- **Response (200):** `UserResponse`

#### PUT `/users/{user_id}`
- **Request Body (all optional):**
  ```json
  {
    "email": "string",
    "full_name": "string",
    "role": "string",
    "is_active": true
  }
  ```
- **Response (200):** Updated `UserResponse`

#### DELETE `/users/{user_id}`
- **Response:** 204 No Content
- **Guards:** Cannot delete yourself. Cannot delete the last `super_admin`.
- **Logic:** Soft-delete (`is_active = False`)

#### POST `/users/{user_id}/reset-password`
- **Query Param:** `send_email` (bool, default false)
- **Request Body:** `{ "new_password": "string" }`
- **Response (200):** `{ "message": "...", "email_sent": true/false }`

#### POST `/users/{user_id}/send-password`
- **Request Body:** `{ "new_password": "string" }`
- **Logic:** Sets password AND sends credentials via email
- **Response (200):** `{ "message": "...", "email_sent": true/false }`

### 5.4 Config Endpoints

#### GET `/config/hospital`
- **Auth:** None
- **Response (200):**
  ```json
  {
    "hospital_name": "City General Hospital",
    "hospital_address": "123 Medical Center Road",
    "hospital_city": "Mumbai",
    "hospital_state": "Maharashtra",
    "hospital_country": "India",
    "hospital_pin_code": "400001",
    "hospital_phone": "+91 22 1234 5678",
    "hospital_email": "info@hospital.com",
    "hospital_website": "www.hospital.com"
  }
  ```

### 5.5 Health & Root Endpoints

| Method | Path | Response |
|---|---|---|
| GET | `/` | `{ "name": "...", "version": "1.0.0", "status": "operational" }` |
| GET | `/health` | `{ "status": "healthy" }` |

### 5.6 Static Files

| Path | Serves |
|---|---|
| `/uploads/photos/{filename}` | Patient photos |

---

## 6. Authentication & Authorization

### 6.1 JWT Token Structure

**Algorithm:** HS256
**Token payload:**
```json
{
  "user_id": 1,
  "username": "superadmin",
  "role": "super_admin",
  "exp": 1739700000,
  "type": "access"
}
```
**Default expiry:** 60 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)

### 6.2 Password Hashing
- **Algorithm:** bcrypt with 12 salt rounds
- **Library:** `bcrypt` Python package

### 6.3 Password Requirements (for change-password and user creation)
- Minimum 8 characters
- At least 1 uppercase letter (`[A-Z]`)
- At least 1 lowercase letter (`[a-z]`)
- At least 1 digit (`[0-9]`)
- At least 1 special character (`[!@#$%^&*(),.?":{}|<>]`)

### 6.4 Auth Flow
1. Client sends `POST /auth/login` with username/password
2. Server validates credentials, returns JWT + user info
3. Client stores `access_token` and `user` JSON in `localStorage`
4. All subsequent requests include `Authorization: Bearer <token>` header
5. On 401 response, client clears localStorage and redirects to `/login`

### 6.5 Role-Based Access
| Feature | Allowed Roles |
|---|---|
| Login, Dashboard, Patient CRUD | All authenticated users |
| User Management | `super_admin` only |
| Sidebar "User Management" link | Visible only for `super_admin` |
| Dashboard "User Management" card | Visible only for `super_admin` |

### 6.6 Auth Dependencies (FastAPI)
```
get_current_user          → Validates JWT, loads User from DB, checks is_active
get_current_active_user   → Wrapper around get_current_user
require_super_admin       → Checks role == 'super_admin'
```

---

## 7. Frontend Application Specification

### 7.1 Routing

| Route | Component | Auth | Description |
|---|---|---|---|
| `/login` | Login | Public | Login page |
| `/dashboard` | Dashboard | Protected | Main dashboard with action cards |
| `/register` | Register | Protected | Patient registration form |
| `/patients` | PatientList | Protected | Paginated patient table |
| `/patients/:id` | PatientDetail | Protected | Full patient details + photo |
| `/patients/:id/id-card` | PatientIdCard | Protected | Printable ID card |
| `/user-management` | UserManagement | Protected | Super-admin user CRUD |
| `/profile` | Profile | Protected | User profile + change password |
| `/change-password` | — | Redirect | Redirects to `/profile` |
| `/` | — | Redirect | Redirects to `/dashboard` |
| `*` (catch-all) | — | Redirect | Redirects to `/dashboard` |

All protected routes are wrapped in `<ProtectedRoute>` + `<Layout>`.

### 7.2 Layout (App Shell)

**Components:**
- **Top Header Bar** (fixed, z-30):
  - Left: Hamburger menu (mobile), "HMS" brand text
  - Right: User's full_name (role), Profile button (UserCircle icon), Logout button
- **Sidebar** (fixed on desktop, slide-in on mobile):
  - Navigation items with icons:
    1. Dashboard (LayoutDashboard icon)
    2. Patients (Users icon)
    3. Register Patient (UserPlus icon)
    4. User Management (Settings icon) — **only for `super_admin`**
  - Active item has blue highlight (`bg-primary-50 text-primary-700`)
- **Mobile Overlay:** Semi-transparent black backdrop when sidebar open
- **Main Content Area:** `flex-1 p-6`

### 7.3 Page Specifications

#### Login Page
- **Layout:** Full-screen gradient background (`from-primary-50 to-primary-100`), centered card
- **Elements:**
  - Lock icon in circle
  - Title: "Hospital Management"
  - Subtitle: "Sign in to your account"
  - Error banner (red, with AlertCircle icon)
  - Username field (User icon prefix)
  - Password field (Lock icon prefix)
  - Submit button: "Sign In" / "Signing in..." (disabled while loading)
  - Footer: "Hospital Management System © 2026"
- **Validation:** react-hook-form + Zod (`loginSchema`: username min 3, password min 6)
- **On success:** Navigate to `/dashboard`

#### Dashboard Page
- **Header:** "Dashboard" title, welcome message with user name and role
- **Action Cards** (grid 1-4 cols):
  1. Register Patient (blue, UserPlus) → navigates to `/register`
  2. View Patients (green, Users) → navigates to `/patients`
  3. System Status (yellow, Activity) — static "All systems operational"
  4. Security (purple, Shield) — static "HIPAA compliant data handling"
  5. User Management (red, Settings) → navigates to `/user-management` — **super_admin only**
- **Quick Info Section** (bottom):
  - Your Role badge (primary colored)
  - System Status: "Online" (green)
  - API Version: "v1.0" (yellow)

#### Patient Registration Page (Register)
- **Header:** Back button → Dashboard, "Patient Registration" title with UserPlus icon
- **Success banner:** Green, auto-redirects to `/patients` after 2 seconds
- **Error banner:** Red with error message
- **Form sections (4):**
  1. **Personal Details** (6-column grid):
     - Title (select, required) — 7 options
     - First Name (text, required)
     - Last Name (text, required)
     - Gender (select, required) — 3 options
     - Date of Birth (date picker, required)
     - Blood Group (select, optional) — 8 options
     - Email (email, optional)
  2. **Contact Details** (6-column grid):
     - Country Code (select, required) — from 38+ countries
     - Mobile Number (tel, required)
  3. **Address** (6-column grid):
     - Address Line 1 (text, required, min 5 chars)
     - Address Line 2 (text, optional)
     - State/Province (select if country has states, else text input)
     - City (text, optional)
     - Postal Code (text, optional) — label changes per country
     - Country (select) — 38+ countries
  4. **Emergency Contact** (6-column grid):
     - Contact Name (text, optional)
     - Relationship (select, optional) — 11 options
     - Country Code (select, optional)
     - Contact Mobile (tel, optional)
- **Smart behaviors:**
  - Selecting a state auto-populates the country
  - Changing country auto-updates the phone country code
  - Postal code label changes per country (PIN Code, ZIP Code, Postcode, etc.)
- **Actions:** Cancel → Dashboard, Register Patient (submit)
- **Validation:** Zod `patientSchema`

#### Patient List Page
- **Header:** "Patients" title with total count, "Add Patient" button
- **Search bar:** Text input with Search icon, searches on form submit
- **Table columns:** PRN, Patient Name, Mobile, Email (hidden <md), Blood Group (hidden <sm), Registered Date (hidden <lg), Actions
- **Row actions:** View (Eye icon → `/patients/{id}`), Delete (Trash2 icon, with confirmation dialog)
- **Pagination:** "Page X of Y" with prev/next chevron buttons
- **Empty state:** "No patients found"
- **Loading state:** Spinner

#### Patient Detail Page
- **Header:** Back button → Patients list, "View ID Card" button (green, CreditCard icon)
- **Photo section:** Patient photo in header with hover overlay for upload (Camera icon). Supports JPEG/PNG/WebP ≤5MB.
- **Hero header:** Blue background (`bg-primary-600`) with photo, full name, PRN badge, gender, DOB, blood group badge
- **Detail sections:**
  1. Personal Information (3-col grid): Title, First Name, Last Name, Gender, DOB, Blood Group
  2. Contact Information (2-col grid): Mobile with country code (Phone icon), Email (Mail icon)
  3. Address: Full address with MapPin icon
  4. Emergency Contact (3-col grid, yellow background): Name, Relationship (Heart icon), Mobile — only if contact exists
  5. Metadata footer: PRN, Created date, Updated date

#### Patient ID Card Page
- **Header:** Back button, "Patient ID Card" title, action buttons
- **Action buttons:**
  1. Download PDF (primary blue)
  2. Print (gray)
  3. Email to Patient (green) — disabled if no email
- **Warning banner:** "Patient does not have an email address" if no email
- **ID Card layout:**
  - **Front side** (440×270px, sky blue theme):
    - Header bar: Hospital name, "Patient Identity Card", PRN
    - Body: Photo (80×96px), Name, DOB (with age), Gender, Blood Group (red), Mobile
    - Footer: Emergency contact info
  - **Fold line:** "--- ✂ Fold Here ✂ ---"
  - **Back side** (440×270px, white):
    - Header bar: Hospital name
    - Hospital details: Address, City/State, Country, Phone, Email, Website
    - Footer: "This card is property of [hospital]. If found, return to above address."
- **PDF generation:**
  - Uses `html2canvas` (scale 3x) to capture front + back as images
  - Creates `jsPDF` document: 86mm × 54mm cards with 10mm margins, fold line between front and back
  - Supports download as file and print via new window
- **Email:** Sends the generated PDF blob via `POST /patients/{id}/email-id-card` as multipart form

#### Profile Page
- **Header:** "My Profile" title
- **Profile card:**
  - Gradient hero banner (`from-primary-600 via-primary-700 to-primary-800`) with decorative circles
  - Centered avatar (UserCircle icon, 24×24px with white border)
  - Full name, role badge (color-coded per role)
  - Details grid (2-col): Username (AtSign icon), Email (Mail icon), Password (masked, Lock icon)
- **Change Password section** (collapsible with ChevronDown):
  - Accordion header: KeyRound icon, "Change Password", "Update your account password"
  - Form fields: Current Password, New Password (with strength indicators), Confirm Password
  - Password visibility toggles (Eye/EyeOff)
  - Match/mismatch feedback
  - Actions: Cancel, Update Password

**Role badge colors:**
| Role | Color |
|---|---|
| `super_admin` | `bg-red-100 text-red-700` |
| `admin` | `bg-orange-100 text-orange-700` |
| `doctor` | `bg-blue-100 text-blue-700` |
| `nurse` | `bg-teal-100 text-teal-700` |
| `staff` | `bg-gray-100 text-gray-700` |
| `receptionist` | `bg-purple-100 text-purple-700` |
| `pharmacist` | `bg-green-100 text-green-700` |
| `cashier` | `bg-yellow-100 text-yellow-700` |
| `inventory_manager` | `bg-indigo-100 text-indigo-700` |

#### User Management Page (Super Admin Only)
- **Access guard:** Shows "Access Denied" if not `super_admin`
- **Header:** "User Management" title with total count, "Add User" button
- **Search bar:** Text input
- **User table columns:** Username, Full Name, Email, Role (color badge), Status (active/inactive badge), Last Login, Actions
- **Row actions:** Edit (Pencil), Reset Password (KeyRound), Send Password via Email (Mail), Delete (Trash2)
- **Modals (3):**
  1. **Create User Modal:**
     - Fields: Username, Email, Password (with visibility toggle), Full Name, Role (select)
     - Checkbox: "Send login credentials via email"
     - Actions: Cancel, Create User
  2. **Edit User Modal:**
     - Fields: Email, Full Name, Role (select), Active toggle (checkbox)
     - Actions: Cancel, Update User
  3. **Reset Password Modal:**
     - Field: New Password (with visibility toggle)
     - Checkbox: "Send new password via email"
     - Actions: Cancel, Reset Password
- **Delete confirmation:** `window.confirm()` dialog, prevents self-delete
- **Pagination:** Same pattern as Patient List

---

## 8. Feature Specifications

### 8.1 PRN (Patient Reference Number) Generation
- **Format:** `{PRN_PREFIX}-{6-digit-zero-padded-number}`
- **Example:** `HMS-000001`, `HMS-000042`
- **Mechanism:** PostgreSQL sequence (`prn_sequence`) for thread-safe auto-increment
- **Configuration:** `PRN_PREFIX` env variable, default `"HMS"`
- **Backend code logic:**
  ```python
  next_val = db.execute(prn_sequence.next_value()).scalar()
  prn = f"{settings.PRN_PREFIX}-{next_val:06d}"
  ```

### 8.2 Patient Photo Upload
- **Allowed types:** `image/jpeg`, `image/png`, `image/webp`
- **Max size:** 5MB
- **Storage path:** `backend/uploads/photos/{uuid4}.{extension}`
- **URL format:** `/uploads/photos/{filename}` (served as static files)
- **Old photo cleanup:** Previous photo file is deleted from disk when a new one is uploaded
- **Display URL construction:** `API_BASE_URL.replace('/api/v1', '') + photo_url`

### 8.3 Soft Delete Pattern
Both patients and users use soft-delete:
- Set `is_active = False` instead of physical deletion
- All list queries filter by `is_active = True`
- Single-record fetches also check `is_active = True`

### 8.4 Pagination Pattern
Used consistently across patients and users:
```json
{
  "total": 42,
  "page": 1,
  "limit": 10,
  "total_pages": 5,
  "data": [...]
}
```
- `total_pages = ceil(total / limit)`
- Default `limit = 10`, max `limit = 100`
- Backend calculates `offset = (page - 1) * limit`

### 8.5 Search Pattern
- **Patients:** Searches across `first_name`, `last_name`, `mobile_number`, `email`, `prn` using `ILIKE '%search%'` with `OR`
- **Users:** Searches across `username`, `full_name`, `email` using `ILIKE '%search%'` with `OR`
- Search resets page to 1

---

## 9. Data Validation Rules

### 9.1 Backend (Pydantic) Validation

#### Patient Fields
| Field | Type | Required | Validation |
|---|---|---|---|
| `title` | string | Yes | One of: `Mr.`, `Mrs.`, `Ms.`, `Master`, `Dr.`, `Prof.`, `Baby` |
| `first_name` | string | Yes | 1–100 chars |
| `last_name` | string | Yes | 1–100 chars |
| `date_of_birth` | date | Yes | Not in future, not more than 150 years ago |
| `gender` | string | Yes | One of: `Male`, `Female`, `Other` |
| `blood_group` | string | No | One of: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` |
| `country_code` | string | Yes | Regex: `^\+[0-9]{1,4}$`, default `+91` |
| `mobile_number` | string | Yes | Regex: `^\d{4,15}$` (digits only, 4-15 chars) |
| `email` | EmailStr | No | Valid email format |
| `address_line1` | string | Yes | Min 1 char |
| `address_line2` | string | No | |
| `city` | string | No | |
| `state` | string | No | |
| `pin_code` | string | No | Regex: `^[A-Za-z0-9 \-]{3,10}$` |
| `country` | string | No | Default `"India"` |
| `emergency_contact_name` | string | No | |
| `emergency_contact_country_code` | string | No | Regex: `^\+[0-9]{1,4}$` |
| `emergency_contact_mobile` | string | No | Regex: `^\d{4,15}$` |
| `emergency_contact_relationship` | string | No | One of: `Father`, `Mother`, `Husband`, `Wife`, `Son`, `Daughter`, `Brother`, `Sister`, `Friend`, `Guardian`, `Other` |

#### User Fields
| Field | Type | Required | Validation |
|---|---|---|---|
| `username` | string | Yes | 3–50 chars, alphanumeric + underscore only, auto-lowercased |
| `email` | EmailStr | Yes | Valid email |
| `password` | string | Yes | 8–128 chars, strong password regex |
| `full_name` | string | Yes | Non-empty |
| `role` | string | Yes | One of 9 valid roles, default `staff` |

### 9.2 Frontend (Zod) Validation

**Login Schema:**
- `username`: min 3 chars
- `password`: min 6 chars

**Patient Schema:**
- `title`: enum (7 values)
- `first_name`: 1–100 chars
- `last_name`: 1–100 chars
- `date_of_birth`: `YYYY-MM-DD` format
- `gender`: enum (`Male`, `Female`, `Other`)
- `blood_group`: optional enum (8 values) or empty string
- `country_code`: regex `^\+[0-9]{1,4}$`, default `+91`
- `mobile_number`: regex `^\d{4,15}$`, 4–15 digits
- `email`: optional valid email or empty
- `address_line1`: min 5 chars
- `pin_code`: optional regex `^[A-Za-z0-9 \-]{3,10}$` or empty
- `emergency_contact_mobile`: optional regex `^\d{4,15}$` or empty
- `emergency_contact_relationship`: optional enum (11 values) or empty

---

## 10. Constants & Reference Data

### 10.1 Title Options
`Mr.` | `Mrs.` | `Ms.` | `Master` | `Dr.` | `Prof.` | `Baby`

### 10.2 Gender Options
`Male` | `Female` | `Other`

### 10.3 Blood Group Options
`A+` | `A-` | `B+` | `B-` | `AB+` | `AB-` | `O+` | `O-`

### 10.4 Relationship Options
`Father` | `Mother` | `Husband` | `Wife` | `Son` | `Daughter` | `Brother` | `Sister` | `Friend` | `Guardian` | `Other`

### 10.5 User Roles
`super_admin` | `admin` | `doctor` | `nurse` | `staff` | `receptionist` | `pharmacist` | `cashier` | `inventory_manager`

### 10.6 Countries (38 countries with phone codes)

| Country | Code | Phone Code | Postal Code Label | Has State List |
|---|---|---|---|---|
| India | IN | +91 | PIN Code | Yes (36 states/UTs) |
| United States | US | +1 | ZIP Code | Yes (51 incl. DC) |
| United Kingdom | GB | +44 | Postcode | Yes (11 regions) |
| Canada | CA | +1 | Postal Code | Yes (13 provinces) |
| Australia | AU | +61 | Postcode | Yes (8 states) |
| United Arab Emirates | AE | +971 | Postal Code | Yes (7 emirates) |
| Saudi Arabia | SA | +966 | Postal Code | Yes (13 regions) |
| Germany | DE | +49 | Postleitzahl | Yes (16 states) |
| Malaysia | MY | +60 | Postcode | Yes (16 states) |
| Nepal | NP | +977 | Postal Code | Yes (7 provinces) |
| Sri Lanka | LK | +94 | Postal Code | Yes (9 provinces) |
| Bangladesh | BD | +880 | Postal Code | Yes (8 divisions) |
| Pakistan | PK | +92 | Postal Code | Yes (7 regions) |
| Singapore | SG | +65 | Postal Code | No |
| Qatar | QA | +974 | Postal Code | No |
| Oman | OM | +968 | Postal Code | No |
| Kuwait | KW | +965 | Postal Code | No |
| Bahrain | BH | +973 | Postal Code | No |
| France | FR | +33 | Code Postal | No |
| Japan | JP | +81 | Postal Code | No |
| China | CN | +86 | Postal Code | No |
| South Korea | KR | +82 | Postal Code | No |
| Italy | IT | +39 | CAP | No |
| Spain | ES | +34 | Código Postal | No |
| Brazil | BR | +55 | CEP | No |
| Mexico | MX | +52 | Código Postal | No |
| South Africa | ZA | +27 | Postal Code | No |
| Nigeria | NG | +234 | Postal Code | No |
| Egypt | EG | +20 | Postal Code | No |
| Russia | RU | +7 | Postal Code | No |
| Indonesia | ID | +62 | Postal Code | No |
| Thailand | TH | +66 | Postal Code | No |
| Vietnam | VN | +84 | Postal Code | No |
| Philippines | PH | +63 | ZIP Code | No |
| Turkey | TR | +90 | Postal Code | No |
| New Zealand | NZ | +64 | Postcode | No |
| Afghanistan | AF | +93 | Postal Code | No |
| Iran | IR | +98 | Postal Code | No |
| Iraq | IQ | +964 | Postal Code | No |

### 10.7 Smart Form Behaviors
1. **State → Country auto-populate:** A reverse lookup map (`STATE_COUNTRY_MAP`) maps each state name to its country. When a user selects a state, the country field auto-updates.
2. **Country → Phone code auto-update:** When the country changes, the phone country code dropdown updates to match.
3. **Country → States list:** Only countries with defined state lists show a dropdown; others show a free-text input.
4. **Country → Postal code label:** Label dynamically changes (PIN Code, ZIP Code, Postcode, etc.)

---

## 11. Email & PDF Services

### 11.1 Email Service

**SMTP Configuration (env vars):**
| Variable | Default |
|---|---|
| `SMTP_HOST` | (empty) |
| `SMTP_PORT` | 587 |
| `SMTP_USERNAME` | (empty) |
| `SMTP_PASSWORD` | (empty) |
| `SMTP_FROM_EMAIL` | `noreply@hospital.com` |
| `SMTP_FROM_NAME` | `Hospital Management System` |

**Email Functions:**
1. **`send_email(to_email, subject, html_body, attachments=[])`**
   - TLS/SSL negotiation
   - HTML body with optional file attachments
   - Error handling for auth failures, recipient refusal, connection errors

2. **`send_password_email(to_email, username, password, full_name)`**
   - Branded HTML template with hospital header/footer
   - Contains: username, temporary password, security notice
   - Subject: "Your Hospital Management System Account Credentials"

3. **`send_patient_id_card_email(patient, hospital_config, pdf_bytes=None)`**
   - If PDF bytes provided by frontend, uses those
   - Otherwise generates PDF server-side via xhtml2pdf
   - Attaches as `ID-Card-{PRN}.pdf`
   - Subject: "Your Patient ID Card — {hospital_name}"

### 11.2 Email HTML Template Structure
```html
<div style="font-family: Arial; max-width: 600px; margin: auto;">
  <!-- Header: Hospital name on blue background -->
  <!-- Body content -->
  <!-- Footer: Hospital name, do-not-reply notice, copyright -->
</div>
```

### 11.3 PDF Generation

**Client-side (primary):**
- Library: `html2canvas` + `jsPDF`
- Renders HTML divs (front + back of ID card) to canvas at 3x scale
- Creates PDF with card dimensions (86mm × 54mm) plus margins
- Adds fold line between front and back

**Server-side (fallback):**
- Library: `xhtml2pdf`
- Generates HTML for front and back card using inline CSS
- Converts to PDF bytes for email attachment

---

## 12. Environment Configuration

### Backend `.env` File

```env
# ─── Application ───────────────────────
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True

# ─── Database ──────────────────────────
DATABASE_URL=postgresql://hospital_admin:<password>@localhost:5432/hospital_management
DB_ECHO=False

# ─── Security ─────────────────────────
SECRET_KEY=<min-32-char-random-string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# ─── CORS ─────────────────────────────
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]

# ─── Pagination ───────────────────────
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# ─── Patient ──────────────────────────
PRN_PREFIX=HMS

# ─── File Uploads ─────────────────────
UPLOAD_DIR=<path-to-backend>/uploads
MAX_PHOTO_SIZE_MB=5

# ─── SMTP Email ───────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@hospital.com
SMTP_FROM_NAME=Hospital Management System

# ─── Hospital Identity ────────────────
HOSPITAL_NAME=City General Hospital
HOSPITAL_ADDRESS=123 Medical Center Road
HOSPITAL_CITY=Mumbai
HOSPITAL_STATE=Maharashtra
HOSPITAL_COUNTRY=India
HOSPITAL_PIN_CODE=400001
HOSPITAL_PHONE=+91 22 1234 5678
HOSPITAL_EMAIL=info@hospital.com
HOSPITAL_WEBSITE=www.hospital.com
```

### Frontend `.env` File
```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Frontend Vite Config
```typescript
// vite.config.ts
{
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 3000,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } }
  }
}
```

### Tailwind Custom Theme
```javascript
// tailwind.config.js
theme: {
  extend: {
    colors: {
      primary: {
        50:  '#f0f9ff',
        100: '#e0f2fe',
        200: '#bae6fd',
        300: '#7dd3fc',
        400: '#38bdf8',
        500: '#0ea5e9',
        600: '#0284c7',  // Main brand color (sky blue)
        700: '#0369a1',
        800: '#075985',
        900: '#0c4a6e',
      }
    }
  }
}
```

---

## 13. File Upload Handling

### Patient Photo Upload Flow
1. Frontend validates file type (JPEG/PNG/WebP) and size (≤5MB) client-side
2. Sends `POST /patients/{id}/photo` with `multipart/form-data`, field name `photo`
3. Backend validates file type and size again server-side
4. Generates unique filename: `{uuid4}.{extension}`
5. Saves to `{UPLOAD_DIR}/photos/{filename}`
6. If patient had a previous photo, deletes the old file from disk
7. Updates `patient.photo_url` to `/uploads/photos/{filename}`
8. Returns updated patient response
9. Frontend constructs display URL: `API_BASE.replace('/api/v1', '') + photo_url`

### Email ID Card PDF Upload Flow
1. Frontend generates PDF blob using html2canvas + jsPDF
2. Sends `POST /patients/{id}/email-id-card` with `multipart/form-data`, field name `pdf_file`
3. If `pdf_file` is provided, backend uses it directly as email attachment
4. If not provided, backend generates PDF server-side using xhtml2pdf
5. Emails PDF to patient's email address

---

## 14. Error Handling Patterns

### Backend
- **Global SQLAlchemy exception handler:** Returns 500 with generic message
- **Global unhandled exception handler:** Logs traceback, returns 500
- **Per-endpoint validation:** Returns 422 with Pydantic validation details
- **Business logic errors:** Returns 400/401/403/404 with `detail` string

### Frontend
- **Axios 401 interceptor:** Clears auth data, redirects to `/login`
- **Error display pattern:** Red banner with AlertCircle icon, error text from `err.response?.data?.detail`
- **Success display pattern:** Green banner with CheckCircle icon
- **Loading state:** Spinning circle (`animate-spin rounded-full border-b-2 border-primary-600`)
- **Error detail parsing:** Handles both string and array `detail` formats from backend

---

## 15. Setup & Deployment

### Prerequisites
- PostgreSQL 15+
- Python 3.11+
- Node.js 18+

### Database Setup (Fresh Install)
```bash
# Step 1: Create DB, user, permissions (as postgres superuser)
psql -U postgres -f database/scripts/000_setup_database.sql

# Step 2: Create tables (as hospital_admin)
psql -U hospital_admin -d hospital_management -f database/scripts/001_create_schema.sql

# Step 3: Apply global/user-management updates
psql -U hospital_admin -d hospital_management -f database/scripts/003_global_and_user_mgmt.sql

# Step 4: Seed test data
psql -U hospital_admin -d hospital_management -f database/seeds/seed_data.sql
```

### Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
# Create .env file with configuration
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev                  # Starts on port 3000
```

### Default Seed Credentials
| Username | Role | Notes |
|---|---|---|
| `superadmin` | Super Admin | Full access + user management |
| `admin` | Admin | Standard admin |
| `doctor1` | Doctor | Clinical access |
| `nurse1` | Nurse | Nursing access |

*(Passwords are bcrypt-hashed in seed; check TESTING_GUIDE.md or reset via superadmin)*

### API Documentation
- **Swagger UI:** `http://localhost:8000/api/docs`
- **ReDoc:** `http://localhost:8000/api/redoc`

---

## Appendix A: Seed Data (Sample Patients)

| PRN | Name | Gender | Blood | Mobile | City | State |
|---|---|---|---|---|---|---|
| HMS-000001 | Mr. Praveen S | Male | O+ | +91 9876543210 | Mumbai | Maharashtra |
| HMS-000002 | Mrs. Pavithran K | Female | A+ | +91 9876543211 | Chennai | Tamil Nadu |
| HMS-000003 | Ms. Subhasini R T | Female | B+ | +91 9999888877 | Bengaluru | Karnataka |
| HMS-000004 | Mr. Naveen Raj B | Male | AB- | +91 8888777766 | Chennai | Tamil Nadu |

---

## Appendix B: Icon Usage (lucide-react)

| Icon | Used For |
|---|---|
| `LayoutDashboard` | Dashboard nav item |
| `Users` | Patients nav item, View Patients card |
| `UserPlus` | Register Patient nav/card |
| `Settings` | User Management nav/card |
| `LogOut` | Logout button |
| `UserCircle` | Profile button, avatar |
| `Menu` / `X` | Mobile hamburger menu |
| `Lock` | Login icon, password fields |
| `User` | Username field, patient avatar placeholder |
| `AlertCircle` | Error alerts |
| `CheckCircle` | Success alerts |
| `Search` | Search input |
| `Eye` / `EyeOff` | Password visibility toggles |
| `ArrowLeft` | Back buttons |
| `ChevronLeft` / `ChevronRight` | Pagination |
| `ChevronDown` | Accordion toggle |
| `Pencil` | Edit button |
| `Trash2` | Delete button |
| `KeyRound` | Password reset, change password |
| `Mail` | Email field, send email buttons |
| `Phone` | Phone display |
| `MapPin` | Address display |
| `Droplets` | Blood group badge |
| `Hash` | PRN badge |
| `Heart` | Relationship display |
| `CreditCard` | View ID Card button |
| `Camera` | Photo upload overlay |
| `Printer` | Print button |
| `Download` | Download PDF button |
| `Activity` | System status card |
| `Shield` | Security card, change password header |
| `AtSign` | Username display |
| `Plus` | Add user button |

---

## Appendix C: API Axios Configuration

```typescript
// Base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

// Request interceptor: Adds Bearer token from localStorage
// Response interceptor: On 401, clears auth and redirects to /login

// Auth data stored in localStorage:
//   'access_token' → JWT string
//   'user' → JSON.stringify(UserResponse)
```

---

## Appendix D: Database Migration Order

**Fresh install:**
```
000_setup_database.sql → 001_create_schema.sql → 003_global_and_user_mgmt.sql → seed_data.sql
```

**Existing DB with old schema:**
```
002_migrate_patient_fields.sql → 003_add_patient_photo.sql → 003_global_and_user_mgmt.sql
```

---

*This document was auto-generated from the full source code analysis of the Hospital Management System project on February 15, 2026.*
