# Phase 1 — Core Modules: Use Cases & Wireframe Flow

> **Tables (12):** patients, patient_consents, patient_documents, doctors, doctor_schedules, doctor_leaves, doctor_fees, appointments, appointment_status_log, appointment_queue, id_sequences, id_cards
> **Focus:** Patient Registration, Doctor Management, Appointments, Queue, ID Cards

---

## Eraser.io Use Case Diagram

Copy the code below into [eraser.io](https://app.eraser.io) → Diagram as Code:

```eraser
// =============================================================================
// PHASE 1: CORE MODULES — USE CASE DIAGRAM
// =============================================================================

// Actors
Receptionist [icon: clipboard, color: blue]
Doctor [icon: stethoscope, color: purple]
Admin [icon: user-check, color: orange]
Nurse [icon: heart, color: pink]
Patient [icon: user, color: green]

// ─────────────────────────────────────────────
// Patient Management
// ─────────────────────────────────────────────

Register New Patient [icon: user-plus, color: red] {
  description: "Enter demographics, consent, generate 12-digit PRN, create ID card"
}

Upload Patient Documents [icon: file, color: red] {
  description: "Upload ID proof, insurance card, lab reports"
}

Search View Patient [icon: search, color: red] {
  description: "Search by PRN, name, phone; view full profile"
}

Update Patient Info [icon: edit, color: red] {
  description: "Edit demographics, contact, emergency contact, allergies"
}

Generate Patient ID Card [icon: credit-card, color: emerald] {
  description: "Render front/back card with photo, PRN, QR code"
}

// ─────────────────────────────────────────────
// Doctor Management
// ─────────────────────────────────────────────

Register Doctor Profile [icon: user-plus, color: purple] {
  description: "Link user to doctor, set specialization, qualification, department"
}

Set Doctor Schedule [icon: calendar, color: purple] {
  description: "Define weekly availability: days, shifts, slot duration, max patients"
}

Apply Doctor Leave [icon: calendar-x, color: purple] {
  description: "Mark full-day or half-day leave, approval workflow"
}

Manage Doctor Fees [icon: tag, color: purple] {
  description: "Set consultation, follow-up, and procedure fees with effective dates"
}

// ─────────────────────────────────────────────
// Appointment Management
// ─────────────────────────────────────────────

Book Appointment [icon: calendar-plus, color: orange] {
  description: "Select patient, doctor, date/time; check schedule & leaves; create slot"
}

Check In Patient [icon: log-in, color: orange] {
  description: "Mark arrival, assign queue token, update status to checked_in"
}

Manage Queue [icon: users, color: orange] {
  description: "View waiting list, call next patient, skip/reorder"
}

Start End Consultation [icon: clock, color: orange] {
  description: "Doctor begins/ends consultation, timestamps recorded"
}

Cancel Reschedule Appointment [icon: x-circle, color: orange] {
  description: "Cancel with reason or reschedule to new date/time"
}

Transfer to Next Doctor [icon: arrow-right, color: orange] {
  description: "Move patient to doctor 2 or 3 in multi-doctor workflow"
}

Book Follow Up [icon: repeat, color: orange] {
  description: "Create linked follow-up appointment with parent reference"
}

// ─────────────────────────────────────────────
// ID Card System
// ─────────────────────────────────────────────

Generate Staff ID Card [icon: credit-card, color: emerald] {
  description: "Staff ID card with role, specialization, department"
}

// ─────────────────────────────────────────────
// Relationships
// ─────────────────────────────────────────────

Receptionist > Register New Patient
Receptionist > Upload Patient Documents
Receptionist > Search View Patient
Receptionist > Update Patient Info
Receptionist > Generate Patient ID Card
Receptionist > Book Appointment
Receptionist > Check In Patient
Receptionist > Cancel Reschedule Appointment
Receptionist > Book Follow Up

Doctor > Search View Patient
Doctor > Set Doctor Schedule
Doctor > Apply Doctor Leave
Doctor > Start End Consultation
Doctor > Transfer to Next Doctor
Doctor > Book Follow Up

Admin > Register Doctor Profile
Admin > Manage Doctor Fees
Admin > Generate Staff ID Card

Nurse > Manage Queue
Nurse > Check In Patient
```

---

## Use Case Descriptions

### UC-1.1: Register New Patient
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `patients`, `patient_consents`, `id_sequences`, `id_cards` |
| **Precondition** | Hospital and departments exist (Phase 0) |
| **Main Flow** | 1. Receptionist enters: first name, last name, DOB/age, gender, phone, email<br>2. Enters address, national ID, emergency contact, allergies, chronic conditions<br>3. Captures/uploads patient photo<br>4. Patient signs consent (registration, treatment, photo)<br>5. System generates 12-digit PRN via `id_sequences`:<br>&nbsp;&nbsp;&nbsp;→ HH(hospital) + G(gender) + YY(year) + M(month) + C(checksum) + #####(seq)<br>6. Patient record saved with `patient_reference_number`<br>7. ID card auto-generated with front/back design |
| **Postcondition** | Patient registered, PRN assigned, ID card available for print |

### UC-1.2: Upload Patient Documents
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `patient_documents` |
| **Main Flow** | 1. Select patient<br>2. Choose document type (id_proof, insurance_card, lab_report, other)<br>3. Upload file (PDF, JPEG, PNG)<br>4. System stores file URL, type, size, uploaded_by |

### UC-1.3: Search / View Patient
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist, Doctor |
| **Tables** | `patients` |
| **Main Flow** | 1. Search by PRN, name, phone number, or national ID<br>2. View patient profile: demographics, photo, allergies, documents, appointment history |

### UC-1.4: Update Patient Info
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `patients` |
| **Main Flow** | 1. Find patient → edit demographics, contact, emergency contact, allergies<br>2. System logs `updated_by` and `updated_at` |

### UC-1.5: Generate Patient ID Card
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `id_cards`, `id_sequences`, `hospital_settings` |
| **Main Flow** | 1. Select patient (must have photo and PRN)<br>2. System renders front side: logo, photo, name, DOB, gender, blood group, PRN, department, QR code<br>3. System renders back side: hospital address, phone, email, emergency info, terms<br>4. Stores `card_data_snapshot` (JSON) for historical record<br>5. Card version incremented if regenerated; old card `revoked_at` set |
| **Postcondition** | ID card available for download, email, or print |

### UC-1.6: Register Doctor Profile
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `doctors`, `users` |
| **Precondition** | User account exists with doctor role |
| **Main Flow** | 1. Admin selects user with doctor role<br>2. Sets: department, specialization, qualification, registration number, experience<br>3. Sets: doctor_sequence (1, 2, or 3 for multi-doctor workflow)<br>4. Sets: consultation fee, follow-up fee<br>5. System creates 1:1 doctor record linked to `users.id` |

### UC-1.7: Set Doctor Schedule
| Field | Detail |
|-------|--------|
| **Actor** | Doctor, Admin |
| **Tables** | `doctor_schedules` |
| **Main Flow** | 1. Select day of week (0=Sun to 6=Sat)<br>2. Set shift: start_time, end_time, break_start, break_end<br>3. Set slot_duration_minutes (default 15) and max_patients (default 20)<br>4. Set effective_from/to dates for schedule validity<br>5. Multiple shifts per day supported (morning, evening) |

### UC-1.8: Apply Doctor Leave
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `doctor_leaves` |
| **Main Flow** | 1. Doctor selects leave date<br>2. Chooses: full_day, morning, or afternoon<br>3. Enters reason<br>4. Status set to "pending" → Admin approves → "approved"<br>5. Approved leaves block appointment slots on that date |

### UC-1.9: Manage Doctor Fees
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `doctor_fees` |
| **Main Flow** | 1. Select doctor<br>2. Add fee entries: fee_type (consultation, follow_up, procedure), service name, amount<br>3. Set effective_from/to for price validity<br>4. Old fees deactivated, not deleted — preserves history |

### UC-1.10: Book Appointment
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `appointments`, `doctor_schedules`, `doctor_leaves` |
| **Main Flow** | 1. Select patient and doctor<br>2. System checks `doctor_schedules` for available days/times<br>3. System checks `doctor_leaves` to exclude leave dates<br>4. System checks existing appointments to avoid double-booking<br>5. Select date, time slot, appointment type (scheduled/walk_in/emergency)<br>6. Enter chief complaint<br>7. System generates `appointment_number` (APT-2026-00001)<br>8. Status set to "scheduled" |
| **Exception** | Doctor on leave → show alternative dates; slots full → suggest next available |

### UC-1.11: Check-In Patient
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `appointments`, `appointment_queue`, `appointment_status_log` |
| **Main Flow** | 1. Find appointment by number or patient PRN<br>2. Mark: status → "checked_in", set `check_in_at` timestamp<br>3. System creates `appointment_queue` entry with next token number<br>4. Status change logged in `appointment_status_log` |
| **Postcondition** | Patient appears on queue display board |

### UC-1.12: Manage Queue
| Field | Detail |
|-------|--------|
| **Actor** | Nurse, Doctor |
| **Tables** | `appointment_queue`, `appointment_status_log` |
| **Main Flow** | 1. View today's queue for a specific doctor<br>2. Call next patient → queue status = "called", set `called_at`<br>3. Skip patient → queue status = "skipped"<br>4. Emergency patients jump to front (priority = "emergency")<br>5. Queue board shows: token number, patient name, status |

### UC-1.13: Start / End Consultation
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `appointments`, `appointment_status_log` |
| **Main Flow** | 1. Doctor selects patient from queue<br>2. Start → status = "with_doctor", set `consultation_start_at`<br>3. Doctor examines patient<br>4. End → status = "completed", set `consultation_end_at`<br>5. Queue entry → status = "completed"<br>6. Each status change logged with `changed_by` |

### UC-1.14: Cancel / Reschedule Appointment
| Field | Detail |
|-------|--------|
| **Actor** | Receptionist |
| **Tables** | `appointments`, `appointment_status_log` |
| **Main Flow** | **Cancel:** Status → "cancelled", record `cancel_reason`<br>**Reschedule:** Update date/time, record `reschedule_reason`, increment `reschedule_count`<br>Both logged in `appointment_status_log` |

### UC-1.15: Transfer to Next Doctor
| Field | Detail |
|-------|--------|
| **Actor** | Doctor |
| **Tables** | `appointments` |
| **Main Flow** | 1. Doctor 1 completes their part<br>2. Sets `current_doctor_sequence` from 1 → 2<br>3. Patient re-enters queue for Doctor 2<br>4. Doctor 2 may transfer to Doctor 3 (sequence → 3)<br>5. Status changes logged throughout |

### UC-1.16: Book Follow-up
| Field | Detail |
|-------|--------|
| **Actor** | Doctor, Receptionist |
| **Tables** | `appointments` |
| **Main Flow** | 1. After consultation, doctor suggests follow-up<br>2. New appointment created with `visit_type` = "follow_up"<br>3. `parent_appointment_id` set to original appointment<br>4. If within `follow_up_validity_days` → fee may be reduced or free |

### UC-1.17: Generate Staff ID Card
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `id_cards`, `id_sequences`, `users` |
| **Main Flow** | 1. Select staff user<br>2. System generates 12-digit staff ID via `id_sequences`:<br>&nbsp;&nbsp;&nbsp;→ HH + G(gender) + YY + M + C(checksum) + #####<br>3. Renders front: logo, photo, name, role, specialization, department, ID, QR<br>4. Renders back: hospital info, emergency, terms<br>5. Card stored in `id_cards` with `holder_type` = "user" |

---

## Data Flow: Patient Registration → ID Card

```
Receptionist fills registration form
        │
        ▼
┌─ patients table ──────────────────────┐
│  Insert: name, DOB, gender, phone     │
│  Insert: address, allergies, photo    │
│  Set: hospital_id, created_by         │
└───────────┬───────────────────────────┘
            │
            ├──────────────────────────┐
            ▼                          ▼
┌─ patient_consents ──────┐  ┌─ id_sequences ────────────────┐
│  registration consent    │  │  Find: hospital+gender        │
│  treatment consent       │  │  +year+month                  │
│  photo consent           │  │  Increment: last_sequence     │
│  Store: signature, text  │  │  Build: HCM262K00147          │
└─────────────────────────┘  └───────────┬───────────────────┘
                                         │
                                         ▼
                             ┌─ Update patients ────────────┐
                             │  Set: patient_reference_num   │
                             └───────────┬──────────────────┘
                                         │
                                         ▼
                             ┌─ id_cards ───────────────────┐
                             │  holder_type: patient         │
                             │  Render: front + back design  │
                             │  Store: card_data_snapshot    │
                             │  Set: issued_by, version = 1  │
                             └──────────────────────────────┘
```

## Data Flow: Appointment Booking → Consultation

```
Receptionist selects patient + doctor
        │
        ▼
┌─ doctor_schedules ────────────────────┐
│  Check: available days, time slots    │
│  Check: slot_duration, max_patients   │
└───────────┬───────────────────────────┘
            │
            ▼
┌─ doctor_leaves ───────────────────────┐
│  Check: no leave on selected date     │
└───────────┬───────────────────────────┘
            │ ✓ Available
            ▼
┌─ appointments ────────────────────────┐
│  Insert: patient, doctor, date, time  │
│  Generate: APT-2026-00001            │
│  Set: status = "scheduled"            │
└───────────┬───────────────────────────┘
            │
            ▼ (Patient arrives)
┌─ appointment_queue ───────────────────┐
│  Assign: queue_number (token)         │
│  Set: position, status = "waiting"    │
└───────────┬───────────────────────────┘
            │
            ▼ (Nurse calls patient)
┌─ appointment_status_log ──────────────┐
│  Log: checked_in → in_queue           │
│  Log: in_queue → with_doctor          │
│  Log: with_doctor → completed         │
│  Each: changed_by, timestamp          │
└───────────────────────────────────────┘
```

## Data Flow: Multi-Doctor Transfer (Doctor 1 → 2 → 3)

```
Patient arrives for Doctor 1
        │
        ▼
┌─ appointments ──────────────────┐
│  current_doctor_sequence = 1    │
│  status = "with_doctor"         │
└───────────┬─────────────────────┘
            │ Doctor 1 completes
            ▼
┌─ appointments ──────────────────┐
│  current_doctor_sequence = 2    │
│  → Re-enter queue for Doctor 2  │
└───────────┬─────────────────────┘
            │ Doctor 2 completes
            ▼
┌─ appointments ──────────────────┐
│  current_doctor_sequence = 3    │
│  → Re-enter queue for Doctor 3  │
└───────────┬─────────────────────┘
            │ Doctor 3 completes
            ▼
     status = "completed"
     → Ready for prescription
```
