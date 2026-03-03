# HMS — Complete API Endpoints

Base URL: `/api/v1`

All endpoints return the standardized response format defined in `00_PROJECT_OVERVIEW.md`.
All list endpoints support: `?page=1&per_page=20&sort_by=created_at&sort_order=desc`

**Auth Header:** `Authorization: Bearer <access_token>`

Legend:
- 🔓 Public (no auth)
- 🔒 Authenticated (any logged-in user)
- 👑 Admin only
- 🏥 Role-specific (noted in Roles column)

---

## 1. Authentication — `/auth`

| Method | Endpoint | Description | Roles | Request Body | Response |
|--------|----------|-------------|-------|-------------|----------|
| POST | `/auth/login` | Login with email/username + password | 🔓 | `{ "email_or_username": "string", "password": "string" }` | `{ "access_token", "refresh_token", "token_type", "expires_in", "user": {...}, "permissions": [...] }` |
| POST | `/auth/logout` | Revoke refresh token | 🔒 | `{ "refresh_token": "string" }` | `{ "message": "Logged out" }` |
| POST | `/auth/refresh` | Refresh access token | 🔓 | `{ "refresh_token": "string" }` | `{ "access_token", "expires_in" }` |
| POST | `/auth/forgot-password` | Send password reset email | 🔓 | `{ "email": "string" }` | `{ "message": "Reset link sent" }` |
| POST | `/auth/reset-password` | Reset password with token | 🔓 | `{ "token": "string", "new_password": "string", "confirm_password": "string" }` | `{ "message": "Password reset" }` |
| POST | `/auth/change-password` | Change own password | 🔒 | `{ "current_password", "new_password", "confirm_password" }` | `{ "message": "Password changed" }` |
| GET | `/auth/me` | Get current user profile | 🔒 | — | `{ "user": {...}, "roles": [...], "permissions": [...] }` |
| PUT | `/auth/me` | Update own profile | 🔒 | `{ "first_name", "last_name", "phone", "preferred_locale", "preferred_timezone" }` | Updated user |
| POST | `/auth/me/avatar` | Upload profile photo | 🔒 | `multipart/form-data: avatar` | `{ "avatar_url" }` |
| POST | `/auth/mfa/enable` | Enable MFA (TOTP) | 🔒 | — | `{ "secret", "qr_code_url", "backup_codes" }` |
| POST | `/auth/mfa/verify` | Verify MFA code during login | 🔓 | `{ "temp_token": "string", "code": "string" }` | Full login response |
| POST | `/auth/mfa/disable` | Disable MFA | 🔒 | `{ "password": "string", "code": "string" }` | `{ "message": "MFA disabled" }` |

### Login Flow
1. POST `/auth/login` → if MFA enabled, returns `{ "requires_mfa": true, "temp_token": "..." }`
2. POST `/auth/mfa/verify` with temp_token + TOTP code → full token response
3. Store access token in memory (NOT localStorage), refresh token in httpOnly cookie or secure storage
4. On 401, try POST `/auth/refresh` → if fails, redirect to login

### Password Validation Rules (enforced backend)
- Minimum 8 characters
- At least 1 uppercase, 1 lowercase, 1 digit, 1 special character
- Cannot be same as last 5 passwords
- Cannot contain username or email

### Account Lockout
- 5 failed attempts → lock for 15 minutes
- 10 failed attempts → lock for 1 hour
- Admin can manually unlock

---

## 2. User Management — `/users`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/users` | List users (paginated, filterable) | 👑 Super Admin, Admin |
| POST | `/users` | Create new user (with password) | 👑 Super Admin |
| GET | `/users/{id}` | Get user by ID | 👑 Super Admin, Admin |
| PUT | `/users/{id}` | Update user | 👑 Super Admin |
| PATCH | `/users/{id}/status` | Activate/deactivate user | 👑 Super Admin |
| DELETE | `/users/{id}` | Soft delete user | 👑 Super Admin |
| GET | `/users/{id}/roles` | Get user's roles | 👑 Super Admin, Admin |
| PUT | `/users/{id}/roles` | Assign roles to user | 👑 Super Admin |
| POST | `/users/{id}/reset-password` | Admin reset user's password | 👑 Super Admin |
| POST | `/users/{id}/send-password` | Send password to user via email | 👑 Super Admin |
| GET | `/users/{id}/audit-log` | Get user's activity log | 👑 Super Admin, Admin |
| GET | `/users/{id}/id-card` | Get user's ID card data | 👑 Super Admin, Admin, 🏥 Own |
| POST | `/users/{id}/id-card/generate` | Generate/regenerate staff ID card | 👑 Super Admin, Admin |
| POST | `/users/{id}/photo` | Upload user photo (for ID card) | 👑 Super Admin, Admin, 🏥 Own |
| DELETE | `/users/{id}/photo` | Remove user photo | 👑 Super Admin, Admin |

### Filters for GET `/users`:
- `?status=active|inactive`
- `?role=doctor|nurse|receptionist|pharmacist|...`
- `?search=<name, email, or reference_number>`
- `?department_id=<uuid>`

### POST `/users` Request Body:
Super Admin creates user with password. The user's 12-digit reference number is **auto-generated** based on the HMS ID system.
```json
{
  "email": "doctor@hospital.com",
  "username": "dr.smith",
  "password": "TempP@ss123",
  "first_name": "John",
  "last_name": "Smith",
  "phone": "+12025551234",
  "role_ids": ["<uuid>", "<uuid>"],
  "department_id": "<uuid>",
  "must_change_password": true
}
```
Response includes auto-generated `reference_number` (e.g., `HCD262Z00003`).

