# Hospital Management System - Setup & Run Guide

## Prerequisites

- **PostgreSQL 15+** installed and running
- **Python 3.11+** installed
- **Node.js 18+** and npm installed
- **Git** installed

---

## 1. Database Setup

### 1a. Fresh Installation (New Database)

> **⚠️ Important:** PostgreSQL 15+ requires explicit schema permissions for non-superuser roles.
> You **must** run Step 1 as the `postgres` superuser before anything else.

**Step 1 — Create database, user & grant permissions (run as `postgres` superuser):**

Choose **one** of the following options:

**Option A — Automated script (recommended):**
```bash
psql -U postgres -f database/scripts/000_setup_database.sql
```

**Option B — Manual commands in psql / pgAdmin:**
```sql
-- Connect as postgres superuser first
-- 1. Create user (choose a strong password!)
CREATE USER hospital_admin WITH PASSWORD '<YOUR_STRONG_PASSWORD>';

-- 2. Create database
CREATE DATABASE hospital_management OWNER hospital_admin;

-- 3. Connect to the new database
\connect hospital_management

-- 4. Grant schema permissions (CRITICAL for PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO hospital_admin;
```

**Step 2 — Create tables (run as `hospital_admin`):**
```bash
psql -U hospital_admin -d hospital_management -f database/scripts/001_create_schema.sql
```

**Step 3 — Seed test data:**
```bash
psql -U hospital_admin -d hospital_management -f database/seeds/seed_data.sql
```

### 1b. Existing Database (Migration from old schema)

If you already have the old schema with `full_name` and `+91XXXXXXXXXX` mobile format:

```bash
# Migrate name & mobile fields to global format
psql -U hospital_admin -d hospital_management -f database/scripts/002_migrate_patient_fields.sql
```

### 1c. Troubleshooting — "permission denied for schema public"

This error occurs on **PostgreSQL 15+** because non-superuser roles no longer have
CREATE permission on the `public` schema by default.

**Fix:** Connect as `postgres` superuser and run:
```sql
\connect hospital_management
GRANT ALL ON SCHEMA public TO hospital_admin;
```
Then re-run the schema script (Step 2 above).

---

## 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
# Copy .env.example to .env and edit as needed:
copy .env.example .env   # Windows
# cp .env.example .env   # Linux/Mac

# Edit .env with your database credentials and secret key
```

### Backend .env Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://<user>:<password>@localhost:5432/hospital_management` |
| `SECRET_KEY` | JWT signing key (min 32 chars) | Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `PRN_PREFIX` | Patient Reference Number prefix | `HMS` |
| `DEFAULT_PAGE_SIZE` | Default pagination size | `10` |
| `MAX_PAGE_SIZE` | Maximum pagination size | `100` |
| `CORS_ORIGINS` | Allowed frontend origins | `["http://localhost:3000", "http://localhost:5173"]` |

#### SMTP Email Configuration (for password emails & patient ID cards)

| Variable | Description | Default |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USERNAME` | SMTP login username | (empty) |
| `SMTP_PASSWORD` | SMTP login password / app password | (empty) |
| `FROM_EMAIL` | Sender email address | (empty) |
| `FROM_NAME` | Sender display name | `Hospital Management System` |

> **Gmail users**: Enable 2FA and generate an App Password at https://myaccount.google.com/apppasswords

#### Hospital Details (shown on Patient ID Cards)

| Variable | Description | Default |
|----------|-------------|---------|
| `HOSPITAL_NAME` | Hospital name | `General Hospital` |
| `HOSPITAL_ADDRESS` | Street address | `123 Medical Avenue` |
| `HOSPITAL_CITY` | City | `Mumbai` |
| `HOSPITAL_STATE` | State/Province | `Maharashtra` |
| `HOSPITAL_COUNTRY` | Country | `India` |
| `HOSPITAL_PIN_CODE` | Postal/ZIP code | `400001` |
| `HOSPITAL_PHONE` | Contact phone | `+91 22 12345678` |
| `HOSPITAL_EMAIL` | Contact email | `info@hospital.com` |
| `HOSPITAL_WEBSITE` | Hospital website | `www.hospital.com` |

### Run Backend

```bash
cd backend
venv\Scripts\activate   # Windows
uvicorn app.main:app --reload --port 8000
```

Backend will be available at: `http://localhost:8000`
API docs at: `http://localhost:8000/docs`

