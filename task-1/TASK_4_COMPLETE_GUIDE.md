# TASK 4: HOSPITAL DETAILS MODULE - COMPLETE GUIDE & WORKFLOW

## 📚 TABLE OF CONTENTS
1. [Implementation Summary](#implementation-summary)
2. [Architecture Overview](#architecture-overview)
3. [Database Layer](#database-layer)
4. [Backend Layer](#backend-layer)
5. [Frontend Layer](#frontend-layer)
6. [Complete Workflow](#complete-workflow)
7. [Setup Instructions](#setup-instructions)
8. [API Documentation](#api-documentation)
9. [Testing Guide](#testing-guide)
10. [Learning Points](#learning-points)

---

## 📦 IMPLEMENTATION SUMMARY

### **What Was Implemented:**
- ✅ Database table for hospital configuration (single record)
- ✅ Backend API for CRUD operations (super_admin only)
- ✅ Logo upload functionality with file validation
- ✅ Frontend setup wizard for first-time configuration
- ✅ Frontend profile page for viewing/editing
- ✅ Integration with Patient ID Card (back side)
- ✅ Dashboard card for super admins

### **Files Created: 14**
**Database:** 1 file  
**Backend:** 6 files  
**Frontend:** 7 files  

### **Files Modified: 5**
- `backend/app/main.py`
- `frontend/src/App.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/PatientIdCard.tsx`

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE (React)                    │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  HospitalSetup   │  │ HospitalProfile  │                │
│  │  (First-time)    │  │  (View/Edit)     │                │
│  └────────┬─────────┘  └────────┬─────────┘                │
│           │                     │                           │
│           └──────────┬──────────┘                           │
│                      │                                       │
│              ┌───────▼───────┐                              │
│              │ hospitalService│ (API calls)                 │
│              └───────┬────────┘                              │
└──────────────────────┼──────────────────────────────────────┘
                       │ HTTP REST API
┌──────────────────────▼──────────────────────────────────────┐
│                  BACKEND (FastAPI)                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Router (hospital.py)                                  │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │ GET  /hospital/status                           │  │ │
│  │  │ GET  /hospital                                  │  │ │
│  │  │ POST /hospital          (super_admin)           │  │ │
│  │  │ PUT  /hospital          (super_admin)           │  │ │
│  │  │ POST /hospital/logo     (super_admin)           │  │ │
│  │  │ GET  /hospital/logo                             │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  └─────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│  ┌─────────────────────▼──────────────────────────────────┐ │
│  │  Service Layer (hospital_service.py)                   │ │
│  │  - Business logic                                      │ │
│  │  - File upload handling                                │ │
│  │  - Validation                                          │ │
│  └─────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│  ┌─────────────────────▼──────────────────────────────────┐ │
│  │  Model (hospital.py)                                   │ │
│  │  SQLAlchemy ORM mapping                                │ │
│  └─────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ SQL
┌────────────────────────▼────────────────────────────────────┐
│                  DATABASE (PostgreSQL)                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Table: hospital_details (Single Record)              │ │
│  │  - Basic Info (name, code, type, reg. no.)           │ │
│  │  - Contact (phone, email, website)                    │ │
│  │  - Address (full address, city, state, pin)          │ │
│  │  - Branding (logo path, filename)                     │ │
│  │  - Legal (GST, PAN, licenses)                         │ │
│  │  - Operations (working hours, days)                   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ DATABASE LAYER

### **File: `database/scripts/004_create_hospital_details.sql`**

#### **Purpose:**
Creates the `hospital_details` table with all necessary fields and constraints.

#### **Key Features:**
1. **Single Record Enforcement** - Trigger prevents multiple hospital records
2. **Auto-update Timestamp** - `updated_at` updates automatically
3. **Audit Trail** - All changes logged in `audit_logs` table
4. **Validation** - Phone, email, GST, PAN format checks

#### **Table Structure:**
```sql
hospital_details
├── id (Primary Key)
├── hospital_name (VARCHAR 200) *Required*
├── hospital_code (VARCHAR 20)
├── registration_number (VARCHAR 50)
├── primary_phone (VARCHAR 20) *Required*
├── email (VARCHAR 255) *Required*
├── address_line1 (TEXT) *Required*
├── city, state, country, pin_code *Required*
├── logo_path (VARCHAR 500) - File system path
├── gst_number, pan_number (Tax identifiers)
├── working_hours_start, working_hours_end (TIME)
├── working_days (JSONB array)
├── is_configured (BOOLEAN) - Setup status
├── created_at, updated_at, created_by, updated_by
```

#### **Important Constraints:**
- **Only 1 record allowed** (enforced by trigger)
- **No DELETE** - Can only INSERT (once) and UPDATE
- **Email format** validation
- **Phone format** validation (international)
- **GST/PAN** format validation (India specific)

#### **Run Migration:**
```powershell
psql -U hospital_admin -d hospital_management -f database/scripts/004_create_hospital_details.sql
```

---

## 🔧 BACKEND LAYER

### **1. Model Layer**
**File: `backend/app/models/hospital.py`**

#### **Purpose:**
SQLAlchemy ORM model mapping Python objects to database table.

#### **Key Features:**
- All database columns mapped to Python attributes
- Computed properties: `full_address`, `is_setup_complete`
- Type hints for better IDE support
- Relationships to `users` table (created_by, updated_by)

#### **Example Usage:**
```python
from .models.hospital import HospitalDetails

# Query
hospital = db.query(HospitalDetails).first()

# Access data
print(hospital.hospital_name)
print(hospital.full_address)  # Computed property
print(hospital.is_setup_complete)  # Computed property
```

---

### **2. Schema Layer**
**File: `backend/app/schemas/hospital.py`**

#### **Purpose:**
Pydantic models for request/response validation and serialization.

#### **Schemas:**
1. **HospitalBase** - Common fields for create/update
2. **HospitalCreate** - For initial setup (all required fields)
3. **HospitalUpdate** - For editing (all fields optional)
4. **HospitalResponse** - Full response with metadata
5. **HospitalPublicInfo** - Public data (for ID cards, no sensitive info)
6. **HospitalLogoUpload** - Logo upload response

#### **Validation Features:**
- Email validation (EmailStr)
- Field length validation
- Custom validators for GST (15 chars), PAN (10 chars)
- Working days validation (valid day names)

#### **Example:**
```python
from .schemas.hospital import HospitalCreate

# Pydantic automatically validates
hospital_data = HospitalCreate(
    hospital_name="City Hospital",
    primary_phone="+91 22 1234 5678",
    email="info@hospital.com",
    address_line1="123 Main St",
    city="Mumbai",
    state="Maharashtra",
    country="India",
    pin_code="400001"
)
```

---

### **3. Service Layer**
**File: `backend/app/services/hospital_service.py`**

#### **Purpose:**
Business logic and data manipulation separated from API layer.

#### **Functions:**

| Function | Purpose | Returns |
|----------|---------|---------|
| `get_hospital_details()` | Get single hospital record | HospitalDetails or None |
| `is_hospital_configured()` | Check if setup done | Boolean |
| `create_hospital()` | First-time setup | HospitalDetails |
| `update_hospital()` | Edit existing record | HospitalDetails |
| `save_hospital_logo()` | Upload logo file | Dict with path info |
| `get_logo_path()` | Get logo file path | String path or None |
| `delete_hospital_logo()` | Remove logo | Dict message |

#### **File Upload Logic:**
```python
# Upload directory
UPLOAD_DIR = "backend/uploads/hospital/"

# Validation
- Allowed extensions: .jpg, .jpeg, .png, .svg
- Max size: 2MB
- Unique filename: "hospital_logo{extension}"

# Process:
1. Validate extension and size
2. Delete old logo if exists
3. Save new file
4. Update database with path
```

---

### **4. Router Layer**
**File: `backend/app/routers/hospital.py`**

#### **Purpose:**
HTTP endpoints for hospital CRUD operations.

#### **Endpoints:**

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/hospital/status` | Public | Check if configured |
| GET | `/hospital` | Public | Get public info (for ID cards) |
| GET | `/hospital/full` | Super Admin | Get complete details |
| POST | `/hospital` | Super Admin | Create (one-time) |
| PUT | `/hospital` | Super Admin | Update |
| POST | `/hospital/logo` | Super Admin | Upload logo |
| GET | `/hospital/logo` | Public | Get logo file |
| DELETE | `/hospital/logo` | Super Admin | Delete logo |

#### **Authentication:**
- Public endpoints: No auth required
- Super Admin endpoints: `require_super_admin` dependency

#### **Error Handling:**
- 404: Hospital not found
- 400: Validation errors, duplicate records
- 401: Unauthorized
- 403: Not super admin
- 500: Server errors

---

## 🎨 FRONTEND LAYER

### **1. TypeScript Types**
**File: `frontend/src/types/hospital.ts`**

#### **Purpose:**
Type definitions for TypeScript type safety.

#### **Interfaces:**
- `Hospital` - Full hospital object
- `HospitalCreate` - Create payload
- `HospitalUpdate` - Update payload (partial)
- `HospitalStatus` - Configuration status
- `HospitalLogoUpload` - Logo upload response

---

### **2. API Service**
**File: `frontend/src/services/hospitalService.ts`**

#### **Purpose:**
Centralized API calls using Axios.

#### **Methods:**
```typescript
hospitalService.checkStatus()         // Check if configured
hospitalService.getHospital()         // Get public info
hospitalService.getHospitalFull()     // Get full details (admin)
hospitalService.createHospital(data)  // Create
hospitalService.updateHospital(data)  // Update
hospitalService.uploadLogo(file)      // Upload logo
hospitalService.getLogoUrl()          // Get logo URL
hospitalService.deleteLogo()          // Delete logo
```

#### **Features:**
- Automatic authentication (token from localStorage)
- Error handling
- TypeScript return types
- FormData for file uploads

---

### **3. Hospital Setup Page**
**File: `frontend/src/pages/HospitalSetup.tsx`**

#### **Purpose:**
First-time hospital configuration wizard.

#### **Features:**
- **Multi-section form:**
  - Basic Information
  - Contact Information
  - Address
  - Legal & Tax (optional)
  - Operating Hours (optional)
- **Form validation** using React Hook Form
- **Default values** pre-filled
- **Success/Error messages**
- **Auto-redirect** to profile after setup

#### **User Flow:**
```
Super Admin logs in
    ↓
Dashboard shows "Hospital Profile" card
    ↓
Clicks card → Redirected to /hospital-profile
    ↓
If not configured → Auto-redirected to /hospital-setup
    ↓
Fills form → Submits
    ↓
Success → Redirected to /hospital-profile
```

---

### **4. Hospital Profile Page**
**File: `frontend/src/pages/HospitalProfile.tsx`**

#### **Purpose:**
View and edit existing hospital details.

#### **Features:**
- **Logo management:**
  - Upload new logo (drag & drop or click)
  - Preview current logo
  - Delete logo
  - Size and type validation
- **Inline editing:**
  - View mode (default)
  - Edit mode (super_admin only)
  - Organized by sections
- **Real-time updates**
- **Form pre-population**

#### **Sections:**
1. Logo Upload (separate card)
2. Basic Information
3. Contact Information
4. Address
5. Legal & Tax Information

---

### **5. Dashboard Integration**
**File: `frontend/src/pages/Dashboard.tsx` (Modified)**

#### **Changes:**
- Added "Hospital Profile" card for super_admin
- Icon: Building2
- Color: Indigo
- Links to `/hospital-profile`

#### **Card Visibility:**
Only shown when `user.role === 'super_admin'`

---

### **6. Patient ID Card Integration**
**File: `frontend/src/pages/PatientIdCard.tsx` (Modified)**

#### **Changes:**
```typescript
// OLD: Hardcoded config
import api from './api';
const hospitalData = await api.get('/config/hospital');

// NEW: Database API
import { hospitalService } from '../services/hospitalService';
const hospitalData = await hospitalService.getHospital();
```

#### **Back Side Updates:**
- Uses `hospital.address_line1`, `hospital.address_line2`
- Uses `hospital.city`, `hospital.state`, `hospital.pin_code`
- Uses `hospital.primary_phone`, `hospital.email`
- Shows `hospital.emergency_hotline` (if available)
- Shows `hospital.registration_number` (if available)
- Uses `hospital.website` (if available)

---

## 🔄 COMPLETE WORKFLOW

### **Scenario 1: First-Time Setup**

```
1. Super Admin logs in
   └→ Dashboard loads

2. Clicks "Hospital Profile" card
   └→ GET /api/v1/hospital/full
   └→ 404 Not Found (no hospital record)
   └→ Auto-redirected to /hospital-setup

3. Fills hospital setup form:
   - Hospital name: "City General Hospital"
   - Phone: "+91 22 1234 5678"
   - Email: "info@hospital.com"
   - Address: "123 Main St, Mumbai..."
   - etc.

4. Clicks "Save Hospital Details"
   └→ POST /api/v1/hospital
   └→ Backend: hospital_service.create_hospital()
   └→ Database: INSERT INTO hospital_details
   └→ Trigger: enforce_single_hospital (passes, first record)
   └→ Response: Created hospital record
   └→ Frontend: Success message
   └→ Redirect to /hospital-profile

5. Hospital Profile page loads
   └→ GET /api/v1/hospital/full
   └→ Shows all hospital details in view mode
```

---

### **Scenario 2: Uploading Logo**

```
1. Super Admin on Hospital Profile page

2. Clicks "Upload Logo" button
   └→ File picker opens

3. Selects logo.png (500KB)
   └→ onChange event triggers

4. Frontend validation:
   - File type: ✓ PNG allowed
   - File size: ✓ <2MB

5. Upload starts:
   └→ POST /api/v1/hospital/logo (FormData)
   └→ Backend: hospital_service.save_hospital_logo()
   
6. Backend validation:
   - Extension check: ✓ .png in allowed list
   - Size check: ✓ <2MB
   - Old logo exists? Delete it
   - Save to: backend/uploads/hospital/hospital_logo.png

7. Database update:
   - logo_path: "D:\\HMS\\task-1\\backend\\uploads\\hospital\\hospital_logo.png"
   - logo_filename: "hospital_logo.png"
   - logo_mime_type: "image/png"
   - logo_size_kb: 488

8. Response: Success with file info

9. Frontend:
   - Refresh hospital data
   - Show success message
   - Display new logo
```

---

### **Scenario 3: Patient ID Card Generation**

```
1. User views patient details (any role)

2. Clicks "View ID Card" button
   └→ Navigate to /patients/:id/id-card

3. Patient ID Card page loads:
   └→ Parallel API calls:
      ├→ GET /api/v1/patients/:id (patient data)
      └→ GET /api/v1/hospital (hospital data)

4. Data received:
   Patient:
   - PRN, Name, DOB, Gender, Blood Group
   - Mobile, Emergency Contact
   
   Hospital:
   - Name, Logo, Address
   - Phone, Email, Website, Emergency Hotline

5. Render ID Card:
   ┌─────────────────────┐
   │ FRONT (Blue header) │
   │ Hospital Name   PRN │
   │ ┌───┐              │
   │ │   │ Patient Info │
   │ │ 👤│ DOB, Gender  │
   │ └───┘ Blood, Mobile│
   │ Emergency Contact   │
   └─────────────────────┘

   ┌─────────────────────┐
   │ BACK (Blue header)  │
   │ Hospital Name       │
   │ Address (from DB)   │
   │ City, State - PIN   │
   │ Phone, Email        │
   │ Website, Emergency  │
   │ Reg. No (if set)    │
   │ Footer text         │
   └─────────────────────┘

6. User clicks "Print / Download"
   └→ Browser print dialog
   └→ CSS @media print styles apply
   └→ Clean card-only output
```

---

### **Scenario 4: Editing Hospital Details**

```
1. Super Admin on Hospital Profile page (view mode)

2. Clicks "Edit Details" button
   └→ Form fields become editable
   └→ "Save" and "Cancel" buttons appear

3. Modifies phone number:
   - Old: "+91 22 1234 5678"
   - New: "+91 22 9999 9999"

4. Clicks "Save Changes"
   └→ PUT /api/v1/hospital
   └→ Payload: { primary_phone: "+91 22 9999 9999" }
   └→ Backend: hospital_service.update_hospital()
   └→ Database: UPDATE hospital_details SET...
   └→ Trigger: update_hospital_updated_at (sets updated_at)
   └→ Trigger: audit_hospital_details (logs change)

5. audit_logs entry created:
   {
     table_name: "hospital_details",
     action: "UPDATE",
     old_values: { "primary_phone": "+91 22 1234 5678", ... },
     new_values: { "primary_phone": "+91 22 9999 9999", ... },
     user_id: 1,
     created_at: "2026-02-11 10:30:00"
   }

6. Response: Updated hospital record

7. Frontend:
   - Exit edit mode
   - Show success message
   - Display updated data
```

---

## 🚀 SETUP INSTRUCTIONS

### **Step 1: Run Database Migration**
```powershell
cd D:\HMS\task-1

# Run migration script
psql -U hospital_admin -d hospital_management -f database/scripts/004_create_hospital_details.sql

# Verify table created
psql -U hospital_admin -d hospital_management -c "\d hospital_details"
```

**Expected Output:**
```
CREATE TABLE
CREATE INDEX
CREATE TRIGGER
CREATE FUNCTION
NOTICE: Hospital Details table created successfully!
```

---

### **Step 2: Restart Backend**
```powershell
cd D:\HMS\task-1\backend

# Activate virtual environment
venv\Scripts\activate

# Restart server (to load new router)
# Press Ctrl+C to stop current server, then:
uvicorn app.main:app --reload --port 8000
```

**Check logs for:**
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

---

### **Step 3: Restart Frontend**
```powershell
cd D:\HMS\task-1\frontend

# Restart development server
# Press Ctrl+C to stop current server, then:
npm run dev
```

**Access:** `http://localhost:5173`

---

### **Step 4: Initial Setup**

1. **Login as Super Admin:**
   - Username: `superadmin`
   - Password: `Super@123`

2. **Navigate to Dashboard**
   - Look for "Hospital Profile" card (only visible to super_admin)

3. **Click "Hospital Profile"**
   - First time: Auto-redirected to Hospital Setup page

4. **Fill Hospital Setup Form:**
   ```
   Hospital Name: City General Hospital
   Phone: +91 22 1234 5678
   Email: info@hospital.com
   Address: 123 Medical Center Road
   City: Mumbai
   State: Maharashtra
   Country: India
   PIN: 400001
   ```

5. **Submit Form**
   - Success message appears
   - Redirected to Hospital Profile page

6. **Upload Logo (Optional):**
   - Click "Upload Logo"
   - Select image file (<2MB, JPG/PNG/SVG)
   - Logo appears on page

7. **Test Patient ID Card:**
   - Go to Patients list
   - Click any patient
   - Click "View ID Card"
   - Check back side has your hospital details

---

## 📡 API DOCUMENTATION

### **Base URL:** `http://localhost:8000/api/v1`

---

### **1. Check Hospital Status**
```http
GET /hospital/status
```

**Access:** Public (no auth required)

**Response:**
```json
{
  "is_configured": true,
  "message": "Hospital configured"
}
```

---

### **2. Get Hospital (Public Info)**
```http
GET /hospital
```

**Access:** Public

**Response:**
```json
{
  "id": 1,
  "hospital_name": "City General Hospital",
  "primary_phone": "+91 22 1234 5678",
  "email": "info@hospital.com",
  "website": "www.hospital.com",
  "emergency_hotline": "+91 22 9999 9999",
  "address_line1": "123 Medical Center Road",
  "address_line2": "Near Central Park",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pin_code": "400001",
  "logo_path": "D:\\HMS\\task-1\\backend\\uploads\\hospital\\hospital_logo.png",
  "registration_number": "MH/REG/2020/12345"
}
```

---

### **3. Get Hospital (Full Details)**
```http
GET /hospital/full
Authorization: Bearer <super_admin_token>
```

**Access:** Super Admin only

**Response:** Full hospital object with all fields including GST, PAN, etc.

---

### **4. Create Hospital**
```http
POST /hospital
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "hospital_name": "City General Hospital",
  "hospital_code": "CGH",
  "regist ration_number": "MH/REG/2020/12345",
  "primary_phone": "+91 22 1234 5678",
  "email": "info@hospital.com",
  "address_line1": "123 Medical Center Road",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pin_code": "400001"
}
```

**Response:** `201 Created` + full hospital object

**Error:** `400 Bad Request` if hospital already exists

---

### ** 5. Update Hospital**
```http
PUT /hospital
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "primary_phone": "+91 22 9999 9999",
  "emergency_hotline": "+91 22 8888 8888"
}
```

**Response:** `200 OK` + updated hospital object

---

### **6. Upload Logo**
```http
POST /hospital/logo
Authorization: Bearer <super_admin_token>
Content-Type: multipart/form-data

file: <binary file>
```

**Response:**
```json
{
  "logo_path": "D:\\HMS\\task-1\\backend\\uploads\\hospital\\hospital_logo.png",
  "logo_filename": "hospital_logo.png",
  "logo_size_kb": 488,
  "message": "Logo uploaded successfully"
}
```

**Errors:**
- `400`: Invalid file type or size exceeded
- `404`: Hospital record not found

---

### **7. Get Logo**
```http
GET /hospital/logo
```

**Access:** Public

**Response:** Binary file (image)

---

### **8. Delete Logo**
```http
DELETE /hospital/logo
Authorization: Bearer <super_admin_token>
```

**Response:**
```json
{
  "message": "Logo deleted successfully"
}
```

---

## 🧪 TESTING GUIDE

### **Test 1: Database Constraints**

```sql
-- Test: Only one record allowed
psql -U hospital_admin -d hospital_management

-- Insert first record (should work)
INSERT INTO hospital_details (hospital_name, primary_phone, email, address_line1, city, state, country, pin_code, created_by, updated_by)
VALUES ('Test Hospital', '+91 22 1234 5678', 'test@hospital.com', '123 Test St', 'Mumbai', 'Maharashtra', 'India', '400001', 1, 1);

-- Try to insert second record (should fail)
INSERT INTO hospital_details (hospital_name, primary_phone, email, address_line1, city, state, country, pin_code, created_by, updated_by)
VALUES ('Another Hospital', '+91 22 9999 9999', 'another@hospital.com', '456 Another St', 'Delhi', 'Delhi', 'India', '110001', 1, 1);

-- Expected: ERROR: Only one hospital record is allowed
```

---

### **Test 2: Logo Upload**

**Invalid File Type:**
```
1. Login as super_admin
2. Go to Hospital Profile
3. Try to upload a .pdf file
4. Expected: Error "Invalid file type. Allowed: .jpg, .jpeg, .png, .svg"
```

**Oversized File:**
```
1. Try to upload 3MB image
2. Expected: Error "File too large. Maximum size: 2MB"
```

**Valid Upload:**
```
1. Upload 500KB PNG
2. Expected: Success, logo displays on page
3. Check database: logo_path, logo_filename populated
4. Check filesystem: File exists at backend/uploads/hospital/
```

---

### **Test 3: Patient ID Card**

```
1. Ensure hospital is configured
2. Go to any patient details page
3. Click "View ID Card"
4. Check BACK SIDE:
   ✓ Hospital name from database
   ✓ Address from database (line1, line2, city, state, pin)
   ✓ Phone, email, website from database
   ✓ Registration number (if set)
5. Click Print
   ✓ Only cards print (no header/buttons)
```

---

### **Test 4: Access Control**

**Non-Super-Admin User:**
```
1. Login as 'doctor1' (role: doctor)
2. Try to access /hospital-profile
3. Expected: Page loads but Edit button missing
4. Try POST /api/v1/hospital
5. Expected: 403 Forbidden
```

**Public Endpoints:**
```
1. Logout (no token)
2. Try GET /api/v1/hospital
3. Expected: 200 OK with hospital data
4. Try GET /api/v1/hospital/logo
5. Expected: Image file
```

---

## 📚 LEARNING POINTS

### **1. Database Design Principles**

**Single Record Table:**
- Used trigger to enforce business rule
- Alternative: Application-level check (less reliable)
- PostgreSQL triggers run before INSERT/UPDATE/DELETE

**Audit Trail:**
- JSONB column stores old/new values
- Automatic logging via trigger
- Essential for compliance and debugging

**Computed Properties:**
- Database: Can use SQL functions
- ORM: Python @property decorator
- Keeps logic in one place

---

### **2. Backend Architecture (3-Layer)**

**Why Separate Layers?**
```
Router (API) → Service (Logic) → Model (Data)

Benefits:
- Testing: Can test service layer without HTTP
- Reusability: Service functions used by multiple routers
- Maintainability: Changes isolated to one layer
- Clarity: Each layer has single responsibility
```

**Example Flow:**
```python
# Router: HTTP handling only
@router.post("/hospital")
async def create_hospital(hospital: HospitalCreate, db: Session, user: User):
    return hospital_service.create_hospital(db, hospital, user.id)

# Service: Business logic
def create_hospital(db: Session, data: HospitalCreate, user_id: int):
    # Validation, transformation, database operations
    hospital = HospitalDetails(**data.model_dump(), created_by=user_id)
    db.add(hospital)
    db.commit()
    return hospital

# Model: Data structure only
class HospitalDetails(Base):
    __tablename__ = "hospital_details"
    id = Column(Integer, primary_key=True)
    # ... field definitions only
```

---

### **3. File Upload Handling**

**Key Concepts:**
```python
# 1. FormData in frontend
const formData = new FormData();
formData.append('file', fileObject);

# 2. FastAPI UploadFile
async def upload(file: UploadFile = File(...)):
    # file.filename, file.content_type, file.file (stream)

# 3. Save to filesystem
with open(path, "wb") as buffer:
    shutil.copyfileobj(file.file, buffer)

# 4. Store path in database (not file content!)
```

**Security Considerations:**
- Validate file extension
- Check file size before saving
- Use unique/predictable filenames (avoid user input)
- Store outside web root if sensitive
- Virus scan for production

---

### **4. Frontend State Management**

**React useState Hook:**
```typescript
const [hospital, setHospital] = useState<Hospital | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

// Fetch data
useEffect(() => {
  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await hospitalService.getHospital();
      setHospital(data);
    } catch (err) {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, []); // Empty array = run once on mount
```

**Form Handling with React Hook Form:**
```typescript
const { register, handleSubmit, reset, formState: { errors } } = useForm();

// Register inputs
<input {...register('hospital_name', { required: true })} />

// Handle submit
const onSubmit = (data) => {
  // data is validated and typed
  api.post('/hospital', data);
};

// Reset form
reset(initialValues);
```

---

### **5. TypeScript Best Practices**

**Type Safety Flow:**
```typescript
// 1. Define interface
interface Hospital {
  id: number;
  hospital_name: string;
  // ...
}

// 2. API service returns typed data
const getHospital = async (): Promise<Hospital> => {
  const response = await api.get<Hospital>('/hospital');
  return response.data;
};

// 3. Component uses typed state
const [hospital, setHospital] = useState<Hospital | null>(null);

// 4. TypeScript catches errors at compile time
hospital.hosptal_name; // Error: Property 'hosptal_name' does not exist
hospital.hospital_name; // OK
```

**Benefits:**
- Autocomplete in IDE
- Catch typos before runtime
- Refactoring is safer
- Self-documenting code

---

### **6. API Design Patterns**

**RESTful Principles:**
```
GET    /resource       → List/Search
POST   /resource       → Create
GET    /resource/:id   → Get single
PUT    /resource/:id   → Update (full)
PATCH  /resource/:id   → Update (partial)
DELETE /resource/:id   → Delete
```

**Our Hospital API:**
```
GET   /hospital        → Get single (no :id needed, only 1 record)
POST  /hospital        → Create single
PUT   /hospital        → Update single
POST  /hospital/logo   → Upload related file
GET   /hospital/logo   → Get related file
```

**Status Codes:**
- 200 OK - Success (GET, PUT)
- 201 Created - Success (POST)
- 400 Bad Request - Validation error
- 401 Unauthorized - No/invalid token
- 403 Forbidden - Valid token, insufficient permissions
- 404 Not Found - Resource doesn't exist
- 500 Internal Server Error - Server problem

---

### **7. Authentication Flow**

```
1. User login → POST /auth/login
   └→ Backend verifies username/password
   └→ Creates JWT token
   └→ Returns token + user info

2. Frontend stores token
   └→ localStorage.setItem('access_token', token)

3. Subsequent requests include token
   └→ axios interceptor adds:
       headers: { Authorization: 'Bearer <token>' }

4. Backend validates token
   └→ decode_access_token(token)
   └→ get user from DB
   └→ check is_active, role
   └→ attach user to request

5. Role-based access
   └→ @require_super_admin dependency
   └→ checks user.role == 'super_admin'
   └→ raises 403 if not
```

---

### **8. Data Validation Layers**

**3 Layers of Validation:**

```
1. Database Layer (SQL constraints)
   ├─ NOT NULL
   ├─ UNIQUE
   ├─ CHECK (email format, phone format)
   └─ Foreign Keys

2. Backend Layer (Pydantic)
   ├─ Type validation (str, int, email)
   ├─ Field constraints (min_length, max_length)
   ├─ Custom validators (@field_validator)
   └─ Business rules (in service layer)

3. Frontend Layer (React Hook Form + HTML5)
   ├─ required attribute
   ├─ type="email", type="tel"
   ├─ minLength, maxLength
   └─ Custom validation rules
```

**Why Multiple Layers?**
- Frontend: Better UX (instant feedback)
- Backend: Security (can't trust client)
- Database: Last line of defense (data integrity)

---

### **9. Error Handling Strategy**

**Backend:**
```python
try:
    # Operation
    result = perform_operation()
    return result
except HTTPException:
    # Pass through FastAPI exceptions
    raise
except ValidationError as e:
    # Pydantic validation failed
    raise HTTPException(400, detail=str(e))
except SQLAlchemyError as e:
    # Database error
    db.rollback()
    logger.error(f"DB error: {e}")
    raise HTTPException(500, detail="Database error")
except Exception as e:
    # Unexpected error
    logger.error(f"Unexpected: {e}", exc_info=True)
    raise HTTPException(500, detail="Internal server error")
```

**Frontend:**
```typescript
try {
  await api.post('/hospital', data);
  setSuccess('Hospital created!');
} catch (err: any) {
  // Extract error message
  const message = err.response?.data?.detail || 'An error occurred';
  setError(message);
}
```

---

### **10. Development Workflow**

**Git Workflow (Recommended):**
```bash
# Feature branch
git checkout -b feature/task-4-hospital-details

# Work on feature (multiple commits)
git add .
git commit -m "Add hospital_details database table"
git commit -m "Implement hospital backend API"
git commit -m "Create hospital frontend pages"

# Merge to main
git checkout main
git merge feature/task-4-hospital-details

# Tag release
git tag -a v1.1.0 -m "Add Hospital Details Module (Task 4)"
```

**Code Review Checklist:**
- [ ] Database migration runs without errors
- [ ] All API endpoints return correct status codes
- [ ] Fields properly validated (backend & frontend)
- [ ] File upload works and validates correctly
- [ ] Patient ID card displays hospital data
- [ ] Only super_admin can create/edit
- [ ] Public endpoints work without auth
- [ ] No sensitive data in public responses
- [ ] Error messages are user-friendly
- [ ] Code is commented where complex
- [ ] TypeScript types are accurate
- [ ] No console.log in production code

---

## 🎓 SUMMARY

### **What You Learned:**

1. **Full-Stack Development:**
   - Database design → Backend API → Frontend UI
   - How each layer communicates
   - Data flow from user click to database and back

2. **Database Techniques:**
   - Single record enforcement with triggers
   - Audit logging
   - Computed properties
   - JSONB for flexible data

3. **Backend Patterns:**
   - 3-layer architecture (Router/Service/Model)
   - Pydantic validation
   - File upload handling
   - JWT authentication
   - Role-based access control

4. **Frontend Skills:**
   - React hooks (useState, useEffect)
   - Form handling (React Hook Form)
   - File uploads (FormData)
   - TypeScript interfaces
   - Axios API calls
   - Error/success handling

5. **Best Practices:**
   - Separation of concerns
   - Type safety
   - Error handling at every layer
   - Security considerations
   - User experience (loading states, error messages)

---

### **Next Steps:**

1. **Test the implementation thoroughly**
2. **Add more features:**
   - Logo preview before upload
   - Drag & drop for logo
   - Image cropping
   - Multiple file formats
   - Logo on reports/emails
3. **Optimize:**
   - Add caching for hospital data
   - Lazy load logo images
   - Compress uploaded images
4. **Document:**
   - API documentation (Swagger)
   - User manual
   - Deployment guide

---

## 📞 SUPPORT

If you encounter issues:

1. **Check logs:**
   - Backend: Console where uvicorn is running
   - Frontend: Browser console (F12)
   - Database: psql error messages

2. **Common issues:**
   - Migration failed → Check table doesn't already exist
   - 403 Forbidden → Check logged in as super_admin
   - Logo not showing → Check file path, permissions
   - Form validation errors → Check required fields
   
3. **Debug mode:**
   ```python
   # backend/app/config.py
   DEBUG = True  # More detailed error messages
   ```

---

**🎉 Congratulations! You've successfully implemented Task 4: Hospital Details Module!**

This module is now the foundation for:
- Patient ID cards (✅ Done)
- Future billing/invoices
- Future email templates
- Future reports

The same patterns learned here apply to all future modules (appointments, prescriptions, pharmacy, etc.).
