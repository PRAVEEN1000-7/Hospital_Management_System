# HMS — Complete Database Schema

All tables use:
- **UUID** primary keys (globally unique, safe for distributed systems)
- **Timestamps**: `created_at`, `updated_at` as `TIMESTAMPTZ` (UTC)
- **Soft Deletes**: `is_deleted BOOLEAN DEFAULT false`, `deleted_at TIMESTAMPTZ`
- **Audit**: `created_by UUID`, `updated_by UUID` (FK to users)

---

## 1. Hospital & Configuration

### 1.1 `hospitals`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| name | VARCHAR(255) | NOT NULL | Hospital name |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Short code (e.g., "HOSP01") |
| logo_url | VARCHAR(500) | | Logo file path |
| address_line_1 | VARCHAR(255) | | |
| address_line_2 | VARCHAR(255) | | |
| city | VARCHAR(100) | | |
| state_province | VARCHAR(100) | | |
| postal_code | VARCHAR(20) | | |
| country | VARCHAR(3) | NOT NULL, DEFAULT 'USA' | ISO 3166-1 alpha-3 |
| phone | VARCHAR(20) | | E.164 format |
| email | VARCHAR(255) | | |
| website | VARCHAR(255) | | |
| timezone | VARCHAR(50) | NOT NULL, DEFAULT 'UTC' | IANA timezone |
| default_currency | VARCHAR(3) | NOT NULL, DEFAULT 'USD' | ISO 4217 |
| tax_id | VARCHAR(50) | | Tax registration number |
| registration_number | VARCHAR(100) | | Hospital registration |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

### 1.2 `departments`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | Department name |
| code | VARCHAR(20) | NOT NULL | Department code |
| description | TEXT | | |
| head_doctor_id | UUID | FK → doctors, NULLABLE | Department head |
| is_active | BOOLEAN | DEFAULT true | |
| display_order | INTEGER | DEFAULT 0 | Sort order |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, code) | |

### 1.3 `hospital_settings`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, UNIQUE | |
| hospital_code | CHAR(2) | NOT NULL | 2-char hospital code for 12-digit ID (e.g., 'HC','HA','HM') |
| patient_id_start_number | INTEGER | DEFAULT 1 | First PRN sequence number (project-defined) |
| patient_id_sequence | INTEGER | DEFAULT 0 | Current auto-increment sequence |
| staff_id_start_number | INTEGER | DEFAULT 1 | First staff ID sequence number (project-defined) |
| staff_id_sequence | INTEGER | DEFAULT 0 | Current staff auto-increment sequence |
| invoice_prefix | VARCHAR(10) | DEFAULT 'INV' | Invoice number prefix |
| invoice_sequence | INTEGER | DEFAULT 0 | |
| prescription_prefix | VARCHAR(10) | DEFAULT 'RX' | |
| prescription_sequence | INTEGER | DEFAULT 0 | |
| appointment_slot_duration_minutes | INTEGER | DEFAULT 15 | Default slot length |
| appointment_buffer_minutes | INTEGER | DEFAULT 5 | Buffer between slots |
| max_daily_appointments_per_doctor | INTEGER | DEFAULT 40 | |
| allow_walk_in | BOOLEAN | DEFAULT true | |
| allow_emergency_bypass | BOOLEAN | DEFAULT true | |
| enable_sms_notifications | BOOLEAN | DEFAULT false | |
| enable_email_notifications | BOOLEAN | DEFAULT true | |
| enable_whatsapp_notifications | BOOLEAN | DEFAULT false | |
| consultation_fee_default | DECIMAL(12,2) | DEFAULT 0 | |
| follow_up_validity_days | INTEGER | DEFAULT 7 | Days within which follow-up is free |
| data_retention_years | INTEGER | DEFAULT 7 | |
| branding_primary_color | VARCHAR(7) | DEFAULT '#1E40AF' | Hex color |
| branding_secondary_color | VARCHAR(7) | DEFAULT '#3B82F6' | |
| print_header_text | TEXT | | Custom header for prints |
| print_footer_text | TEXT | | Custom footer for prints |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 1.4 `tax_configurations`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | Tax name (e.g., "GST", "VAT", "Sales Tax") |
| code | VARCHAR(20) | NOT NULL | Tax code |
| rate_percentage | DECIMAL(5,2) | NOT NULL | Tax rate |
| applies_to | VARCHAR(20) | NOT NULL | 'product', 'service', 'both' |
| category | VARCHAR(50) | | Tax category |
| is_compound | BOOLEAN | DEFAULT false | Applied on top of other taxes? |
| is_active | BOOLEAN | DEFAULT true | |
| effective_from | DATE | NOT NULL | |
| effective_to | DATE | | NULL = no end date |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, code) | |

---

## 2. Users & RBAC

### 2.1 `users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| reference_number | VARCHAR(12) | UNIQUE, NOT NULL | HMS 12-digit ID (auto-generated, see ID System below) |
| email | VARCHAR(255) | NOT NULL | |
| username | VARCHAR(50) | NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| first_name | VARCHAR(100) | NOT NULL | |
| last_name | VARCHAR(100) | NOT NULL | |
| phone | VARCHAR(20) | | E.164 format |
| avatar_url | VARCHAR(500) | | Profile photo (uploaded for ID card) |
| preferred_locale | VARCHAR(10) | DEFAULT 'en' | User's language preference |
| preferred_timezone | VARCHAR(50) | | Override hospital timezone |
| is_active | BOOLEAN | DEFAULT true | |
| is_mfa_enabled | BOOLEAN | DEFAULT false | |
| mfa_secret | VARCHAR(255) | | TOTP secret (encrypted) |
| last_login_at | TIMESTAMPTZ | | |
| password_changed_at | TIMESTAMPTZ | | |
| failed_login_attempts | INTEGER | DEFAULT 0 | |
| locked_until | TIMESTAMPTZ | | Account lockout expiry |
| must_change_password | BOOLEAN | DEFAULT true | Force password change on first login |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| created_by | UUID | FK → users | |
| is_deleted | BOOLEAN | DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, email) | |
| **UNIQUE** | | (hospital_id, username) | |
| **INDEX** | | (email) | |
| **INDEX** | | (is_active, hospital_id) | |

### 2.2 `roles`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NULLABLE | NULL = system-wide role |
| name | VARCHAR(50) | NOT NULL | e.g., 'admin', 'doctor', 'receptionist' |
| display_name | VARCHAR(100) | NOT NULL | Human-readable name |
| description | TEXT | | |
| is_system | BOOLEAN | DEFAULT false | Built-in, cannot delete |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, name) | |

**Default Roles (seeded):**
- `super_admin` — Full system access
- `admin` — Hospital-level admin
- `doctor` — Clinical access
- `receptionist` — Front desk operations
- `pharmacist` — Pharmacy operations
- `optical_staff` — Optical store operations
- `cashier` — Billing operations
- `inventory_manager` — Inventory operations
- `report_viewer` — Read-only reports

