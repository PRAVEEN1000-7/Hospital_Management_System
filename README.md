<p align="center">
  <img src="https://img.icons8.com/fluency/96/hospital-3.png" alt="HMS Logo" width="80"/>
</p>

<h1 align="center">Hospital Management System</h1>

<p align="center">
  <strong>A modern, full-stack hospital management platform built for speed, security, and scale.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/FastAPI-0.109-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-Active_Development-brightgreen?style=flat-square" alt="Status"/>
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version"/>
  <img src="https://img.shields.io/badge/license-Proprietary-red?style=flat-square" alt="License"/>
</p>

---

## Overview

HMS is an enterprise-grade hospital management system that streamlines appointment booking, doctor schedules, walk-in queues, patient records, and facility operations through an intuitive web interface. Built with a React + TypeScript frontend and a FastAPI + PostgreSQL backend, it delivers fast performance with robust role-based security out of the box.

---

## Key Features

| Module | Highlights |
|--------|------------|
| **Dashboard** | Real-time stats — patients, appointments, doctor workloads, department overview |
| **Appointment Booking** | Schedule appointments by doctor, department, date & time slot with auto-validation |
| **Walk-In Registration** | Quick walk-in registration with auto-queue token, auto-waitlist when slots are full |
| **Walk-In Queue** | Live queue management — call, start consultation, complete, skip patients |
| **Waitlist** | Automatic waitlisting when doctor slots are full, promote to appointment on cancellation |
| **Doctor Schedule** | Create/manage doctor time slots, bulk slot creation, leave management with day-cards |
| **Appointment Reports** | Statistics and enhanced reports with filters by date, doctor, department |
| **Patient Records** | Full registration, demographics, medical history, auto-generated 12-digit PRNs |
| **Patient ID Card** | Printable & downloadable PDF ID cards with QR code, email delivery |
| **Staff Directory** | Search, filter, bulk actions, employee ID card generation, CSV export |
| **User Management** | Role-based access (8 roles), auto-generated employee IDs, photo upload, password reset |
| **Hospital Setup** | 3-step configuration wizard — hospital info, settings, branding |
| **Profile** | User profile management, password change, personal info update |
| **Authentication** | JWT access + refresh tokens, bcrypt hashing, session management, forced password change |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| React 19 + TypeScript 5.9 | UI framework with type safety |
| Vite 7.3 | Build tool with HMR |
| Tailwind CSS 3.4 | Utility-first styling (Custom theme: Manrope font, `#137fec` primary) |
| React Hook Form + Zod | Form handling and validation |
| React Router DOM 6 | Client-side routing with role guards |
| Axios | HTTP client with interceptors |
| html2canvas + jsPDF | ID card PDF generation |
| qrcode.react | QR code rendering on ID cards |
| date-fns | Date formatting and calculations |
| Lucide React | Icon library |

### Backend

| Technology | Purpose |
|-----------|---------|
| FastAPI 0.109 | High-performance async API framework |
| SQLAlchemy 2.0 | ORM with relationship mapping |
| Pydantic 2.5 | Request/response validation |
| python-jose | JWT token management |
| bcrypt 4.0+ | Password hashing |
| psycopg2-binary | PostgreSQL driver |
| Jinja2 | Email templates |
| python-dotenv | Environment configuration |

### Database

| Feature | Details |
|---------|---------|
| PostgreSQL 15+ | Primary database — 63 tables |
| pgcrypto | UUID generation via `gen_random_uuid()` |
| 12-digit PRN system | `[HH][G][YY][M][C][#####]` patient reference numbers |
| Soft deletes | `is_deleted` + `deleted_at` on all core tables |
| Audit columns | `created_by`, `updated_by`, timestamps on every table |
| Optimized indexes | On role, department, status, doctor+date, queue position |

---

## Project Structure

