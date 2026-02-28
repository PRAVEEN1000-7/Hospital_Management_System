# HMS — Database Explanation & Data Flow Guide

> How data flows through the Hospital Management System — phase by phase, table by table, column by column.

---

## Relationship Symbols

| Symbol | Name | Meaning | Example |
|--------|------|---------|---------|
| `A.id < B.a_id` | **One-to-Many** | One record in A can have many records in B | One hospital has many patients |
| `A.id - B.a_id` | **One-to-One** | One record in A has exactly one record in B | One hospital has one settings row |
| `A *──* B (via C)` | **Many-to-Many** | A and B relate through a join table C | Users have many roles, roles have many users — linked through `user_roles` |
| `FK` | **Foreign Key** | A column that points to another table's primary key | `patients.hospital_id` points to `hospitals.id` |
| `PK` | **Primary Key** | Unique identifier for every row, always a UUID | The `id` column present in every table |
| `UNIQUE` | **Unique Constraint** | No two rows can have the same value in this column | `users.email` must be unique per hospital |
| `NULLABLE` | **Optional FK** | The foreign key column can be empty | `departments.head_doctor_id` is null until a head is assigned |

---

## Data Flow Overview

```
START HERE
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 0: FOUNDATION (11 tables)                                │
│  Hospital → Settings → Departments → Users → Roles/Permissions  │
│  "Set up the building before anyone walks in"                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ hospitals, users, departments flow down
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: CORE (12 tables)                                       │
│  Patients → Doctors → Appointments → Queue → ID Cards            │
│  "People walk in, get registered, see a doctor"                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ patients, doctors, appointments flow down
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: CLINICAL (16 tables)                                   │
│  Prescriptions → Pharmacy Dispensing → Optical Orders            │
│  "Doctor writes prescription, pharmacy fills it"                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ prescriptions, medicines, optical flow down
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: BILLING & INVENTORY (19 tables)                        │
│  Invoices → Payments → Insurance Claims → Stock Management       │
│  "Patient pays the bill, stock gets updated"                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ all modules feed into
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: SUPPORT (4 tables)                                     │
│  Notifications → Audit Logs                                      │
│  "Track everything that happened, notify everyone involved"      │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
  END — Full system operational
```

---

## Which DB Tables Power Which App Modules

| App Module (UI Page / Feature) | Phase | Tables Used |
|-------------------------------|-------|-------------|
| **Login / Auth** | 0 | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `refresh_tokens` |
| **Super Admin → User Management** | 0 | `users`, `roles`, `user_roles`, `password_emails` |
| **Hospital Settings Page** | 0 | `hospitals`, `hospital_settings`, `departments`, `tax_configurations` |
| **Patient Registration** | 1 | `patients`, `patient_consents`, `patient_documents`, `id_sequences`, `id_cards` |
| **Patient List / Search** | 1 | `patients` (search by PRN, name, phone) |
| **ID Card Generation** | 1 | `id_cards`, `id_sequences`, `hospital_settings`, `patients` or `users` |
| **Doctor Management** | 1 | `doctors`, `doctor_schedules`, `doctor_leaves`, `doctor_fees` |
| **Appointment Booking** | 1 | `appointments`, `doctor_schedules`, `doctor_leaves`, `patients`, `doctors` |
| **Queue Management Board** | 1 | `appointment_queue`, `appointments`, `doctors` |
| **Prescription Writing** | 2 | `prescriptions`, `prescription_items`, `prescription_templates`, `medicines` |
| **Prescription History** | 2 | `prescriptions`, `prescription_versions`, `prescription_items` |
| **Lab Orders** | 2 | `lab_orders`, `prescriptions`, `patients` |
| **Pharmacy Dispensing** | 2 | `pharmacy_dispensing`, `pharmacy_dispensing_items`, `medicines`, `medicine_batches` |
| **Pharmacy Counter Sale (OTC)** | 2 | `pharmacy_dispensing`, `pharmacy_dispensing_items`, `medicines`, `medicine_batches` |
| **Pharmacy Returns** | 2 | `pharmacy_returns`, `pharmacy_return_items`, `pharmacy_dispensing` |
| **Optical Prescription** | 2 | `optical_prescriptions`, `patients`, `doctors` |
| **Optical Order Management** | 2 | `optical_orders`, `optical_order_items`, `optical_products` |
| **Optical Repairs** | 2 | `optical_repairs`, `patients` |
| **Invoice / Billing** | 3 | `invoices`, `invoice_items`, `tax_configurations` |
| **Payment Collection** | 3 | `payments`, `invoices`, `patients` |
| **Refunds** | 3 | `refunds`, `payments`, `invoices` |
| **Daily Cash Settlement** | 3 | `daily_settlements`, `users` |
| **Insurance Policy Mgmt** | 3 | `insurance_providers`, `insurance_policies`, `patients` |
| **Insurance Claims** | 3 | `insurance_claims`, `insurance_policies`, `invoices` |
| **Supplier Management** | 3 | `suppliers` |
| **Purchase Orders** | 3 | `purchase_orders`, `purchase_order_items`, `suppliers` |
| **Goods Receipt (GRN)** | 3 | `goods_receipt_notes`, `grn_items`, `purchase_orders`, `medicine_batches` |
| **Stock Tracking** | 3 | `stock_movements`, `stock_adjustments` |
| **Cycle Count / Audit** | 3 | `cycle_counts`, `cycle_count_items` |
| **Reports Dashboard** | 4 | Reads from `invoices`, `appointments`, `patients`, `pharmacy_dispensing`, etc. |
| **Notifications (bell icon)** | 4 | `notifications`, `notification_templates` |
| **SMS / Email Sending** | 4 | `notification_queue`, `notification_templates` |
| **Audit Log Viewer** | 4 | `audit_logs` |

---

## Phase 0: Foundation (Week 1–2)

> **Total tables:** 11  
> **Starts at:** `hospitals` — the root of the entire system, created first.  
> **Ends at:** `refresh_tokens` / `password_emails` — users can log in, Super Admin can manage accounts.  
> **Connected from previous phase:** None — this is the starting point.  
> **Connects to next phase:** `hospitals`, `users`, `departments`, `hospital_settings` flow into Phase 1.  
> **Description:** This phase builds the infrastructure that everything else depends on. You cannot register a patient or book an appointment without first having a hospital, departments, and user accounts. Every row in every table across the entire system has a `hospital_id` pointing back to this phase.

---

### Table 1: `hospitals`

The root table of the entire system. Every other table directly or indirectly connects back here. Stores the hospital's identity — name, location, contact, and operational settings like timezone and currency.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier (UUID) | Every table references this to know which hospital a record belongs to |
| `name` | Hospital's full name ("City General Hospital") | Displayed on headers, invoices, ID cards, and reports |
| `code` | Short unique code ("HOSP01") | Used in URL paths, API filters, and quick lookups |
| `logo_url` | Path to the uploaded logo image | Printed on invoices, prescriptions, ID cards, and reports |
| `address_line_1` | Street address first line | Printed on ID card back, invoices, and official documents |
| `address_line_2` | Street address second line | Additional address detail if needed |
| `city` | City name | Part of the full mailing address |
| `state_province` | State or province | Needed for tax rules and regional compliance |
| `postal_code` | ZIP or postal code | Part of mailing address |
| `country` | 3-letter country code (ISO 3166-1) | Determines date format, currency, phone format, tax rules |
| `phone` | Hospital's phone number (E.164 format) | Printed on ID cards and used for WhatsApp notifications |
| `email` | Hospital's contact email | Shown on printed documents and used as sender for system emails |
| `website` | Hospital's website URL | Printed on ID card back side |
| `timezone` | IANA timezone ("Asia/Kolkata", "America/New_York") | All appointment times and schedules are calculated relative to this |
| `default_currency` | 3-letter currency code (ISO 4217) | All prices, invoices, and payments use this currency |
| `tax_id` | Tax registration number (GST, EIN, VAT) | Printed on invoices for legal/tax compliance |
| `registration_number` | Hospital's government registration | Printed on ID cards and official documents |
| `is_active` | Whether the hospital is operational | Disabled hospitals can't accept new registrations or appointments |
| `created_at` | When this record was created | Audit trail |
| `updated_at` | When this record was last modified | Audit trail |

**Connected to:** `departments`, `hospital_settings`, `tax_configurations`, `users`, `roles`, `patients`, `doctors`, `appointments`, `invoices`, and virtually every other table.

---

### Table 2: `departments`

Organizes the hospital into sections like Cardiology, Pediatrics, Emergency, Pharmacy. Doctors belong to departments, patients visit departments.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by doctors, appointments, and ID generation |
| `hospital_id` | Which hospital this department belongs to | One hospital has many departments |
| `name` | Full name ("Cardiology", "Emergency Room") | Shown in dropdowns, reports, and ID cards |
| `code` | Short code ("CC", "ER", "PE") | Used for department identification and reporting |
| `description` | What this department does | Informational, shown in admin panel |
| `head_doctor_id` | The doctor leading this department | Optional — set after doctors are created in Phase 1 |
| `is_active` | Whether this department is accepting patients | Inactive departments don't appear in booking dropdowns |
| `display_order` | Sort position in lists and menus | Controls the order departments appear in the sidebar and forms |

**Connected to:** `hospitals` (parent), `doctors` (doctors work here), `appointments` (visits happen here), `id_sequences` (department code used in IDs).

---

### Table 3: `hospital_settings`

One-to-one configuration record for each hospital. Controls how the hospital behaves — ID numbering, appointment rules, notification preferences, and branding.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital (one-to-one, unique) | Each hospital has exactly one settings row |
| `hospital_code` | 2-character code ("HC", "HA", "HM") | First 2 characters of every 12-digit ID generated for this hospital |
| `patient_id_start_number` | First sequence number for patients (e.g., 1 or 100000) | Project can choose to start patient numbering at any number |
| `patient_id_sequence` | Current counter for patient IDs | Auto-increments each time a new patient is registered |
| `staff_id_start_number` | First sequence number for staff | Same concept as patient start, but for doctors/nurses/staff |
| `staff_id_sequence` | Current counter for staff IDs | Auto-increments each time a new staff member is created |
| `invoice_prefix` | Prefix for invoice numbers ("INV") | Invoices become INV-2026-00001, INV-2026-00002, etc. |
| `invoice_sequence` | Current invoice counter | Ensures invoice numbers are sequential |
| `prescription_prefix` | Prefix for prescription numbers ("RX") | Prescriptions become RX-2026-00001, etc. |
| `prescription_sequence` | Current prescription counter | Ensures Rx numbers are sequential |
| `appointment_slot_duration_minutes` | How long each appointment slot is (default 15 min) | Determines how many slots fit in a doctor's working day |
| `appointment_buffer_minutes` | Gap between appointment slots (default 5 min) | Prevents back-to-back scheduling, gives doctors breathing room |
| `max_daily_appointments_per_doctor` | Maximum appointments per doctor per day (default 40) | Prevents overbooking |
| `allow_walk_in` | Whether walk-in patients are accepted | Some hospitals are appointment-only |
| `allow_emergency_bypass` | Whether emergencies skip the queue | Emergency patients get immediate access |
| `enable_sms_notifications` | Send SMS notifications | Costs money per SMS, so disabled by default |
| `enable_email_notifications` | Send email notifications | Enabled by default for appointment reminders and receipts |
| `enable_whatsapp_notifications` | Send WhatsApp messages | Requires WhatsApp Business API integration |
| `consultation_fee_default` | Default consultation fee | Used when a doctor doesn't have a custom fee set |
| `follow_up_validity_days` | How many days a follow-up visit is free (default 7) | If patient returns within 7 days for same issue, no charge |
| `data_retention_years` | How long to keep patient data (default 7 years) | Legal requirement in most countries |
| `branding_primary_color` | Primary brand color (hex) | Used in UI theme, printed headers, and ID cards |
| `branding_secondary_color` | Secondary brand color (hex) | Accent color for buttons and highlights |
| `print_header_text` | Custom text printed at top of invoices/Rx | Hospital tagline or registration details |
| `print_footer_text` | Custom text printed at bottom | Disclaimer, refund policy, or thank-you note |

