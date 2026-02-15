# Hospital Management System (HMS) — Complete Project Documentation

> **Version:** 1.0.0  
> **Last Updated:** February 12, 2026  
> **Project Type:** Full-Stack Web Application  
> **Architecture:** REST API Backend + SPA Frontend

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Database Design](#6-database-design)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [API Endpoints Reference](#8-api-endpoints-reference)
9. [Core Features & Modules](#9-core-features--modules)
10. [Data Validation Strategy](#10-data-validation-strategy)
11. [International Support](#11-international-support)
12. [Email Service](#12-email-service)
13. [Security Measures](#13-security-measures)
14. [Environment Configuration](#14-environment-configuration)
15. [Database Migration Strategy](#15-database-migration-strategy)
16. [Setup & Installation Guide](#16-setup--installation-guide)
17. [Default Credentials](#17-default-credentials)
18. [Important Design Decisions](#18-important-design-decisions)

---

## 1. Project Overview

The **Hospital Management System (HMS)** is a full-stack web application designed to manage hospital operations including patient registration, user management, and hospital configuration. The system follows a clean separation of concerns with a Python FastAPI backend serving a React TypeScript frontend.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Patient Registration** | Register patients with auto-generated PRN (Patient Reference Number) |
| **Patient Management** | Full CRUD operations with search, pagination, soft delete |
| **Patient ID Card** | Generate printable front/back ID cards with hospital branding |
| **User Management** | Role-based user CRUD (Super Admin only) with 9 distinct roles |
| **Hospital Configuration** | One-time hospital setup with logo upload, legal details, operations info |
| **Email Notifications** | Send account credentials and patient ID cards via SMTP email |
| **Authentication** | JWT-based authentication with role-based access control (RBAC) |
| **International Support** | Multi-country phone codes, postal formats, state/region data for 35+ countries |
| **Audit Logging** | Database-level audit triggers for all patient record changes |

---

## 2. Technology Stack

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Python** | 3.10+ | Core programming language |
| **FastAPI** | 0.109.0 | Async web framework with auto-generated OpenAPI docs |
| **Uvicorn** | 0.27.0 | ASGI server for running the FastAPI app |
| **SQLAlchemy** | 2.0.25 | ORM for database operations |
| **PostgreSQL** | 15+ | Relational database |
| **psycopg2-binary** | 2.9.9 | PostgreSQL adapter for Python |
| **python-jose** | 3.3.0 | JWT token creation and verification |
| **bcrypt** | 4.0+ | Password hashing (12 rounds) |
| **Pydantic** | 2.5.3 | Data validation and serialization |
| **pydantic-settings** | 2.1.0 | Environment-based configuration management |
| **Alembic** | 1.13.1 | Database migration tool |
| **Jinja2** | 3.1.3 | HTML template rendering (email templates) |
| **email-validator** | 2.1.0 | Email format validation |
| **python-dotenv** | 1.0.0 | .env file loading |
| **python-multipart** | 0.0.6 | File upload handling (multipart/form-data) |

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19.0.0 | UI library |
| **TypeScript** | 5.3.3 | Type-safe JavaScript |
| **Vite** | 5.0.11 | Build tool and dev server |
| **React Router DOM** | 6.21.3 | Client-side routing |
| **Axios** | 1.6.5 | HTTP client for API calls |
| **React Hook Form** | 7.49.3 | Form state management and validation |
| **Zod** | 3.22.4 | Schema-based form validation |
| **@hookform/resolvers** | 3.3.4 | Zod integration with React Hook Form |
| **Tailwind CSS** | 3.4.1 | Utility-first CSS framework |
| **Lucide React** | 0.474.0 | Icon library |
| **date-fns** | 3.2.0 | Date formatting utilities |
| **clsx + tailwind-merge** | 2.1.0 / 2.2.0 | Conditional CSS class merging |

### Infrastructure

| Component | Details |
|-----------|---------|
| **Database** | PostgreSQL 15+ with pgcrypto extension |
| **API Protocol** | REST API with JSON payloads |
| **API Versioning** | URL-based (`/api/v1/`) |
| **CORS** | Configured for `localhost:3000` and `localhost:5173` |
| **Dev Proxy** | Vite proxies `/api` requests to backend at `localhost:8000` |

---

## 3. Project Structure

```
task-1/
├── backend/                          # Python FastAPI backend
│   ├── requirements.txt              # Python dependencies
│   ├── .env                          # Environment variables (not committed)
│   ├── app/                          # Application package
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app entry point & router registration
│   │   ├── config.py                 # Pydantic settings (env-based configuration)
│   │   ├── database.py               # SQLAlchemy engine, session, and Base
│   │   ├── dependencies.py           # Auth dependency injection (JWT verification)
│   │   ├── models/                   # SQLAlchemy ORM models
│   │   │   ├── __init__.py           # Re-exports User, Patient
│   │   │   ├── user.py              # User model + UserRole enum (9 roles)
│   │   │   ├── patient.py           # Patient model + Gender, Title, BloodGroup enums
│   │   │   └── hospital.py          # HospitalDetails model (single-row config)
│   │   ├── schemas/                  # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── auth.py              # LoginRequest, TokenResponse, UserResponse, TokenData
│   │   │   ├── patient.py           # PatientCreate/Update/Response + pagination schemas
│   │   │   ├── hospital.py          # HospitalCreate/Update/Response + logo/public schemas
│   │   │   └── user.py             # UserCreate/Update/Response + PasswordReset + list
│   │   ├── routers/                  # API route handlers (controllers)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py              # POST /auth/login, /logout, /refresh
│   │   │   ├── patients.py          # CRUD + email-id-card endpoints
│   │   │   ├── users.py            # User CRUD + password reset (Super Admin only)
│   │   │   └── hospital.py         # Hospital setup, update, logo management
│   │   ├── services/                 # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py      # User authentication logic
│   │   │   ├── patient_service.py   # PRN generation, patient CRUD logic
│   │   │   ├── user_service.py      # User CRUD + password management
│   │   │   ├── email_service.py     # SMTP email (credentials + ID card templates)
│   │   │   └── hospital_service.py  # Hospital CRUD + logo file management
│   │   └── utils/                    # Utility functions
│   │       ├── __init__.py
│   │       ├── security.py          # bcrypt hashing + JWT encode/decode
│   │       └── validators.py        # Regex validators (mobile, email, pin_code)
│   ├── tests/                        # Test files
│   │   └── __init__.py
│   ├── uploads/                      # File upload directory
│   │   └── hospital/                # Hospital logo storage
│   └── env/                          # Python virtual environment
│
├── frontend/                         # React TypeScript frontend
│   ├── package.json                  # NPM dependencies and scripts
│   ├── index.html                    # HTML entry point
│   ├── vite.config.ts               # Vite config (proxy, path aliases)
│   ├── tailwind.config.js           # Tailwind CSS customization (primary colors)
│   ├── postcss.config.js            # PostCSS with Tailwind + Autoprefixer
│   ├── tsconfig.json                # TypeScript configuration
│   ├── tsconfig.node.json           # Node-specific TS config
│   └── src/
│       ├── main.tsx                  # React DOM render entry
│       ├── App.tsx                  # Root component with routing
│       ├── index.css                # Tailwind directives + base styles
│       ├── vite-env.d.ts           # Vite environment types
│       ├── components/
│       │   └── common/
│       │       ├── Layout.tsx       # App shell (header, sidebar, main content)
│       │       └── ProtectedRoute.tsx # Auth guard component
│       ├── contexts/
│       │   └── AuthContext.tsx       # React Context for auth state management
│       ├── pages/
│       │   ├── Login.tsx            # Login form with Zod validation
│       │   ├── Dashboard.tsx        # Role-based dashboard with quick actions
│       │   ├── Register.tsx         # Patient registration form
│       │   ├── PatientList.tsx      # Paginated patient table with search
│       │   ├── PatientDetail.tsx    # Read-only patient detail view
│       │   ├── PatientIdCard.tsx    # Printable patient ID card (front/back)
│       │   ├── UserManagement.tsx   # User CRUD with modals (Super Admin)
│       │   ├── HospitalSetup.tsx    # One-time hospital configuration form
│       │   └── HospitalProfile.tsx  # Hospital profile view/edit with logo
│       ├── services/
│       │   ├── api.ts               # Axios instance with JWT interceptor
│       │   ├── authService.ts       # Login/logout + localStorage management
│       │   ├── patientService.ts    # Patient API methods
│       │   ├── userService.ts       # User management API methods
│       │   └── hospitalService.ts   # Hospital config API methods
│       ├── types/
│       │   ├── auth.ts              # Auth TypeScript interfaces
│       │   ├── patient.ts          # Patient TypeScript interfaces
│       │   ├── user.ts             # User TypeScript interfaces
│       │   └── hospital.ts         # Hospital TypeScript interfaces
│       └── utils/
│           ├── constants.ts         # Dropdown options, 35+ country data, helpers
│           └── validation.ts        # Zod schemas for forms
│
├── database/                         # Database scripts
│   ├── scripts/
│   │   ├── 001_create_schema.sql    # Initial schema (users, patients, audit_logs, refresh_tokens)
│   │   ├── 002_migrate_patient_fields.sql  # Patient field migration (name split, PRN)
│   │   ├── 003_global_and_user_mgmt.sql    # Global support + Super Admin seed
│   │   ├── 004_create_hospital_details.sql # Hospital details table (single row enforced)
│   │   └── 005_add_hospital_country_codes.sql # International phone codes for hospital
│   ├── seeds/
│   │   └── seed_data.sql            # Default users + sample patients
│   └── migrations/                   # Alembic migration directory
│
└── PROJECT_DOCUMENTATION.md          # This document
```

---

## 4. Backend Architecture

The backend follows a **layered architecture** pattern:

```
┌──────────────────────────────────────────────┐
│              FastAPI Application              │
│   main.py (CORS, Exception Handlers, Routes) │
├──────────────────────────────────────────────┤
│              Routers (Controllers)            │
│   auth.py │ patients.py │ users.py │ hospital│
├──────────────────────────────────────────────┤
│            Dependencies (Middleware)           │
│   JWT Auth │ Role Guards │ DB Sessions        │
├──────────────────────────────────────────────┤
│              Services (Business Logic)        │
│   auth │ patient │ user │ email │ hospital    │
├──────────────────────────────────────────────┤
│          Schemas (Validation/Serialization)    │
│   Pydantic models for request/response        │
├──────────────────────────────────────────────┤
│              Models (ORM Layer)               │
│   SQLAlchemy models mapped to PostgreSQL      │
├──────────────────────────────────────────────┤
│              Database (PostgreSQL)             │
│   Connection pool, sessions, Base             │
└──────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Entry Point** | `main.py` | App initialization, CORS config, exception handlers, router registration |
| **Configuration** | `config.py` | Environment-based settings using Pydantic `BaseSettings` |
| **Database** | `database.py` | SQLAlchemy engine (pool_size=10, max_overflow=20), session factory, `get_db` dependency |
| **Dependencies** | `dependencies.py` | Authentication middleware: `get_current_user`, `require_super_admin`, `require_admin_or_super_admin` |
| **Routers** | `routers/*.py` | HTTP endpoint definitions, request parsing, response formatting |
| **Services** | `services/*.py` | Core business logic, database queries, file operations, email sending |
| **Schemas** | `schemas/*.py` | Input validation (field_validators), output serialization (`from_attributes = True`) |
| **Models** | `models/*.py` | SQLAlchemy table definitions, enums, computed properties |
| **Utils** | `utils/*.py` | Security helpers (bcrypt, JWT), validation regex patterns |

### Key Patterns Used in Backend

1. **Dependency Injection** — FastAPI's `Depends()` for DB sessions, auth, and role guards
2. **Repository Pattern** — Services abstract database queries from routers
3. **Soft Delete** — Records are marked `is_active = False` instead of physical deletion
4. **Auto-generated PRN** — PostgreSQL sequence (`prn_sequence`) + prefix (`HMS-000001`)
5. **Global Exception Handling** — `SQLAlchemyError` and generic `Exception` handlers in `main.py`
6. **Computed Properties** — `full_name`, `full_mobile`, `full_address` as `@property` decorators

---

## 5. Frontend Architecture

The frontend is a **Single Page Application (SPA)** using React with TypeScript.

```
┌──────────────────────────────────────────────┐
│              React Application                │
│   App.tsx (BrowserRouter + Routes)            │
├──────────────────────────────────────────────┤
│              Contexts (State Management)      │
│   AuthContext (login state, JWT token, user)  │
├──────────────────────────────────────────────┤
│                   Pages                       │
│   Login │ Dashboard │ Register │ PatientList  │
│   PatientDetail │ PatientIdCard │ UserMgmt    │
│   HospitalSetup │ HospitalProfile             │
├──────────────────────────────────────────────┤
│              Components                       │
│   Layout (Header + Sidebar) │ ProtectedRoute  │
├──────────────────────────────────────────────┤
│              Services (API Layer)             │
│   api.ts │ authService │ patientService       │
│   userService │ hospitalService               │
├──────────────────────────────────────────────┤
│              Utils & Types                    │
│   validation.ts (Zod) │ constants.ts          │
│   TypeScript interfaces for all entities      │
└──────────────────────────────────────────────┘
```

### Routing Structure

| Route | Page | Access |
|-------|------|--------|
| `/login` | Login | Public |
| `/dashboard` | Dashboard | All authenticated users |
| `/register` | Patient Registration | All authenticated users |
| `/patients` | Patient List | All authenticated users |
| `/patients/:id` | Patient Detail | All authenticated users |
| `/patients/:id/id-card` | Patient ID Card | All authenticated users |
| `/user-management` | User Management | Super Admin only (UI-enforced) |
| `/hospital-setup` | Hospital Setup | Admin / Super Admin |
| `/hospital-profile` | Hospital Profile | Admin / Super Admin |

### Key Frontend Patterns

1. **AuthContext** — React Context API for global authentication state
2. **ProtectedRoute** — HOC that redirects unauthenticated users to `/login`
3. **Axios Interceptors** — Auto-attach JWT token to all requests; auto-redirect on 401
4. **React Hook Form + Zod** — Declarative form validation with schema definitions
5. **Role-based UI** — Sidebar navigation items shown/hidden based on `user.role`
6. **Responsive Design** — Mobile hamburger menu, collapsible sidebar via Tailwind
7. **API Proxy** — Vite dev server proxies `/api` to `http://localhost:8000`

---

## 6. Database Design

### Entity-Relationship Overview

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│    users     │────▶│   patients   │     │  hospital_details │
│─────────────│     │──────────────│     │───────────────────│
│ id (PK)     │     │ id (PK)      │     │ id (PK)           │
│ username    │     │ prn (UNIQUE) │     │ hospital_name     │
│ email       │     │ title        │     │ primary_phone     │
│ password_hash│    │ first_name   │     │ email             │
│ full_name   │     │ last_name    │     │ address_line1     │
│ role        │     │ date_of_birth│     │ city, state       │
│ is_active   │     │ gender       │     │ country, pin_code │
│ last_login  │     │ mobile_number│     │ logo_path         │
│ created_at  │     │ email        │     │ gst_number        │
│ updated_at  │     │ address_*    │     │ working_hours_*   │
└─────────────┘     │ emergency_*  │     │ is_configured     │
       │            │ is_active    │     │ created_by (FK)   │
       │            │ created_by(FK)│    └───────────────────┘
       │            │ updated_by(FK)│
       │            │ created_at   │     ┌───────────────────┐
       │            │ updated_at   │     │   audit_logs      │
       │            └──────────────┘     │───────────────────│
       │                                 │ id (PK)           │
       │            ┌──────────────┐     │ table_name        │
       └───────────▶│refresh_tokens│     │ record_id         │
                    │──────────────│     │ action            │
                    │ id (PK)      │     │ old_values (JSONB)│
                    │ user_id (FK) │     │ new_values (JSONB)│
                    │ token        │     │ user_id (FK)      │
                    │ expires_at   │     │ ip_address        │
                    │ is_revoked   │     │ created_at        │
                    └──────────────┘     └───────────────────┘
```

### Tables

#### `users` Table
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| username | VARCHAR(50) | UNIQUE, NOT NULL |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| full_name | VARCHAR(255) | NOT NULL |
| role | VARCHAR(20) | NOT NULL, CHECK constraint (9 valid roles) |
| is_active | BOOLEAN | DEFAULT TRUE |
| last_login | TIMESTAMP | nullable |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | Auto-updated via trigger |

**Valid Roles:** `super_admin`, `admin`, `doctor`, `nurse`, `staff`, `receptionist`, `pharmacist`, `cashier`, `inventory_manager`

#### `patients` Table
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| prn | VARCHAR(20) | UNIQUE, NOT NULL (auto-generated) |
| title | VARCHAR(10) | NOT NULL, CHECK (Mr./Mrs./Ms./Master/Dr./Prof./Baby) |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| date_of_birth | DATE | NOT NULL, CHECK (≤ today) |
| gender | VARCHAR(10) | NOT NULL, CHECK (Male/Female/Other) |
| blood_group | VARCHAR(5) | nullable, CHECK (A+/A-/B+/B-/AB+/AB-/O+/O-) |
| country_code | VARCHAR(5) | NOT NULL, DEFAULT '+91', CHECK (regex) |
| mobile_number | VARCHAR(15) | UNIQUE, NOT NULL, CHECK (4-15 digits) |
| email | VARCHAR(255) | nullable, CHECK (email regex) |
| address_line1 | VARCHAR(255) | NOT NULL |
| address_line2 | VARCHAR(255) | nullable |
| city | VARCHAR(100) | nullable |
| state | VARCHAR(100) | nullable |
| pin_code | VARCHAR(10) | nullable, CHECK (3-10 alphanumeric) |
| country | VARCHAR(100) | DEFAULT 'India' |
| emergency_contact_name | VARCHAR(255) | nullable |
| emergency_contact_country_code | VARCHAR(5) | DEFAULT '+91' |
| emergency_contact_mobile | VARCHAR(15) | nullable |
| emergency_contact_relationship | VARCHAR(50) | nullable, CHECK (11 valid values) |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_by | INTEGER | FK → users.id |
| updated_by | INTEGER | FK → users.id |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | Auto-updated via trigger |

#### `hospital_details` Table (Single Row)
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| hospital_name | VARCHAR(200) | NOT NULL |
| hospital_code | VARCHAR(20) | nullable |
| registration_number | VARCHAR(50) | nullable |
| established_date | DATE | nullable |
| hospital_type | VARCHAR(50) | DEFAULT 'General' |
| primary_phone_country_code | VARCHAR(5) | NOT NULL, DEFAULT '+91' |
| primary_phone | VARCHAR(20) | NOT NULL, CHECK (4-15 digits) |
| secondary_phone_country_code | VARCHAR(5) | nullable |
| secondary_phone | VARCHAR(20) | nullable |
| email | VARCHAR(255) | NOT NULL |
| website | VARCHAR(255) | nullable |
| emergency_hotline_country_code | VARCHAR(5) | nullable |
| emergency_hotline | VARCHAR(20) | nullable |
| address_line1 | TEXT | NOT NULL |
| address_line2 | TEXT | nullable |
| city | VARCHAR(100) | NOT NULL |
| state | VARCHAR(100) | NOT NULL |
| country | VARCHAR(100) | NOT NULL |
| pin_code | VARCHAR(10) | NOT NULL |
| logo_path | VARCHAR(500) | nullable |
| logo_filename | VARCHAR(255) | nullable |
| logo_mime_type | VARCHAR(50) | nullable |
| logo_size_kb | INTEGER | nullable |
| gst_number | VARCHAR(20) | nullable, CHECK (Indian GST format conditionally) |
| pan_number | VARCHAR(20) | nullable, CHECK (Indian PAN format conditionally) |
| drug_license_number | VARCHAR(50) | nullable |
| medical_registration_number | VARCHAR(50) | nullable |
| working_hours_start | TIME | DEFAULT '09:00:00' |
| working_hours_end | TIME | DEFAULT '18:00:00' |
| working_days | JSONB | DEFAULT Mon-Sat |
| emergency_24_7 | BOOLEAN | DEFAULT FALSE |
| is_configured | BOOLEAN | DEFAULT FALSE |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at / updated_at | TIMESTAMP | Auto-managed |
| created_by / updated_by | INTEGER | FK → users.id |

**Enforced Constraint:** A database trigger (`prevent_multiple_hospitals`) ensures only ONE hospital record can exist.

#### `audit_logs` Table
Automatically populated via database triggers on `patients` and `hospital_details` tables.

| Column | Type | Purpose |
|--------|------|---------|
| table_name | VARCHAR(50) | Which table was modified |
| record_id | INTEGER | Which record was modified |
| action | VARCHAR(20) | INSERT / UPDATE / DELETE |
| old_values | JSONB | Previous state (for UPDATE/DELETE) |
| new_values | JSONB | New state (for INSERT/UPDATE) |
| user_id | INTEGER | Who made the change |

#### `refresh_tokens` Table
Prepared for refresh token rotation (currently login returns access tokens only).

### Database Functions & Triggers

| Trigger/Function | Table | Purpose |
|-----------------|-------|---------|
| `update_updated_at_column()` | users, patients, hospital_details | Auto-update `updated_at` on every UPDATE |
| `audit_trigger_function()` | patients, hospital_details | Log all INSERT/UPDATE/DELETE to `audit_logs` |
| `prevent_multiple_hospitals()` | hospital_details | Enforce single-row constraint |

### Sequences

| Sequence | Usage |
|----------|-------|
| `prn_sequence` | Auto-increment for Patient Reference Number (HMS-000001, HMS-000002, ...) |

---

## 7. Authentication & Authorization

### Authentication Flow

```
1. User submits credentials → POST /api/v1/auth/login
2. Backend verifies username + bcrypt password hash
3. Backend creates JWT access token (HS256, 60-min expiry)
4. Token payload: { user_id, username, role, exp, type: "access" }
5. Frontend stores token + user in localStorage
6. All subsequent requests include: Authorization: Bearer <token>
7. Backend dependency `get_current_user` decodes & validates JWT
8. If token expired/invalid → 401 Unauthorized
```

### Authorization Levels (Dependency Chain)

```python
get_current_user              → Validates JWT, returns User object
  └─ get_current_active_user  → Ensures user.is_active == True
       ├─ require_super_admin          → role == "super_admin"
       └─ require_admin_or_super_admin → role in ["admin", "super_admin"]
```

### Role-Based Access Matrix

| Endpoint | Any Auth User | Admin | Super Admin |
|----------|:---:|:---:|:---:|
| Patient CRUD | ✅ | ✅ | ✅ |
| Hospital View (public) | ✅ | ✅ | ✅ |
| Hospital Full View | ❌ | ✅ | ✅ |
| Hospital Create/Update | ❌ | ✅ | ✅ |
| Hospital Logo Manage | ❌ | ✅ | ✅ |
| User Management CRUD | ❌ | ❌ | ✅ |
| Password Reset | ❌ | ❌ | ✅ |

### Security Implementation Details

- **Password Hashing:** bcrypt with 12 salt rounds
- **JWT Algorithm:** HS256
- **Token Expiry:** 60 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- **Token Type:** Bearer
- **Frontend Auto-Logout:** Axios interceptor detects 401 → clears localStorage → redirects to `/login`
- **Self-Delete Prevention:** Super Admin cannot delete their own account
- **Last Super Admin Guard:** System prevents deletion of the last Super Admin account

---

## 8. API Endpoints Reference

### Base URL: `http://localhost:8000/api/v1`

### Root Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | App info (name, version, status) |
| GET | `/health` | No | Health check |
| GET | `/api/v1/config/hospital` | No | Hospital config from env vars |

### Authentication (`/api/v1/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | Login with username/password → Returns JWT |
| POST | `/auth/logout` | Yes | Logout (client discards token) |
| POST | `/auth/refresh` | Yes | Get a new access token |

### Patients (`/api/v1/patients`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/patients` | Yes | Create patient (auto-generates PRN) |
| GET | `/patients` | Yes | List patients (paginated, searchable) |
| GET | `/patients/{id}` | Yes | Get patient by ID |
| PUT | `/patients/{id}` | Yes | Update patient |
| DELETE | `/patients/{id}` | Yes | Soft-delete patient |
| POST | `/patients/{id}/email-id-card` | Yes | Email patient ID card |

**Query Parameters for GET /patients:**
- `page` (int, default=1)
- `limit` (int, default=10, max=100)
- `search` (string — searches first_name, last_name, mobile, email, PRN)

### Users (`/api/v1/users`) — Super Admin Only

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | Super Admin | List users (paginated, searchable) |
| POST | `/users` | Super Admin | Create user (optional: `send_email=true`) |
| GET | `/users/{id}` | Super Admin | Get user by ID |
| PUT | `/users/{id}` | Super Admin | Update user |
| DELETE | `/users/{id}` | Super Admin | Soft-delete user |
| POST | `/users/{id}/reset-password` | Super Admin | Reset password (optional email) |
| POST | `/users/{id}/send-password` | Super Admin | Send new password via email |

### Hospital (`/api/v1/hospital`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/hospital/status` | No | Check if hospital is configured |
| GET | `/hospital` | No | Get hospital public info |
| GET | `/hospital/full` | Admin+ | Get complete hospital details |
| POST | `/hospital` | Admin+ | Create hospital (one-time setup) |
| PUT | `/hospital` | Admin+ | Update hospital details |
| POST | `/hospital/logo` | Admin+ | Upload hospital logo |
| GET | `/hospital/logo` | No | Get hospital logo file |
| DELETE | `/hospital/logo` | Admin+ | Delete hospital logo |

### API Documentation (Auto-generated)

| URL | Format |
|-----|--------|
| `http://localhost:8000/api/docs` | Swagger UI (interactive) |
| `http://localhost:8000/api/redoc` | ReDoc (documentation) |

---

## 9. Core Features & Modules

### 9.1 Patient Registration Module

**Flow:**
1. User fills in the registration form (title, name, DOB, gender, contact, address, emergency)
2. Frontend validates with Zod schema
3. Backend validates with Pydantic schema (field_validators for title, blood_group, DOB, pin_code)
4. Backend checks for duplicate mobile number and email
5. System auto-generates PRN using PostgreSQL sequence: `HMS-{sequence:06d}`
6. Record created with `created_by` = current user's ID
7. Response includes the generated PRN

**PRN Generation Logic:**
```python
def generate_prn(db: Session) -> str:
    next_val = db.execute(prn_sequence.next_value()).scalar()
    return f"{settings.PRN_PREFIX}-{next_val:06d}"
    # Output: HMS-000001, HMS-000002, HMS-000003, ...
```

### 9.2 Patient ID Card

The system generates a **front/back ID card** as HTML:

**Front Side:**
- Hospital name and "Patient Identity Card" header
- PRN number
- Patient avatar placeholder
- Full name, DOB, age, gender, blood group, mobile number
- Emergency contact info

**Back Side:**
- Hospital name header
- Full hospital address, phone, email, website
- "Property of hospital" notice

**Actions available:** Print (via `window.print()`) and Email to patient (via SMTP)

### 9.3 User Management Module (Super Admin Only)

- **Create User:** Username, email, password (with strength validation), full name, role
- **9 Roles:** super_admin, admin, doctor, nurse, staff, receptionist, pharmacist, cashier, inventory_manager
- **Password Validation:** Must contain: uppercase, lowercase, digit, special character (min 8 chars)
- **Password Reset:** Generate new password + optionally email it
- **Soft Delete:** Users are deactivated, not physically deleted
- **Guards:** Cannot delete self, cannot delete last super_admin

### 9.4 Hospital Configuration Module

- **One-time Setup:** Only one hospital record allowed (enforced at DB level)
- **Sections:** Basic Info, Contact (with international phone codes), Address, Legal/Tax, Operations
- **Logo Upload:** Supports .jpg, .jpeg, .png, .svg (max 2MB), stored in `uploads/hospital/`
- **India-Specific Validation:** GST (15 chars, specific format) and PAN (10 chars, specific format)
- **Working Hours:** Configurable start/end times + working days selection
- **Emergency 24/7 Flag:** Boolean toggle

---

## 10. Data Validation Strategy

The application implements **triple-layer validation**:

### Layer 1: Frontend (Zod Schemas)
```typescript
// validation.ts — Pre-submission validation
const patientSchema = z.object({
  title: z.enum(['Mr.', 'Mrs.', ...]),
  mobile_number: z.string().regex(/^\d{4,15}$/),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // ... more fields
});
```

### Layer 2: Backend (Pydantic Schemas)
```python
# schemas/patient.py — Request body validation
class PatientBase(BaseModel):
    title: str = Field(...)
    mobile_number: str = Field(..., pattern=r"^\d{4,15}$")
    
    @field_validator('date_of_birth')
    def validate_dob(cls, v):
        if v > date.today():
            raise ValueError('Date of birth cannot be in the future')
        ...
```

### Layer 3: Database (CHECK Constraints)
```sql
-- 001_create_schema.sql — Database-level enforcement
CONSTRAINT chk_gender CHECK (gender IN ('Male', 'Female', 'Other')),
CONSTRAINT chk_mobile_format CHECK (mobile_number ~ '^\d{4,15}$'),
CONSTRAINT chk_dob CHECK (date_of_birth <= CURRENT_DATE),
```

### Validated Fields Overview

| Field | Frontend | Backend | Database |
|-------|:---:|:---:|:---:|
| Title (enum) | ✅ | ✅ | ✅ |
| Gender (enum) | ✅ | ✅ | ✅ |
| Blood Group (enum) | ✅ | ✅ | ✅ |
| Mobile (4-15 digits) | ✅ | ✅ | ✅ |
| Email (format) | ✅ | ✅ | ✅ |
| DOB (not future, max 150 years) | ✅ | ✅ | ✅ |
| PIN Code (3-10 alphanumeric) | ✅ | ✅ | ✅ |
| Country Code (+digits) | ✅ | ✅ | ✅ |
| Emergency Relationship (enum) | ✅ | ✅ | ✅ |
| Password strength | ✅ | ✅ | — |
| GST/PAN format (India) | ✅ | ✅ | ✅ |
| Duplicate mobile/email | — | ✅ | ✅ (UNIQUE) |

---

## 11. International Support

The system supports international hospital and patient data with:

### Supported Countries (35+)

India, United States, United Kingdom, Canada, Australia, UAE, Saudi Arabia, Germany, Malaysia, Nepal, Sri Lanka, Bangladesh, Pakistan, Singapore, Qatar, Oman, Kuwait, Bahrain, France, Japan, China, South Korea, Italy, Spain, Brazil, Mexico, South Africa, Nigeria, Egypt, Russia, Indonesia, Thailand, Vietnam, Philippines, Turkey, New Zealand, Afghanistan, Iran, Iraq

### International Features

| Feature | Implementation |
|---------|---------------|
| **Phone Country Codes** | Dropdown with codes (+91, +1, +44, etc.) stored separately from number |
| **Mobile Number Format** | 4-15 digits (global standard vs old India-only 10-digit) |
| **Postal/ZIP Codes** | 3-10 alphanumeric characters (supports US ZIP, UK postcode, Indian PIN, etc.) |
| **Postal Code Labels** | Dynamic label per country: "PIN Code", "ZIP Code", "Postcode", "Postleitzahl" |
| **State/Province Data** | Pre-loaded for major countries (India: 36, US: 51, UK: 11, etc.) |
| **Country-specific Tax** | GST/PAN validation only for India; flexible for other countries |
| **Emergency Contact** | Separate country code field for emergency contact phone |
| **Hospital Phones** | All hospital phone numbers have separate country code columns |

### Dynamic Country Selection Flow

```
User selects Country → States dropdown populates
                     → Phone country code auto-selects
                     → Postal code label updates (PIN Code / ZIP Code / Postcode)
                     → Tax field hints update (GST/PAN for India only)
```

---

## 12. Email Service

### SMTP Configuration (via `.env`)

```env
SMTP_HOST=smtp.gmail.com       # SMTP server host
SMTP_PORT=587                   # 587 (STARTTLS) or 465 (SSL)
SMTP_USERNAME=your@email.com    # SMTP login username
SMTP_PASSWORD=app-password      # SMTP login password
SMTP_FROM_EMAIL=noreply@hospital.com
SMTP_FROM_NAME=Hospital Management System
```

### Email Templates

| Template | Trigger | Content |
|----------|---------|---------|
| **Account Credentials** | User creation with `send_email=true` | Username, password, hospital branding, first-login warning |
| **Patient ID Card** | Click "Email ID Card" on patient detail | Full HTML front/back ID card with hospital info |

### Email Flow

```
1. Check SMTP_HOST is configured (if empty → log warning, return False)
2. Create MIME multipart message with HTML body
3. Connect via SMTP (port 465 = SSL, otherwise STARTTLS)
4. Authenticate with username/password
5. Send email
6. Close connection
```

---

## 13. Security Measures

| Measure | Implementation |
|---------|---------------|
| **Password Hashing** | bcrypt with 12 salt rounds |
| **JWT Tokens** | HS256 algorithm, 60-min expiry, server-side secret |
| **CORS** | Restricted to localhost:3000 and localhost:5173 |
| **SQL Injection Prevention** | SQLAlchemy ORM parameterized queries |
| **Input Validation** | Triple-layer (Zod + Pydantic + DB constraints) |
| **Soft Delete** | Data preservation for audit compliance |
| **Audit Logging** | Automatic DB triggers capture all data changes with old/new values |
| **Role-Based Access** | Dependency injection guards (Super Admin, Admin, Authenticated) |
| **Auto-Logout** | Frontend auto-clears session on 401 response |
| **Self-Delete Prevention** | Super Admin cannot delete own account |
| **Last Admin Guard** | Cannot delete the last Super Admin from the system |
| **File Upload Security** | Extension whitelist (.jpg/.jpeg/.png/.svg), 2MB size limit |
| **Error Handling** | Global exception handlers hide internal errors from clients |
| **Logging** | Python logging throughout all services and routers |

---

## 14. Environment Configuration

### Backend `.env` File (placed in `task-1/backend/`)

```env
# Application
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=True

# Database
DATABASE_URL=postgresql://hospital_admin:HMS%402026@localhost:5432/hospital_management
DB_ECHO=False

# Security
SECRET_KEY=your-secret-key-min-32-characters-long-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]

# Pagination
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# PRN (Patient Reference Number)
PRN_PREFIX=HMS

# SMTP Email (Optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@hospital.com
SMTP_FROM_NAME=Hospital Management System

# Hospital Details
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

### Frontend `.env` File (placed in `task-1/frontend/`)

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Configuration Loading

- Backend uses **Pydantic `BaseSettings`** which auto-reads `.env` file and environment variables
- Frontend uses **Vite's `import.meta.env`** for `VITE_`-prefixed variables
- All settings have sensible defaults so the app runs even without a `.env` file

---

## 15. Database Migration Strategy

The project uses **sequential SQL scripts** for schema management:

| Script | Purpose | Dependencies |
|--------|---------|-------------|
| `001_create_schema.sql` | Full initial schema (users, patients, audit_logs, refresh_tokens, sequences, triggers) | None |
| `002_migrate_patient_fields.sql` | Migrates old `full_name` → `first_name`/`last_name`, adds PRN, country_code, blood_group | 001 |
| `003_global_and_user_mgmt.sql` | Adds global phone/PIN patterns, adds super_admin role, seeds default Super Admin | 001 |
| `004_create_hospital_details.sql` | Creates hospital_details table with single-row trigger | 001 (for `update_updated_at_column`) |
| `005_add_hospital_country_codes.sql` | Adds country code columns to hospital_details, makes GST/PAN conditional | 004 |

### Fresh Setup Order

```
001_create_schema.sql → 003_global_and_user_mgmt.sql → 004_create_hospital_details.sql → 005_add_hospital_country_codes.sql
```

### Existing Database Upgrade Order

```
002_migrate_patient_fields.sql → 003_global_and_user_mgmt.sql → 004_create_hospital_details.sql → 005_add_hospital_country_codes.sql
```

### Seed Data

```
seed_data.sql — Creates 4 default users + 4 sample patients (idempotent with ON CONFLICT DO NOTHING)
```

---

## 16. Setup & Installation Guide

### Prerequisites

| Software | Required Version |
|----------|-----------------|
| Python | 3.10+ |
| Node.js | 18+ |
| PostgreSQL | 15+ |
| npm | 9+ |
| Git | Latest |

### Step 1: Database Setup

```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE hospital_management;
CREATE USER hospital_admin WITH PASSWORD 'HMS@2026';
GRANT ALL PRIVILEGES ON DATABASE hospital_management TO hospital_admin;

-- Connect to hospital_management database
\c hospital_management

-- Run scripts in order
\i database/scripts/001_create_schema.sql
\i database/scripts/003_global_and_user_mgmt.sql
\i database/scripts/004_create_hospital_details.sql
\i database/scripts/005_add_hospital_country_codes.sql
\i database/seeds/seed_data.sql
```

### Step 2: Backend Setup

```bash
cd task-1/backend

# Create virtual environment
python -m venv env

# Activate (Windows)
env\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from config.py defaults and customize)

# Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 3: Frontend Setup

```bash
cd task-1/frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

### Step 4: Access the Application

| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | Frontend application |
| `http://localhost:8000` | Backend API root |
| `http://localhost:8000/api/docs` | Swagger API documentation |
| `http://localhost:8000/api/redoc` | ReDoc API documentation |

---

## 17. Default Credentials

| Username | Password | Role | Description |
|----------|----------|------|-------------|
| `superadmin` | `Super@123` | Super Admin | Full system access |
| `admin` | `Admin@123` | Admin | Hospital config + patient management |
| `doctor1` | `Admin@123` | Doctor | Patient management |
| `nurse1` | `Admin@123` | Nurse | Patient management |

> **Important:** Change all default passwords after first login in production.

---

## 18. Important Design Decisions

### 18.1 Why Soft Delete?
All deletions (patients, users) set `is_active = False` instead of removing records. This preserves:
- Audit trail integrity
- Historical data for reporting
- Compliance with healthcare data retention requirements

### 18.2 Why Single Hospital Record?
The `hospital_details` table enforces a single row via a database trigger. This is because:
- The system is designed for a single hospital deployment
- Hospital info is used globally (ID cards, emails, reports)
- Simplifies the API (no hospital_id needed in URLs)

### 18.3 Why Separate Country Code Fields?
Phone numbers store `country_code` and `mobile_number` separately to:
- Enable international support without breaking existing Indian data
- Allow proper display formatting (e.g., "+91 9876543210")
- Support country-code dropdown in the UI

### 18.4 Why PostgreSQL Sequence for PRN?
Using a database sequence ensures:
- Unique, gap-free numbering
- Concurrency-safe (no race conditions)
- Centralized counter (not application-level)

### 18.5 Why Triple-Layer Validation?
Each layer catches errors at a different stage:
- **Zod (Frontend):** Instant user feedback before API call
- **Pydantic (Backend):** Catches invalid API requests from any client
- **DB Constraints:** Last line of defense against data corruption

### 18.6 Why Audit Triggers at DB Level?
Database triggers for audit logging ensure:
- All changes are captured regardless of how they happen (API, direct SQL, migration)
- No application code can bypass audit logging
- JSONB storage preserves full before/after state

### 18.7 Key Libraries and Why

| Library | Why Chosen |
|---------|-----------|
| **FastAPI** | Async, auto-docs, Pydantic integration, high performance |
| **SQLAlchemy 2.0** | Mature ORM, excellent PostgreSQL support, session management |
| **Pydantic v2** | Fast validation, schema generation, `from_attributes` for ORM |
| **React Hook Form** | Minimal re-renders, built-in validation, small bundle size |
| **Zod** | TypeScript-native validation, composable schemas, great errors |
| **Tailwind CSS** | Utility-first, no CSS files to manage, consistent design system |
| **Axios** | Interceptors for auth, request/response transforms, cancellation |
| **Lucide React** | Tree-shakeable icons, consistent design, active development |
| **bcrypt** | Industry standard for password hashing, configurable rounds |
| **python-jose** | Well-maintained JWT library with JWE/JWS support |

### 18.8 Application Ports

| Service | Port | Protocol |
|---------|------|----------|
| Frontend (Vite Dev) | 3000 | HTTP |
| Backend (Uvicorn) | 8000 | HTTP |
| PostgreSQL | 5432 | TCP |

---

## Summary

The Hospital Management System is a production-ready full-stack application built with modern technologies and best practices. It features comprehensive patient registration with auto-generated PRNs, role-based user management, hospital branding configuration, international support for 35+ countries, email notifications, printable ID cards, and a robust triple-layer validation strategy. The architecture ensures data integrity through audit logging, soft deletes, and database-level constraints while maintaining developer productivity through FastAPI's auto-documentation and React's component-based UI.