### POST `/users/{id}/reset-password` Request Body:
Super Admin resets user's password.
```json
{
  "new_password": "NewP@ss456"
}
```

### POST `/users/{id}/send-password`
Sends the user's current or a new temporary password via email.
```json
{
  "password": "TempP@ss123",
  "message": "Your HMS account has been created. Please login and change your password."
}
```
Response:
```json
{
  "success": true,
  "message": "Password sent to doctor@hospital.com",
  "data": { "sent_to": "doctor@hospital.com", "sent_at": "2026-02-19T10:30:00Z" }
}
```
**Business Rules:**
- Only Super Admin can send passwords
- Email is sent via configured email backend (SMTP/SES)
- A record is logged in `password_emails` table for audit
- `must_change_password` is automatically set to `true` on the user account
- Password is **never** stored in plain text in the database; only sent in the email body

### POST `/users/{id}/id-card/generate`
Generates (or regenerates) a soft ID card for the staff member.
```json
{
  "regenerate": false
}
```
Response:
```json
{
  "success": true,
  "data": {
    "id_card_id": "<uuid>",
    "reference_number": "HCD262Z00003",
    "front_image_url": "/files/id-cards/HCD262Z00003-front.png",
    "back_image_url": "/files/id-cards/HCD262Z00003-back.png",
    "pdf_url": "/files/id-cards/HCD262Z00003.pdf",
    "version": 1,
    "issued_at": "2026-02-19T10:30:00Z"
  }
}
```

---

## 3. Roles & Permissions — `/roles`, `/permissions`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/roles` | List all roles | 👑 Admin |
| POST | `/roles` | Create custom role | 👑 Admin |
| GET | `/roles/{id}` | Get role detail with permissions | 👑 Admin |
| PUT | `/roles/{id}` | Update role | 👑 Admin |
| DELETE | `/roles/{id}` | Delete role (not system roles) | 👑 Admin |
| GET | `/roles/{id}/permissions` | Get role's permissions | 👑 Admin |
| PUT | `/roles/{id}/permissions` | Set role's permissions | 👑 Admin |
| GET | `/permissions` | List all available permissions | 👑 Admin |
| GET | `/permissions/modules` | List permission modules | 👑 Admin |

### PUT `/roles/{id}/permissions` Request Body:
```json
{
  "permission_ids": ["<uuid>", "<uuid>", "<uuid>"]
}
```

---

## 4. Patients — `/patients`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/patients` | List patients (paginated) | 🏥 Receptionist, Doctor, Admin |
| POST | `/patients` | Register new patient | 🏥 Receptionist, Admin |
| GET | `/patients/{id}` | Get patient profile | 🏥 Receptionist, Doctor, Pharmacist, Cashier, Admin |
| PUT | `/patients/{id}` | Update patient info | 🏥 Receptionist, Admin |
| GET | `/patients/search` | Search patients | 🏥 All clinical staff |
| POST | `/patients/check-duplicate` | Check for duplicate (by phone/ID) | 🏥 Receptionist |
| POST | `/patients/{id}/photo` | Upload patient photo (also used on ID card) | 🏥 Receptionist |
| DELETE | `/patients/{id}/photo` | Remove patient photo | 🏥 Receptionist, Admin |
| GET | `/patients/{id}/consents` | Get consent records | 🏥 Receptionist, Admin |
| POST | `/patients/{id}/consents` | Record consent | 🏥 Receptionist |
| GET | `/patients/{id}/documents` | List documents | 🏥 Receptionist, Doctor, Admin |
| POST | `/patients/{id}/documents` | Upload document | 🏥 Receptionist |
| DELETE | `/patients/{id}/documents/{doc_id}` | Delete document | 🏥 Admin |
| GET | `/patients/{id}/appointments` | Patient's appointments | 🏥 Receptionist, Doctor |
| GET | `/patients/{id}/prescriptions` | Patient's prescriptions | 🏥 Doctor, Pharmacist |
| GET | `/patients/{id}/invoices` | Patient's invoices | 🏥 Cashier, Admin |
| GET | `/patients/{id}/insurance-policies` | Patient's insurance | 🏥 Cashier, Admin |
| GET | `/patients/{id}/timeline` | Complete visit timeline | 🏥 Doctor, Admin |
| GET | `/patients/{id}/id-card` | Get patient's ID card data | 🏥 Receptionist, Admin |
| POST | `/patients/{id}/id-card/generate` | Generate/regenerate patient soft ID card | 🏥 Receptionist, Admin |
| POST | `/patients/{id}/id-card/email` | Email ID card PDF to patient | 🏥 Receptionist, Admin |
| GET | `/patients/{id}/id-card/download` | Download ID card PDF | 🏥 Receptionist, Admin |
| GET | `/patients/{id}/id-card/print` | Get print-optimized ID card | 🏥 Receptionist, Admin |

### GET `/patients/search` Query Params:
- `?q=<search term>` — searches name, phone, patient_reference_number, email
- `?phone=<phone number>`
- `?prn=<12-digit reference number>` — search by Patient Reference Number
- `?national_id=<ID number>`
- `?date_from=<date>&date_to=<date>` — registration date range