**Connected to:** `hospitals` (1:1 parent), `id_sequences` (uses `hospital_code` for ID generation).

---

### Table 4: `tax_configurations`

Stores tax rules — different countries have GST, VAT, Sales Tax, etc. at different rates. Applied when generating invoices in Phase 3.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by `medicines`, `optical_products`, and `invoice_items` |
| `hospital_id` | Which hospital's tax rules | Different hospitals in different states/countries have different taxes |
| `name` | Human-readable name ("GST 18%", "VAT Standard") | Shown on invoices and in admin settings |
| `code` | Short code ("GST18", "VAT20") | Used in calculations and API responses |
| `rate_percentage` | The tax rate (e.g., 18.00, 5.00, 12.50) | Multiplied by item price to calculate tax amount |
| `applies_to` | What this tax applies to ("product", "service", "both") | Medicine tax may differ from consultation tax |
| `category` | Tax grouping (optional) | For organizing taxes in reports |
| `is_compound` | Whether this tax is calculated on top of other taxes | Compound tax = tax on tax (rare but exists in some jurisdictions) |
| `is_active` | Whether this tax rule is currently in effect | Old tax rules are deactivated, not deleted, for historical records |
| `effective_from` | Date the tax rule starts | Tax rates change; this tracks when each rate became effective |
| `effective_to` | Date the tax rule ends (null = ongoing) | When a new rate replaces this one |

**Connected to:** `hospitals` (parent), `medicines.tax_config_id`, `optical_products.tax_config_id`, `invoice_items.tax_config_id`.

---

### Table 5: `users`

Anyone who logs into the system — Super Admins, hospital admins, doctors, receptionists, pharmacists, cashiers. Each user has a unique 12-digit reference number and belongs to one hospital.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced throughout the system as `created_by`, `updated_by`, `assigned_by` |
| `hospital_id` | Which hospital this user works at | Users only see data from their own hospital |
| `reference_number` | The 12-digit HMS ID (e.g., "HCD261X00003") | Unique staff identification printed on ID cards and used for lookups |
| `email` | User's email address | Used for login, password reset, and receiving notifications |
| `username` | Login username | Alternative login method to email |
| `password_hash` | Encrypted password (bcrypt) | Never stored as plain text; bcrypt hash checked during login |
| `first_name` | First name | Displayed in the UI, printed on ID cards and prescriptions |
| `last_name` | Last name | Combined with first name for full display name |
| `phone` | Phone number (E.164 format) | For SMS notifications and contact |
| `avatar_url` | Path to uploaded profile photo | Displayed in the UI header and printed on ID cards |
| `preferred_locale` | Language preference ("en", "es", "ar") | System UI renders in this language for the user |
| `preferred_timezone` | Override timezone | If user works across timezones, this overrides hospital's default |
| `is_active` | Whether the account is enabled | Disabled users cannot log in |
| `is_mfa_enabled` | Whether two-factor auth is turned on | Extra security layer — requires TOTP code after password |
| `mfa_secret` | Encrypted TOTP secret key | Used to generate/verify 6-digit codes in authenticator apps |
| `last_login_at` | Timestamp of last successful login | Shown in admin panel for security monitoring |
| `password_changed_at` | When password was last changed | Enforce password rotation policies |
| `failed_login_attempts` | Count of consecutive failed logins | After 5 failures, account gets locked |
| `locked_until` | When the account lockout expires | Auto-unlocks after a cooling period |
| `must_change_password` | Whether user must set new password on next login | Set to true when Super Admin creates account or resets password |
| `created_by` | Which admin created this account | Audit trail — tracks who invited this user |
| `is_deleted` | Soft delete flag | User data preserved for audit but account is invisible |
| `deleted_at` | When the soft delete happened | Audit trail for account removal |

**Connected to:** `hospitals` (parent), `roles` (via `user_roles`), `doctors` (1:1 if user is a doctor), `refresh_tokens`, `password_emails`, `id_cards`, `notifications`, `audit_logs`, and as `created_by`/`updated_by` across all tables.

---

### Table 6: `roles`

Named permission groups. Instead of assigning 50 individual permissions to each user, you assign a role like "doctor" or "receptionist" that bundles the right permissions together.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by `user_roles` and `role_permissions` |
| `hospital_id` | Which hospital (null = system-wide) | Hospital-specific roles stay within that hospital; system roles apply everywhere |
| `name` | Internal name ("super_admin", "doctor", "cashier") | Used in code for permission checks |
| `display_name` | Human-readable name ("Super Admin", "Doctor") | Shown in the UI and on ID cards |
| `description` | What this role can do | Help text for admins assigning roles |
| `is_system` | Whether it's a built-in role | System roles (super_admin, doctor) cannot be deleted |
| `is_active` | Whether this role is usable | Inactive roles can't be assigned to new users |

**Default roles seeded:** super_admin, admin, doctor, receptionist, pharmacist, optical_staff, cashier, inventory_manager, report_viewer.

**Connected to:** `user_roles` (which users have this role), `role_permissions` (what this role can do).

---

### Table 7: `permissions`

Individual capabilities — "can create a patient", "can delete an invoice", "can export reports". Permissions are assigned to roles, not directly to users.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by `role_permissions` |
| `module` | Which app section ("patients", "billing", "pharmacy") | Groups permissions by feature area |
| `action` | What operation ("create", "read", "update", "delete", "export", "approve") | Fine-grained control over what users can do |
| `resource` | What entity ("patient", "invoice", "prescription") | Combined with module + action for unique permission key |
| `description` | Human-readable description | Shown in the permission matrix admin UI |

**Example:** module=`patients`, action=`create`, resource=`patient` → "Can register new patients".

**Connected to:** `role_permissions` (which roles have this permission).

---

### Table 8: `user_roles`

Join table linking users to roles. A user can have multiple roles (e.g., a doctor who is also an admin).

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `user_id` | Which user | Points to `users.id` |
| `role_id` | Which role | Points to `roles.id` |
| `assigned_at` | When the role was assigned | Audit trail |
| `assigned_by` | Who assigned it (admin user) | Tracks which admin gave this role |

**Connected to:** `users` (the person), `roles` (the role they received).

---

### Table 9: `role_permissions`

Join table linking roles to permissions. Defines what each role is allowed to do.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `role_id` | Which role | Points to `roles.id` |
| `permission_id` | Which permission | Points to `permissions.id` |

**Connected to:** `roles` (the role), `permissions` (the capability).

---

### Table 10: `refresh_tokens`

When a user logs in, they get an access token (short-lived, ~15 min) and a refresh token (longer, ~7 days). This table stores refresh tokens so the system can issue new access tokens without re-login.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `user_id` | Which user owns this token | Links token to the logged-in user |
| `token_hash` | SHA-256 hash of the refresh token | The actual token is never stored — only its hash, for security |
| `device_info` | Browser/device description | Lets users see "logged in on Chrome, Windows" and revoke specific sessions |
| `ip_address` | IP address of the login | Security audit — detect logins from unusual locations |
| `expires_at` | When the token becomes invalid | After this time, user must log in again with password |
| `revoked_at` | When the token was manually invalidated (null = still valid) | Logout sets this; allows revoking stolen tokens |

**Connected to:** `users` (owner of the session).

---

### Table 11: `password_emails`

Whenever Super Admin creates a user or resets a password and sends it via email, this table logs that action. Ensures there's a traceable record of every password sent.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `user_id` | Which user received the password | Points to the target user |
| `sent_by` | Which admin sent it | Points to the Super Admin who triggered the email |
| `sent_to_email` | The email address it was sent to | May differ from user's current email if it was changed later |
| `sent_at` | When the email was sent | Audit timestamp |
| `is_temp_password` | Whether it was a temporary password | Temporary = user must change it on next login |

**Connected to:** `users` (target user and sending admin).

---

### Connections Within Phase 0

```
hospitals ──(1:1)──→ hospital_settings     One hospital has exactly one config
hospitals ──(1:many)──→ departments         One hospital has many departments
hospitals ──(1:many)──→ tax_configurations  One hospital has many tax rules
hospitals ──(1:many)──→ users               One hospital has many staff
hospitals ──(1:many)──→ roles               One hospital has custom roles

users ──(many:many)──→ roles                Via user_roles join table
roles ──(many:many)──→ permissions          Via role_permissions join table

users ──(1:many)──→ refresh_tokens          One user can have many active sessions
users ──(1:many)──→ password_emails         One user can receive multiple password emails
```

### What Flows to Phase 1

| From Phase 0 | → To Phase 1 | Why |
|-------------|-----------|-----|
| `hospitals.id` | `patients.hospital_id` | Patients register at a hospital |
| `hospitals.id` | `doctors.hospital_id` | Doctors work at a hospital |
| `hospitals.id` | `appointments.hospital_id` | Appointments happen at a hospital |
| `users.id` | `doctors.user_id` | Every doctor is also a login user (1:1) |
| `departments.id` | `doctors.department_id` | Doctors belong to departments |
| `hospital_settings.hospital_code` | `id_sequences` | 2-char hospital code becomes first part of every 12-digit ID |

---

## Phase 1: Core Modules (Week 3–6)

> **Total tables:** 12  
> **Starts at:** `patients` and `doctors` — people enter the system.  
> **Ends at:** `id_cards` — everyone gets their ID card generated.  
> **Connected from Phase 0:** Uses `hospitals`, `users`, `departments`, `hospital_settings`.  
> **Connects to Phase 2:** `patients`, `doctors`, `appointments` flow into prescriptions and pharmacy.  
> **Description:** This phase brings people into the system. Patients get registered with a 12-digit PRN, doctors get their profiles and schedules set up, appointments get booked, and the queue board starts working. ID cards are generated for both patients and staff.

---

### Table 12: `patients`

