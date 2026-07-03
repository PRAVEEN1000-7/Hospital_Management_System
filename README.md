# Hospital Management System (HMS)

A multi-tenant, full-stack Hospital Management System built for modern healthcare facilities. Supports general hospitals, eye hospitals, and multi-specialty clinics from a single codebase.

---

## Overview

HMS provides an end-to-end digital workflow covering patient registration through billing, prescription management, pharmacy dispensing, optical store operations, and real-time queue display — all under one roof with hospital-level data isolation.

---

## Key Features

| Module | Capabilities |
|--------|-------------|
| **Patient Management** | Registration, medical history, ID cards, patient directory |
| **Appointments** | Scheduling, walk-in queue, doctor slots, waitlist management |
| **Prescriptions** | Doctor prescription builder, finalize & dispense workflow |
| **Pharmacy** | Dispensing, FEFO batch allocation, stock tracking, pharmacy queue |
| **Billing & Invoicing** | OPD/IPD invoices, payments, refunds, daily settlements |
| **Inventory** | Suppliers, purchase orders, GRNs, stock movements, cycle counts |
| **Optical Store** | Eye prescriptions, lens inventory, optical sales (eye hospitals) |
| **Queue Display** | Public real-time token display for waiting rooms |
| **Analytics** | Appointment and revenue reports |
| **Notifications** | Role-based in-app notifications for every clinical event |
| **Multi-Tenant** | Per-hospital data isolation, subscription plans, super-admin control |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11 · FastAPI · SQLAlchemy · PostgreSQL 15 |
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS |
| **Auth** | JWT access + refresh tokens, role-based access control |
| **PDF** | WeasyPrint (prescriptions, invoices, optical Rx) |
| **Database** | PostgreSQL with pgcrypto, UUID primary keys, multi-schema |

---

## Project Structure

```
HMS/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── routers/      # API endpoints
│   │   ├── services/     # Business logic
│   │   ├── schemas/      # Pydantic request/response models
│   │   └── main.py       # App entry point
│   ├── uploads/          # Hospital logos, patient photos (gitignored)
│   └── requirements.txt
│
├── frontend/             # React + TypeScript SPA
│   ├── src/
│   │   ├── pages/        # Route-level page components
│   │   ├── components/   # Shared UI components
│   │   ├── services/     # API client modules
│   │   ├── contexts/     # Auth, Toast, Notification contexts
│   │   └── types/        # TypeScript type definitions
│   └── package.json
│
├── database_hole/        # SQL migration scripts
│   ├── 01_full_schema.sql       # Complete database schema
│   ├── 02_eye_hospital_updates.sql  # Eye-hospital feature additions
│   ├── 03_seed_data.sql         # Initial data (roles, users, departments)
│   ├── 04_reference_queries.sql # Reference queries (do not execute)
│   └── README.md
│
├── deploy/               # Production deployment
│   ├── deploy.sh         # Full deploy script (env → build → nginx → restart)
│   ├── nginx.conf        # Nginx site configuration
│   └── hms-backend.service  # systemd service unit
│
└── docs/                 # Architecture and planning documents
```

---

## Hospital Specialties

The system adapts its feature set based on the hospital's `specialty` field:

- **`general`** — Core HMS modules only
- **`eye_hospital`** — Unlocks: Optical Store, eye prescriptions, pharmacy queue, public queue display, eye-format drug dispensing
- **`multi_specialty`** — All modules enabled

---

## Notification System

Every clinical event fires a role-targeted in-app notification:

| Event | Recipients |
|-------|-----------|
| Appointment booked | Assigned doctor + receptionists |
| Appointment cancelled | Assigned doctor |
| Prescription finalized | Pharmacists |
| Prescription dispensed | Prescribing doctor |
| Invoice created | Cashiers + admins |
| Optical Rx created | Optical staff |
| Low stock | Pharmacists + inventory managers + admins |

Notifications appear in the bell icon in the top navigation bar, scoped to the logged-in user's hospital.

---

## Quick Start (Local Development)

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed step-by-step instructions.

```powershell
# Database
$env:PGPASSWORD = "HMS@2026"
psql -h localhost -U hms_user -d hms_db -f database_hole/01_full_schema.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/02_eye_hospital_updates.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/03_seed_data.sql

# Backend  (Terminal 1)
cd backend && python -m venv venv && .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend  (Terminal 2)
cd frontend && npm install && npm run dev
```

Default login: `superadmin` / `Admin@123`

---

## Production Deployment

See [deploy/deploy.sh](deploy/deploy.sh) for the authoritative 7-step deploy script (Ubuntu/Debian server with Nginx + systemd).

See [linux_setup_detailed.md](linux_setup_detailed.md) for the full server setup walkthrough.

---

## Default Credentials

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `superadmin` | `Admin@123` |
| Admin | `admin1` | `Admin@123` |
| Doctor | `drsmith` | `Admin@123` |
| Pharmacist | `pharma1` | `Admin@123` |
| Cashier | `cashier1` | `Admin@123` |

> All non-superadmin accounts have `must_change_password = true` and will prompt for a password change on first login.

---

## Database

SQL files live in [`database_hole/`](database_hole/). See [`database_hole/README.md`](database_hole/README.md) for the schema overview and migration run order.

> **Important:** SQL migration files are written but must be run manually by the administrator. Never execute them automatically in CI/CD without a backup.