### 2.3 `permissions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| module | VARCHAR(50) | NOT NULL | e.g., 'patients', 'billing', 'pharmacy' |
| action | VARCHAR(20) | NOT NULL | 'create', 'read', 'update', 'delete', 'export', 'approve' |
| resource | VARCHAR(50) | NOT NULL | e.g., 'patient', 'invoice', 'prescription' |
| description | VARCHAR(255) | | Human-readable |
| **UNIQUE** | | (module, action, resource) | |

### 2.4 `user_roles`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users, NOT NULL | |
| role_id | UUID | FK → roles, NOT NULL | |
| assigned_at | TIMESTAMPTZ | DEFAULT NOW() | |
| assigned_by | UUID | FK → users | |
| **UNIQUE** | | (user_id, role_id) | |

### 2.5 `role_permissions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| role_id | UUID | FK → roles, NOT NULL | |
| permission_id | UUID | FK → permissions, NOT NULL | |
| **UNIQUE** | | (role_id, permission_id) | |

### 2.6 `refresh_tokens`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users, NOT NULL | |
| token_hash | VARCHAR(255) | NOT NULL, UNIQUE | SHA-256 hash of refresh token |
| device_info | VARCHAR(255) | | User-agent / device |
| ip_address | VARCHAR(45) | | IPv4 or IPv6 |
| expires_at | TIMESTAMPTZ | NOT NULL | |
| revoked_at | TIMESTAMPTZ | | Null = valid |
| created_at | TIMESTAMPTZ | | |
| **INDEX** | | (user_id, revoked_at) | |

---

## 3. Patients

### 3.1 `patients`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| patient_reference_number | VARCHAR(12) | NOT NULL | HMS 12-digit PRN (auto-generated, see ID System below) |
| first_name | VARCHAR(100) | NOT NULL | |
| last_name | VARCHAR(100) | NOT NULL | |
| date_of_birth | DATE | | |
| age_years | INTEGER | | Manual entry if DOB unknown |
| age_months | INTEGER | | For infants |
| gender | VARCHAR(20) | NOT NULL | 'male','female','other','prefer_not_to_say' |
| blood_group | VARCHAR(5) | | 'A+','A-','B+','B-','AB+','AB-','O+','O-' |
| marital_status | VARCHAR(20) | | 'single','married','divorced','widowed' |
| phone_country_code | VARCHAR(5) | NOT NULL, DEFAULT '+1' | |
| phone_number | VARCHAR(15) | NOT NULL | Without country code |
| secondary_phone | VARCHAR(20) | | Full E.164 |
| email | VARCHAR(255) | | |
| national_id_type | VARCHAR(30) | | 'SSN','passport','national_id','aadhaar','nric', etc. |
| national_id_number | VARCHAR(50) | | Encrypted at rest |
| address_line_1 | VARCHAR(255) | | |
| address_line_2 | VARCHAR(255) | | |
| city | VARCHAR(100) | | |
| state_province | VARCHAR(100) | | |
| postal_code | VARCHAR(20) | | |
| country | VARCHAR(3) | DEFAULT 'USA' | ISO 3166-1 alpha-3 |
| photo_url | VARCHAR(500) | | Path to photo |
| emergency_contact_name | VARCHAR(200) | | |
| emergency_contact_phone | VARCHAR(20) | | E.164 |
| emergency_contact_relation | VARCHAR(50) | | |
| known_allergies | TEXT | | Comma-separated or JSON array |
| chronic_conditions | TEXT | | |
| notes | TEXT | | General notes |
| preferred_language | VARCHAR(10) | DEFAULT 'en' | |
| is_active | BOOLEAN | DEFAULT true | |
| registered_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| created_by | UUID | FK → users | |
| updated_by | UUID | FK → users | |
| is_deleted | BOOLEAN | DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, patient_reference_number) | |
| **INDEX** | | (patient_reference_number) | For PRN lookup across modules |
| **INDEX** | | (phone_country_code, phone_number) | For dedup |
| **INDEX** | | (first_name, last_name) | For search |
| **INDEX** | | (hospital_id, is_active) | |

### 3.2 `patient_consents`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| patient_id | UUID | FK → patients, NOT NULL | |
| consent_type | VARCHAR(50) | NOT NULL | 'registration','treatment','data_sharing','photo' |
| consent_text | TEXT | NOT NULL | Full consent text shown |
| is_accepted | BOOLEAN | NOT NULL | |
| signature_url | VARCHAR(500) | | Digital signature image |
| consented_at | TIMESTAMPTZ | NOT NULL | |
| ip_address | VARCHAR(45) | | |
| created_at | TIMESTAMPTZ | | |

### 3.3 `patient_documents`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| patient_id | UUID | FK → patients, NOT NULL | |
| document_type | VARCHAR(50) | NOT NULL | 'id_proof','insurance_card','lab_report','other' |
| title | VARCHAR(200) | NOT NULL | |
| file_url | VARCHAR(500) | NOT NULL | |
| file_type | VARCHAR(20) | NOT NULL | 'pdf','jpeg','png' |
| file_size_bytes | INTEGER | | |
| uploaded_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | | |
| is_deleted | BOOLEAN | DEFAULT false | |

---

## 4. Doctors

### 4.1 `doctors`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users, UNIQUE, NOT NULL | Links to user account |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| department_id | UUID | FK → departments | |
| employee_id | VARCHAR(30) | | Hospital employee ID |
| specialization | VARCHAR(100) | NOT NULL | |
| qualification | VARCHAR(255) | NOT NULL | e.g., "MBBS, MD" |
| registration_number | VARCHAR(50) | NOT NULL | Medical license number |
| registration_authority | VARCHAR(100) | | Licensing body |
| experience_years | INTEGER | | |
| bio | TEXT | | |
| doctor_sequence | INTEGER | | 1, 2, or 3 — for workflow |
| consultation_fee | DECIMAL(12,2) | DEFAULT 0 | Current fee |
| follow_up_fee | DECIMAL(12,2) | DEFAULT 0 | |
| is_available | BOOLEAN | DEFAULT true | |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| created_by | UUID | FK → users | |
| is_deleted | BOOLEAN | DEFAULT false | |
| **INDEX** | | (hospital_id, is_active) | |
| **INDEX** | | (department_id) | |

### 4.2 `doctor_schedules`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| day_of_week | INTEGER | NOT NULL | 0=Sunday, 6=Saturday |
| shift_name | VARCHAR(50) | DEFAULT 'default' | For multi-shift support |
| start_time | TIME | NOT NULL | e.g., '09:00' |
| end_time | TIME | NOT NULL | e.g., '17:00' |
| break_start_time | TIME | | Lunch break |
| break_end_time | TIME | | |
| slot_duration_minutes | INTEGER | NOT NULL, DEFAULT 15 | |
| max_patients | INTEGER | DEFAULT 20 | Max per slot period |
| is_active | BOOLEAN | DEFAULT true | |
| effective_from | DATE | NOT NULL | |
| effective_to | DATE | | NULL = indefinite |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (doctor_id, day_of_week, shift_name, effective_from) | |