The core clinical entity. Every person who comes to the hospital for treatment gets a patient record. Identified by a unique 12-digit PRN (Patient Reference Number).

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by appointments, prescriptions, invoices, and everything clinical |
| `hospital_id` | Which hospital registered this patient | Patients belong to one hospital |
| `patient_reference_number` | 12-digit ID like "HCM262K00147" | The primary way to look up a patient across all modules |
| `first_name` | Patient's first name | Displayed everywhere, printed on ID card and prescriptions |
| `last_name` | Patient's last name | Combined with first name for full name |
| `date_of_birth` | Date of birth | Used to calculate age, printed on ID card |
| `age_years` | Age in years (manual entry) | Used when exact DOB is unknown (common in some regions) |
| `age_months` | Age in months | For infants where months matter more than years |
| `gender` | Male, female, other, prefer_not_to_say | Determines the gender code in the 12-digit ID, shown on ID card |
| `blood_group` | A+, A−, B+, B−, AB+, AB−, O+, O− | Critical medical info, printed on ID card |
| `marital_status` | Single, married, divorced, widowed | Demographic data for records |
| `phone_country_code` | Country code like "+91", "+1" | Needed for international SMS and call formatting |
| `phone_number` | Local phone number without country code | Primary contact for appointment reminders and notifications |
| `secondary_phone` | Alternative phone (full E.164) | Backup contact if primary doesn't answer |
| `email` | Patient's email | For email notifications and digital receipts |
| `national_id_type` | Type of government ID ("SSN", "Aadhaar", "Passport") | Different countries use different IDs |
| `national_id_number` | Government ID number (encrypted at rest) | For identity verification, encrypted for security |
| `address_line_1` | Street address | For postal communications and records |
| `address_line_2` | Additional address | Apartment number, floor, etc. |
| `city` | City | Part of address |
| `state_province` | State or province | Part of address |
| `postal_code` | ZIP or postal code | Part of address |
| `country` | 3-letter country code | Patient's country |
| `photo_url` | Path to patient's photo | Printed on ID card and shown in patient profile |
| `emergency_contact_name` | Name of emergency contact | Contacted if patient is unconscious or in critical condition |
| `emergency_contact_phone` | Phone of emergency contact | Must be reachable in emergencies |
| `emergency_contact_relation` | Relationship ("spouse", "parent", "sibling") | Helps staff understand who they're calling |
| `known_allergies` | List of allergies | Drug interaction warnings — critical for prescriptions |
| `chronic_conditions` | Ongoing health conditions | Diabetes, hypertension, etc. — influences treatment decisions |
| `notes` | General notes | Receptionist or doctor can add freeform notes |
| `preferred_language` | Patient's language ("en", "hi", "ar") | For generating documents and notifications in their language |
| `is_active` | Whether this patient record is active | Inactive patients don't appear in search results |
| `registered_at` | When patient first registered | Printed on ID card and used in reporting |
| `created_by` | Which user registered this patient | Audit trail |
| `updated_by` | Which user last modified this record | Audit trail |
| `is_deleted` | Soft delete flag | Data preserved for medical records but hidden from UI |

**Connected to:** `hospitals` (parent), `appointments` (visits), `prescriptions` (treatments), `invoices` (bills), `insurance_policies` (coverage), `pharmacy_dispensing` (medicine purchases), `optical_prescriptions` (eye care), `id_cards` (ID card), `patient_consents` (legal consents), `patient_documents` (uploaded files).

---

### Table 13: `patient_consents`

Records the patient's agreement for specific purposes — registration, treatment, data sharing, photo usage. Each consent is timestamped with the full text that was shown.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `patient_id` | Which patient signed | Links to the patient record |
| `consent_type` | What they consented to ("registration", "treatment", "data_sharing", "photo") | Different consents for different purposes |
| `consent_text` | The full legal text shown at the time | Proves exactly what the patient agreed to, even if the template changes later |
| `is_accepted` | Whether they agreed or declined | Must be true for treatment to proceed |
| `signature_url` | Path to digital signature image | Electronic signature captured via touchscreen |
| `consented_at` | When they signed | Legal timestamp for compliance |
| `ip_address` | IP if signed digitally online | Additional audit for online registrations |

**Connected to:** `patients` (the patient who consented).

---

### Table 14: `patient_documents`

Files uploaded for a patient — government ID scans, insurance cards, previous lab reports, referral letters.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `patient_id` | Which patient owns this document | Links file to the patient |
| `document_type` | Category ("id_proof", "insurance_card", "lab_report", "other") | Organizes files by type in the patient's profile |
| `title` | Display name ("Aadhaar Card", "Blood Test Report") | Shown in the document list UI |
| `file_url` | Path to the file in MinIO/S3 storage | The actual file location for download/view |
| `file_type` | File format ("pdf", "jpeg", "png") | Determines how the viewer renders it |
| `file_size_bytes` | File size | For storage monitoring and upload limits |
| `uploaded_by` | Which staff uploaded it | Audit trail |

**Connected to:** `patients` (owner), `users` (uploader).

---

### Table 15: `doctors`

Extends `users` with medical-specific data. Every doctor is also a user (1:1 relationship), but this table adds specialization, qualification, license, and fee information.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by appointments, prescriptions, and schedules |
| `user_id` | Links to the doctor's user account (1:1, unique) | Doctor logs in as a user; this connects their clinical profile to their login |
| `hospital_id` | Which hospital they work at | Doctors are scoped to one hospital |
| `department_id` | Which department they belong to | Determines department code in ID and filters in appointment booking |
| `employee_id` | Hospital's internal employee ID | Some hospitals have existing employee numbering systems |
| `specialization` | Area of expertise ("Cardiologist", "General Physician") | Shown in doctor lists and printed on ID cards |
| `qualification` | Degrees ("MBBS, MD, DM Cardiology") | Printed on prescriptions and ID cards |
| `registration_number` | Medical license number | Legal requirement — printed on prescriptions |
| `registration_authority` | Licensing body ("Medical Council of India", "GMC") | For verification reference |
| `experience_years` | Years of practice | Shown in doctor profiles for patients to see |
| `bio` | Short biography | Optional description shown on the hospital website or app |
| `doctor_sequence` | Position in multi-doctor workflow (1, 2, or 3) | In some hospitals, patients see Doctor 1 → Doctor 2 → Doctor 3 in sequence |
| `consultation_fee` | Current consultation fee | Charged when patient is billed for the appointment |
| `follow_up_fee` | Fee for follow-up visits | Usually lower than first consultation |
| `is_available` | Whether doctor is currently accepting patients | Quick toggle for temporary unavailability |
| `is_active` | Whether the doctor profile is active | Inactive doctors don't appear in booking |

**Connected to:** `users` (1:1 login account), `hospitals` (workplace), `departments` (team), `doctor_schedules` (availability), `doctor_leaves` (absences), `doctor_fees` (pricing), `appointments` (patient visits), `prescriptions` (treatments written).

---

### Table 16: `doctor_schedules`

The weekly timetable for a doctor. Defines when they're available for appointments — which days, what hours, how long each slot is, and whether there's a lunch break.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `doctor_id` | Which doctor | Links to the doctor profile |
| `day_of_week` | Day number (0=Sunday, 6=Saturday) | Defines which days the doctor works |
| `shift_name` | Shift label ("morning", "evening", "default") | Supports multiple shifts per day |
| `start_time` | Shift start ("09:00") | When appointment slots begin |
| `end_time` | Shift end ("17:00") | When appointment slots end |
| `break_start_time` | Break starts ("13:00") | Lunch/prayer break — no slots during this time |
| `break_end_time` | Break ends ("14:00") | Slots resume after this time |
| `slot_duration_minutes` | Length of each slot (default 15) | Determines how many patients can be seen per day |
| `max_patients` | Maximum patients per shift | Hard cap to prevent overbooking |
| `is_active` | Whether this schedule entry is in effect | Allows disabling without deleting |
| `effective_from` | Start date for this schedule | Schedules can change — this tracks when the new one starts |
| `effective_to` | End date (null = indefinite) | Old schedules expire, new ones take over |

**Connected to:** `doctors` (the doctor this schedule belongs to).

---

### Table 17: `doctor_leaves`

Planned days when a doctor is unavailable — vacation, sick leave, conferences. Blocks appointment slots on those dates.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `doctor_id` | Which doctor | Links to doctor profile |
| `leave_date` | The date of absence | Slots on this date are blocked for booking |
| `leave_type` | "full_day", "morning", or "afternoon" | Half-day leaves only block that portion |
| `reason` | Why they're away | Informational for admin |
| `approved_by` | Which admin approved | Approval workflow tracking |
| `status` | "pending", "approved", "rejected" | Leave goes through approval before blocking slots |

**Connected to:** `doctors` (the doctor), `users` (approver).

---

### Table 18: `doctor_fees`

Fee structure for a doctor — different prices for different services. Supports effective date ranges so prices can change over time without losing history.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `doctor_id` | Which doctor | Links to doctor profile |
| `fee_type` | Type of service ("consultation", "follow_up", "procedure") | Different services have different prices |
| `service_name` | Descriptive name ("Initial Consultation", "ECG Reading") | Shown on invoices |
| `amount` | Price in hospital's currency | The actual fee charged |
| `currency` | Currency code | Usually matches hospital's default currency |
| `effective_from` | When this fee starts | Enables price changes without losing old pricing |
| `effective_to` | When this fee ends (null = current) | Old fees expire, new ones take over |
| `is_active` | Whether this fee is currently chargeable | Quick toggle |

**Connected to:** `doctors` (the doctor whose fee this is).

---

### Table 19: `appointments`

The central transaction table of Phase 1. Represents a scheduled visit — which patient sees which doctor, when, and what happened. Tracks the entire lifecycle from booking to completion.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by prescriptions, invoices, status log, queue |
| `hospital_id` | Which hospital | Scopes the appointment to a hospital |
| `appointment_number` | Human-readable number ("APT-2026-00001") | Shown on receipts and used for verbal reference |
| `patient_id` | Which patient | The person being seen |
| `doctor_id` | Which doctor | The doctor providing consultation |
| `department_id` | Which department | Organizational reference |
| `appointment_date` | Date of visit | For scheduling and calendar views |
| `start_time` | Scheduled start time | When the patient should arrive |
| `end_time` | Scheduled end time | When the slot ends |
| `appointment_type` | How it was booked ("scheduled", "walk_in", "emergency", "follow_up") | Affects queue priority and billing |
| `visit_type` | "new" or "follow_up" | Follow-ups may be free within validity period |
| `priority` | "normal", "urgent", "emergency" | Emergencies jump the queue |
| `status` | Current state in the workflow | Tracks: scheduled → checked_in → in_queue → with_doctor → completed |
| `current_doctor_sequence` | Which doctor in the chain (1, 2, or 3) | For multi-doctor workflows where patient sees 3 doctors in sequence |
| `parent_appointment_id` | Links to the original appointment if this is a follow-up | Chains related visits together |
| `chief_complaint` | Why the patient is here ("chest pain", "headache") | Receptionist records this at check-in |
| `cancel_reason` | Why cancelled (if applicable) | Records reason for analytics |
| `reschedule_reason` | Why rescheduled | Records reason for analytics |
| `reschedule_count` | How many times rescheduled | Tracks frequent reschedulers |
| `check_in_at` | When patient arrived at the hospital | Start of in-person waiting time |
| `consultation_start_at` | When doctor started seeing patient | Measures wait time (check_in_at → consultation_start_at) |
| `consultation_end_at` | When doctor finished | Measures consultation duration |
| `notes` | Internal notes | Staff-facing notes about this visit |
| `consultation_fee` | Fee charged for this specific visit | May differ from doctor's default fee |
| `created_by` | Who booked the appointment | Receptionist or patient (if online booking) |

**Connected to:** `hospitals`, `patients`, `doctors`, `departments` (core references), `appointment_status_log` (status history), `appointment_queue` (queue position), `prescriptions` (treatment), `invoices` (billing), `optical_prescriptions` (eye care).

---

### Table 20: `appointment_status_log`

An immutable history of every status change for an appointment. Never updated or deleted — only new rows are added. Shows exactly who changed the status and when.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `appointment_id` | Which appointment | Links to the appointment record |
| `from_status` | Previous status (null for first entry) | Shows what the status was before the change |
| `to_status` | New status | Shows what it changed to |
| `changed_by` | Which user made the change | Audit trail — receptionist checked in, doctor completed, etc. |
| `notes` | Reason for change | Optional context like "patient requested cancellation" |
| `created_at` | When the change happened | Exact timestamp for workflow analysis |

