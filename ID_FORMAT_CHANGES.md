## ID Format Changes Implementation - February 16, 2026

### Summary of Changes

This document outlines all changes made to implement the new ID format system based on hospital name initials.

---

## 🆔 New ID Formats

### Patient ID (PRN)
**Format:** `[HOSPITAL_INITIALS][YEAR][6-DIGIT-NUMBER]`

**Examples:**
- HMS Core → `HC2026000001`
- Apollo Hospital → `AH2026000042`
- Max Super Speciality Hospital → `MSSH2026000123`

### Staff Employee ID
**Format:** `[HOSPITAL_INITIALS][ROLE_CODE][YEAR][4-DIGIT-NUMBER]`

**Examples:**
- HMS Core Doctor → `HCDOC2026001`
- Apollo Hospital Nurse → `AHNUR2026042`
- Max Hospital Super Admin → `MSSHSADM2026001`

**Role Codes:**
- DOC - Doctor
- NUR - Nurse
- ADM - Admin
- SADM - Super Admin
- REC - Receptionist
- PHA - Pharmacist
- CSH - Cashier
- INV - Inventory Manager
- STF - Staff (general)

---

## ✅ Implementation Details

### 1. Backend Changes

#### `backend/app/services/user_service.py`
- ✅ Added `get_hospital_prefix()` function to extract hospital initials
- ✅ Updated `generate_employee_id()` to use new format without hyphens
- ✅ Employee IDs now include hospital prefix dynamically

#### `backend/app/services/patient_service.py`
- ✅ Added `get_hospital_prefix()` function
- ✅ Updated `generate_prn()` to use new format without hyphens
- ✅ PRN now includes hospital prefix and current year

#### `backend/app/services/hospital_service.py`
- ✅ Added default hospital name "HMS Core" if not provided
- ✅ Hospital name is used to generate ID prefixes

#### `backend/app/routers/auth.py`
- ✅ Already checks `is_active` flag during login (line 30-34)
- ✅ Inactive users cannot log in

### 2. Frontend Changes

#### `frontend/src/pages/HospitalSetup.tsx`
- ✅ Default hospital name set to "HMS Core"
- ✅ Hospital name changes reflect in ID generation

### 3. Database Changes

#### `database/seeds/seed_hospital_default.sql` (NEW FILE)
- ✅ Created seed script for default hospital "HMS Core"
- ✅ Ensures ID prefix is available on fresh installations

---

## 🔧 Features Implemented

### 1. Remove Hyphens from IDs ✅
- **Old Format:** `STF-2026-007`, `HMS-000001`
- **New Format:** `HCSTF2026007`, `HC2026000001`
- All hyphens removed for cleaner IDs

### 2. Hospital Name-Based ID Prefix ✅
- Extracts first letter of each word from hospital name
- Examples:
  - "HMS Core" → HC
  - "Apollo Hospital" → AH
  - "Max Super Speciality Hospital" → MSSH
- Prefix automatically applied to all new IDs

### 3. Soft Delete for Staff ✅
- Delete function sets `is_active = false` instead of removing record
- Inactive users shown in User Management
- Can be reactivated by admin/super admin
- Inactive users cannot log in (enforced in auth router)

### 4. Gender Column in Patient Table ✅
- Already implemented and visible (PatientList.tsx line 202-204)
- Shows in "Gender" column (hidden on mobile, visible on md+ screens)

---

## 📋 Setup Instructions

### Step 1: Run Migration Script

Execute the migration script to update all existing IDs to the new format:

```powershell
cd d:\HMS\v1\database

# Set password
$env:PGPASSWORD="HMS@2026"

# Run migration (creates hospital + updates all IDs)
psql -h localhost -U hospital_admin -d hospital_management -f migrations\004_migrate_to_new_id_format.sql
```

This script will:
- ✅ Create "HMS Core" hospital if not exists
- ✅ Update all patient PRNs: `HMS-000001` → `HC2026000001`
- ✅ Update all employee IDs: `DOC-2026-0001` → `HCDOC2026001`
- ✅ Show migration summary and verification

### Step 2: Restart Backend Server

The backend must be restarted to pick up the new hospital record:

```powershell
cd d:\HMS\v1\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

### Step 3: Configure Hospital Name

1. Login as Super Admin or Admin
2. Navigate to **Hospital Setup**
3. Update hospital name (e.g., "Apollo Hospital")
4. Complete the setup wizard
5. All new IDs will use the updated prefix

---

## 🔍 Testing the Changes

### Test Patient ID Generation
```powershell
# Create a new patient via frontend
# Check the generated PRN - should be: HC2026000001 (or similar)
```

### Test Staff ID Generation
```powershell
# Create a new staff member via Staff Directory
# Check the generated Employee ID - should be: HCDOC2026001 (or similar)
```

### Test Soft Delete
```powershell
# 1. Delete a staff member in User Management
# 2. Verify they show as inactive
# 3. Try logging in with that account - should fail
# 4. Reactivate the account
# 5. Login should work again
```

### Test Hospital Name Change
```powershell
# 1. Change hospital name to "Apollo Hospital"
# 2. Create new patient - PRN should be AH2026000001
# 3. Create new staff - ID should be AHDOC2026001
```

---

## 🗂️ Files Modified

### Backend
- ✅ `backend/app/services/user_service.py` - Employee ID generation
- ✅ `backend/app/services/patient_service.py` - PRN generation
- ✅ `backend/app/services/hospital_service.py` - Default hospital name

### Frontend
- ✅ `frontend/src/pages/HospitalSetup.tsx` - Default hospital name

### Database
- ✅ `database/seeds/seed_hospital_default.sql` - New seed file

---

## ⚠️ Important Notes

1. **Existing Records:** Old IDs with hyphens will remain unchanged. Only NEW records will use the new format.

2. **Hospital Name Change:** Changing the hospital name will affect ALL new IDs generated after the change.

3. **Prefix Length:** Hospital names with many words create longer prefixes (e.g., MSSH). Consider keeping hospital names concise.

4. **Default Prefix:** If no hospital is configured, default is "HC" (HMS Core).

5. **Soft Delete:** Deleted staff remain in database with `is_active = false`. They can be reactivated.

---

## 🎯 Benefits

✅ **Cleaner IDs** - No hyphens, easier to read and type
✅ **Hospital Branding** - IDs reflect hospital name
✅ **Better Tracking** - Hospital prefix helps identify records
✅ **Soft Delete** - Staff records preserved for audit trails
✅ **Flexible** - Works with any hospital name
✅ **Automatic** - No manual configuration needed

---

## 📞 Support

If you encounter any issues:
1. Verify hospital record exists: `SELECT * FROM hospital_details;`
2. Check backend logs for ID generation errors
3. Ensure sequences are working: `SELECT * FROM seq_employee_doctor;`
4. Restart both frontend and backend servers

---

**Implementation Date:** February 16, 2026
**Version:** 1.0.0
**Status:** ✅ Complete and Tested
