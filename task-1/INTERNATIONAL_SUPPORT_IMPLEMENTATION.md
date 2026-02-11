# International Support Implementation for HMS

## Overview
This document describes the worldwide support implementation for the Hospital Management System.

## Changes Made

### 1. Database Migration (005_add_hospital_country_codes.sql)
**Created**: `database/scripts/005_add_hospital_country_codes.sql`

- Added country code columns for all phone numbers:
  - `primary_phone_country_code` (VARCHAR(5), NOT NULL, default '+91')
  - `secondary_phone_country_code` (VARCHAR(5), NULL)
  - `emergency_hotline_country_code` (VARCHAR(5), NULL)
  
- Updated constraints:
  - GST validation now only applies to Indian hospitals
  - PAN validation now only applies to Indian hospitals
  - Phone format accepts digits only (4-15 digits)
  - Country codes validated: `^\+[0-9]{1,4}$`
  
- Removed India as default country (user must select)

**To Run Migration:**
```powershell
psql -U postgres -d hospital_management -f "d:\HMS\task-1\database\scripts\005_add_hospital_country_codes.sql"
```

### 2. Backend Model Updates

**File**: `backend/app/models/hospital.py`

Added fields:
- `primary_phone_country_code` (default "+91")
- `secondary_phone_country_code`
- `emergency_hotline_country_code`

Removed:
- India as default for `country` field

Added computed properties:
- `full_primary_phone` - Returns country code + phone
- `full_emergency_hotline` - Returns formatted hotline

### 3. Backend Schema Updates

**File**: `backend/app/schemas/hospital.py`

Changes:
- Added country code fields with regex validation
- Made `country` field required (no default)
- Phone fields now accept only digits (4-15)
- Added `model_validator` for India-specific GST/PAN validation
- Updated all response schemas to include country codes

Validation logic:
```python
@model_validator(mode='after')
def validate_india_specific_fields(self):
    """Only validate GST/PAN for Indian hospitals"""
    if self.country == 'India':
        # GST and PAN validation here
    return self
```

### 4. Service Layer Updates

**File**: `backend/app/services/hospital_service.py`

Added preprocessing to convert empty strings to None:
```python
# Convert empty strings to None for optional fields with database constraints
optional_fields = ['gst_number', 'pan_number', 'drug_license_number', 
                   'medical_registration_number', 'secondary_phone', 'address_line2']
for field in optional_fields:
    if field in data and data[field] == '':
        data[field] = None
```

This fixes the CHECK constraint violation for GST/PAN empty strings.

### 5. Frontend Updates Required

**File**: `frontend/src/pages/HospitalSetup.tsx`

**Required Changes:**
1. Import country utilities from constants.ts
2. Add country dropdown (similar to Register.tsx)
3. Add country code dropdowns for all phone fields
4. Add dynamic state dropdown based on country
5. Show GST/PAN only when country === 'India'
6. Update form defaultValues

**File**: `frontend/src/types/hospital.ts`

Add new fields matching backend:
```typescript
primary_phone_country_code: string;
secondary_phone_country_code?: string;
emergency_hotline_country_code?: string;
```

## Features

### Supported Countries (40+)
- **India** - with states, PIN codes, GST/PAN validation
- **United States** - ZIP codes, 50 states
- **United Kingdom** - Postcodes
- **Canada** - Postal codes
- **Australia** - Postcodes
- **UAE, Saudi Arabia, Germany, Malaysia, Nepal, Sri Lanka, Bangladesh, Pakistan**
- **Singapore, Qatar, Oman, Kuwait, Bahrain, France, Japan, China, South Korea**
- **Italy, Spain, Brazil, Mexico, South Africa, Nigeria, Egypt, Russia**
- **Indonesia, Thailand, Vietnam, Philippines, Turkey, New Zealand**
- **Afghanistan, Iran, Iraq**

### Country-Specific Features
- **Phone Codes**: Automatic country code selection (+91, +1, +44, etc.)
- **States**: Predefined state lists for 13 major countries
- **Postal Codes**: Dynamic labels (PIN/ZIP/Postcode)
- **Validation**: Conditional GST/PAN validation (India only)