**Connected to:** `appointments` (the appointment being tracked), `users` (who made the change).

---

### Table 21: `appointment_queue`

Real-time queue management for today's appointments per doctor. Each patient gets a token number and position. Powers the waiting room display board.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `appointment_id` | Which appointment | Links to the visit |
| `doctor_id` | Which doctor's queue | Each doctor has their own queue |
| `queue_date` | Today's date | Queue resets daily |
| `queue_number` | Token number (1, 2, 3...) | Patient's ticket number shown on the display board |
| `position` | Current position in queue | Changes as patients are called in |
| `status` | "waiting", "called", "in_consultation", "completed", "skipped" | Tracks where the patient is in the waiting process |
| `called_at` | When the patient was called in | Measures wait time |

**Connected to:** `appointments` (the visit), `doctors` (whose queue).

---

### Table 22: `id_sequences`

Tracks the last-used sequence number for each combination of hospital + entity type + role/gender + year + month. Ensures the 5-digit sequence in the 12-digit ID is always unique.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Sequences are per-hospital |
| `hospital_code` | 2-char code from settings | First 2 characters of the generated ID |
| `entity_type` | "patient" or "staff" | Patients and staff have separate sequence streams |
| `role_gender_code` | 1-char code (M/F/O for patients, D/N/S/A for staff) | Third character of the ID — encodes gender or role |
| `year_code` | 2-digit year ("26") | Fourth-fifth characters — registration year |
| `month_code` | 1-char month (1–9, A=Oct, B=Nov, C=Dec) | Sixth character — registration month |
| `last_sequence` | Last issued 5-digit number | Incremented to get the next ID's last 5 digits |

**Connected to:** `hospitals` (parent), `hospital_settings` (source of hospital_code).

---

### Table 23: `id_cards`

Stores the generated ID card for a patient or staff member. Includes the rendered front/back images, a snapshot of all data on the card, and versioning for regeneration.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the ID card |
| `holder_type` | "patient" or "user" (staff) | Determines whether `holder_id` points to patients or users table |
| `holder_id` | UUID of the patient or user | The person this ID card belongs to |
| `reference_number` | The 12-digit ID printed on the card | Quick lookup without joining to patient/user tables |
| `photo_url` | Photo printed on the card | Uploaded or captured via webcam |
| `card_data_snapshot` | JSON of all card data at generation time | If patient updates their name later, the old card still shows the old name |
| `front_design_url` | Path to the generated front-side PDF/image | Downloadable and printable card front |
| `back_design_url` | Path to the generated back-side PDF/image | Hospital info, emergency contacts, terms |
| `issued_at` | When the card was generated | Printed on the card back |
| `issued_by` | Which staff generated it | Audit trail |
| `revoked_at` | When the card was invalidated (null = active) | Old cards are revoked when a new version is generated |
| `version` | Card version number (1, 2, 3...) | Increments each time the card is regenerated |

**Connected to:** `hospitals` (card issuer), `users` (who generated it).

---

### Connections Within Phase 1

```
patients ──(1:many)──→ patient_consents      Patient signs multiple consents
patients ──(1:many)──→ patient_documents     Patient has multiple uploaded files
patients ──(1:many)──→ appointments          Patient books many appointments

doctors ──(1:1)──→ users                     Every doctor is also a login user
doctors ──(belongs to)──→ departments        Doctor works in one department
doctors ──(1:many)──→ doctor_schedules       Doctor has weekly schedule entries
doctors ──(1:many)──→ doctor_leaves          Doctor records planned absences
doctors ──(1:many)──→ doctor_fees            Doctor has fee structure
doctors ──(1:many)──→ appointments           Doctor sees many patients

appointments ──(1:many)──→ appointment_status_log   Every status change is logged
appointments ──(1:1)──→ appointment_queue            Each appointment gets a queue slot
appointments ──(self-ref)──→ appointments             Follow-ups link to original visit

hospitals ──(1:many)──→ id_sequences         Per-department per-month ID tracking
hospitals ──(1:many)──→ id_cards             ID cards generated at this hospital
```

### What Flows to Phase 2

| From Phase 1 | → To Phase 2 | Why |
|-------------|-----------|-----|
| `patients.id` | `prescriptions.patient_id` | Doctor writes prescription for the patient |
| `doctors.id` | `prescriptions.doctor_id` | Doctor is the author of the prescription |
| `appointments.id` | `prescriptions.appointment_id` | Prescription is linked to the visit |
| `patients.id` | `optical_prescriptions.patient_id` | Eye prescription for the patient |
| `doctors.id` | `optical_prescriptions.doctor_id` | Ophthalmologist writes the eye Rx |
| `appointments.id` | `optical_prescriptions.appointment_id` | Eye Rx linked to the consultation |

---

## Phase 2: Clinical & Pharmacy (Week 7–9)

> **Total tables:** 16  
> **Starts at:** `prescriptions` — doctor finishes consultation and writes treatment.  
> **Ends at:** `pharmacy_return_items` / `optical_repairs` — returns and repairs are the final actions.  
> **Connected from Phase 1:** Uses `patients`, `doctors`, `appointments` as inputs.  
> **Connects to Phase 3:** `pharmacy_dispensing`, `optical_orders`, `optical_repairs` connect to `invoices` for billing. `medicines` connects to `purchase_order_items` for restocking.  
> **Description:** After a patient sees a doctor (Phase 1), the doctor writes a prescription. The pharmacy fills it by dispensing medicines from specific batches. If the patient needs eyeglasses, the optical store processes and fulfills that order. This phase handles the treatment part of healthcare.

---

### Prescription Module (5 tables)

#### Table 24: `prescriptions`

The doctor's treatment order after consultation. Contains diagnosis, clinical notes, and advice. Links the appointment to the medicines and tests the patient needs.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by prescription items, versions, lab orders, and pharmacy |
| `hospital_id` | Which hospital | Scopes the prescription |
| `prescription_number` | Readable number ("RX-2026-00001") | Printed on the prescription and used for verbal reference |
| `appointment_id` | Which visit this Rx is for | Links treatment to the consultation |
| `patient_id` | Which patient | The person receiving treatment |
| `doctor_id` | Which doctor wrote it | Legal responsibility — doctor's name printed on Rx |
| `diagnosis` | What the doctor found ("Upper respiratory tract infection") | Printed on Rx, needed for insurance claims |
| `clinical_notes` | Doctor's private notes | Not printed — internal medical notes for reference |
| `advice` | Instructions to patient ("Rest for 3 days, avoid cold water") | Printed on the prescription |
| `version` | Edit count (1, 2, 3...) | Tracks how many times the Rx was modified |
| `status` | "draft", "finalized", "dispensed", "partially_dispensed" | Draft = editable, finalized = locked, dispensed = pharmacy filled it |
| `is_finalized` | Whether the Rx is locked for edits | Once finalized, cannot be modified (only new version can be created) |
| `finalized_at` | When the doctor finalized it | Timestamp for the locked state |
| `valid_until` | Expiry date for this prescription | Some Rx expire after 30 days — pharmacy can't fill expired Rx |
| `created_by` | Who created the record | Usually the doctor, but could be a scribe |

**Connected to:** `hospitals`, `appointments`, `patients`, `doctors` (core references), `prescription_items` (medicines listed), `prescription_versions` (edit history), `lab_orders` (tests ordered), `pharmacy_dispensing` (filling the Rx).

---

#### Table 25: `prescription_items`

Individual medicine lines in a prescription — each line says "take this medicine, this dose, this often, for this long".

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by pharmacy dispensing items |
| `prescription_id` | Which prescription | Parent Rx this item belongs to |
| `medicine_id` | Link to the medicine catalog (optional) | If the medicine exists in the pharmacy's catalog, it links for easy dispensing |
| `medicine_name` | Medicine name as free text | Doctor can prescribe medicines not in the catalog |
| `generic_name` | Generic alternative name | For generic substitution at pharmacy |
| `dosage` | Strength per dose ("500mg", "10ml") | How much to take each time |
| `frequency` | How often ("1-0-1" = morning-afternoon-night) | "1-0-1" means once in morning, none at noon, once at night |
| `duration_value` | Number (e.g., 7) | Combined with `duration_unit` = "take for 7 days" |
| `duration_unit` | "days", "weeks", "months" | Time unit for the duration |
| `route` | How to take it ("oral", "topical", "injection", "inhalation") | Different for pills vs creams vs injections |
| `instructions` | Additional notes ("After food", "Before bedtime") | Special instructions printed on label |
| `quantity` | Total quantity to dispense | Auto-calculated: dose × frequency × duration |
| `allow_substitution` | Whether pharmacist can give generic alternative | Some doctors insist on specific brands |
| `is_dispensed` | Whether pharmacy has filled this item | Tracks fulfillment status |
| `dispensed_quantity` | How much was actually given | May be less than prescribed if stock is low |
| `display_order` | Sort position on the printed Rx | Controls the order medicines appear on the prescription |

**Connected to:** `prescriptions` (parent), `medicines` (catalog link), `pharmacy_dispensing_items` (when dispensed).

---

#### Table 26: `prescription_templates`

Pre-saved prescription templates that doctors reuse. A cardiologist might have a "Post Heart Attack" template with 5 standard medicines pre-filled.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `doctor_id` | Which doctor created this template | Each doctor has their own saved templates |
| `name` | Template name ("Common Cold", "Diabetes Routine") | Shown in the template selector dropdown |
| `diagnosis` | Pre-filled diagnosis text | Auto-fills the diagnosis field when template is selected |
| `items` | JSON array of medicine items | Contains all medicine names, dosages, and instructions |
| `advice` | Pre-filled advice text | Auto-fills the advice field |
| `is_active` | Whether the template is usable | Doctors can archive old templates |
| `usage_count` | How many times used | Most-used templates appear first in suggestions |

**Connected to:** `doctors` (the owner of this template).

---

#### Table 27: `prescription_versions`

Every time a finalized prescription is edited, the old version is saved as a JSON snapshot. Provides immutable history for legal and medical compliance.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `prescription_id` | Which prescription | Links to the parent Rx |
| `version` | Version number (1, 2, 3...) | Sequential version for ordering |
| `snapshot` | Full prescription state as JSON | Complete copy of the Rx at that point in time — immutable |
| `changed_by` | Which user made the edit | Audit trail — tracks who modified the Rx |
| `change_reason` | Why it was changed ("Dosage adjustment", "Drug allergy found") | Required explanation for medical records |

**Connected to:** `prescriptions` (parent Rx), `users` (editor).

---

#### Table 28: `lab_orders`

Tests ordered by the doctor as part of the prescription — blood tests, X-rays, urine analysis. Tracks from ordered to completed.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `prescription_id` | Part of which prescription | Lab orders are part of the treatment plan |
| `patient_id` | Which patient | The person getting tested |
| `doctor_id` | Which doctor ordered | The doctor requesting the test |
| `test_name` | Name of the test ("Complete Blood Count", "Chest X-Ray") | What test to perform |
| `test_code` | Short code ("CBC", "CXR") | For quick reference and lab system integration |
| `instructions` | Special instructions ("Fasting required", "Collect morning sample") | Preparation instructions for the patient or lab technician |
| `urgency` | "routine", "urgent", "stat" | Stat = do it immediately; routine = normal queue |
| `status` | "ordered", "collected", "processing", "completed" | Tracks progress through the lab workflow |