### POST `/patients` Request Body:
The `patient_reference_number` (12-digit PRN) is **auto-generated** by the system. The patient does not supply it.
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "date_of_birth": "1990-05-15",
  "gender": "female",
  "blood_group": "O+",
  "phone_country_code": "+1",
  "phone_number": "2025551234",
  "email": "jane@example.com",
  "national_id_type": "passport",
  "national_id_number": "AB1234567",
  "address_line_1": "123 Main Street",
  "city": "New York",
  "state_province": "NY",
  "postal_code": "10001",
  "country": "USA",
  "department_code": "GP",
  "emergency_contact_name": "John Doe",
  "emergency_contact_phone": "+12025559876",
  "emergency_contact_relation": "spouse",
  "known_allergies": "Penicillin",
  "chronic_conditions": "Diabetes Type 2",
  "preferred_language": "en"
}
```
Response includes auto-generated `patient_reference_number` (e.g., `HCF265GP000148`).

### POST `/patients/{id}/id-card/generate`
Generates a modern, attractive soft ID card for the patient.
```json
{
  "regenerate": false
}
```
Response:
```json
{
  "success": true,
  "data": {
    "id_card_id": "<uuid>",
    "reference_number": "HCF265GP000148",
    "front_image_url": "/files/id-cards/HCF265GP000148-front.png",
    "back_image_url": "/files/id-cards/HCF265GP000148-back.png",
    "pdf_url": "/files/id-cards/HCF265GP000148.pdf",
    "version": 1,
    "issued_at": "2026-02-19T10:30:00Z"
  }
}
```

### POST `/patients/{id}/id-card/email`
Emails the ID card PDF to the patient's registered email.
```json
{
  "email": "jane@example.com",
  "message": "Dear Jane, please find your hospital ID card attached."
}
```
Response:
```json
{
  "success": true,
  "message": "ID card sent to jane@example.com"
}
```

### Validation Rules:
- `first_name`: required, 1-100 chars, no special characters except hyphen/apostrophe
- `last_name`: required, 1-100 chars
- `phone_number`: required, validated per country format
- `gender`: required, must be one of enum values
- `date_of_birth`: optional, cannot be future date, cannot be > 150 years ago
- `age_years`: if DOB not given, required, 0-150
- `email`: optional, valid email format
- `national_id_number`: encrypted at rest
- `photo`: max 5MB, JPEG/PNG only, auto-compressed to max 500KB
- Duplicate check on (phone_country_code + phone_number) within same hospital

### ID Card Design Rules:
- **Front Side (Patient):** Hospital logo, patient photo (uploaded/captured), full name, DOB/Age, gender symbol, blood group, PRN (12-digit), department color band, QR code with PRN, registration date
- **Back Side:** Hospital full address, phone, email, website, emergency number, terms, hospital registration number, card issue date, version
- **Design:** Modern rounded-corner card (credit-card size ratio), subtle gradient background, clean typography
- **Output formats:** PNG (high-res for email), PDF (for print), both sides on one page for easy printing
- **Photo:** Patient/user can upload their image for the ID card; also supports webcam capture
- **Delivery:** Download as PDF, Email to patient, Print from browser

---

## 5. Doctors — `/doctors`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/doctors` | List doctors | 🏥 All authenticated |
| POST | `/doctors` | Create doctor profile | 👑 Admin |
| GET | `/doctors/{id}` | Get doctor detail | 🏥 All authenticated |
| PUT | `/doctors/{id}` | Update doctor profile | 👑 Admin, 🏥 Own profile |
| PATCH | `/doctors/{id}/status` | Activate/deactivate | 👑 Admin |
| GET | `/doctors/{id}/schedule` | Get weekly schedule | 🏥 All authenticated |
| PUT | `/doctors/{id}/schedule` | Set/update schedule | 👑 Admin, 🏥 Own schedule |
| GET | `/doctors/{id}/leaves` | List leaves | 🏥 Receptionist, Admin |
| POST | `/doctors/{id}/leaves` | Create leave | 👑 Admin, 🏥 Doctor (own) |
| DELETE | `/doctors/{id}/leaves/{leave_id}` | Cancel leave | 👑 Admin, 🏥 Doctor (own) |
| GET | `/doctors/{id}/fees` | Get fee structure | 🏥 Receptionist, Cashier, Admin |
| PUT | `/doctors/{id}/fees` | Update fees | 👑 Admin |
| GET | `/doctors/{id}/availability` | Check availability for date | 🏥 Receptionist, Admin |
| GET | `/doctors/{id}/queue` | Get current queue | 🏥 Doctor (own), Receptionist, Admin |
| GET | `/doctors/{id}/stats` | Doctor statistics | 👑 Admin, 🏥 Doctor (own) |
| GET | `/doctors/by-department/{dept_id}` | Doctors in department | 🏥 All authenticated |

### PUT `/doctors/{id}/schedule` Request Body:
```json
{
  "schedules": [
    {
      "day_of_week": 1,
      "shift_name": "morning",
      "start_time": "09:00",
      "end_time": "13:00",
      "break_start_time": null,
      "break_end_time": null,
      "slot_duration_minutes": 15,
      "max_patients": 20,
      "effective_from": "2026-02-01"
    },
    {
      "day_of_week": 1,
      "shift_name": "afternoon",
      "start_time": "14:00",
      "end_time": "18:00",
      "slot_duration_minutes": 15,
      "max_patients": 16,
      "effective_from": "2026-02-01"
    }
  ]
}
```

---

