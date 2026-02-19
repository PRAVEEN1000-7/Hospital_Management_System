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
  <img src="https://img.shields.io/badge/status-Production_Ready-brightgreen?style=flat-square" alt="Status"/>
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version"/>
  <img src="https://img.shields.io/badge/license-Proprietary-red?style=flat-square" alt="License"/>
</p>

---

## Overview

HMS is an enterprise-grade hospital management system that streamlines staff management, patient records, and facility operations through an intuitive web interface. Built with a React + TypeScript frontend and a FastAPI + PostgreSQL backend, it delivers fast performance with robust security out of the box.

---

## Key Features

| Module | Highlights |
|--------|------------|
| **Dashboard** | Real-time stats for patients, active staff, and facility overview |
| **Staff Directory** | Search, filter, bulk actions, ID card generation (PDF), CSV export |
| **User Management** | Role-based access (8 roles), auto-generated employee IDs, photo upload |
| **Patient Records** | Registration, demographics, medical history, auto-generated PRNs |
| **Hospital Setup** | 3-step configuration wizard with card display view and edit mode |
| **Authentication** | JWT access + refresh tokens, bcrypt password hashing, session management |
| **Audit Trail** | Tracks all CRUD operations with user, IP, timestamp, and change details |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| React 19 + TypeScript 5.9 | UI framework with type safety |
| Vite 7.3 | Build tool with HMR |
| Tailwind CSS 3.4 | Utility-first styling |
| React Hook Form + Zod | Form handling and validation |
| Axios | HTTP client |
| Lucide React | Icon library |
| html2canvas + jsPDF | ID card PDF generation |
| date-fns | Date formatting |

### Backend

| Technology | Purpose |
|-----------|---------|
| FastAPI 0.109 | High-performance API framework |
| SQLAlchemy 2.0 | ORM with async support |
| Pydantic 2.5 | Request/response validation |
| python-jose | JWT token management |
| bcrypt | Password hashing |
| psycopg2 | PostgreSQL driver |
| Jinja2 | Email templates |

### Database

| Feature | Details |
|---------|---------|
| PostgreSQL 15+ | Primary database |
| pgcrypto | Cryptographic functions |
| Role-based sequences | Auto-incrementing employee IDs per role |
| Optimized indexes | On role, department, status, employee_id |
| JSONB audit logs | Detailed change tracking |

---

## Project Structure

```
HMS/v1/
├── backend/
│   └── app/
│       ├── routers/          # auth, users, patients, hospital
│       ├── models/           # SQLAlchemy models
│       ├── schemas/          # Pydantic validation schemas
│       ├── services/         # Business logic layer
│       ├── utils/            # Security, validators
│       ├── config.py         # Environment configuration
│       └── main.py           # FastAPI app entry point
│
├── frontend/
│   └── src/
│       ├── pages/            # 10 page components
│       ├── components/       # Layout, ProtectedRoute, Toast
│       ├── services/         # API client modules
│       ├── contexts/         # Auth & Toast providers
│       ├── types/            # TypeScript interfaces
│       └── utils/            # Constants, validation helpers
│
├── database/
│   ├── scripts/              # 4 schema creation scripts
│   ├── migrations/           # 4 migration scripts
│   └── seeds/                # Initial demo data
│
├── SETUP_GUIDE.md            # Development setup instructions
└── README.md                 # This file
```

---

## Quick Start

### Prerequisites

| Software | Version |
|----------|---------|
| PostgreSQL | 15+ |
| Python | 3.11+ |
| Node.js | 20+ |

### 1. Database

```sql
-- Run as PostgreSQL superuser
CREATE USER hospital_admin WITH PASSWORD '<YOUR_DB_PASSWORD>';
CREATE DATABASE hospital_management;
GRANT ALL PRIVILEGES ON DATABASE hospital_management TO hospital_admin;
\c hospital_management
GRANT ALL ON SCHEMA public TO hospital_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hospital_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hospital_admin;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

```powershell
cd d:\HMS\v1\database
$env:PGPASSWORD = "<YOUR_DB_PASSWORD>"
psql -h localhost -U hospital_admin -d hospital_management -f scripts\001_create_schema.sql
psql -h localhost -U hospital_admin -d hospital_management -f scripts\002_migrate_patient_fields.sql
psql -h localhost -U hospital_admin -d hospital_management -f scripts\003_global_and_user_mgmt.sql
psql -h localhost -U hospital_admin -d hospital_management -f scripts\004_create_hospital_details.sql
psql -h localhost -U hospital_admin -d hospital_management -f migrations\001_add_user_profile_fields.sql
psql -h localhost -U hospital_admin -d hospital_management -f migrations\002_add_employee_sequences_and_indexes.sql
psql -h localhost -U hospital_admin -d hospital_management -f migrations\003_backfill_employee_ids.sql
psql -h localhost -U hospital_admin -d hospital_management -f seeds\seed_data.sql
psql -h localhost -U hospital_admin -d hospital_management -f migrations\004_migrate_to_new_id_format.sql
```

### 2. Backend

```powershell
cd d:\HMS\v1\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```powershell
cd d:\HMS\v1\frontend
npm install
npm run dev
```

### 4. Access

| URL | Description |
|-----|-------------|
| http://localhost:5173 | Application |
| http://localhost:8000/docs | Swagger API Docs |
| http://localhost:8000/redoc | ReDoc API Docs |

**Default Login:** `superadmin` / (password set during seed — change immediately after first login)

> Detailed setup instructions: [SETUP_GUIDE.md](SETUP_GUIDE.md)

---

## API Endpoints

All endpoints are prefixed with `/api/v1`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | User login |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | User logout |
| `GET` | `/users` | List users (paginated) |
| `POST` | `/users` | Create user |
| `PUT` | `/users/:id` | Update user |
| `DELETE` | `/users/:id` | Delete user |
| `POST` | `/users/:id/photo` | Upload user photo |
| `GET` | `/patients` | List patients (paginated) |
| `POST` | `/patients` | Register patient |
| `GET` | `/patients/:id` | Get patient details |
| `PUT` | `/patients/:id` | Update patient |
| `DELETE` | `/patients/:id` | Delete patient |
| `GET` | `/hospital/full` | Get hospital configuration |
| `POST` | `/hospital` | Create hospital config |
| `PUT` | `/hospital` | Update hospital config |

---

## User Roles

| Role | Access Level |
|------|-------------|
| Super Admin | Full system access, user management, hospital setup |
| Admin | Staff management, patient records |
| Doctor | Patient records, medical notes |
| Nurse | Patient records, vitals |
| Pharmacist | Prescription access |
| Receptionist | Patient registration, appointments |
| Cashier | Billing operations |
| Inventory Manager | Stock management |

---

## Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://hospital_admin:<YOUR_DB_PASSWORD>@localhost:5432/hospital_management
SECRET_KEY=<generate-with-python-secrets-token_hex-32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=["http://localhost:5173"]
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

> Generate a production secret key: `python -c "import secrets; print(secrets.token_hex(32))"`

---

## Production Checklist

- [ ] Generate new `SECRET_KEY`
- [ ] Change all default passwords
- [ ] Set `DEBUG=False`
- [ ] Update `CORS_ORIGINS` to production domain
- [ ] Enable HTTPS
- [ ] Set up automated database backups
- [ ] Configure log rotation

---

<p align="center">
  <sub>Built with React, FastAPI, and PostgreSQL &mdash; February 2026</sub>
</p>