**Connected to:** `prescriptions` (parent Rx), `patients` (tested person), `doctors` (ordering doctor).

---

### Pharmacy Module (6 tables)

#### Table 29: `medicines`

The pharmacy's product catalog. Every medicine available in the hospital's pharmacy — brand name, generic name, pricing, stock levels, and whether it needs a prescription.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by prescription items, batches, dispensing, and inventory |
| `hospital_id` | Which hospital's pharmacy | Each hospital has its own medicine catalog |
| `name` | Brand name ("Crocin", "Amoxil") | Displayed in pharmacy UI and on labels |
| `generic_name` | Generic name ("Paracetamol", "Amoxicillin") | For generic substitution and drug interaction checks |
| `category` | Form factor ("tablet", "capsule", "syrup", "injection", "cream") | Helps categorize and search |
| `manufacturer` | Manufacturing company | For quality tracking and preferring specific manufacturers |
| `composition` | Active ingredients ("Paracetamol 500mg + Caffeine 65mg") | For drug interaction and allergy checks |
| `strength` | Dosage strength ("500mg", "250mg/5ml") | Differentiates same medicine in different strengths |
| `unit_of_measure` | How it's sold ("strip", "bottle", "tube", "vial") | Determines how quantity is counted |
| `units_per_pack` | Items per pack (e.g., 10 tablets per strip) | For calculating total tablets from number of strips |
| `hsn_code` | Tax classification code | Required for GST/tax calculation in some countries |
| `sku` | Stock keeping unit code | Internal inventory tracking code |
| `barcode` | EAN/UPC barcode | Scanned at pharmacy counter for quick dispensing |
| `requires_prescription` | Whether Rx is needed (OTC = false) | Pharmacist cannot sell without Rx if true |
| `is_controlled` | Whether it's a controlled substance (narcotics, etc.) | Extra regulatory tracking and approval needed |
| `selling_price` | Retail price (MRP) | Charged to the patient |
| `purchase_price` | Cost to the hospital | For profit margin calculations |
| `tax_config_id` | Which tax rule applies | Links to tax_configurations for automatic tax calculation |
| `reorder_level` | Minimum stock before alert triggers | When stock falls below this, "low stock" alert is generated |
| `max_stock_level` | Maximum stock to maintain | Prevents over-ordering |
| `storage_instructions` | How to store ("Below 25°C", "Refrigerate") | Printed on batch labels |
| `is_active` | Whether it's currently stocked | Discontinued medicines are deactivated |