## 6. Appointments — `/appointments`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/appointments` | List appointments (filterable) | 🏥 Receptionist, Doctor, Admin |
| POST | `/appointments` | Book scheduled appointment | 🏥 Receptionist, Admin |
| POST | `/appointments/walk-in` | Register walk-in | 🏥 Receptionist |
| POST | `/appointments/emergency` | Emergency appointment (bypass queue) | 🏥 Receptionist, Admin |
| GET | `/appointments/{id}` | Get appointment detail | 🏥 Receptionist, Doctor, Admin |
| PUT | `/appointments/{id}` | Update appointment | 🏥 Receptionist, Doctor, Admin |
| PATCH | `/appointments/{id}/status` | Change status | 🏥 Receptionist, Doctor |
| PATCH | `/appointments/{id}/cancel` | Cancel appointment | 🏥 Receptionist, Admin |
| PATCH | `/appointments/{id}/reschedule` | Reschedule | 🏥 Receptionist |
| POST | `/appointments/{id}/check-in` | Mark patient arrived | 🏥 Receptionist |
| POST | `/appointments/{id}/transfer` | Transfer to next doctor in workflow | 🏥 Doctor |
| GET | `/appointments/slots` | Get available slots | 🏥 Receptionist |
| GET | `/appointments/queue` | Get queue for doctor/date | 🏥 Receptionist, Doctor |
| PATCH | `/appointments/queue/{queue_id}/position` | Reorder queue | 🏥 Receptionist |
| PATCH | `/appointments/queue/{queue_id}/call-next` | Call next patient | 🏥 Doctor |
| PATCH | `/appointments/queue/{queue_id}/skip` | Skip patient | 🏥 Doctor |
| GET | `/appointments/calendar` | Calendar view data | 🏥 Receptionist, Doctor, Admin |
| GET | `/appointments/today-summary` | Today's summary stats | 🏥 Receptionist, Doctor, Admin |

### GET `/appointments` Filters:
- `?doctor_id=<uuid>`
- `?patient_id=<uuid>`
- `?date=<YYYY-MM-DD>` or `?date_from=&date_to=`
- `?status=scheduled|checked_in|in_queue|with_doctor|completed|cancelled`
- `?appointment_type=scheduled|walk_in|emergency|follow_up`
- `?department_id=<uuid>`

### GET `/appointments/slots` Query Params:
```
?doctor_id=<uuid>&date=2026-02-15
```
Response:
```json
{
  "doctor_id": "<uuid>",
  "date": "2026-02-15",
  "slots": [
    { "start_time": "09:00", "end_time": "09:15", "available": true },
    { "start_time": "09:15", "end_time": "09:30", "available": false },
    { "start_time": "09:30", "end_time": "09:45", "available": true }
  ]
}
```

### POST `/appointments` Request Body:
```json
{
  "patient_id": "<uuid>",
  "doctor_id": "<uuid>",
  "appointment_date": "2026-02-15",
  "start_time": "09:00",
  "appointment_type": "scheduled",
  "visit_type": "new",
  "chief_complaint": "Persistent headache for 3 days"
}
```

### POST `/appointments/{id}/transfer` (Doctor workflow):
```json
{
  "next_doctor_id": "<uuid>",
  "notes": "Referred to ophthalmology for eye examination",
  "priority": "normal"
}
```

### Doctor 1 → 2 → 3 Workflow:
1. Appointment created for Doctor 1 (`current_doctor_sequence = 1`)
2. Doctor 1 completes consultation → calls `/transfer` → new queue entry for Doctor 2 (`current_doctor_sequence = 2`)
3. Doctor 2 completes → `/transfer` → Doctor 3 (`current_doctor_sequence = 3`)
4. Doctor 3 completes → status = `completed`

---

## 7. Prescriptions — `/prescriptions`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/prescriptions` | List prescriptions | 🏥 Doctor, Pharmacist, Admin |
| POST | `/prescriptions` | Create prescription | 🏥 Doctor |
| GET | `/prescriptions/{id}` | Get prescription detail | 🏥 Doctor, Pharmacist, Admin |
| PUT | `/prescriptions/{id}` | Update prescription (if not finalized) | 🏥 Doctor |
| POST | `/prescriptions/{id}/finalize` | Finalize (lock for editing) | 🏥 Doctor |
| GET | `/prescriptions/{id}/versions` | Version history | 🏥 Doctor, Admin |
| GET | `/prescriptions/{id}/pdf` | Generate PDF | 🏥 Doctor, Pharmacist |
| POST | `/prescriptions/{id}/duplicate` | Create copy for new visit | 🏥 Doctor |
| GET | `/prescription-templates` | List templates | 🏥 Doctor |
| POST | `/prescription-templates` | Create template | 🏥 Doctor |
| GET | `/prescription-templates/{id}` | Get template | 🏥 Doctor |
| PUT | `/prescription-templates/{id}` | Update template | 🏥 Doctor |
| DELETE | `/prescription-templates/{id}` | Delete template | 🏥 Doctor |
| POST | `/prescriptions/{id}/lab-orders` | Add lab order | 🏥 Doctor |
| GET | `/prescriptions/{id}/lab-orders` | List lab orders | 🏥 Doctor, Admin |
| GET | `/drug-interactions/check` | Check drug interactions | 🏥 Doctor |
| GET | `/medicines/formulary` | Search medicine formulary | 🏥 Doctor, Pharmacist |