### Patient Registration
✅ Already supports worldwide registration:
- Country code selection (+1 to +998)
- Dynamic state dropdown
- Flexible postal code (3-10 alphanumeric)
- Phone format (4-15 digits)

### Hospital Setup
✅ Will support after frontend update:
- Country selection from 40+ countries
- Phone country codes for all numbers
- Conditional India-specific fields
- International address formats

## Testing Checklist

### Database
- [ ] Run migration 005 successfully
- [ ] Verify country_code columns exist
- [ ] Test GST constraint with India country
- [ ] Test GST constraint with non-India country
- [ ] Verify empty strings convert to NULL

### Backend
- [ ] POST /hospital with India country + GST (should succeed)
- [ ] POST /hospital with USA country + empty GST (should succeed)  
- [ ] POST /hospital with India country + invalid GST (should fail)
- [ ] POST /hospital without country (should fail - required)
- [ ] Verify full_primary_phone property works

### Frontend (After Update)
- [ ] Country dropdown displays 40+ countries
- [ ] Selecting country updates phone code
- [ ] Selecting country updates state dropdown
- [ ] India shows GST/PAN fields
- [ ] USA hides GST/PAN fields
- [ ] Phone inputs accept digits only
- [ ] Form submits with country codes

## Migration Instructions

### Step 1: Run Database Migration
```powershell
# Using postgres superuser
psql -U postgres -d hospital_management -f "d:\HMS\task-1\database\scripts\005_add_hospital_country_codes.sql"

# OR using hospital_admin (if permissions allow)
psql -U hospital_admin -d hospital_management -f "d:\HMS\task-1\database\scripts\005_add_hospital_country_codes.sql"
```

### Step 2: Update Existing Hospital Records
If you have existing hospital records, update them:
```sql
-- Set default country codes for existing records
UPDATE hospital_details 
SET primary_phone_country_code = '+91'
WHERE primary_phone_country_code IS NULL;
```

### Step 3: Restart Backend
The backend will auto-reload with uvicorn --reload flag.

### Step 4: Update Frontend (Manual)
Update HospitalSetup.tsx using the pattern from Register.tsx:
- Add COUNTRIES import
- Add country state management
- Add country code dropdowns
- Add conditional GST/PAN rendering

### Step 5: Test
- Create a new hospital with India country
- Create a new hospital with USA country
- Verify GST validation works for India only

## Code Examples

### Backend - India-Specific Validation
```python
# In schemas/hospital.py
@model_validator(mode='after')
def validate_india_specific_fields(self):
    if self.country == 'India':
        if self.gst_number and len(self.gst_number) > 0:
            if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', self.gst_number):
                raise ValueError('Invalid GST format')
    return self
```

### Frontend - Country Code Dropdown
```tsx
<select {...register('primary_phone_country_code')}>
  {COUNTRY_CODE_OPTIONS.map((cc) => (
    <option key={cc.code} value={cc.code}>
      {cc.label}
    </option>
  ))}
</select>
```

### Frontend - Conditional GST Display
```tsx
{selectedCountry === 'India' && (
  <div>
    <label>GST Number</label>
    <input {...register('gst_number')} placeholder="22AAAAA0000A1Z5" />
  </div>
)}
```

## Benefits

1. **Global Reach**: Hospitals worldwide can use the system
2. **Proper Validation**: Country-specific formats validated correctly
3. **Better UX**: Dynamic labels and dropdowns based on selection
4. **Data Quality**: Structured phone numbers with country codes
5. **Compliance**: India-specific tax fields only for Indian hospitals

## Breaking Changes

⚠️ **IMPORTANT**: 
- `country` field no longer has default value
- Phone fields now separate: country_code + number
- GST/PAN validation only for India

**Existing installations must**:
1. Run migration 005
2. Update any API calls to include country codes
3. Update frontend forms

## Support

For issues or questions:
- Check migration ran successfully: `\d hospital_details` in psql
- Verify backend models match database schema
- Ensure frontend sends country_code fields
- Review error logs for validation failures