### 4.3 `doctor_leaves`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| leave_date | DATE | NOT NULL | |
| leave_type | VARCHAR(30) | DEFAULT 'full_day' | 'full_day','morning','afternoon' |
| reason | VARCHAR(255) | | |
| approved_by | UUID | FK → users | |
| status | VARCHAR(20) | DEFAULT 'approved' | 'pending','approved','rejected' |
| created_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (doctor_id, leave_date, leave_type) | |

### 4.4 `doctor_fees`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| fee_type | VARCHAR(30) | NOT NULL | 'consultation','follow_up','procedure' |
| service_name | VARCHAR(100) | NOT NULL | |
| amount | DECIMAL(12,2) | NOT NULL | |
| currency | VARCHAR(3) | DEFAULT 'USD' | |
| effective_from | DATE | NOT NULL | |
| effective_to | DATE | | |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

---

## 5. Appointments

### 5.1 `appointments`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| appointment_number | VARCHAR(30) | NOT NULL, UNIQUE | APT-2026-00001 |
| patient_id | UUID | FK → patients, NOT NULL | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| department_id | UUID | FK → departments | |
| appointment_date | DATE | NOT NULL | |
| start_time | TIME | NOT NULL | |
| end_time | TIME | | |
| appointment_type | VARCHAR(20) | NOT NULL | 'scheduled','walk_in','emergency','follow_up' |
| visit_type | VARCHAR(20) | DEFAULT 'new' | 'new','follow_up' |
| priority | VARCHAR(10) | DEFAULT 'normal' | 'normal','urgent','emergency' |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'scheduled' | See status enum |
| current_doctor_sequence | INTEGER | DEFAULT 1 | Which doctor (1, 2, or 3) |
| parent_appointment_id | UUID | FK → appointments | For follow-ups |
| chief_complaint | TEXT | | Reason for visit |
| cancel_reason | VARCHAR(255) | | If cancelled |
| reschedule_reason | VARCHAR(255) | | |
| reschedule_count | INTEGER | DEFAULT 0 | |
| check_in_at | TIMESTAMPTZ | | When patient arrived |
| consultation_start_at | TIMESTAMPTZ | | When doctor started |
| consultation_end_at | TIMESTAMPTZ | | When doctor finished |
| notes | TEXT | | |
| consultation_fee | DECIMAL(12,2) | | Fee charged |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| created_by | UUID | FK → users | |
| is_deleted | BOOLEAN | DEFAULT false | |
| **INDEX** | | (doctor_id, appointment_date) | |
| **INDEX** | | (patient_id, appointment_date) | |
| **INDEX** | | (hospital_id, appointment_date, status) | |

**Appointment Status Enum:**
`scheduled` → `checked_in` → `in_queue` → `with_doctor` → `completed` → (`transferred` to next doctor)
Also: `cancelled`, `no_show`, `rescheduled`

### 5.2 `appointment_status_log`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| appointment_id | UUID | FK → appointments, NOT NULL | |
| from_status | VARCHAR(20) | | Previous status |
| to_status | VARCHAR(20) | NOT NULL | New status |
| changed_by | UUID | FK → users | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

### 5.3 `appointment_queue`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| appointment_id | UUID | FK → appointments, NOT NULL | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| queue_date | DATE | NOT NULL | |
| queue_number | INTEGER | NOT NULL | Token number for the day |
| position | INTEGER | NOT NULL | Current position in queue |
| status | VARCHAR(20) | DEFAULT 'waiting' | 'waiting','called','in_consultation','completed','skipped' |
| called_at | TIMESTAMPTZ | | When called in |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (doctor_id, queue_date, queue_number) | |
| **INDEX** | | (doctor_id, queue_date, status) | |

---

## 6. Prescriptions

### 6.1 `prescriptions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| prescription_number | VARCHAR(30) | NOT NULL, UNIQUE | RX-2026-00001 |
| appointment_id | UUID | FK → appointments | |
| patient_id | UUID | FK → patients, NOT NULL | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| diagnosis | TEXT | | |
| clinical_notes | TEXT | | |
| advice | TEXT | | Doctor's advice to patient |
| version | INTEGER | DEFAULT 1 | Increments on edit |
| status | VARCHAR(20) | DEFAULT 'draft' | 'draft','finalized','dispensed','partially_dispensed' |
| is_finalized | BOOLEAN | DEFAULT false | Once true, cannot be edited |
| finalized_at | TIMESTAMPTZ | | |
| valid_until | DATE | | Prescription validity |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| created_by | UUID | FK → users | |
| is_deleted | BOOLEAN | DEFAULT false | |

### 6.2 `prescription_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| prescription_id | UUID | FK → prescriptions, NOT NULL | |
| medicine_id | UUID | FK → medicines, NULLABLE | Links to formulary |
| medicine_name | VARCHAR(200) | NOT NULL | Free text (in case not in formulary) |
| generic_name | VARCHAR(200) | | |
| dosage | VARCHAR(50) | NOT NULL | e.g., "500mg" |
| frequency | VARCHAR(50) | NOT NULL | e.g., "1-0-1" (morning-afternoon-night) |
| duration_value | INTEGER | | e.g., 7 |
| duration_unit | VARCHAR(10) | | 'days','weeks','months' |
| route | VARCHAR(30) | | 'oral','topical','injection','inhalation' |
| instructions | TEXT | | e.g., "After food" |
| quantity | INTEGER | | Calculated from dosage × duration |
| allow_substitution | BOOLEAN | DEFAULT true | Allow generic substitution |
| is_dispensed | BOOLEAN | DEFAULT false | |
| dispensed_quantity | INTEGER | DEFAULT 0 | |
| display_order | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |

### 6.3 `prescription_templates`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| diagnosis | VARCHAR(255) | | |
| items | JSONB | NOT NULL | Array of item definitions |
| advice | TEXT | | |
| is_active | BOOLEAN | DEFAULT true | |
| usage_count | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 6.4 `prescription_versions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| prescription_id | UUID | FK → prescriptions, NOT NULL | |
| version | INTEGER | NOT NULL | |
| snapshot | JSONB | NOT NULL | Full prescription state at this version |
| changed_by | UUID | FK → users | |
| change_reason | TEXT | | |
| created_at | TIMESTAMPTZ | | |

### 6.5 `lab_orders`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| prescription_id | UUID | FK → prescriptions, NOT NULL | |
| patient_id | UUID | FK → patients, NOT NULL | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| test_name | VARCHAR(200) | NOT NULL | |
| test_code | VARCHAR(30) | | |
| instructions | TEXT | | |
| urgency | VARCHAR(20) | DEFAULT 'routine' | 'routine','urgent','stat' |
| status | VARCHAR(20) | DEFAULT 'ordered' | 'ordered','collected','processing','completed' |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

---

## 7. Pharmacy / Medicines

### 7.1 `medicines`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| name | VARCHAR(200) | NOT NULL | Brand name |
| generic_name | VARCHAR(200) | NOT NULL | |
| category | VARCHAR(50) | | 'tablet','capsule','syrup','injection','cream','drops' |
| manufacturer | VARCHAR(200) | | |
| composition | TEXT | | Active ingredients |
| strength | VARCHAR(50) | | e.g., "500mg", "250mg/5ml" |
| unit_of_measure | VARCHAR(20) | NOT NULL | 'strip','bottle','tube','vial','box' |
| units_per_pack | INTEGER | DEFAULT 1 | e.g., 10 tablets per strip |
| hsn_code | VARCHAR(20) | | Harmonized System code for tax |
| sku | VARCHAR(50) | | Stock keeping unit |
| barcode | VARCHAR(50) | | EAN/UPC barcode |
| requires_prescription | BOOLEAN | DEFAULT true | OTC = false |
| is_controlled | BOOLEAN | DEFAULT false | Controlled substance |
| selling_price | DECIMAL(12,2) | NOT NULL | MRP / retail price |
| purchase_price | DECIMAL(12,2) | | |
| tax_config_id | UUID | FK → tax_configurations | |
| reorder_level | INTEGER | DEFAULT 10 | |
| max_stock_level | INTEGER | | |
| storage_instructions | VARCHAR(255) | | e.g., "Store below 25°C" |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **INDEX** | | (hospital_id, name) | |
| **INDEX** | | (generic_name) | |
| **INDEX** | | (barcode) WHERE barcode IS NOT NULL | |

### 7.2 `medicine_batches`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| medicine_id | UUID | FK → medicines, NOT NULL | |
| batch_number | VARCHAR(50) | NOT NULL | |
| grn_id | UUID | FK → goods_receipt_notes | |
| manufactured_date | DATE | | |
| expiry_date | DATE | NOT NULL | |
| purchase_price | DECIMAL(12,2) | | Cost per unit |
| selling_price | DECIMAL(12,2) | | May differ from medicine default |
| initial_quantity | INTEGER | NOT NULL | Received quantity |
| current_quantity | INTEGER | NOT NULL | Available stock |
| is_expired | BOOLEAN | DEFAULT false | |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (medicine_id, batch_number) | |
| **INDEX** | | (expiry_date) | For expiry alerts |
| **INDEX** | | (medicine_id, is_active, current_quantity) | |

### 7.3 `pharmacy_dispensing`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| dispensing_number | VARCHAR(30) | NOT NULL, UNIQUE | |
| prescription_id | UUID | FK → prescriptions, NULLABLE | NULL for OTC counter sale |
| patient_id | UUID | FK → patients, NULLABLE | NULL for walk-in OTC |
| sale_type | VARCHAR(20) | NOT NULL | 'prescription','counter_sale' |
| invoice_id | UUID | FK → invoices, NULLABLE | |
| status | VARCHAR(20) | DEFAULT 'pending' | 'pending','dispensed','partial','cancelled' |
| total_amount | DECIMAL(12,2) | DEFAULT 0 | |
| discount_amount | DECIMAL(12,2) | DEFAULT 0 | |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | |
| net_amount | DECIMAL(12,2) | DEFAULT 0 | |
| dispensed_by | UUID | FK → users | |
| dispensed_at | TIMESTAMPTZ | | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 7.4 `pharmacy_dispensing_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| dispensing_id | UUID | FK → pharmacy_dispensing, NOT NULL | |
| prescription_item_id | UUID | FK → prescription_items, NULLABLE | |
| medicine_id | UUID | FK → medicines, NOT NULL | |
| medicine_batch_id | UUID | FK → medicine_batches, NOT NULL | |
| quantity | INTEGER | NOT NULL | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| discount_percent | DECIMAL(5,2) | DEFAULT 0 | |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | |
| total_price | DECIMAL(12,2) | NOT NULL | |
| substituted | BOOLEAN | DEFAULT false | Generic substitution |
| original_medicine_name | VARCHAR(200) | | If substituted |
| created_at | TIMESTAMPTZ | | |

### 7.5 `pharmacy_returns`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| return_number | VARCHAR(30) | NOT NULL, UNIQUE | |
| dispensing_id | UUID | FK → pharmacy_dispensing, NOT NULL | |
| patient_id | UUID | FK → patients, NULLABLE | |
| reason | VARCHAR(255) | NOT NULL | |
| total_refund | DECIMAL(12,2) | NOT NULL | |
| status | VARCHAR(20) | DEFAULT 'pending' | 'pending','approved','processed','rejected' |
| approved_by | UUID | FK → users | |
| restock | BOOLEAN | DEFAULT true | Return to inventory? |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 7.6 `pharmacy_return_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| return_id | UUID | FK → pharmacy_returns, NOT NULL | |
| dispensing_item_id | UUID | FK → pharmacy_dispensing_items, NOT NULL | |
| medicine_id | UUID | FK → medicines, NOT NULL | |
| batch_id | UUID | FK → medicine_batches, NOT NULL | |
| quantity | INTEGER | NOT NULL | |
| refund_amount | DECIMAL(12,2) | NOT NULL | |
| restocked | BOOLEAN | DEFAULT false | |
| created_at | TIMESTAMPTZ | | |

---

## 8. Optical Store

### 8.1 `optical_products`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| name | VARCHAR(200) | NOT NULL | |
| category | VARCHAR(50) | NOT NULL | 'frame','lens','contact_lens','accessory','solution' |
| brand | VARCHAR(100) | | |
| model_number | VARCHAR(50) | | |
| color | VARCHAR(30) | | |
| material | VARCHAR(50) | | e.g., 'titanium','plastic','acetate' |
| size | VARCHAR(20) | | Frame size |
| gender | VARCHAR(10) | | 'unisex','male','female','kids' |
| sku | VARCHAR(50) | | |
| barcode | VARCHAR(50) | | |
| selling_price | DECIMAL(12,2) | NOT NULL | |
| purchase_price | DECIMAL(12,2) | | |
| tax_config_id | UUID | FK → tax_configurations | |
| current_stock | INTEGER | DEFAULT 0 | |
| reorder_level | INTEGER | DEFAULT 5 | |
| lens_type | VARCHAR(30) | | 'single_vision','bifocal','progressive','tinted' |
| lens_index | VARCHAR(10) | | '1.5','1.56','1.6','1.67','1.74' |
| lens_coating | VARCHAR(50) | | 'anti_reflective','blue_cut','photochromic' |
| image_url | VARCHAR(500) | | |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 8.2 `optical_prescriptions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| prescription_number | VARCHAR(30) | NOT NULL, UNIQUE | |
| patient_id | UUID | FK → patients, NOT NULL | |
| doctor_id | UUID | FK → doctors, NOT NULL | |
| appointment_id | UUID | FK → appointments | |
| right_sph | DECIMAL(5,2) | | Sphere (±) |
| right_cyl | DECIMAL(5,2) | | Cylinder (±) |
| right_axis | INTEGER | | 0-180 degrees |
| right_add | DECIMAL(4,2) | | Addition for reading |
| right_va | VARCHAR(20) | | Visual acuity (e.g., "6/6") |
| left_sph | DECIMAL(5,2) | | |
| left_cyl | DECIMAL(5,2) | | |
| left_axis | INTEGER | | |
| left_add | DECIMAL(4,2) | | |
| left_va | VARCHAR(20) | | |
| pd_distance | DECIMAL(4,1) | | Pupillary distance (mm) |
| pd_near | DECIMAL(4,1) | | |
| pd_right | DECIMAL(4,1) | | Monocular PD |
| pd_left | DECIMAL(4,1) | | |
| notes | TEXT | | |
| is_finalized | BOOLEAN | DEFAULT false | |
| valid_until | DATE | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 8.3 `optical_orders`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| order_number | VARCHAR(30) | NOT NULL, UNIQUE | |
| patient_id | UUID | FK → patients, NOT NULL | |
| optical_prescription_id | UUID | FK → optical_prescriptions | |
| invoice_id | UUID | FK → invoices | |
| order_type | VARCHAR(20) | NOT NULL | 'new','replacement','repair_order' |
| status | VARCHAR(20) | DEFAULT 'placed' | See status enum below |
| frame_product_id | UUID | FK → optical_products | |
| right_lens_product_id | UUID | FK → optical_products | |
| left_lens_product_id | UUID | FK → optical_products | |
| fitting_measurements | JSONB | | segment height, vertex distance, etc. |
| total_amount | DECIMAL(12,2) | DEFAULT 0 | |
| discount_amount | DECIMAL(12,2) | DEFAULT 0 | |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | |
| net_amount | DECIMAL(12,2) | DEFAULT 0 | |
| estimated_delivery_date | DATE | | |
| delivered_at | TIMESTAMPTZ | | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

