# Prescription Module — Plug & Play Documentation

## Overview

A complete **E-Prescription** module added to the Hospital Management System.  
Doctors can create, edit, finalize, and print prescriptions.  
Pharmacists and nurses can view prescriptions. Admins have full access.

---

## New Files Created

### Database

| File | Purpose |
|------|---------|
| `database_hole/04_prescription_schema.sql` | SQL migration — 5 tables, indexes, permissions seed (additive, safe to re-run) |

**Tables created:**
- `medicines` — hospital formulary catalog
- `prescriptions` — main prescription records (UUID PK, status, versioning)
- `prescription_items` — line items (medicine, dosage, frequency, duration, route)
- `prescription_templates` — reusable prescription templates for doctors
- `prescription_versions` — version snapshots for audit trail

### Backend (FastAPI / Python)

| File | Purpose |
|------|---------|
| `backend/app/models/prescription.py` | SQLAlchemy ORM models (Medicine, Prescription, PrescriptionItem, PrescriptionTemplate, PrescriptionVersion) |
| `backend/app/schemas/prescription.py` | Pydantic v2 request/response schemas with `_orm_to_dict` pattern |
| `backend/app/services/prescription_service.py` | Business logic — CRUD, finalization, versioning, batch enrichment |
| `backend/app/routers/prescriptions.py` | REST API endpoints — 3 routers (prescriptions, medicines, templates) |

### Frontend (React / TypeScript)

| File | Purpose |
|------|---------|
| `frontend/src/types/prescription.ts` | TypeScript interfaces for all prescription entities |
| `frontend/src/services/prescriptionService.ts` | Axios API service layer |
| `frontend/src/pages/PrescriptionList.tsx` | List/manage prescriptions with search, filters, pagination |
| `frontend/src/pages/PrescriptionBuilder.tsx` | Create/edit prescription form with patient search, medicine formulary, templates |
| `frontend/src/pages/PrescriptionDetail.tsx` | View prescription detail with items, version history, quick actions |

---

## Existing Files Modified

Only **4 files** were modified (minimal changes):

| File | Change |
|------|--------|
| `backend/app/main.py` | Added 1 import line + 3 `app.include_router()` calls for prescription routers |
| `backend/app/models/__init__.py` | Added 1 import line for prescription models |
| `frontend/src/App.tsx` | Added 3 import lines + 4 `<Route>` definitions for prescription pages |
| `frontend/src/components/common/Layout.tsx` | Added `prescriptionsOpen` state + `prescriptionItems` nav array + collapsible sidebar section |

---

## API Endpoints

### Prescriptions (`/api/v1/prescriptions`)

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/` | Create prescription | doctor, admin, super_admin |
| GET | `/` | List prescriptions (paginated, filterable) | all clinical |
| GET | `/{id}` | Get single prescription | all clinical |
| PUT | `/{id}` | Update draft prescription | doctor, admin, super_admin |
| DELETE | `/{id}` | Soft-delete draft prescription | doctor, admin, super_admin |
| POST | `/{id}/finalize` | Finalize (lock) prescription | doctor, admin, super_admin |
| GET | `/my-prescriptions` | Doctor's own prescriptions | doctor |
| GET | `/patient/{patient_id}` | Patient's prescription history | all clinical |
| GET | `/{id}/versions` | Version history | all clinical |
| GET | `/{id}/pdf` | Printable HTML/PDF | all clinical |

### Medicines (`/api/v1/medicines`)

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/` | Add to hospital formulary | admin, super_admin |
| GET | `/` | Search/list medicines | all clinical |
| PUT | `/{id}` | Update medicine | admin, super_admin |

### Templates (`/api/v1/prescription-templates`)

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/` | Create template | doctor, admin, super_admin |
| GET | `/` | List templates | all clinical |
| PUT | `/{id}` | Update template | doctor, admin, super_admin |
| DELETE | `/{id}` | Delete template | doctor, admin, super_admin |
| POST | `/{id}/use` | Use template (increments counter) | all clinical |

---

## Frontend Routes

| Path | Page | Allowed Roles |
|------|------|---------------|
| `/prescriptions` | PrescriptionList | super_admin, admin, doctor, nurse, pharmacist |
| `/prescriptions/new` | PrescriptionBuilder | super_admin, admin, doctor |
| `/prescriptions/:id` | PrescriptionDetail | super_admin, admin, doctor, nurse, pharmacist |
| `/prescriptions/:id/edit` | PrescriptionBuilder | super_admin, admin, doctor |

---

## Setup Instructions

### For existing team members (already have the system running)

**Only ONE step required — run the prescription schema migration:**

```bash
psql -U <your_db_user> -d <your_db_name> -h localhost -f database_hole/04_prescription_schema.sql
```

That's it. The migration is fully additive and safe:
- All `CREATE TABLE IF NOT EXISTS` — won't touch your existing tables
- All `CREATE INDEX IF NOT EXISTS` — won't duplicate indexes
- Permissions `INSERT ... ON CONFLICT DO NOTHING` — won't duplicate rows
- **No ALTER, DROP, UPDATE, or DELETE** — your existing data, passwords, and records stay exactly as they are

Then restart your backend and frontend as usual. The new routes and sidebar will appear automatically.

### For fresh setup (new developer / new machine)

```bash
# 1. Database (run in order)
psql -U <user> -d <db> -h localhost -f database_hole/01_schema.sql
psql -U <user> -d <db> -h localhost -f database_hole/02_seed_data.sql
psql -U <user> -d <db> -h localhost -f database_hole/04_prescription_schema.sql

# 2. Backend
cd backend
cp .env.example .env        # then fill in your DB credentials
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd frontend
echo "VITE_API_BASE_URL=http://localhost:8000/api/v1" > .env
npm install --legacy-peer-deps
npm run dev
```

**Default login after fresh seed:** `superadmin` / `Admin@123`

---

## Design Patterns Followed

- **Backend:** Model → Schema → Service → Router (same as appointments)
- **Frontend:** Types → Service → Pages (same as appointments)
- **Database:** UUID PKs via `gen_random_uuid()`, soft deletes, audit columns, `TIMESTAMPTZ`
- **Auth:** JWT + role-based `ProtectedRoute` guards
- **UI:** Slate color palette, `primary=#137fec`, `rounded-xl` cards, Material Symbols icons, `input-field` CSS class
- **Sidebar:** Collapsible section mirroring the Appointments pattern
- **API prefix:** `/api/v1` consistent with all other modules

---

## Status Flow

```
draft → finalized → dispensed
                  → partially_dispensed
```

- **Draft:** Editable, deletable
- **Finalized:** Locked, printable, creates version snapshot
- **Dispensed/Partially Dispensed:** Set by pharmacy module (future)