---

## 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend will be available at: `http://localhost:5173`

---

## 4. Default Login Credentials

> **⚠️ Security:** Default credentials are for initial setup only.
> Change ALL passwords immediately after first login.
> See `TESTING_GUIDE.md` (local only, not in repo) for seed account details.

| Username | Password | Role |
|----------|----------|------|
| `superadmin` | *(set during seed)* | Super Admin |
| `admin` | *(set during seed)* | Admin |
| `doctor1` | *(set during seed)* | Doctor |
| `nurse1` | *(set during seed)* | Nurse |

---

## 5. Features

### 5.1 Patient Registration (Global)
- **Name** split into Title, First Name, Last Name
- **Mobile Number** with international country code dropdown + 4-15 digit number
- **Country** dropdown with 35+ countries
- **State/Province** dynamically filters based on selected country
- **Postal Code** supports global formats (alphanumeric, 3-10 chars)
- **Blood Group** dropdown (A+, A-, B+, B-, AB+, AB-, O+, O-)
- **Emergency Contact** with relationship dropdown and international phone support

### 5.2 Auto-Generated PRN
- Format: `{PRN_PREFIX}-{6-digit-number}` (e.g., `HMS-000001`)
- Configurable prefix via `.env`
- Uses PostgreSQL sequence for thread-safe auto-increment

### 5.3 Patient ID Card
- Printable ID card accessible from Patient Detail page
- **Front**: Hospital name, PRN, patient photo placeholder, personal details, emergency contact
- **Back**: Hospital details (address, phone, email, website)
- Print button for physical card printing
- Email ID card to patient via configured SMTP

### 5.4 User Management (Super Admin Only)
- Accessible only by users with `super_admin` role
- **Create** users with role assignment (9 roles available)
- **Edit** user details (name, email, role, active status)
- **Reset password** with option to auto-send via email
- **Deactivate/Delete** users (soft delete)
- Dashboard card visible only for super admins

### 5.5 Available User Roles
| Role | Description |
|------|-------------|
| `super_admin` | Full system access + user management |
| `admin` | System administration |
| `doctor` | Clinical access |
| `nurse` | Nursing access |
| `receptionist` | Front desk operations |
| `pharmacist` | Pharmacy operations |
| `cashier` | Billing operations |
| `inventory_manager` | Inventory management |
| `staff` | General staff access |

---

## 6. Project Structure