### POST `/prescriptions` Request Body:
```json
{
  "appointment_id": "<uuid>",
  "patient_id": "<uuid>",
  "diagnosis": "Viral Upper Respiratory Tract Infection",
  "clinical_notes": "Patient presents with cough, sore throat for 3 days",
  "advice": "Rest, increase fluid intake, warm salt water gargle",
  "items": [
    {
      "medicine_id": "<uuid>",
      "medicine_name": "Paracetamol 500mg",
      "dosage": "500mg",
      "frequency": "1-0-1",
      "duration_value": 5,
      "duration_unit": "days",
      "route": "oral",
      "instructions": "After food",
      "allow_substitution": true
    },
    {
      "medicine_name": "Cough Syrup (Dextromethorphan)",
      "dosage": "10ml",
      "frequency": "1-1-1",
      "duration_value": 5,
      "duration_unit": "days",
      "route": "oral",
      "instructions": "After food"
    }
  ],
  "valid_until": "2026-03-10"
}
```

### GET `/drug-interactions/check` Query:
```
?medicine_ids=<uuid1>,<uuid2>,<uuid3>
```
Response:
```json
{
  "interactions": [
    {
      "medicine_1": "Warfarin",
      "medicine_2": "Aspirin",
      "severity": "high",
      "description": "Increased risk of bleeding",
      "recommendation": "Avoid combination or monitor INR closely"
    }
  ]
}
```

---

## 8. Pharmacy — `/pharmacy`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/pharmacy/medicines` | List medicines | 🏥 Pharmacist, Doctor, Admin |
| POST | `/pharmacy/medicines` | Add medicine to catalog | 🏥 Pharmacist, Admin |
| GET | `/pharmacy/medicines/{id}` | Get medicine detail | 🏥 Pharmacist, Doctor |
| PUT | `/pharmacy/medicines/{id}` | Update medicine | 🏥 Pharmacist, Admin |
| GET | `/pharmacy/medicines/search` | Search by name/generic/barcode | 🏥 Pharmacist, Doctor |
| POST | `/pharmacy/medicines/barcode-lookup` | Lookup by barcode scan | 🏥 Pharmacist |
| GET | `/pharmacy/pending-prescriptions` | Prescriptions awaiting dispensing | 🏥 Pharmacist |
| GET | `/pharmacy/dispensing` | List dispensing records | 🏥 Pharmacist, Admin |
| POST | `/pharmacy/dispensing` | Dispense against prescription | 🏥 Pharmacist |
| GET | `/pharmacy/dispensing/{id}` | Get dispensing detail | 🏥 Pharmacist, Cashier |
| PATCH | `/pharmacy/dispensing/{id}/status` | Update dispensing status | 🏥 Pharmacist |
| POST | `/pharmacy/counter-sale` | OTC counter sale | 🏥 Pharmacist |
| GET | `/pharmacy/returns` | List returns | 🏥 Pharmacist, Admin |
| POST | `/pharmacy/returns` | Create return | 🏥 Pharmacist |
| PATCH | `/pharmacy/returns/{id}/approve` | Approve return | 👑 Admin, 🏥 Senior Pharmacist |
| GET | `/pharmacy/batches` | List batches (filterable by medicine) | 🏥 Pharmacist |
| GET | `/pharmacy/expiring-soon` | Items expiring within X days | 🏥 Pharmacist, Inventory |
| GET | `/pharmacy/low-stock` | Items below reorder level | 🏥 Pharmacist, Inventory |

### POST `/pharmacy/dispensing` Request Body:
```json
{
  "prescription_id": "<uuid>",
  "patient_id": "<uuid>",
  "items": [
    {
      "prescription_item_id": "<uuid>",
      "medicine_id": "<uuid>",
      "medicine_batch_id": "<uuid>",
      "quantity": 10,
      "unit_price": 5.50,
      "discount_percent": 0,
      "substituted": false
    }
  ],
  "notes": "All items dispensed as prescribed"
}
```

### POST `/pharmacy/counter-sale` Request Body:
```json
{
  "patient_id": null,
  "customer_name": "Walk-in Customer",
  "customer_phone": "+12025551234",
  "items": [
    {
      "medicine_id": "<uuid>",
      "medicine_batch_id": "<uuid>",
      "quantity": 2,
      "unit_price": 8.99,
      "discount_percent": 0
    }
  ]
}
```

### Dispensing Business Rules:
- Cannot dispense expired batches
- FEFO (First Expiry First Out) ordering of batches
- Cannot dispense more than available stock
- Auto-reduce batch stock on dispensing
- If substituting, record original medicine name
- Cannot dispense controlled substances without valid prescription

---

## 9. Optical Store — `/optical`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/optical/products` | List products | 🏥 Optical Staff, Admin |
| POST | `/optical/products` | Add product | 🏥 Optical Staff, Admin |
| GET | `/optical/products/{id}` | Get product detail | 🏥 Optical Staff |
| PUT | `/optical/products/{id}` | Update product | 🏥 Optical Staff, Admin |
| GET | `/optical/products/search` | Search products | 🏥 Optical Staff |
| GET | `/optical/prescriptions` | List optical Rx | 🏥 Optical Staff, Doctor |
| POST | `/optical/prescriptions` | Create optical Rx | 🏥 Doctor |
| GET | `/optical/prescriptions/{id}` | Get optical Rx | 🏥 Doctor, Optical Staff |
| PUT | `/optical/prescriptions/{id}` | Update optical Rx | 🏥 Doctor |
| GET | `/optical/orders` | List orders | 🏥 Optical Staff, Admin |
| POST | `/optical/orders` | Place order | 🏥 Optical Staff |
| GET | `/optical/orders/{id}` | Get order detail | 🏥 Optical Staff, Cashier |
| PATCH | `/optical/orders/{id}/status` | Update order status | 🏥 Optical Staff |
| GET | `/optical/orders/{id}/job-ticket` | Generate job ticket PDF | 🏥 Optical Staff |
| GET | `/optical/repairs` | List repairs | 🏥 Optical Staff |
| POST | `/optical/repairs` | Create repair entry | 🏥 Optical Staff |
| GET | `/optical/repairs/{id}` | Get repair detail | 🏥 Optical Staff |
| PATCH | `/optical/repairs/{id}/status` | Update repair status | 🏥 Optical Staff |