**Connected to:** `hospitals` (pharmacy's hospital), `tax_configurations` (tax rules), `medicine_batches` (stock by batch), `prescription_items` (referenced in Rx), `pharmacy_dispensing_items` (when sold), `purchase_order_items` (when ordered from supplier).

---

#### Table 30: `medicine_batches`

Individual batches of a medicine — each batch has its own lot number, expiry date, and stock count. Enables FEFO (First Expiry, First Out) dispensing to minimize waste.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by dispensing items and return items |
| `medicine_id` | Which medicine | Links to the product catalog |
| `batch_number` | Lot/batch number from manufacturer | Identifies the specific production run for recall tracking |
| `grn_id` | Which Goods Receipt Note brought this batch in | Links to the inventory receipt that created this stock entry |
| `manufactured_date` | When it was made | For shelf-life tracking |
| `expiry_date` | When it expires | Expired medicines cannot be dispensed; alerts generated 90 days before |
| `purchase_price` | What the hospital paid per unit for this batch | May vary between batches from different suppliers |
| `selling_price` | Price per unit for this specific batch | May differ from catalog default if supplier changed pricing |
| `initial_quantity` | How many units were received | Starting stock when the batch arrived |
| `current_quantity` | How many units are left | Decreases with each dispensing, increases with returns |
| `is_expired` | Whether the batch has passed its expiry date | Auto-set by a daily job; expired batches are excluded from dispensing |
| `is_active` | Whether this batch is usable | Deactivated batches (recalled, damaged) can't be dispensed |

**Connected to:** `medicines` (parent product), `goods_receipt_notes` (how this batch arrived), `pharmacy_dispensing_items` (units sold from this batch), `pharmacy_return_items` (units returned to this batch).

---

#### Table 31: `pharmacy_dispensing`

A dispensing transaction — created when a pharmacist fills a prescription or makes an OTC counter sale. Contains the total, discount, tax, and payment reference.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by dispensing items and returns |
| `hospital_id` | Which hospital's pharmacy | Scopes the transaction |
| `dispensing_number` | Readable number ("DISP-2026-00001") | Printed on receipt |
| `prescription_id` | Which prescription was filled (null for OTC) | Links to the doctor's Rx; null for over-the-counter sales |
| `patient_id` | Which patient bought medicines (null for walk-in OTC) | Null for anonymous counter sales |
| `sale_type` | "prescription" or "counter_sale" | Determines whether an Rx reference is required |
| `invoice_id` | Link to the billing invoice | Connects to Phase 3 for payment processing |
| `status` | "pending", "dispensed", "partial", "cancelled" | Partial = some items out of stock, rest dispensed |
| `total_amount` | Sum before any adjustments | Total of all items at retail price |
| `discount_amount` | Discount given | Senior citizen discount, loyalty, etc. |
| `tax_amount` | Total tax | Sum of taxes on all items |
| `net_amount` | Final amount after discount and tax | What the patient actually pays |
| `dispensed_by` | Which pharmacist processed this | Tracks the responsible pharmacist |
| `dispensed_at` | When medicines were handed over | Timestamp for the transaction |
| `notes` | Additional notes | "Patient allergic to X, substituted with Y" |

**Connected to:** `hospitals`, `prescriptions` (Rx being filled), `patients` (buyer), `invoices` (billing), `users` (pharmacist), `pharmacy_dispensing_items` (individual items), `pharmacy_returns` (if returned).

---

#### Table 32: `pharmacy_dispensing_items`

Individual items in a dispensing transaction — which medicine, from which batch, how many, at what price, and whether a generic substitution was made.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by return items |
| `dispensing_id` | Which dispensing transaction | Parent record |
| `prescription_item_id` | Which Rx line this fulfills (null for OTC) | Links dispensed item back to the prescribed item |
| `medicine_id` | Which medicine | The product dispensed |
| `medicine_batch_id` | Which batch it came from | Tracks exactly which batch was given to the patient |
| `quantity` | How many units | Number of tablets/bottles dispensed |
| `unit_price` | Price per unit | Usually the batch's selling price |
| `discount_percent` | Discount on this item | Per-item discount (not overall discount) |
| `tax_amount` | Tax on this item | Calculated from the medicine's tax configuration |
| `total_price` | Final price for this line | quantity × unit_price − discount + tax |
| `substituted` | Whether a generic was given instead | True if pharmacist gave Paracetamol instead of Crocin |
| `original_medicine_name` | What was originally prescribed | Records the original brand if substituted |

**Connected to:** `pharmacy_dispensing` (parent), `prescription_items` (Rx line), `medicines` (product), `medicine_batches` (specific batch).

---

#### Table 33: `pharmacy_returns`

When a patient returns medicines — wrong medicine given, allergic reaction, doctor changed prescription. Tracks the return approval and refund processing.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by return items |
| `hospital_id` | Which hospital | Scopes the return |
| `return_number` | Readable number ("RET-2026-00001") | Printed on return receipt |
| `dispensing_id` | Which original dispensing is being returned against | Links back to the original sale |
| `patient_id` | Which patient is returning | The person bringing medicines back |
| `reason` | Why they're returning ("Wrong medicine", "Allergic reaction") | Required for audit and quality tracking |
| `total_refund` | Amount to refund | Calculated from return items |
| `status` | "pending", "approved", "processed", "rejected" | Returns go through approval before refund is issued |
| `approved_by` | Which manager approved | Approval audit trail |
| `restock` | Whether to put returned items back in inventory | Some returns (e.g., opened packets) can't be restocked |

**Connected to:** `hospitals`, `pharmacy_dispensing` (original sale), `patients` (returner), `users` (approver), `pharmacy_return_items` (individual returned items).

---

#### Table 34: `pharmacy_return_items`

Individual items being returned — which medicine, which batch, how many, and whether they were put back in stock.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `return_id` | Which return transaction | Parent return record |
| `dispensing_item_id` | Which original dispensing line | Links back to the exact item sold |
| `medicine_id` | Which medicine | Product reference |
| `batch_id` | Which batch to restock into | Must go back to the same batch for inventory accuracy |
| `quantity` | How many units returned | Number of tablets/strips coming back |
| `refund_amount` | How much to refund for these items | Calculated from original sale price |
| `restocked` | Whether items were put back in inventory | True = batch quantity increased; false = written off |

**Connected to:** `pharmacy_returns` (parent), `pharmacy_dispensing_items` (original sale line), `medicines` (product), `medicine_batches` (destination batch).

---

### Optical Module (5 tables)

#### Table 35: `optical_products`

Product catalog for the optical store — frames, lenses, contact lenses, accessories, solutions. Includes lens-specific attributes like type, index, and coating.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by orders and order items |
| `hospital_id` | Which hospital's optical store | Scopes the catalog |
| `name` | Product name ("Ray-Ban Aviator", "Zeiss Single Vision 1.67") | Displayed in product lists and orders |
| `category` | "frame", "lens", "contact_lens", "accessory", "solution" | Categorizes products for filters and views |
| `brand` | Manufacturer brand | For filtering by brand |
| `model_number` | Manufacturer model number | For precise identification |
| `color` | Frame/lens color | Patient choice |
| `material` | "titanium", "plastic", "acetate" | Material affects price and durability |
| `size` | Frame size measurement | Proper fitting |
| `gender` | "unisex", "male", "female", "kids" | Filters for gender-appropriate products |
| `sku` | Stock keeping unit | Internal tracking |
| `barcode` | EAN/UPC code | Scanned at counter |
| `selling_price` | Retail price | Charged to patient |
| `purchase_price` | Cost price | For profit calculations |
| `tax_config_id` | Tax rule reference | For tax calculation |
| `current_stock` | Available units | Displayed in product list |
| `reorder_level` | Minimum before reorder alert | Triggers low stock warning |
| `lens_type` | "single_vision", "bifocal", "progressive", "tinted" | Technical lens specification |
| `lens_index` | Refraction index ("1.5", "1.56", "1.67", "1.74") | Higher index = thinner lens for strong prescriptions |
| `lens_coating` | "anti_reflective", "blue_cut", "photochromic" | Special coatings add cost and features |
| `image_url` | Product image path | Shown in product catalog |

**Connected to:** `hospitals`, `tax_configurations`, `optical_orders` (frame/lens selection), `optical_order_items` (order lines), `purchase_order_items` (restocking).

---

#### Table 36: `optical_prescriptions`

Eye prescription from the ophthalmologist. Records precise measurements for both eyes — sphere, cylinder, axis, addition, and pupillary distance.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by optical orders |
| `hospital_id` | Which hospital | Scopes the Rx |
| `prescription_number` | Readable number | Printed on the optical Rx |
| `patient_id` | Which patient | The person needing glasses |
| `doctor_id` | Which ophthalmologist | The prescribing doctor |
| `appointment_id` | Which consultation | Links to the eye exam visit |
| `right_sph` | Right eye sphere power (±) | Distance vision correction |
| `right_cyl` | Right eye cylinder power (±) | Astigmatism correction |
| `right_axis` | Right eye axis (0–180°) | Angle of astigmatism |
| `right_add` | Right eye near addition | Additional power for reading (bifocal/progressive) |
| `right_va` | Right eye visual acuity ("6/6", "20/20") | Current vision measurement |
| `left_sph` / `left_cyl` / `left_axis` / `left_add` / `left_va` | Same measurements for left eye | Each eye has independent values |
| `pd_distance` | Pupillary distance for distance vision (mm) | Critical for aligning lens centers with eyes |
| `pd_near` | Pupillary distance for near vision | Different from distance PD |
| `pd_right` / `pd_left` | Individual eye PD (monocular) | More precise than binocular PD |
| `is_finalized` | Whether the Rx is locked | Once locked, cannot be changed |
| `valid_until` | Expiry date | Eye prescriptions typically valid for 1–2 years |

**Connected to:** `hospitals`, `patients`, `doctors`, `appointments`, `optical_orders` (orders made using this Rx).

---

#### Table 37: `optical_orders`

An eyewear order — patient picks a frame, selects lenses, and the order is assembled and delivered. Tracks progress from placed to delivered.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by order items |
| `hospital_id` | Which hospital | Scopes the order |
| `order_number` | Readable number | For tracking and customer reference |
| `patient_id` | Which patient | The person ordering eyewear |
| `optical_prescription_id` | Which eye Rx | Lens specs come from this prescription |
| `invoice_id` | Billing invoice | Links to Phase 3 for payment |
| `order_type` | "new", "replacement", "repair_order" | Different workflows for new vs replacement |
| `status` | "placed", "in_progress", "quality_check", "ready", "delivered" | Tracks the manufacturing and delivery pipeline |
| `frame_product_id` | Selected frame | Links to optical_products for the frame choice |
| `right_lens_product_id` | Right lens product | Lens type for right eye |
| `left_lens_product_id` | Left lens product | Lens type for left eye |
| `fitting_measurements` | JSON with segment height, vertex distance, etc. | Additional fitting data beyond the Rx |
| `total_amount` / `discount_amount` / `tax_amount` / `net_amount` | Pricing breakdown | Order totals |
| `estimated_delivery_date` | When glasses should be ready | Communicated to the patient |
| `delivered_at` | When actually delivered | For measuring on-time delivery |

**Connected to:** `hospitals`, `patients`, `optical_prescriptions` (eye Rx), `invoices` (billing), `optical_products` (frame & lenses), `optical_order_items` (itemized products).

---

#### Table 38: `optical_order_items`

Individual products in an optical order — the frame, left lens, right lens, case, cleaning cloth.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `order_id` | Which order | Parent order |
| `product_id` | Which product | Links to optical_products catalog |
| `quantity` | How many | Usually 1 for frames, 1 for each lens |
| `unit_price` | Price per unit | Product's selling price at time of order |
| `discount_percent` | Discount on this item | Per-item discount |
| `tax_amount` | Tax on this item | From the product's tax configuration |
| `total_price` | Final line total | quantity × price − discount + tax |

**Connected to:** `optical_orders` (parent), `optical_products` (product catalog).

---

#### Table 39: `optical_repairs`

Walk-in repair jobs — broken frames, loose screws, lens replacements. Tracks from receipt to completion and delivery.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the repair |
| `repair_number` | Readable tracking number | For customer reference |
| `patient_id` | Which patient | The person whose glasses need fixing |
| `item_description` | What's being repaired ("Gold frame spectacles") | Describes the item brought in |
| `issue_description` | What's wrong ("Left arm broken, nose pad missing") | Describes the problem |
| `status` | "received", "in_progress", "completed", "delivered", "cancelled" | Repair lifecycle |
| `estimated_cost` | Quoted price | Given to patient before starting |
| `actual_cost` | Final price | May differ after repair is done |
| `invoice_id` | Billing invoice | Links to Phase 3 for payment |
| `estimated_completion` | When it should be ready | Communicated to patient |
| `completed_at` | When repair finished | Actual completion timestamp |
| `delivered_at` | When patient picked it up | Delivery confirmation |

**Connected to:** `hospitals`, `patients`, `invoices` (billing).

---

### What Flows to Phase 3

| From Phase 2 | → To Phase 3 | Why |
|-------------|-----------|-----|
| `pharmacy_dispensing.invoice_id` | `invoices.id` | Medicine sale generates an invoice |
| `optical_orders.invoice_id` | `invoices.id` | Glasses order generates an invoice |
| `optical_repairs.invoice_id` | `invoices.id` | Repair charge generates an invoice |
| `medicines.id` | `purchase_order_items.item_id` | Medicines are purchased from suppliers |
| `medicine_batches.grn_id` | `goods_receipt_notes.id` | New batches come from goods receipt |
| `optical_products.id` | `purchase_order_items.item_id` | Optical products ordered from suppliers |
| `medicines.tax_config_id` | `tax_configurations.id` | Tax applied to medicine pricing |

---

## Phase 3: Billing & Inventory (Week 10–12)

> **Total tables:** 19  
> **Starts at:** `invoices` — charges for consultations, medicines, and optical products.  
> **Ends at:** `cycle_count_items` — physical stock verification is the final inventory action.  
> **Connected from Phase 2:** `pharmacy_dispensing`, `optical_orders`, `optical_repairs` all link to `invoices`. `medicines` links to `purchase_order_items` for restocking.  
> **Connects to Phase 4:** All creates, updates, and deletes trigger `audit_logs`. Events trigger `notifications`.  
> **Description:** This phase handles money and stock. Invoices are generated from consultations, pharmacy sales, and optical orders. Patients pay via cash, card, or insurance. On the supply side, purchase orders go to suppliers, goods arrive and are verified, stock levels update with every sale and receipt, and periodic counts ensure accuracy.

---

### Billing Module (6 tables)

#### Table 40: `invoices`

The bill sent to the patient. Can include consultation fees, medicines, optical products, or a combination. Tracks how much is owed and how much has been paid.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by invoice items, payments, refunds, credit notes, insurance claims |
| `hospital_id` | Which hospital | Scopes the invoice |
| `invoice_number` | Readable number ("INV-2026-00001") | Printed on the bill |
| `patient_id` | Which patient | The person being billed |
| `appointment_id` | Which visit (optional) | Links to the consultation that generated this bill |
| `invoice_type` | "opd", "pharmacy", "optical", "combined" | What kind of charges are included |
| `invoice_date` | Date the invoice was generated | For accounting and reporting |
| `due_date` | Payment deadline | For tracking overdue payments |
| `subtotal` | Sum of all items before discount and tax | Base amount |
| `discount_amount` | Total discount applied | Senior citizen, loyalty, insurance, etc. |
| `discount_reason` | Why discount was given | For audit purposes |
| `tax_amount` | Total tax | Sum of all item taxes |
| `total_amount` | Final total after discount and tax | What the patient owes |
| `paid_amount` | How much has been paid so far | Updated as payments come in |
| `balance_amount` | Remaining unpaid amount | total − paid; zero = fully paid |
| `currency` | Currency code | Matches hospital's default |
| `status` | "draft", "issued", "partially_paid", "paid", "overdue", "cancelled", "void" | Lifecycle of the invoice |
| `insurance_claim_id` | Link to insurance claim if insured | If insurance covers part, this links to the claim |
| `created_by` | Which staff created the invoice | Usually receptionist or cashier |

**Connected to:** `hospitals`, `patients`, `appointments`, `insurance_claims`, `invoice_items` (line items), `payments` (money received), `refunds` (money returned), `credit_notes` (store credit), `pharmacy_dispensing` (pharmacy bills), `optical_orders` (optical bills), `optical_repairs` (repair bills).

---

#### Table 41: `invoice_items`

Individual line items on an invoice — each line is a consultation, medicine, optical product, or service with its own pricing and tax.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `invoice_id` | Which invoice | Parent bill |
| `item_type` | "consultation", "medicine", "optical_product", "service", "procedure" | Categorizes what's being charged |
| `reference_id` | UUID pointing to the source item | Links to medicines.id, optical_products.id, etc. depending on type |
| `description` | Human-readable description | "Consultation with Dr. Smith", "Paracetamol 500mg × 10" |
| `quantity` | How many | Number of units |
| `unit_price` | Price per unit | Individual item price |
| `discount_percent` | Per-item discount percentage | 10% off on this specific item |
| `discount_amount` | Calculated discount amount | unit_price × quantity × discount_percent |
| `tax_config_id` | Tax rule applied | Links to tax_configurations |
| `tax_rate` | The rate used | Snapshot of the tax rate at invoice time |
| `tax_amount` | Calculated tax | After discount, before total |
| `total_price` | Final price for this line | (qty × price) − discount + tax |
| `display_order` | Position on the printed invoice | Controls the order items appear |

**Connected to:** `invoices` (parent), `tax_configurations` (tax rule).

---

#### Table 42: `payments`

Money received from a patient. Multiple payments can be made against one invoice (partial payments). Supports cash, card, UPI, bank transfer, and insurance.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by refunds |
| `hospital_id` | Which hospital | Scopes the payment |
| `payment_number` | Readable number ("PAY-2026-00001") | Printed on receipt |
| `invoice_id` | Which invoice this payment is for | Links to the bill being paid |
| `patient_id` | Which patient paid | The payer |
| `amount` | How much was paid | Payment amount |
| `currency` | Currency | Matches invoice currency |
| `payment_mode` | "cash", "card", "upi", "wallet", "bank_transfer", "online", "cheque", "insurance" | How the patient paid |
| `payment_reference` | Transaction ID, cheque number, or UPI reference | External reference for reconciliation |
| `payment_date` | Date of payment | For accounting |
| `payment_time` | Time of payment | For daily settlement reports |
| `status` | "pending", "completed", "failed", "reversed" | Payment processing status |
| `received_by` | Which cashier received it | Audit trail for daily settlement |
| `notes` | Additional notes | "Cheque to be deposited on Monday" |

**Connected to:** `hospitals`, `invoices` (bill being paid), `patients` (payer), `users` (cashier), `refunds` (if money is returned).

---

#### Table 43: `refunds`

Money returned to a patient. Must be linked to both an invoice and the original payment. Goes through an approval workflow before processing.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the refund |
| `refund_number` | Readable number ("REF-2026-00001") | Printed on refund receipt |
| `invoice_id` | Original invoice | What the charge was for |
| `payment_id` | Original payment | What's being refunded |
| `patient_id` | Who gets the money back | The patient |
| `amount` | Refund amount | How much is being returned |
| `reason_code` | Standardized reason ("service_not_provided", "billing_error", "patient_request") | For categorization and analytics |
| `reason_detail` | Free-text explanation | More specific reason |
| `status` | "pending", "approved", "processed", "rejected" | Approval workflow |
| `refund_mode` | How money is returned | Same as payment mode or different (e.g., paid by card, refunded to bank) |
| `refund_reference` | Transaction ID for the refund | External reference for reconciliation |
| `requested_by` | Staff who initiated the refund | First step in the approval chain |
| `approved_by` | Manager who approved | Second step — needs authority |
| `processed_at` | When the refund was actually processed | Execution timestamp |

**Connected to:** `hospitals`, `invoices`, `payments`, `patients`, `users` (requester and approver).

---

#### Table 44: `credit_notes`

Store credit issued instead of a cash refund. Can be applied to a future invoice to reduce the amount due. Has an expiry date.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the credit |
| `credit_note_number` | Readable number ("CN-2026-00001") | Reference for the patient |
| `invoice_id` | Original invoice being credited | What the credit is against |
| `patient_id` | Who holds the credit | The patient's credit balance |
| `amount` | Credit amount | How much store credit they have |
| `reason` | Why credit was issued | Explanation for records |
| `status` | "issued", "applied", "expired" | Lifecycle of the credit |
| `applied_to_invoice_id` | Which future invoice used this credit | Set when credit is redeemed |
| `valid_until` | Expiry date | Credit expires if not used |
| `created_by` | Which staff issued it | Audit trail |

**Connected to:** `hospitals`, `invoices` (original and redemption), `patients`, `users` (issuer).

---

#### Table 45: `daily_settlements`

End-of-day cash register closure. The cashier tallies up all collections and refunds for the day. A manager verifies the totals.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the settlement |
| `settlement_date` | Which day | One settlement per cashier per day |
| `cashier_user_id` | Which cashier | The person whose register is being closed |
| `total_cash` | Cash collected | Physically counted |
| `total_card` | Card payments | From POS terminal records |
| `total_online` | Online/ UPI payments | From payment gateway |
| `total_other` | Other payment modes | Cheques, insurance, wallets |
| `total_collected` | Grand total collected | Sum of all modes |
| `total_refunds` | Total refunds processed | Money given back |
| `net_amount` | Final net (collected − refunds) | Actual money retained |
| `status` | "open", "closed", "verified" | Open during day, closed by cashier, verified by manager |
| `verified_by` | Manager who verified | Approval that totals are correct |

**Connected to:** `hospitals`, `users` (cashier and verifier).

---

### Insurance Module (4 tables)

#### Table 46: `insurance_providers`

Insurance companies the hospital works with. Master data — company name, contact details.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by insurance policies |
| `hospital_id` | Which hospital | Each hospital has its own empanelled insurers |
| `name` | Company name ("United Health", "Star Health") | Displayed in policy forms and claims |
| `code` | Short code ("UH01", "SH02") | For quick lookup |
| `contact_person` | Name of the liaison | Hospital's point of contact at the insurance company |
| `phone` / `email` / `address` | Contact details | For communication regarding claims |
| `is_active` | Whether currently empanelled | Inactive providers don't appear in new policy creation |

**Connected to:** `hospitals`, `insurance_policies` (policies from this provider).

---

#### Table 47: `insurance_policies`

A patient's insurance details — policy number, coverage limits, copay percentage. A patient can have multiple policies (primary + secondary).

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by insurance claims and pre-authorizations |
| `patient_id` | Which patient | The insured person |
| `provider_id` | Which insurance company | Links to insurance_providers |
| `policy_number` | Insurance policy number | Required for filing claims |
| `group_number` | Group plan number | For employer-provided group insurance |
| `member_id` | Member ID within the policy | Unique identifier assigned by insurer |
| `plan_name` | Insurance plan name ("Silver", "Gold") | Type of coverage |
| `coverage_type` | "individual" or "family" | Scope of coverage |
| `coverage_amount` | Maximum coverage in currency | Upper limit of what insurance will pay |
| `deductible` | Amount patient must pay before insurance kicks in | Out-of-pocket threshold |
| `copay_percent` | Patient's share of each claim | Insurance pays the rest |
| `effective_from` | Policy start date | When coverage begins |
| `effective_to` | Policy end date | When coverage expires |
| `is_primary` | Whether this is primary or secondary insurance | Primary is billed first, secondary covers remainder |
| `status` | "active", "expired", "suspended" | Current policy state |

**Connected to:** `patients` (insured person), `insurance_providers` (insurer), `insurance_claims` (claims filed), `pre_authorizations` (pre-approvals).

---

#### Table 48: `insurance_claims`

A claim filed with the insurance company for a patient's treatment. Tracks the entire lifecycle from submission to settlement.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by invoices |
| `hospital_id` | Which hospital | Scopes the claim |
| `claim_number` | Readable number ("CLM-2026-00001") | Sent to insurer for tracking |
| `patient_id` | Which patient | The person whose treatment is being claimed |
| `policy_id` | Which insurance policy | Determines coverage limits and copay |
| `invoice_id` | Which invoice is the claim against | Links to the bill being claimed |
| `claim_amount` | Amount requested from insurer | What the hospital is asking insurance to pay |
| `approved_amount` | Amount insurer approved | May be less than requested |
| `status` | "draft", "submitted", "under_review", "approved", "partially_approved", "rejected", "settled" | Claim lifecycle |
| `submission_date` | When filed | Claim filing timestamp |
| `response_date` | When insurer responded | Approval/rejection date |
| `rejection_reason` | Why rejected (if applicable) | From the insurer |
| `documents` | JSON array of document URLs | Supporting documents for the claim |
| `created_by` | Staff who filed | Claims handler |

**Connected to:** `hospitals`, `patients`, `insurance_policies`, `invoices`, `users` (filer).

---

#### Table 49: `pre_authorizations`

Some treatments require prior approval from the insurer before the hospital can proceed. This table tracks those requests and approvals.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `patient_id` | Which patient | The person needing treatment |
| `policy_id` | Which insurance policy | Coverage details |
| `service_description` | What treatment needs approval | Description of planned procedure |
| `estimated_cost` | Expected treatment cost | Sent to insurer for approval |
| `status` | "requested", "approved", "denied", "expired" | Approval lifecycle |
| `auth_number` | Authorization number from insurer | Reference for the approved treatment |
| `approved_amount` | How much insurer approved | May be less than estimated |
| `valid_from` / `valid_to` | Approval validity window | Treatment must happen within this period |

**Connected to:** `patients`, `insurance_policies`.

---

### Inventory Module (9 tables)

#### Table 50: `suppliers`

Companies that supply medicines and optical products to the hospital. Master data with contact info, payment terms, and performance rating.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by purchase orders and GRNs |
| `hospital_id` | Which hospital | Each hospital has its own supplier network |
| `name` | Company name | Displayed in PO forms |
| `code` | Short code | For quick reference |
| `contact_person` | Sales rep name | Point of contact for orders |
| `phone` / `email` / `address` | Contact details | For placing orders and queries |
| `tax_id` | Supplier's tax registration | Required for GST/VAT input credit |
| `payment_terms` | "Net 30", "COD", "Net 60" | How long the hospital has to pay after delivery |
| `lead_time_days` | Average delivery time | Used for planning reorder timing |
| `rating` | 1.0–5.0 performance score | Quality and reliability tracking |
| `is_active` | Whether currently active | Inactive suppliers don't appear in PO creation |

**Connected to:** `hospitals`, `purchase_orders`, `goods_receipt_notes`.

---

#### Table 51: `purchase_orders`

Formal order placed with a supplier — "send us 100 boxes of Paracetamol and 50 frames". Goes through approval before sending to supplier.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by PO items and GRNs |
| `hospital_id` | Which hospital | Scopes the order |
| `po_number` | Readable number ("PO-2026-00001") | Sent to supplier as reference |
| `supplier_id` | Which supplier | Who the order is being placed with |
| `order_date` | When the PO was created | Contract date |
| `expected_delivery_date` | When goods should arrive | For tracking delays |
| `status` | "draft", "submitted", "partially_received", "received", "cancelled" | PO lifecycle |
| `total_amount` / `tax_amount` | Financial totals | Order value |
| `approved_by` | Manager who approved the PO | Approval workflow |
| `created_by` | Staff who created it | Inventory manager usually |

**Connected to:** `hospitals`, `suppliers`, `purchase_order_items` (items in the order), `goods_receipt_notes` (when goods arrive).

---

#### Table 52: `purchase_order_items`

Individual items in a purchase order — which product, how many, at what price.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `purchase_order_id` | Which PO | Parent order |
| `item_type` | "medicine" or "optical_product" | Determines which catalog the item_id points to |
| `item_id` | UUID of the product | Points to medicines.id or optical_products.id |
| `quantity_ordered` | How many units | Requested quantity |
| `quantity_received` | How many actually arrived | Updated when GRN is processed |
| `unit_price` | Negotiated price per unit | May differ from catalog price |
| `total_price` | Line total | quantity × unit_price |

**Connected to:** `purchase_orders` (parent PO).

---

#### Table 53: `goods_receipt_notes`

Created when a delivery arrives from a supplier. The receiving team checks the goods against the PO and records what was received.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by GRN items and medicine batches |
| `hospital_id` | Which hospital | Scopes the receipt |
| `grn_number` | Readable number ("GRN-2026-00001") | Internal reference |
| `purchase_order_id` | Which PO this delivery is for | Links to the original order |
| `supplier_id` | Which supplier delivered | The delivering company |
| `receipt_date` | When goods arrived | Delivery date |
| `invoice_number` | Supplier's invoice number | For matching with supplier's bill |
| `invoice_date` | Supplier invoice date | Accounting reference |
| `total_amount` | Total value received | Financial record |
| `status` | "pending", "verified", "accepted", "rejected" | QC workflow |
| `verified_by` | Who checked the goods | Quality control person |
| `created_by` | Who created the GRN record | Receiving clerk |

**Connected to:** `hospitals`, `purchase_orders` (original PO), `suppliers`, `grn_items` (individual received items), `medicine_batches` (new batches created from this receipt).

---

#### Table 54: `grn_items`

Individual items received in a delivery — actual quantities, batch numbers, expiry dates, and any rejected items.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `grn_id` | Which GRN | Parent receipt |
| `item_type` | "medicine" or "optical_product" | Type of product |
| `item_id` | UUID of the product | Points to medicines.id or optical_products.id |
| `batch_number` | Manufacturer's batch/lot number | For medicine batch creation and recall tracking |
| `manufactured_date` | When the product was made | For shelf life tracking |
| `expiry_date` | When it expires | Critical for medicines |
| `quantity_received` | How many arrived | Physical count |
| `quantity_accepted` | How many passed QC | After inspection |
| `quantity_rejected` | How many failed QC | quantity_received − quantity_accepted |
| `unit_price` | Price per unit | As per supplier invoice |
| `total_price` | Line total | For financial reconciliation |
| `rejection_reason` | Why items were rejected | "Damaged packaging", "Wrong batch" |

**Connected to:** `goods_receipt_notes` (parent GRN).

---

#### Table 55: `stock_movements`

An immutable log of every stock change — every time stock goes in or out, a row is added. Never updated or deleted. Provides a complete audit trail with running balance.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the movement |
| `item_type` | "medicine" or "optical_product" | Type of product |
| `item_id` | UUID of the product | Which product moved |
| `batch_id` | Which batch (for medicines) | Tracks batch-level movements |
| `movement_type` | "stock_in", "sale", "dispensing", "return", "adjustment", "expired", "damaged" | What caused the stock change |
| `reference_type` | "grn", "dispensing", "return", "adjustment" | Which module triggered this movement |
| `reference_id` | UUID of the source record | Links back to the GRN, dispensing, return, or adjustment record |
| `quantity` | Change amount (positive = in, negative = out) | +100 for receipt, −5 for dispensing |
| `balance_after` | Running balance after this movement | Current stock level |
| `unit_cost` | Cost per unit at time of movement | For FIFO/weighted average cost calculations |
| `performed_by` | Which staff member | Audit trail |

**Connected to:** `hospitals`, `users` (performer). Logically references `goods_receipt_notes`, `pharmacy_dispensing`, `pharmacy_returns`, `stock_adjustments` via `reference_type` + `reference_id`.

---

#### Table 56: `stock_adjustments`

Manual corrections to stock levels — when physical count doesn't match system count. Requires a reason and goes through approval.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the adjustment |
| `adjustment_number` | Readable number | For tracking |
| `item_type` | "medicine" or "optical_product" | Product category |
| `item_id` | UUID of the product | Which product is being adjusted |
| `batch_id` | Which batch (for medicines) | Adjusts specific batch quantities |
| `adjustment_type` | "increase", "decrease", "write_off" | Direction of the adjustment |
| `quantity` | How many units to adjust | Amount of increase, decrease, or write-off |
| `reason` | Why the adjustment was needed | "Found extra stock", "Damaged", "Theft suspected" |
| `approved_by` | Manager who approved | Adjustments need authority sign-off |
| `status` | "pending", "approved", "rejected" | Approval workflow |
| `created_by` | Who requested the adjustment | Inventory staff |

**Connected to:** `hospitals`, `users` (requester and approver).

---

#### Table 57: `cycle_counts`

A scheduled physical inventory audit. Staff physically count all products and compare with system records. Done monthly or quarterly.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by cycle count items |
| `hospital_id` | Which hospital | Scopes the count |
| `count_number` | Readable number | For tracking |
| `count_date` | When the count was performed | Audit date |
| `status` | "in_progress", "completed", "verified" | Count lifecycle |
| `counted_by` | Which staff did the counting | The person physically counting |
| `verified_by` | Manager who verified the results | Sign-off on findings |

**Connected to:** `hospitals`, `users` (counter and verifier), `cycle_count_items` (individual items counted).

---

#### Table 58: `cycle_count_items`

Individual products counted during a cycle count — shows system quantity vs actual count and the variance between them.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `cycle_count_id` | Which count session | Parent count |
| `item_type` | "medicine" or "optical_product" | Product category |
| `item_id` | UUID of the product | Which product was counted |
| `batch_id` | Which batch (for medicines) | Per-batch counting |
| `system_quantity` | What the system says we have | Expected count |
| `counted_quantity` | What we actually found | Physical count |
| `variance` | Difference (counted − system) | Positive = surplus, negative = shortage |
| `variance_reason` | Explanation for the difference | "Pilferage", "Dispensing error", "Uncounted return" |

**Connected to:** `cycle_counts` (parent count session).

---

### What Flows to Phase 4

| From Phase 3 | → To Phase 4 | Why |
|-------------|-----------|-----|
| All tables in all phases | `audit_logs` (entity_type + entity_id) | Every create, update, delete is logged |
| All events | `notifications` (reference_type + reference_id) | Important events trigger notifications |
| `invoices` | `notifications` | "Your invoice is ready" notification |
| `purchase_orders` | `notifications` | "Low stock — PO needed" alert |

---

## Phase 4: Reports & Support (Week 13–14)

> **Total tables:** 4  
> **Starts at:** Events and actions from all previous phases trigger entries here.  
> **Ends at:** These are terminal tables — data is written, read for reports, and never flows further.  
> **Connected from Phases 0–3:** Every table across every phase generates `audit_logs` entries. Events from appointments, billing, inventory, etc. generate `notifications`.  
> **Connects to next phase:** None — this is the final phase.  
> **Description:** These tables serve as the system's memory and communication layer. Audit logs record every action anyone takes — who changed what, when, and from where. Notifications deliver alerts and messages to users via in-app, email, SMS, and WhatsApp. These tables don't generate data for other tables; they are the endpoints of data flow.

---

#### Table 59: `notifications`

In-app notifications shown in the bell icon. Each notification targets one user and can link to the entity that triggered it for easy navigation.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the notification |
| `user_id` | Which user should see this | The target recipient |
| `title` | Short title ("New Appointment") | Shown in the notification list |
| `message` | Full message body ("Patient Rajesh has been scheduled for 3:00 PM") | Shown when notification is expanded |
| `type` | "appointment", "prescription", "billing", "inventory", "system" | For categorizing and filtering |
| `priority` | "low", "normal", "high", "urgent" | Urgent notifications may trigger sounds or special styling |
| `reference_type` | Entity type ("appointment", "invoice", etc.) | Tells the frontend what page to navigate to |
| `reference_id` | UUID of the entity | Combined with type to create a clickable link |
| `is_read` | Whether the user has seen it | Unread count shown on bell icon |
| `read_at` | When they read it | For analytics on notification engagement |

**Connected to:** `hospitals`, `users` (recipient). Logically references any entity via `reference_type` + `reference_id`.

---

#### Table 60: `notification_templates`

Reusable message templates with variable placeholders. Supports multiple channels (SMS, email, WhatsApp, in-app) and multiple languages.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Referenced by the notification sending logic |
| `hospital_id` | Which hospital | Templates can be customized per hospital |
| `code` | Template identifier ("appointment_reminder", "prescription_ready") | Code used in application logic to select the template |
| `channel` | "sms", "email", "whatsapp", "in_app" | Same message can have different templates for different channels |
| `locale` | Language code ("en", "es", "ar") | Multi-language support |
| `subject` | Email subject line | Only used for email channel |
| `body_template` | Message text with `{{variables}}` | "Dear {{patient_name}}, your appointment with {{doctor_name}} is at {{time}}" |
| `is_active` | Whether this template is in use | Deactivated templates are skipped |

**Connected to:** `hospitals`.

---

#### Table 61: `notification_queue`

Outbound messages waiting to be sent. Processed asynchronously by Celery workers. Tracks delivery status, retry attempts, and failure reasons.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the queue |
| `channel` | "sms", "email", "whatsapp" | Delivery channel |
| `recipient` | Phone number or email address | Where to send |
| `subject` | Email subject (if email) | Subject line |
| `body` | Full message content | The rendered message with variables filled in |
| `status` | "pending", "sent", "failed", "cancelled" | Delivery status |
| `attempts` | How many times delivery was attempted | Retries on failure (max 3 usually) |
| `last_attempt_at` | When the last attempt was made | For retry scheduling |
| `error_message` | Error from SMS/email provider | "Invalid phone number", "Mailbox full" |
| `scheduled_at` | When to send (for future scheduling) | Appointment reminder sent 1 hour before |
| `sent_at` | When successfully delivered | Delivery confirmation timestamp |

**Connected to:** `hospitals`.

---

#### Table 62: `audit_logs`

Immutable record of every significant action in the system. Never updated or deleted. Stores who did what, to which record, from which IP address, and the before/after state.

| Column | What It Is | Why It Exists |
|--------|-----------|---------------|
| `id` | Unique identifier | Standard PK |
| `hospital_id` | Which hospital | Scopes the log |
| `user_id` | Who performed the action (null for system jobs) | The person or system process responsible |
| `action` | "create", "update", "delete", "login", "logout", "export", "print" | What happened |
| `entity_type` | "patient", "invoice", "prescription", etc. | Which table was affected |
| `entity_id` | UUID of the affected record | Combined with entity_type, locates the exact row |
| `entity_name` | Human-readable name ("Rajesh Kumar", "INV-2026-00147") | Makes logs readable without needing to query the entity |
| `old_values` | JSON of before state (for updates) | Shows what the data looked like before the change |
| `new_values` | JSON of after state (for creates/updates) | Shows what it was changed to |
| `ip_address` | User's IP address | For security analysis — detect unusual access patterns |
| `user_agent` | Browser/device info | "Chrome 120 on Windows 11" — for session analysis |
| `request_path` | API endpoint called | "/api/v1/patients" — what API was used |
| `created_at` | When the action happened | Immutable timestamp |

**Connected to:** `hospitals`, `users` (actor). Logically references any entity via `entity_type` + `entity_id`.

---

## Cross-Phase Connection Map

```
PHASE 0                     PHASE 1                     PHASE 2                     PHASE 3                   PHASE 4
───────────                 ───────────                 ───────────                 ───────────               ───────────
hospitals ─────────────→ patients                                                                           
hospitals ─────────────→ doctors                                                                            
hospitals ─────────────→ appointments                                                                       
users ────────────────→ doctors (1:1)                                                                       
departments ──────────→ doctors                                                                             
hospital_settings ────→ id_sequences                                                                        
                                                                                                            
                          patients ────────────────→ prescriptions                                          
                          patients ────────────────→ optical_prescriptions                                  
                          doctors ─────────────────→ prescriptions                                          
                          doctors ─────────────────→ optical_prescriptions                                  
                          appointments ────────────→ prescriptions                                          
                                                                                                            
                                                      pharmacy_dispensing ────→ invoices                    
                                                      optical_orders ─────────→ invoices                    
                                                      optical_repairs ────────→ invoices                    
                                                      medicines ──────────────→ purchase_order_items        
                                                      medicine_batches ───────→ goods_receipt_notes         
                                                                                                            
                                                                                 ALL TABLES ──→ audit_logs
                                                                                 ALL EVENTS ──→ notifications
```

---

## The Complete Patient Journey

```
Step 1: REGISTRATION (Phase 0 + 1)
  hospitals → hospital_settings → id_sequences → patients → patient_consents → id_cards

Step 2: APPOINTMENT (Phase 1)
  doctor_schedules + doctor_leaves → appointments → appointment_queue → appointment_status_log

Step 3: CONSULTATION (Phase 2)
  prescriptions → prescription_items + lab_orders + optical_prescriptions

Step 4: PHARMACY (Phase 2)
  medicines → medicine_batches → pharmacy_dispensing → pharmacy_dispensing_items

Step 5: OPTICAL (Phase 2)
  optical_products → optical_orders → optical_order_items

Step 6: BILLING (Phase 3)
  invoices → invoice_items → payments → daily_settlements
                                └──→ insurance_claims (if insured)

Step 7: BEHIND THE SCENES (Phase 3 + 4)
  stock_movements ← (triggered by dispensing/receipt)
  purchase_orders → goods_receipt_notes → medicine_batches (restock)
  notifications + audit_logs ← (triggered by every step)
```

---

## Summary

| Phase | Tables | Weeks | Start Point | End Point | Description |
|-------|--------|-------|-------------|-----------|-------------|
| **Phase 0** | 11 | 1–2 | `hospitals` | `refresh_tokens`, `password_emails` | Set up the hospital, create departments, configure settings, set up users with roles and permissions. Nothing else works without this foundation. |
| **Phase 1** | 12 | 3–6 | `patients`, `doctors` | `id_cards` | Register patients with 12-digit PRN, set up doctors with schedules, book appointments, manage the queue, generate ID cards for everyone. |
| **Phase 2** | 16 | 7–9 | `prescriptions` | `pharmacy_return_items`, `optical_repairs` | Doctor writes prescriptions, pharmacy dispenses medicines from tracked batches, optical store handles eye prescriptions, glasses orders, and repairs. |
| **Phase 3** | 19 | 10–12 | `invoices` | `cycle_count_items` | Generate invoices, collect payments, process refunds and insurance claims, order stock from suppliers, receive and verify goods, track every stock movement, and audit physical inventory. |
| **Phase 4** | 4 | 13–14 | Events from all phases | `audit_logs`, `notification_queue` | Send notifications to users via bell icon, email, SMS, WhatsApp. Log every action with before/after snapshots for compliance. |
| **Total** | **62** | **16** | | | |