```
HMS/
├── backend/
│   ├── app/
│   │   ├── config.py          # Settings (DB, JWT, SMTP, Hospital details)
│   │   ├── main.py            # FastAPI application
│   │   ├── database.py        # DB connection
│   │   ├── dependencies.py    # Auth & role dependencies
│   │   ├── models/
│   │   │   ├── patient.py     # Patient model
│   │   │   └── user.py        # User model (9 roles)
│   │   ├── schemas/
│   │   │   ├── patient.py     # Patient Pydantic schemas (global validation)
│   │   │   ├── user.py        # User management schemas
│   │   │   └── auth.py        # Auth schemas
│   │   ├── routers/
│   │   │   ├── patients.py    # Patient CRUD + email ID card
│   │   │   ├── users.py       # User management (super_admin only)
│   │   │   └── auth.py        # Login/register/token
│   │   ├── services/
│   │   │   ├── patient_service.py  # PRN generation
│   │   │   ├── user_service.py     # User CRUD operations
│   │   │   └── email_service.py    # SMTP email service
│   │   └── utils/
│   │       ├── security.py    # JWT & password hashing
│   │       └── validators.py  # Global validators
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Register.tsx        # Global patient registration form
│   │   │   ├── PatientList.tsx     # Patient table with search/pagination
│   │   │   ├── PatientDetail.tsx   # Patient details + ID card link
│   │   │   ├── PatientIdCard.tsx   # Printable patient ID card
│   │   │   ├── UserManagement.tsx  # User CRUD (super_admin only)
│   │   │   ├── Dashboard.tsx       # Dashboard with role-based cards
│   │   │   └── Login.tsx
│   │   ├── types/
│   │   │   ├── patient.ts    # Patient interfaces
│   │   │   ├── user.ts       # User management interfaces
│   │   │   └── auth.ts       # Auth interfaces (9 roles)
│   │   ├── utils/
│   │   │   ├── validation.ts # Zod schemas (global patterns)
│   │   │   └── constants.ts  # Countries, states, codes (35+ countries)
│   │   ├── services/
│   │   │   ├── patientService.ts  # Patient API + email ID card
│   │   │   ├── userService.ts     # User management API
│   │   │   └── api.ts             # Axios instance
│   │   └── contexts/
│   │       └── AuthContext.tsx
│   └── package.json
├── database/
│   ├── scripts/
│   │   ├── 000_setup_database.sql         # DB & user creation (run as postgres)
│   │   ├── 001_create_schema.sql          # Full schema (run as hospital_admin)
│   │   ├── 002_migrate_patient_fields.sql # Migration: name split, mobile format
│   │   └── 003_add_patient_photo.sql      # Migration: add photo_url column
│   └── seeds/
│       └── seed_data.sql                  # Seed users + sample patients
└── SETUP_AND_RUN_GUIDE.md
```

---

## 7. API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/refresh` | Refresh JWT token |
| GET | `/api/v1/auth/me` | Get current user |

### Patients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/patients` | List patients (paginated, searchable) |
| POST | `/api/v1/patients` | Create patient |
| GET | `/api/v1/patients/{id}` | Get patient details |
| PUT | `/api/v1/patients/{id}` | Update patient |
| DELETE | `/api/v1/patients/{id}` | Soft delete patient |
| POST | `/api/v1/patients/{id}/email-id-card` | Email ID card to patient |

### Users (Super Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users` | List users (paginated, searchable) |
| POST | `/api/v1/users` | Create user |
| GET | `/api/v1/users/{id}` | Get user details |
| PUT | `/api/v1/users/{id}` | Update user |
| DELETE | `/api/v1/users/{id}` | Deactivate user |
| POST | `/api/v1/users/{id}/reset-password` | Reset user password |
| POST | `/api/v1/users/{id}/send-password` | Send password via email |

### Config
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/config/hospital` | Get hospital details |

---

## 8. Troubleshooting

| Issue | Solution |
|-------|----------|
| **`permission denied for schema public`** | PostgreSQL 15+ issue. Run `000_setup_database.sql` as `postgres` superuser, or: `\connect hospital_management` → `GRANT ALL ON SCHEMA public TO hospital_admin;` |
| `relation "prn_sequence" does not exist` | Run `001_create_schema.sql` — it creates the sequence |
| `column "full_name" does not exist` | Your DB has old schema — run `002_migrate_patient_fields.sql` |
| `column "prn" does not exist` | Your DB has old schema — run `002_migrate_patient_fields.sql` |
| `UNIQUE constraint on mobile_number fails` | Old data has `+91` prefix — run migration script to strip it |
| Backend 500 error on patient create | Check that `prn_sequence` exists in the database |
| `PRN_PREFIX` not working | Add `PRN_PREFIX=HMS` to `backend/.env` |
| Email not sending | Configure SMTP_* variables in `.env`. Gmail users need App Password |
| User management page shows "Access Denied" | Log in as `superadmin` (role must be `super_admin`) |
| Patient ID card button not showing | Navigate to Patient Detail page → "View ID Card" button at top |
| `chk_mobile_format` violation on insert | Run migration `002_migrate_patient_fields.sql` to update constraints |