### Optical Rx Validation:
- SPH: -25.00 to +25.00 (step 0.25)
- CYL: -10.00 to +10.00 (step 0.25)
- AXIS: 0 to 180 (integer)
- ADD: 0 to +4.00 (step 0.25)
- PD: 50 to 80mm (step 0.5)

---

## 10. Billing — `/billing`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/billing/invoices` | List invoices | 🏥 Cashier, Admin |
| POST | `/billing/invoices` | Create invoice | 🏥 Cashier, Receptionist, Pharmacist, Optical Staff |
| GET | `/billing/invoices/{id}` | Get invoice detail | 🏥 Cashier, Admin |
| PUT | `/billing/invoices/{id}` | Update draft invoice | 🏥 Cashier |
| POST | `/billing/invoices/{id}/issue` | Issue invoice (finalize) | 🏥 Cashier |
| GET | `/billing/invoices/{id}/pdf` | Generate invoice PDF | 🏥 Cashier, Admin |
| POST | `/billing/invoices/{id}/send` | Send invoice via email/SMS | 🏥 Cashier |
| GET | `/billing/invoices/{id}/payments` | Get payments for invoice | 🏥 Cashier |
| POST | `/billing/payments` | Record payment | 🏥 Cashier |
| GET | `/billing/payments` | List payments | 🏥 Cashier, Admin |
| GET | `/billing/payments/{id}` | Get payment detail | 🏥 Cashier, Admin |
| GET | `/billing/payments/{id}/receipt` | Generate receipt PDF | 🏥 Cashier |
| POST | `/billing/refunds` | Create refund request | 🏥 Cashier |
| GET | `/billing/refunds` | List refunds | 🏥 Cashier, Admin |
| GET | `/billing/refunds/{id}` | Get refund detail | 🏥 Cashier, Admin |
| PATCH | `/billing/refunds/{id}/approve` | Approve refund | 👑 Admin |
| PATCH | `/billing/refunds/{id}/process` | Process approved refund | 🏥 Cashier |
| POST | `/billing/credit-notes` | Create credit note | 🏥 Cashier, Admin |
| GET | `/billing/credit-notes` | List credit notes | 🏥 Cashier, Admin |
| GET | `/billing/outstanding` | List outstanding dues | 🏥 Cashier, Admin |
| GET | `/billing/settlements` | List daily settlements | 🏥 Cashier, Admin |
| POST | `/billing/settlements` | Create daily settlement | 🏥 Cashier |
| GET | `/billing/settlements/{id}` | Get settlement detail | 🏥 Cashier, Admin |
| PATCH | `/billing/settlements/{id}/verify` | Verify settlement | 👑 Admin |

### POST `/billing/invoices` Request Body:
```json
{
  "patient_id": "<uuid>",
  "appointment_id": "<uuid>",
  "invoice_type": "opd",
  "invoice_date": "2026-02-15",
  "items": [
    {
      "item_type": "consultation",
      "description": "General Consultation - Dr. Smith",
      "quantity": 1,
      "unit_price": 150.00,
      "tax_config_id": "<uuid>"
    },
    {
      "item_type": "procedure",
      "description": "Blood Pressure Check",
      "quantity": 1,
      "unit_price": 25.00,
      "tax_config_id": null
    }
  ],
  "discount_amount": 10.00,
  "discount_reason": "Senior citizen discount"
}
```

### POST `/billing/payments` Request Body:
```json
{
  "invoice_id": "<uuid>",
  "amount": 165.00,
  "payment_mode": "card",
  "payment_reference": "TXN-12345678",
  "payment_date": "2026-02-15"
}
```

### Billing Business Rules:
- Invoice total = sum(item totals) - discount + tax
- Multiple payments allowed per invoice (partial payments)
- Balance auto-calculated (total - sum of payments)
- Status auto-transitions: draft → issued → partially_paid → paid
- Voiding requires admin approval
- Refund cannot exceed paid amount
- Daily settlement = sum of all payments for date by cashier
- Settlement must match actual collection (cash counted)

---

## 11. Insurance — `/insurance`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/insurance/providers` | List providers | 🏥 Cashier, Admin |
| POST | `/insurance/providers` | Add provider | 👑 Admin |
| PUT | `/insurance/providers/{id}` | Update provider | 👑 Admin |
| GET | `/insurance/policies` | List policies | 🏥 Cashier, Receptionist, Admin |
| POST | `/insurance/policies` | Create policy for patient | 🏥 Receptionist, Cashier |
| GET | `/insurance/policies/{id}` | Get policy detail | 🏥 Cashier, Admin |
| PUT | `/insurance/policies/{id}` | Update policy | 🏥 Cashier, Admin |
| POST | `/insurance/claims` | Submit claim | 🏥 Cashier |
| GET | `/insurance/claims` | List claims | 🏥 Cashier, Admin |
| GET | `/insurance/claims/{id}` | Get claim detail | 🏥 Cashier, Admin |
| PATCH | `/insurance/claims/{id}/status` | Update claim status | 🏥 Cashier, Admin |
| POST | `/insurance/pre-auth` | Request pre-authorization | 🏥 Cashier |
| GET | `/insurance/pre-auth` | List pre-authorizations | 🏥 Cashier, Admin |
| PATCH | `/insurance/pre-auth/{id}/status` | Update pre-auth status | 🏥 Cashier, Admin |