**Optical Order Status:** `placed` → `in_progress` → `quality_check` → `ready` → `delivered`
Also: `cancelled`

### 8.4 `optical_order_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| order_id | UUID | FK → optical_orders, NOT NULL | |
| product_id | UUID | FK → optical_products, NOT NULL | |
| quantity | INTEGER | NOT NULL, DEFAULT 1 | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| discount_percent | DECIMAL(5,2) | DEFAULT 0 | |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | |
| total_price | DECIMAL(12,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

### 8.5 `optical_repairs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| repair_number | VARCHAR(30) | NOT NULL, UNIQUE | |
| patient_id | UUID | FK → patients, NOT NULL | |
| item_description | VARCHAR(255) | NOT NULL | What is being repaired |
| issue_description | TEXT | NOT NULL | Problem description |
| status | VARCHAR(20) | DEFAULT 'received' | 'received','in_progress','completed','delivered','cancelled' |
| estimated_cost | DECIMAL(12,2) | | |
| actual_cost | DECIMAL(12,2) | | |
| invoice_id | UUID | FK → invoices | |
| estimated_completion | DATE | | |
| completed_at | TIMESTAMPTZ | | |
| delivered_at | TIMESTAMPTZ | | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

---

## 9. Billing & Payments

### 9.1 `invoices`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| invoice_number | VARCHAR(30) | NOT NULL, UNIQUE | INV-2026-00001 |
| patient_id | UUID | FK → patients, NOT NULL | |
| appointment_id | UUID | FK → appointments, NULLABLE | |
| invoice_type | VARCHAR(20) | NOT NULL | 'opd','pharmacy','optical','combined' |
| invoice_date | DATE | NOT NULL | |
| due_date | DATE | | |
| subtotal | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | Before tax & discount |
| discount_amount | DECIMAL(12,2) | DEFAULT 0 | |
| discount_reason | VARCHAR(255) | | |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | |
| total_amount | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | Final total |
| paid_amount | DECIMAL(12,2) | DEFAULT 0 | Amount received |
| balance_amount | DECIMAL(12,2) | DEFAULT 0 | total - paid |
| currency | VARCHAR(3) | DEFAULT 'USD' | |
| status | VARCHAR(20) | DEFAULT 'draft' | 'draft','issued','partially_paid','paid','overdue','cancelled','void' |
| notes | TEXT | | |
| insurance_claim_id | UUID | FK → insurance_claims | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| created_by | UUID | FK → users | |
| is_deleted | BOOLEAN | DEFAULT false | |
| **INDEX** | | (hospital_id, invoice_date) | |
| **INDEX** | | (patient_id) | |
| **INDEX** | | (status) | |

### 9.2 `invoice_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| invoice_id | UUID | FK → invoices, NOT NULL | |
| item_type | VARCHAR(20) | NOT NULL | 'consultation','medicine','optical_product','service','procedure' |
| reference_id | UUID | | FK to source table (medicine, optical product, etc.) |
| description | VARCHAR(255) | NOT NULL | |
| quantity | DECIMAL(10,2) | NOT NULL, DEFAULT 1 | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| discount_percent | DECIMAL(5,2) | DEFAULT 0 | |
| discount_amount | DECIMAL(12,2) | DEFAULT 0 | |
| tax_config_id | UUID | FK → tax_configurations | |
| tax_rate | DECIMAL(5,2) | DEFAULT 0 | |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | |
| total_price | DECIMAL(12,2) | NOT NULL | |
| display_order | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |

### 9.3 `payments`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| payment_number | VARCHAR(30) | NOT NULL, UNIQUE | PAY-2026-00001 |
| invoice_id | UUID | FK → invoices, NOT NULL | |
| patient_id | UUID | FK → patients, NOT NULL | |
| amount | DECIMAL(12,2) | NOT NULL | |
| currency | VARCHAR(3) | DEFAULT 'USD' | |
| payment_mode | VARCHAR(20) | NOT NULL | 'cash','card','upi','wallet','bank_transfer','online','cheque','insurance' |
| payment_reference | VARCHAR(100) | | Transaction ID / cheque number |
| payment_date | DATE | NOT NULL | |
| payment_time | TIME | | |
| status | VARCHAR(20) | DEFAULT 'completed' | 'pending','completed','failed','reversed' |
| received_by | UUID | FK → users | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 9.4 `refunds`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| refund_number | VARCHAR(30) | NOT NULL, UNIQUE | REF-2026-00001 |
| invoice_id | UUID | FK → invoices, NOT NULL | |
| payment_id | UUID | FK → payments, NOT NULL | |
| patient_id | UUID | FK → patients, NOT NULL | |
| amount | DECIMAL(12,2) | NOT NULL | |
| reason_code | VARCHAR(50) | NOT NULL | 'service_not_provided','billing_error','patient_request','duplicate','other' |
| reason_detail | TEXT | | |
| status | VARCHAR(20) | DEFAULT 'pending' | 'pending','approved','processed','rejected' |
| refund_mode | VARCHAR(20) | | Same/different from payment mode |
| refund_reference | VARCHAR(100) | | Transaction ID |
| requested_by | UUID | FK → users | |
| approved_by | UUID | FK → users | |
| processed_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 9.5 `credit_notes`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| credit_note_number | VARCHAR(30) | NOT NULL, UNIQUE | CN-2026-00001 |
| invoice_id | UUID | FK → invoices, NOT NULL | |
| patient_id | UUID | FK → patients, NOT NULL | |
| amount | DECIMAL(12,2) | NOT NULL | |
| reason | TEXT | NOT NULL | |
| status | VARCHAR(20) | DEFAULT 'issued' | 'issued','applied','expired' |
| applied_to_invoice_id | UUID | FK → invoices | |
| valid_until | DATE | | |
| created_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | | |

### 9.6 `daily_settlements`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| settlement_date | DATE | NOT NULL | |
| cashier_user_id | UUID | FK → users, NOT NULL | |
| total_cash | DECIMAL(12,2) | DEFAULT 0 | |
| total_card | DECIMAL(12,2) | DEFAULT 0 | |
| total_online | DECIMAL(12,2) | DEFAULT 0 | |
| total_other | DECIMAL(12,2) | DEFAULT 0 | |
| total_collected | DECIMAL(12,2) | DEFAULT 0 | |
| total_refunds | DECIMAL(12,2) | DEFAULT 0 | |
| net_amount | DECIMAL(12,2) | DEFAULT 0 | |
| status | VARCHAR(20) | DEFAULT 'open' | 'open','closed','verified' |
| verified_by | UUID | FK → users | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, settlement_date, cashier_user_id) | |