```
HMS/v1/
├── backend/                        # FastAPI backend
│   ├── app/
│   │   ├── main.py                 # App entry point, router registration
│   │   ├── config.py               # Environment settings
│   │   ├── database.py             # SQLAlchemy engine & session
│   │   ├── models/                 # 6 SQLAlchemy model files
│   │   │   ├── user.py             # Users, roles
│   │   │   ├── patient.py          # Patients
│   │   │   ├── appointment.py      # Appointments, queue, waitlist
│   │   │   ├── department.py       # Departments
│   │   │   ├── hospital_settings.py
│   │   │   └── patient_id_sequence.py
│   │   ├── routers/                # 13 API routers
│   │   │   ├── auth.py             # Login, logout, refresh, me
│   │   │   ├── users.py            # CRUD, photo upload, password reset
│   │   │   ├── patients.py         # Registration, records
│   │   │   ├── appointments.py     # Booking, reschedule, status
│   │   │   ├── walk_ins.py         # Walk-in registration & queue
│   │   │   ├── waitlist.py         # Waitlist CRUD, promote to booking
│   │   │   ├── schedules.py        # Doctor schedules, slots, leaves
│   │   │   ├── doctors.py          # Doctor profiles
│   │   │   ├── departments.py      # Department CRUD
│   │   │   ├── hospital.py         # Hospital config & logo
│   │   │   ├── hospital_settings.py
│   │   │   ├── appointment_settings.py
│   │   │   └── appointment_reports.py
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   └── services/               # 12 business logic services
│   ├── uploads/                    # User-uploaded files (gitignored)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                       # React + TypeScript frontend
│   └── src/
│       ├── pages/                  # 20 page components
│       │   ├── Dashboard.tsx
│       │   ├── Login.tsx
│       │   ├── Profile.tsx
│       │   ├── Register.tsx        # Create new user
│       │   ├── StaffDirectory.tsx
│       │   ├── UserManagement.tsx
│       │   ├── HospitalSetup.tsx
│       │   ├── PatientList.tsx
│       │   ├── PatientDetail.tsx
│       │   ├── PatientIdCard.tsx
│       │   ├── AppointmentBooking.tsx
│       │   ├── AppointmentManagement.tsx
│       │   ├── WalkInRegistration.tsx
│       │   ├── WalkInQueue.tsx
│       │   ├── WaitlistManagement.tsx
│       │   ├── DoctorSchedule.tsx
│       │   ├── DoctorAppointments.tsx
│       │   ├── MyAppointments.tsx
│       │   ├── AppointmentReports.tsx
│       │   └── AppointmentSettings.tsx
│       ├── components/             # Layout, ProtectedRoute, Toast
│       ├── services/               # 11 API service modules
│       ├── contexts/               # Auth & Toast providers
│       └── types/                  # 5 TypeScript type definition files
│
├── database_hole/                  # Database SQL scripts
│   ├── 01_schema.sql              # Full schema (62 tables)
│   ├── 02_seed_data.sql           # Seed data
│   ├── 03_queries.sql             # Reference queries (do not run)
│   ├── 04_waitlist_table.sql      # Waitlist migration
│   └── README.md                  # Database setup notes
│
├── project-plan/                   # Architecture & design docs
├── .gitignore
├── SETUP_GUIDE.md                  # Full setup instructions
└── README.md                       # This file
```

---

## Quick Start

### Prerequisites

| Software   | Version  |
|------------|----------|
| PostgreSQL | 15+      |
| Python     | 3.11+    |
| Node.js    | 20+      |

### 1. Database

```sql
psql -U postgres
CREATE USER hms_user WITH PASSWORD 'HMS@2026';
CREATE DATABASE hms_db;
GRANT ALL PRIVILEGES ON DATABASE hms_db TO hms_user;
\c hms_db
GRANT ALL ON SCHEMA public TO hms_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hms_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hms_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hms_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hms_user;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\q
```

```powershell
$env:PGPASSWORD = "HMS@2026"
psql -h localhost -U hms_user -d hms_db -f database_hole/01_schema.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/02_seed_data.sql
psql -h localhost -U hms_user -d hms_db -f database_hole/04_waitlist_table.sql
```

### 2. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# → Edit .env: set DATABASE_URL and generate SECRET_KEY
mkdir uploads
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

### 4. Access

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Application |
| http://localhost:8000/docs | Swagger API Docs |
| http://localhost:8000/redoc | ReDoc API Docs |

**Default Login:** `superadmin` / `Admin@123`

> For detailed step-by-step instructions, see **[SETUP_GUIDE.md](SETUP_GUIDE.md)**

---

## API Endpoints

All endpoints are prefixed with `/api/v1`.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | User login |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | User logout |
| `GET` | `/auth/me` | Current user profile |