---

## 12. Inventory — `/inventory`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/inventory/items` | List all inventory items | 🏥 Inventory, Pharmacist, Optical Staff, Admin |
| POST | `/inventory/items` | Add inventory item | 🏥 Inventory, Admin |
| GET | `/inventory/items/{id}` | Get item detail | 🏥 Inventory |
| PUT | `/inventory/items/{id}` | Update item | 🏥 Inventory |
| GET | `/inventory/items/{id}/movements` | Item movement history | 🏥 Inventory, Admin |
| GET | `/inventory/suppliers` | List suppliers | 🏥 Inventory, Admin |
| POST | `/inventory/suppliers` | Add supplier | 🏥 Inventory, Admin |
| GET | `/inventory/suppliers/{id}` | Get supplier detail | 🏥 Inventory |
| PUT | `/inventory/suppliers/{id}` | Update supplier | 🏥 Inventory, Admin |
| GET | `/inventory/purchase-orders` | List POs | 🏥 Inventory, Admin |
| POST | `/inventory/purchase-orders` | Create PO | 🏥 Inventory |
| GET | `/inventory/purchase-orders/{id}` | Get PO detail | 🏥 Inventory |
| PATCH | `/inventory/purchase-orders/{id}/status` | Update PO status | 🏥 Inventory, Admin |
| PATCH | `/inventory/purchase-orders/{id}/approve` | Approve PO | 👑 Admin |
| POST | `/inventory/grn` | Create GRN (goods receipt) | 🏥 Inventory |
| GET | `/inventory/grn` | List GRNs | 🏥 Inventory, Admin |
| GET | `/inventory/grn/{id}` | Get GRN detail | 🏥 Inventory |
| PATCH | `/inventory/grn/{id}/verify` | Verify GRN | 🏥 Inventory Manager, Admin |
| POST | `/inventory/stock-adjustments` | Create adjustment | 🏥 Inventory |
| GET | `/inventory/stock-adjustments` | List adjustments | 🏥 Inventory, Admin |
| PATCH | `/inventory/stock-adjustments/{id}/approve` | Approve adjustment | 👑 Admin |
| POST | `/inventory/stock-transfers` | Transfer stock | 🏥 Inventory |
| GET | `/inventory/stock-transfers` | List transfers | 🏥 Inventory |
| GET | `/inventory/reorder-alerts` | Items needing reorder | 🏥 Inventory |
| GET | `/inventory/expiry-alerts` | Items expiring soon | 🏥 Inventory, Pharmacist |
| POST | `/inventory/cycle-counts` | Start cycle count | 🏥 Inventory |
| GET | `/inventory/cycle-counts` | List cycle counts | 🏥 Inventory, Admin |
| GET | `/inventory/cycle-counts/{id}` | Get count detail | 🏥 Inventory |
| PUT | `/inventory/cycle-counts/{id}` | Update counted items | 🏥 Inventory |
| PATCH | `/inventory/cycle-counts/{id}/verify` | Verify count | 🏥 Inventory Manager, Admin |
| GET | `/inventory/variance-report` | Stock variance report | 🏥 Inventory, Admin |

---

## 13. Reports — `/reports`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/reports/dashboard` | Summary dashboard data | 🏥 Admin, Report Viewer |
| GET | `/reports/revenue/daily` | Day-wise revenue | 🏥 Admin, Cashier, Report Viewer |
| GET | `/reports/revenue/monthly` | Month-wise revenue | 🏥 Admin, Report Viewer |
| GET | `/reports/revenue/yearly` | Yearly revenue | 🏥 Admin |
| GET | `/reports/revenue/by-department` | Revenue by department | 🏥 Admin, Report Viewer |
| GET | `/reports/opd/summary` | OPD summary | 🏥 Admin, Report Viewer |
| GET | `/reports/opd/doctor-wise` | Doctor-wise consultations | 🏥 Admin, Report Viewer |
| GET | `/reports/pharmacy/sales` | Pharmacy sales | 🏥 Admin, Pharmacist, Report Viewer |
| GET | `/reports/pharmacy/top-selling` | Top selling medicines | 🏥 Admin, Pharmacist |
| GET | `/reports/optical/sales` | Optical sales | 🏥 Admin, Optical Staff, Report Viewer |
| GET | `/reports/inventory/aging` | Inventory aging report | 🏥 Admin, Inventory |
| GET | `/reports/inventory/stock-status` | Current stock status | 🏥 Admin, Inventory |
| GET | `/reports/financial/outstanding` | Outstanding dues | 🏥 Admin, Cashier |
| GET | `/reports/financial/collection` | Collection report | 🏥 Admin, Cashier |
| GET | `/reports/financial/tax-summary` | Tax collection summary | 👑 Admin |
| POST | `/reports/export` | Export report (CSV/XLSX/PDF) | 🏥 Admin, Report Viewer |
| POST | `/reports/schedule` | Schedule recurring report | 👑 Admin |
| GET | `/reports/scheduled` | List scheduled reports | 👑 Admin |

### GET `/reports/revenue/daily` Query Params:
```
?date_from=2026-02-01&date_to=2026-02-28
&department=opd|pharmacy|optical|all
&group_by=day|department
```