---

## 10. Insurance

### 10.1 `insurance_providers`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| name | VARCHAR(200) | NOT NULL | |
| code | VARCHAR(20) | NOT NULL | |
| contact_person | VARCHAR(100) | | |
| phone | VARCHAR(20) | | |
| email | VARCHAR(255) | | |
| address | TEXT | | |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 10.2 `insurance_policies`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| patient_id | UUID | FK → patients, NOT NULL | |
| provider_id | UUID | FK → insurance_providers, NOT NULL | |
| policy_number | VARCHAR(50) | NOT NULL | |
| group_number | VARCHAR(50) | | |
| member_id | VARCHAR(50) | | |
| plan_name | VARCHAR(100) | | |
| coverage_type | VARCHAR(30) | | 'individual','family' |
| coverage_amount | DECIMAL(12,2) | | Max coverage |
| deductible | DECIMAL(12,2) | | |
| copay_percent | DECIMAL(5,2) | | Patient copay % |
| effective_from | DATE | NOT NULL | |
| effective_to | DATE | | |
| is_primary | BOOLEAN | DEFAULT true | Primary or secondary insurance |
| status | VARCHAR(20) | DEFAULT 'active' | 'active','expired','suspended' |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 10.3 `insurance_claims`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| claim_number | VARCHAR(30) | NOT NULL, UNIQUE | CLM-2026-00001 |
| patient_id | UUID | FK → patients, NOT NULL | |
| policy_id | UUID | FK → insurance_policies, NOT NULL | |
| invoice_id | UUID | FK → invoices | |
| claim_amount | DECIMAL(12,2) | NOT NULL | |
| approved_amount | DECIMAL(12,2) | | |
| status | VARCHAR(20) | DEFAULT 'submitted' | 'draft','submitted','under_review','approved','partially_approved','rejected','settled' |
| submission_date | DATE | | |
| response_date | DATE | | |
| rejection_reason | TEXT | | |
| notes | TEXT | | |
| documents | JSONB | | Array of document URLs |
| created_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 10.4 `pre_authorizations`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| patient_id | UUID | FK → patients, NOT NULL | |
| policy_id | UUID | FK → insurance_policies, NOT NULL | |
| service_description | TEXT | NOT NULL | |
| estimated_cost | DECIMAL(12,2) | NOT NULL | |
| status | VARCHAR(20) | DEFAULT 'requested' | 'requested','approved','denied','expired' |
| auth_number | VARCHAR(50) | | Insurance auth number |
| approved_amount | DECIMAL(12,2) | | |
| valid_from | DATE | | |
| valid_to | DATE | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

---

## 11. Inventory

### 11.1 `suppliers`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| name | VARCHAR(200) | NOT NULL | |
| code | VARCHAR(20) | NOT NULL | |
| contact_person | VARCHAR(100) | | |
| phone | VARCHAR(20) | | |
| email | VARCHAR(255) | | |
| address | TEXT | | |
| tax_id | VARCHAR(50) | | Supplier tax registration |
| payment_terms | VARCHAR(50) | | e.g., "Net 30" |
| lead_time_days | INTEGER | | Average delivery days |
| rating | DECIMAL(3,1) | | 1.0-5.0 |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, code) | |

### 11.2 `purchase_orders`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| po_number | VARCHAR(30) | NOT NULL, UNIQUE | PO-2026-00001 |
| supplier_id | UUID | FK → suppliers, NOT NULL | |
| order_date | DATE | NOT NULL | |
| expected_delivery_date | DATE | | |
| status | VARCHAR(20) | DEFAULT 'draft' | 'draft','submitted','partially_received','received','cancelled' |
| total_amount | DECIMAL(12,2) | DEFAULT 0 | |
| tax_amount | DECIMAL(12,2) | DEFAULT 0 | |
| notes | TEXT | | |
| approved_by | UUID | FK → users | |
| created_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 11.3 `purchase_order_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| purchase_order_id | UUID | FK → purchase_orders, NOT NULL | |
| item_type | VARCHAR(20) | NOT NULL | 'medicine','optical_product' |
| item_id | UUID | NOT NULL | FK to medicines or optical_products |
| quantity_ordered | INTEGER | NOT NULL | |
| quantity_received | INTEGER | DEFAULT 0 | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| total_price | DECIMAL(12,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

### 11.4 `goods_receipt_notes`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| grn_number | VARCHAR(30) | NOT NULL, UNIQUE | GRN-2026-00001 |
| purchase_order_id | UUID | FK → purchase_orders, NULLABLE | |
| supplier_id | UUID | FK → suppliers, NOT NULL | |
| receipt_date | DATE | NOT NULL | |
| invoice_number | VARCHAR(50) | | Supplier invoice number |
| invoice_date | DATE | | |
| total_amount | DECIMAL(12,2) | DEFAULT 0 | |
| status | VARCHAR(20) | DEFAULT 'pending' | 'pending','verified','accepted','rejected' |
| verified_by | UUID | FK → users | |
| notes | TEXT | | |
| created_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### 11.5 `grn_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| grn_id | UUID | FK → goods_receipt_notes, NOT NULL | |
| item_type | VARCHAR(20) | NOT NULL | 'medicine','optical_product' |
| item_id | UUID | NOT NULL | |
| batch_number | VARCHAR(50) | | For medicines |
| manufactured_date | DATE | | |
| expiry_date | DATE | | |
| quantity_received | INTEGER | NOT NULL | |
| quantity_accepted | INTEGER | | After QC |
| quantity_rejected | INTEGER | DEFAULT 0 | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| total_price | DECIMAL(12,2) | NOT NULL | |
| rejection_reason | VARCHAR(255) | | |
| created_at | TIMESTAMPTZ | | |