### Users & Staff

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users` | List users (paginated, filterable) |
| `POST` | `/users` | Create user |
| `GET` | `/users/:id` | Get user details |
| `PUT` | `/users/:id` | Update user |
| `DELETE` | `/users/:id` | Soft-delete user |
| `POST` | `/users/:id/upload-photo` | Upload user photo |
| `POST` | `/users/:id/reset-password` | Reset user password |

### Patients

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/patients` | List patients (paginated) |
| `POST` | `/patients` | Register new patient |
| `GET` | `/patients/:id` | Get patient details |
| `PUT` | `/patients/:id` | Update patient |
| `DELETE` | `/patients/:id` | Soft-delete patient |

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/appointments` | List appointments |
| `POST` | `/appointments` | Book appointment |
| `GET` | `/appointments/:id` | Get appointment details |
| `PUT` | `/appointments/:id` | Update appointment |
| `DELETE` | `/appointments/:id` | Cancel appointment |
| `POST` | `/appointments/:id/reschedule` | Reschedule appointment |
| `PATCH` | `/appointments/:id/status` | Update status |
| `GET` | `/appointments/:id/pdf` | Download appointment PDF |

### Walk-In Queue

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/walk-ins` | Register walk-in (auto-waitlists if full) |
| `GET` | `/walk-ins/queue` | Get live queue |
| `PATCH` | `/walk-ins/queue/:id/call` | Call next patient |
| `PATCH` | `/walk-ins/queue/:id/start-consultation` | Start consultation |
| `PATCH` | `/walk-ins/queue/:id/complete` | Complete consultation |
| `PATCH` | `/walk-ins/queue/:id/skip` | Skip patient |
| `GET` | `/walk-ins/queue/doctor-loads` | Doctor workload stats |

### Waitlist

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/waitlist` | List waitlist entries |
| `POST` | `/waitlist` | Add to waitlist |
| `GET` | `/waitlist/:id` | Get waitlist entry |
| `PATCH` | `/waitlist/:id` | Update entry |
| `DELETE` | `/waitlist/:id` | Cancel entry |
| `POST` | `/waitlist/:id/book` | Promote to appointment |
| `GET` | `/waitlist/stats/summary` | Waitlist statistics |

### Schedules & Doctors

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/schedules/doctors` | List doctor schedules |
| `POST` | `/schedules/doctors/:id` | Create schedule slot |
| `POST` | `/schedules/doctors/:id/bulk` | Bulk create slots |
| `GET` | `/schedules/available-slots` | Get available slots for booking |
| `POST` | `/schedules/doctor-leaves` | Create leave |
| `GET` | `/schedules/doctor-leaves` | List leaves |
| `GET` | `/doctors` | List doctors |
| `GET` | `/doctors/me` | Current doctor profile |

### Hospital & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/hospital/full` | Get hospital configuration |
| `POST` | `/hospital` | Create hospital config |
| `PUT` | `/hospital` | Update hospital config |
| `GET` | `/departments` | List departments |
| `GET` | `/appointment-settings` | Get appointment settings |
| `GET` | `/reports/appointments/statistics` | Appointment statistics |

---

## User Roles

| Role | Access Level |
|------|-------------|
| **Super Admin** | Full system access — user management, hospital setup, all modules |
| **Admin** | Staff management, patient records, appointments, reports |
| **Doctor** | Own schedule, appointments, walk-in queue, patient records |
| **Nurse** | Patient records, walk-in queue, appointment management |
| **Receptionist** | Walk-in registration, queue, appointment booking, waitlist |
| **Pharmacist** | Prescription access |
| **Cashier** | Billing operations |
| **Inventory Manager** | Stock management |

---

## Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://hms_user:HMS%402026@localhost:5432/hms_db
SECRET_KEY=<generate-with: python -c "import secrets; print(secrets.token_hex(32))">
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=["http://localhost:3000"]
PRN_PREFIX=HMS
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:8000
```

---

## Default Credentials

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `superadmin` | `Admin@123` |
| Admin | `admin1` | `Admin@123` |
| Doctor | `drsmith` | `Admin@123` |
| Receptionist | `reception1` | `Admin@123` |
| Nurse | `nursewilson` | `Admin@123` |
| Pharmacist | `pharma1` | `Admin@123` |
| Cashier | `cashier1` | `Admin@123` |

> **Change all default passwords after first login.**

---

## Production Checklist

- [ ] Generate new `SECRET_KEY`
- [ ] Change all default passwords
- [ ] Set `DEBUG=False`
- [ ] Update `CORS_ORIGINS` to production domain
- [ ] Enable HTTPS
- [ ] Set up automated database backups
- [ ] Configure log rotation
- [ ] Set `VITE_API_BASE_URL` to production API URL

---

<p align="center">
  <sub>Built with React, FastAPI, and PostgreSQL</sub>
</p>