Response:
```json
{
  "data": {
    "summary": {
      "total_revenue": 125000.00,
      "opd_revenue": 45000.00,
      "pharmacy_revenue": 55000.00,
      "optical_revenue": 25000.00,
      "total_invoices": 340,
      "total_patients": 280,
      "average_ticket_size": 367.65
    },
    "daily_breakdown": [
      {
        "date": "2026-02-01",
        "opd": 1500.00,
        "pharmacy": 2200.00,
        "optical": 800.00,
        "total": 4500.00,
        "invoice_count": 12
      }
    ],
    "trends": {
      "mom_change_percent": 12.5,
      "yoy_change_percent": 8.3
    }
  }
}
```

---

## 14. Notifications — `/notifications`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/notifications` | List my notifications | 🔒 Any authenticated |
| GET | `/notifications/unread-count` | Get unread count | 🔒 Any authenticated |
| PATCH | `/notifications/{id}/read` | Mark as read | 🔒 Own notifications |
| PATCH | `/notifications/read-all` | Mark all as read | 🔒 Own notifications |
| DELETE | `/notifications/{id}` | Delete notification | 🔒 Own notifications |
| GET | `/notifications/templates` | List templates | 👑 Admin |
| POST | `/notifications/templates` | Create template | 👑 Admin |
| PUT | `/notifications/templates/{id}` | Update template | 👑 Admin |
| DELETE | `/notifications/templates/{id}` | Delete template | 👑 Admin |
| POST | `/notifications/test-send` | Send test notification | 👑 Admin |

---

## 15. Administration — `/admin`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/admin/hospital` | Get hospital info | 👑 Admin |
| PUT | `/admin/hospital` | Update hospital info | 👑 Admin |
| POST | `/admin/hospital/logo` | Upload hospital logo | 👑 Admin |
| GET | `/admin/settings` | Get hospital settings | 👑 Admin |
| PUT | `/admin/settings` | Update settings | 👑 Admin |
| GET | `/admin/departments` | List departments | 🏥 All authenticated |
| POST | `/admin/departments` | Create department | 👑 Admin |
| PUT | `/admin/departments/{id}` | Update department | 👑 Admin |
| DELETE | `/admin/departments/{id}` | Delete department | 👑 Admin |
| GET | `/admin/tax-config` | List tax configs | 👑 Admin, Cashier |
| POST | `/admin/tax-config` | Create tax config | 👑 Admin |
| PUT | `/admin/tax-config/{id}` | Update tax config | 👑 Admin |
| DELETE | `/admin/tax-config/{id}` | Delete tax config | 👑 Admin |
| GET | `/admin/audit-logs` | View audit logs | 👑 Admin |
| GET | `/admin/audit-logs/export` | Export audit logs | 👑 Admin |
| GET | `/admin/system-health` | System health check | 👑 Admin |
| POST | `/admin/backup` | Trigger manual backup | 👑 Admin |
| GET | `/admin/backups` | List backups | 👑 Admin |
| GET | `/admin/active-sessions` | List active user sessions | 👑 Admin |
| DELETE | `/admin/sessions/{id}` | Force logout user | 👑 Admin |

### GET `/admin/audit-logs` Filters:
- `?user_id=<uuid>`
- `?action=create|update|delete|login|export`
- `?entity_type=patient|invoice|prescription|...`
- `?entity_id=<uuid>`
- `?date_from=&date_to=`
- `?search=<term>` — searches entity_name

---

## 16. File Upload — `/files`

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/files/upload` | Upload file | 🔒 Any authenticated |
| GET | `/files/{id}` | Download/view file | 🔒 Permission-based |
| DELETE | `/files/{id}` | Delete file | 🔒 Owner or Admin |

### Upload Validation:
- **Images**: JPEG, PNG only, max 5MB, auto-compressed
- **Documents**: PDF, JPEG, PNG, max 10MB
- **Virus scanning**: File content type validation (magic bytes, not just extension)
- **Filename sanitization**: Strip path traversal, special characters
- **Storage**: Local filesystem (dev) → MinIO/S3 (prod)

---

## API Versioning Strategy

- Current: `/api/v1/`
- Future breaking changes → `/api/v2/`
- Non-breaking changes added to current version
- Deprecation: 6-month notice with `Sunset` header
- OpenAPI spec auto-generated at `/api/v1/docs` (Swagger) and `/api/v1/redoc`

---

## Rate Limiting

| Endpoint Pattern | Limit | Window |
|-----------------|-------|--------|
| `POST /auth/login` | 5 requests | per minute per IP |
| `POST /auth/forgot-password` | 3 requests | per hour per email |
| `POST /auth/reset-password` | 5 requests | per hour per token |
| `POST /files/upload` | 10 requests | per minute per user |
| `GET /reports/*` | 20 requests | per minute per user |
| All other endpoints | 60 requests | per minute per user |

---

## WebSocket Endpoints

| Endpoint | Description | Use Case |
|----------|-------------|----------|
| `ws://host/ws/queue/{doctor_id}` | Live queue updates | Queue Management Board |
| `ws://host/ws/notifications/{user_id}` | Real-time notifications | Header notification bell |

### Queue WebSocket Messages:
```json
{
  "type": "queue_update",
  "data": {
    "action": "patient_called",
    "queue_number": 15,
    "patient_name": "Jane D.",
    "doctor_id": "<uuid>",
    "position": 3,
    "total_waiting": 8
  }
}
```