### 11.6 `stock_movements`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| item_type | VARCHAR(20) | NOT NULL | 'medicine','optical_product' |
| item_id | UUID | NOT NULL | |
| batch_id | UUID | | For medicines |
| movement_type | VARCHAR(20) | NOT NULL | 'stock_in','sale','dispensing','return','adjustment','transfer','expired','damaged' |
| reference_type | VARCHAR(30) | | 'grn','dispensing','return','adjustment','transfer' |
| reference_id | UUID | | FK to source record |
| quantity | INTEGER | NOT NULL | Positive = in, Negative = out |
| balance_after | INTEGER | NOT NULL | Running balance |
| unit_cost | DECIMAL(12,2) | | |
| notes | VARCHAR(255) | | |
| performed_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| **INDEX** | | (item_type, item_id, created_at) | |

### 11.7 `stock_adjustments`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| adjustment_number | VARCHAR(30) | NOT NULL, UNIQUE | |
| item_type | VARCHAR(20) | NOT NULL | |
| item_id | UUID | NOT NULL | |
| batch_id | UUID | | |
| adjustment_type | VARCHAR(20) | NOT NULL | 'increase','decrease','write_off' |
| quantity | INTEGER | NOT NULL | |
| reason | VARCHAR(255) | NOT NULL | |
| approved_by | UUID | FK → users | |
| status | VARCHAR(20) | DEFAULT 'pending' | 'pending','approved','rejected' |
| created_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | | |

### 11.8 `cycle_counts`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| count_number | VARCHAR(30) | NOT NULL, UNIQUE | |
| count_date | DATE | NOT NULL | |
| status | VARCHAR(20) | DEFAULT 'in_progress' | 'in_progress','completed','verified' |
| notes | TEXT | | |
| counted_by | UUID | FK → users | |
| verified_by | UUID | FK → users | |
| created_at | TIMESTAMPTZ | | |

### 11.9 `cycle_count_items`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| cycle_count_id | UUID | FK → cycle_counts, NOT NULL | |
| item_type | VARCHAR(20) | NOT NULL | |
| item_id | UUID | NOT NULL | |
| batch_id | UUID | | |
| system_quantity | INTEGER | NOT NULL | Expected |
| counted_quantity | INTEGER | NOT NULL | Actual |
| variance | INTEGER | NOT NULL | counted - system |
| variance_reason | VARCHAR(255) | | |
| created_at | TIMESTAMPTZ | | |

---

## 12. Notifications

### 12.1 `notifications`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| user_id | UUID | FK → users, NOT NULL | Target user |
| title | VARCHAR(200) | NOT NULL | |
| message | TEXT | NOT NULL | |
| type | VARCHAR(30) | NOT NULL | 'appointment','prescription','billing','inventory','system' |
| priority | VARCHAR(10) | DEFAULT 'normal' | 'low','normal','high','urgent' |
| reference_type | VARCHAR(30) | | Entity type (appointment, invoice, etc.) |
| reference_id | UUID | | Entity ID for navigation |
| is_read | BOOLEAN | DEFAULT false | |
| read_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | | |
| **INDEX** | | (user_id, is_read, created_at DESC) | |

### 12.2 `notification_templates`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals | |
| code | VARCHAR(50) | NOT NULL | e.g., 'appointment_reminder', 'prescription_ready' |
| channel | VARCHAR(20) | NOT NULL | 'sms','email','whatsapp','in_app' |
| locale | VARCHAR(10) | DEFAULT 'en' | |
| subject | VARCHAR(200) | | For email |
| body_template | TEXT | NOT NULL | Template with {{variables}} |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, code, channel, locale) | |

### 12.3 `notification_queue`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| channel | VARCHAR(20) | NOT NULL | 'sms','email','whatsapp' |
| recipient | VARCHAR(255) | NOT NULL | Phone or email |
| subject | VARCHAR(200) | | |
| body | TEXT | NOT NULL | |
| status | VARCHAR(20) | DEFAULT 'pending' | 'pending','sent','failed','cancelled' |
| attempts | INTEGER | DEFAULT 0 | |
| last_attempt_at | TIMESTAMPTZ | | |
| error_message | TEXT | | |
| scheduled_at | TIMESTAMPTZ | | |
| sent_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | | |

---

## 13. Audit Log

### 13.1 `audit_logs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals | |
| user_id | UUID | FK → users | NULL for system actions |
| action | VARCHAR(20) | NOT NULL | 'create','update','delete','login','logout','export','print' |
| entity_type | VARCHAR(50) | NOT NULL | 'patient','invoice','prescription', etc. |
| entity_id | UUID | | |
| entity_name | VARCHAR(200) | | Human-readable identifier |
| old_values | JSONB | | Previous state (for updates) |
| new_values | JSONB | | New state (for creates/updates) |
| ip_address | VARCHAR(45) | | |
| user_agent | VARCHAR(500) | | |
| request_path | VARCHAR(255) | | API endpoint |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| **INDEX** | | (entity_type, entity_id) | |
| **INDEX** | | (user_id, created_at DESC) | |
| **INDEX** | | (hospital_id, created_at DESC) | |

---

## 14. ID Card System

### 14.1 HMS 12-Digit ID Format

> Applies to **all** users (patients, doctors, nurses, staff) for unified identification across every module.

**Format:** `[HOSPITAL][GENDER][YY][M][CHECKSUM][#####]` = 12 chars

| Position | Component | Length | Description |
|----------|-----------|--------|-------------|
| 1-2 | Hospital Code | 2 chars | Hospital/branch identifier (e.g., HC, HA, HM) |
| 3 | Gender Code | 1 char | Gender (M/F/O/N/U) |
| 4-5 | Year | 2 digits | Registration year (last 2) |
| 6 | Month | 1 char | Registration month (1-9, A=Oct, B=Nov, C=Dec) |
| 7 | Checksum | 1 char | Validation character calculated from positions 1-6 |
| 8-12 | Sequence | 5 digits | Auto-generated, starts from project-defined first number |

**Examples:**
| Person | Details | ID | Breakdown |
|--------|---------|----|-----------|
| Patient Rajesh | Male, HMS Core, Feb 2026, #147 | HCM262K00147 | HC-M-26-2-K-00147 |
| Dr. Smith | Doctor, HMS Core, Jan 2026, #3 | HCD261X00003 | HC-D-26-1-X-00003 |
| Nurse Priya | Nurse, HMS Apollo, Mar 2026, #12 | HAN263Y00012 | HA-N-26-3-Y-00012 |
| Pharmacist Ali | Pharmacist, HMS Core, Feb 2026, #5 | HCP262Z00005 | HC-P-26-2-Z-00005 |

