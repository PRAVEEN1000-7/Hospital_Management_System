# Hospital Management System - Setup & Run Guide

## Prerequisites

- **PostgreSQL 15+** installed and running
- **Python 3.11+** installed
- **Node.js 18+** and npm installed
- **Git** installed

---

## 1. Database Setup

### 1a. Fresh Installation (New Database)

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create database and user
CREATE DATABASE hospital_management;
CREATE USER hospital_admin WITH PASSWORD 'HMS@2026';
GRANT ALL PRIVILEGES ON DATABASE hospital_management TO hospital_admin;
ALTER DATABASE hospital_management OWNER TO hospital_admin;
\q

# Run schema script
psql -U hospital_admin -d hospital_management -f database/scripts/001_create_schema.sql

# Run seed data
psql -U hospital_admin -d hospital_management -f database/seeds/seed_data.sql
```

### 1b. Existing Database (Migration from old schema)

If you already have the old schema with `full_name` and `+91XXXXXXXXXX` mobile format:

```bash
# Step 1: Migrate name & mobile fields
psql -U hospital_admin -d hospital_management -f database/scripts/002_migrate_patient_fields.sql

# Step 2: Apply global support & user management updates
psql -U hospital_admin -d hospital_management -f database/scripts/003_global_and_user_mgmt.sql
```

Migration 003 will:
- Expand user roles (adds `super_admin`, `receptionist`, `pharmacist`, `cashier`, `inventory_manager`)
- Update mobile number constraint for global format (4-15 digits)
- Update postal code constraint for global format (alphanumeric, 3-10 chars)
- Create default `superadmin` user

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
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://hospital_admin:HMS%402026@localhost:5432/hospital_management` |
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

| Username | Password | Role |
|----------|----------|------|
| `superadmin` | `Super@123` | Super Admin |
| `admin` | `Admin@123` | Admin |
| `doctor1` | `Admin@123` | Doctor |
| `nurse1` | `Admin@123` | Nurse |

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
│   │   ├── 001_create_schema.sql         # Full schema (global constraints)
│   │   ├── 002_migrate_patient_fields.sql # Migration: name split, mobile format
│   │   └── 003_global_and_user_mgmt.sql  # Migration: global + user management
│   └── seeds/
│       └── seed_data.sql                 # Seed users + sample patients
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
| `relation "prn_sequence" does not exist` | Run `001_create_schema.sql` — it creates the sequence |
| `column "full_name" does not exist` | Your DB has old schema — run `002_migrate_patient_fields.sql` |
| `column "prn" does not exist` | Your DB has old schema — run `002_migrate_patient_fields.sql` |
| `UNIQUE constraint on mobile_number fails` | Old data has `+91` prefix — run migration script to strip it |
| Backend 500 error on patient create | Check that `prn_sequence` exists in the database |
| `PRN_PREFIX` not working | Add `PRN_PREFIX=HMS` to `backend/.env` |
| Email not sending | Configure SMTP_* variables in `.env`. Gmail users need App Password |
| User management page shows "Access Denied" | Log in as `superadmin` (role must be `super_admin`) |
| Patient ID card button not showing | Navigate to Patient Detail page → "View ID Card" button at top |
| `chk_mobile_format` violation on insert | Run migration `003_global_and_user_mgmt.sql` to update constraints |