**Sequence Start Number:** Configurable in `hospital_settings.patient_id_start_number` and `hospital_settings.staff_id_start_number`. For example, a project may choose to start patient sequences at 10000 instead of 1. All subsequent numbers are auto-incremented.

**Mapping:** This reference number is the primary identifier used for cross-module lookups (appointments, prescriptions, billing, pharmacy, optical, inventory, reports). It enables instant identification of hospital, gender, and registration date from the ID alone.

### 14.2 `id_sequences`

Per-hospital, per-month sequence tracker to ensure unique 5-digit sequences.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| hospital_code | CHAR(2) | NOT NULL | |
| entity_type | VARCHAR(10) | NOT NULL | 'patient' or 'staff' |
| role_gender_code | CHAR(1) | NOT NULL | M/F/O/D/N/S/A/P/R/T/X |
| year_code | CHAR(2) | NOT NULL | e.g., '26' |
| month_code | CHAR(1) | NOT NULL | 1-9,A,B,C |
| last_sequence | INTEGER | NOT NULL, DEFAULT 0 | Last issued sequence |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **UNIQUE** | | (hospital_id, entity_type, role_gender_code, year_code, month_code) | |

### 14.3 `id_cards`

Stores generated ID card data for patients and staff, including uploaded photo reference.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| hospital_id | UUID | FK → hospitals, NOT NULL | |
| holder_type | VARCHAR(10) | NOT NULL | 'patient' or 'user' (staff) |
| holder_id | UUID | NOT NULL | FK to patients.id or users.id |
| reference_number | VARCHAR(12) | NOT NULL | The 12-digit ID |
| photo_url | VARCHAR(500) | | Uploaded photo for ID card |
| card_data_snapshot | JSONB | NOT NULL | Complete data rendered on card (name, DOB, blood group, dept, etc.) |
| front_design_url | VARCHAR(500) | | Generated front-side image/PDF |
| back_design_url | VARCHAR(500) | | Generated back-side image/PDF |
| issued_at | TIMESTAMPTZ | DEFAULT NOW() | |
| issued_by | UUID | FK → users | |
| revoked_at | TIMESTAMPTZ | | NULL = active |
| version | INTEGER | DEFAULT 1 | Regenerated card increments version |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |
| **INDEX** | | (reference_number) | |
| **INDEX** | | (holder_type, holder_id) | |

**Front Side Content (Patient):**
- Hospital logo + name
- Patient photo (uploaded or captured)
- Full name, DOB/Age, Gender, Blood group
- Patient Reference Number (12-digit)
- Department with color band
- QR code encoding the reference number
- Registration date

**Back Side Content:**
- Hospital full address + phone + email + website
- Emergency contact number
- Terms & conditions / disclaimer
- Hospital registration number
- Card issue date + version

**Staff Front Side** has the same layout with role title ("Doctor", "Nurse", etc.) and employee-specific info.

### 14.4 `password_emails`

Tracks passwords sent to users via email by Super Admin.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users, NOT NULL | |
| sent_by | UUID | FK → users, NOT NULL | Super Admin who triggered send |
| sent_to_email | VARCHAR(255) | NOT NULL | Email address password was sent to |
| sent_at | TIMESTAMPTZ | DEFAULT NOW() | |
| is_temp_password | BOOLEAN | DEFAULT true | Was it a temporary password? |
| created_at | TIMESTAMPTZ | | |
| **INDEX** | | (user_id, sent_at DESC) | |

---

## Database Indexes Summary

### Performance-Critical Indexes
```sql
-- Patient search
CREATE INDEX idx_patients_phone ON patients(phone_country_code, phone_number) WHERE is_deleted = false;
CREATE INDEX idx_patients_name ON patients(hospital_id, first_name, last_name) WHERE is_deleted = false;
CREATE INDEX idx_patients_prn ON patients(patient_reference_number);
CREATE INDEX idx_users_refnum ON users(reference_number);

-- ID card lookup
CREATE INDEX idx_id_cards_refnum ON id_cards(reference_number);
CREATE INDEX idx_id_cards_holder ON id_cards(holder_type, holder_id);

-- Appointment queries
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date) WHERE is_deleted = false;
CREATE INDEX idx_appointments_patient ON appointments(patient_id, appointment_date DESC) WHERE is_deleted = false;
CREATE INDEX idx_appointments_status ON appointments(hospital_id, appointment_date, status) WHERE is_deleted = false;

-- Queue management
CREATE INDEX idx_queue_doctor_date ON appointment_queue(doctor_id, queue_date, position);

-- Invoice queries
CREATE INDEX idx_invoices_patient ON invoices(patient_id, invoice_date DESC) WHERE is_deleted = false;
CREATE INDEX idx_invoices_date_status ON invoices(hospital_id, invoice_date, status) WHERE is_deleted = false;

-- Inventory
CREATE INDEX idx_medicine_batches_expiry ON medicine_batches(expiry_date) WHERE is_active = true;
CREATE INDEX idx_stock_movements_item ON stock_movements(item_type, item_id, created_at DESC);

-- Audit
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
```

---

## Entity Relationship Summary

```
Hospital 1──* Department
Hospital 1──* User
Hospital 1──* Patient
Hospital 1──* HospitalSettings (1:1)
Hospital 1──* TaxConfiguration

User *──* Role (via user_roles)
Role *──* Permission (via role_permissions)
User 1──1 Doctor (optional)
User 1──* IDCard (staff cards)
User 1──* PasswordEmail

Patient 1──* IDCard (patient cards)
Patient 1──* Appointment
Patient 1──* PatientConsent
Patient 1──* PatientDocument
Patient 1──* InsurancePolicy
Patient 1──* Invoice

Doctor 1──* DoctorSchedule
Doctor 1──* DoctorLeave
Doctor 1──* DoctorFee
Doctor 1──* Appointment
Doctor 1──* Prescription

Appointment 1──* AppointmentStatusLog
Appointment 1──1 AppointmentQueue
Appointment 1──* Prescription

Prescription 1──* PrescriptionItem
Prescription 1──* PrescriptionVersion
Prescription 1──* LabOrder
Prescription 1──* PharmacyDispensing

Medicine 1──* MedicineBatch
MedicineBatch 1──* PharmacyDispensingItem
PharmacyDispensing 1──* PharmacyDispensingItem

Invoice 1──* InvoiceItem
Invoice 1──* Payment
Payment 1──* Refund

Supplier 1──* PurchaseOrder
PurchaseOrder 1──* PurchaseOrderItem
PurchaseOrder 1──* GoodsReceiptNote
GoodsReceiptNote 1──* GRNItem
```
