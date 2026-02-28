# Hospital Management System — Test Plan

## Project Architecture Summary

| Layer       | Technology                         |
|-------------|-------------------------------------|
| Backend     | FastAPI 0.109, Python 3.11          |
| ORM         | SQLAlchemy 2.0.25                   |
| Database    | PostgreSQL 18                       |
| Auth        | JWT (python-jose), bcrypt           |
| Frontend    | React 19, TypeScript, Vite, Tailwind|
| Test Tools  | pytest 7.4.4, httpx 0.26.0          |

---

## Modules Under Test

| # | Module                  | Router Prefix                  | Key Entities                                |
|---|-------------------------|-------------------------------|---------------------------------------------|
| 1 | Authentication          | `/api/v1/auth`                | JWT tokens, login, logout, refresh           |
| 2 | Patients                | `/api/v1/patients`            | Patient, PRN, 12-digit ID                    |
| 3 | Users                   | `/api/v1/users`               | User, roles, employee IDs                    |
| 4 | Hospital                | `/api/v1/hospital`            | HospitalDetails, setup wizard                |
| 5 | Doctor Schedules        | `/api/v1/schedules`           | DoctorSchedule, BlockedPeriod, time slots    |
| 6 | Appointments            | `/api/v1/appointments`        | Appointment, double-booking, audit log       |
| 7 | Walk-ins                | `/api/v1/walk-ins`            | Walk-in queue, Q-numbers, wait time          |
| 8 | Waitlist                | `/api/v1/waitlist`            | Waitlist entries, confirm/cancel             |
| 9 | Appointment Settings    | `/api/v1/appointment-settings`| AppointmentSetting, global/doctor-level      |
|10 | Appointment Reports     | `/api/v1/reports/appointments`| Stats, rates, averages                       |

---

## Utility Modules Under Test

| Module                   | Functions                                                      |
|--------------------------|----------------------------------------------------------------|
| `utils/validators.py`    | `validate_mobile_number`, `validate_email`, `validate_pin_code`, `validate_country_code` |
| `utils/security.py`      | `verify_password`, `get_password_hash`, `create_access_token`, `decode_access_token` |
| `services/patient_id_service.py` | `calculate_checksum`, `validate_checksum`, `generate_patient_id` |
| `services/schedule_service.py`   | `is_date_blocked`, `get_available_slots`, time-slot generation  |
| `services/appointment_service.py`| `check_double_booking`, `enrich_appointment`, `get_appointment_stats` |

---

## Test Categories

### Category 1 — Pure Unit Tests (no DB)
Fast, isolated, no external dependencies.

### Category 2 — Service Unit Tests (DB required)
Test service functions directly against the test database.

### Category 3 — API Integration Tests (FastAPI TestClient)
Full HTTP request/response cycle through all layers.

### Category 4 — Edge Case & Negative Tests
Invalid inputs, boundary values, authorization failures.

---

## Detailed Test Cases

### TC-UTIL-001 through TC-UTIL-020: Validators

| ID          | Function                 | Input                      | Expected         | Category |
|-------------|--------------------------|----------------------------|------------------|----------|
| TC-UTIL-001 | validate_mobile_number   | "9876543210" (10 digits)   | True             | Unit     |
| TC-UTIL-002 | validate_mobile_number   | "1234" (4 digits, min)     | True             | Unit     |
| TC-UTIL-003 | validate_mobile_number   | "123456789012345" (15 max) | True             | Unit     |
| TC-UTIL-004 | validate_mobile_number   | "123" (3 digits, too short)| False            | Unit     |
| TC-UTIL-005 | validate_mobile_number   | "1234567890123456" (16)    | False            | Unit     |
| TC-UTIL-006 | validate_mobile_number   | "+9198765" (has +)         | False            | Unit     |
| TC-UTIL-007 | validate_mobile_number   | "98765abcd" (alpha chars)  | False            | Unit     |
| TC-UTIL-008 | validate_mobile_number   | "" (empty)                 | False            | Unit     |
| TC-UTIL-009 | validate_email           | "user@example.com"         | True             | Unit     |
| TC-UTIL-010 | validate_email           | "user+tag@sub.domain.co"   | True             | Unit     |
| TC-UTIL-011 | validate_email           | "user@"                    | False            | Unit     |
| TC-UTIL-012 | validate_email           | "@domain.com"              | False            | Unit     |
| TC-UTIL-013 | validate_email           | "nodomain" (no @)          | False            | Unit     |
| TC-UTIL-014 | validate_pin_code        | "400001" (India)           | True             | Unit     |
| TC-UTIL-015 | validate_pin_code        | "SW1A 2AA" (UK)            | True             | Unit     |
| TC-UTIL-016 | validate_pin_code        | "AB" (2 chars, too short)  | False            | Unit     |
| TC-UTIL-017 | validate_pin_code        | "12345678901" (11, too long)| False            | Unit     |
| TC-UTIL-018 | validate_country_code    | "+91"                      | True             | Unit     |
| TC-UTIL-019 | validate_country_code    | "+1"                       | True             | Unit     |
| TC-UTIL-020 | validate_country_code    | "91" (missing +)           | False            | Unit     |

---

### TC-SEC-001 through TC-SEC-010: Security Utils

| ID         | Function              | Input / Scenario                        | Expected                        |
|------------|-----------------------|-----------------------------------------|---------------------------------|
| TC-SEC-001 | get_password_hash     | "Admin@123"                             | bcrypt hash, len > 50           |
| TC-SEC-002 | verify_password       | correct password vs hash                | True                            |
| TC-SEC-003 | verify_password       | wrong password vs hash                  | False                           |
| TC-SEC-004 | verify_password       | empty string vs hash                    | False                           |
| TC-SEC-005 | create_access_token   | valid data dict + expiry                | non-empty JWT string            |
| TC-SEC-006 | decode_access_token   | valid JWT                               | dict with user_id, role, exp    |
| TC-SEC-007 | decode_access_token   | tampered JWT                            | None                            |
| TC-SEC-008 | decode_access_token   | expired JWT                             | None                            |
| TC-SEC-009 | decode_access_token   | empty string                            | None                            |
| TC-SEC-010 | create/decode round-trip| encode then decode                    | original data intact            |

---

### TC-PID-001 through TC-PID-015: Patient ID Service

| ID         | Function              | Scenario                                        | Expected                         |
|------------|-----------------------|-------------------------------------------------|----------------------------------|
| TC-PID-001 | calculate_checksum    | "HCM262" (6 chars)                              | deterministic char (e.g., "K")   |
| TC-PID-002 | calculate_checksum    | same input twice                                | same result (idempotent)         |
| TC-PID-003 | validate_checksum     | valid 12-char ID "HCM262K00147"                 | True                              |
| TC-PID-004 | validate_checksum     | ID with wrong checksum char                     | False                             |
| TC-PID-005 | validate_checksum     | 11-char ID (too short)                          | False                             |
| TC-PID-006 | validate_checksum     | 13-char ID (too long)                           | False                             |
| TC-PID-007 | GENDER_CODE_MAP       | "Male" → "M"                                    | "M"                               |
| TC-PID-008 | GENDER_CODE_MAP       | "Female" → "F"                                  | "F"                               |
| TC-PID-009 | MONTH_ENCODE          | month 10 → "A"                                  | "A"                               |
| TC-PID-010 | MONTH_ENCODE          | month 12 → "C"                                  | "C"                               |
| TC-PID-011 | generate_patient_id   | generates 12-char ID                            | len == 12                         |
| TC-PID-012 | generate_patient_id   | checksum in generated ID is valid               | validate_checksum returns True    |
| TC-PID-013 | generate_patient_id   | two calls produce different IDs (seq increment) | result1 != result2               |
| TC-PID-014 | validate_checksum     | valid ID all capitals                           | True                              |
| TC-PID-015 | validate-id endpoint  | 12-char valid ID via HTTP GET                   | 200 + valid=True                  |

---

### TC-AUTH-001 through TC-AUTH-015: Authentication

| ID          | Method | Endpoint            | Scenario                               | Expected Code | Expected Body Key          |
|-------------|--------|---------------------|----------------------------------------|---------------|----------------------------|
| TC-AUTH-001 | POST   | /auth/login         | Valid superadmin credentials           | 200           | access_token, user.role    |
| TC-AUTH-002 | POST   | /auth/login         | Wrong password                         | 401           | detail                     |
| TC-AUTH-003 | POST   | /auth/login         | Non-existent username                  | 401           | detail                     |
| TC-AUTH-004 | POST   | /auth/login         | Empty username and password            | 422           | —                          |
| TC-AUTH-005 | POST   | /auth/login         | Missing password field                 | 422           | —                          |
| TC-AUTH-006 | POST   | /auth/login         | Inactive user (is_active=False)        | 403           | detail                     |
| TC-AUTH-007 | POST   | /auth/logout        | Valid token                            | 200           | message                    |
| TC-AUTH-008 | POST   | /auth/logout        | No auth header                         | 403           | —                          |
| TC-AUTH-009 | POST   | /auth/refresh       | Valid token                            | 200           | access_token               |
| TC-AUTH-010 | POST   | /auth/refresh       | Expired token                          | 401/403       | detail                     |
| TC-AUTH-011 | POST   | /auth/login         | last_login updated after login         | 200           | (check DB)                 |
| TC-AUTH-012 | POST   | /auth/login         | Token payload contains user_id, role   | 200           | decoded token check        |
| TC-AUTH-013 | GET    | /patients           | Request with no Authorization header   | 403           | —                          |
| TC-AUTH-014 | GET    | /patients           | Request with malformed token "Bearer x"| 401           | —                          |
| TC-AUTH-015 | GET    | /users              | Logged in as doctor (not super_admin)  | 403           | detail                     |

---

### TC-PAT-001 through TC-PAT-025: Patients

| ID          | Method | Endpoint                       | Scenario                                         | Expected Code | Notes                                  |
|-------------|--------|--------------------------------|--------------------------------------------------|---------------|----------------------------------------|
| TC-PAT-001  | POST   | /patients                      | Create with all required fields                  | 201           | PRN auto-generated, 12-char            |
| TC-PAT-002  | POST   | /patients                      | Duplicate mobile number                          | 400           | detail: mobile already exists          |
| TC-PAT-003  | POST   | /patients                      | Duplicate email                                  | 400           | detail: email already exists           |
| TC-PAT-004  | POST   | /patients                      | Missing required field (title)                   | 422           | —                                      |
| TC-PAT-005  | POST   | /patients                      | Invalid gender value                             | 422           | —                                      |
| TC-PAT-006  | POST   | /patients                      | Mobile number with letters                       | 422           | —                                      |
| TC-PAT-007  | POST   | /patients                      | Date of birth in future                          | 201/422       | depends on validators                  |
| TC-PAT-008  | GET    | /patients/{id}                 | Existing patient ID                              | 200           | full patient object                    |
| TC-PAT-009  | GET    | /patients/{id}                 | Non-existent ID                                  | 404           | —                                      |
| TC-PAT-010  | GET    | /patients/{id}                 | Soft-deleted patient                             | 404           | —                                      |
| TC-PAT-011  | PUT    | /patients/{id}                 | Update first_name and city                       | 200           | updated fields reflected               |
| TC-PAT-012  | PUT    | /patients/{id}                 | Update mobile to existing mobile of other patient| 400           | conflict                               |
| TC-PAT-013  | DELETE | /patients/{id}                 | Soft delete existing patient                     | 200/204       | is_active=False                        |
| TC-PAT-014  | DELETE | /patients/{id}                 | Delete non-existent patient                      | 404           | —                                      |
| TC-PAT-015  | GET    | /patients                      | List with default pagination                     | 200           | total, page, limit, data[]             |
| TC-PAT-016  | GET    | /patients?search=Praveen        | Search by first name                             | 200           | matching patients returned             |
| TC-PAT-017  | GET    | /patients?search=HMS-000001     | Search by PRN                                    | 200           | correct patient returned               |
| TC-PAT-018  | GET    | /patients?search=9876543210     | Search by mobile                                 | 200           | matching patient                       |
| TC-PAT-019  | GET    | /patients?page=2&limit=2        | Second page                                      | 200           | correct pagination                     |
| TC-PAT-020  | GET    | /patients/by-prn/{prn}          | Search by PRN path param                         | 200           | correct patient                        |
| TC-PAT-021  | GET    | /patients/by-mobile/{mobile}    | Get by mobile number                             | 200           | correct patient                        |
| TC-PAT-022  | GET    | /patients/validate-id/HCM262K00147 | Valid 12-char ID                              | 200           | valid=True, components present         |
| TC-PAT-023  | GET    | /patients/validate-id/12345     | Wrong length                                     | 400           | error detail                           |
| TC-PAT-024  | GET    | /patients/validate-id/XXXXXXXXXXX1 | Wrong checksum (11 chars)                    | 400           | error detail                           |
| TC-PAT-025  | POST   | /patients                      | PRN generated has valid checksum                 | 201           | validate_checksum(prn) == True         |

---

### TC-USR-001 through TC-USR-020: User Management

| ID          | Method | Endpoint               | Scenario                                   | Expected Code | Notes                              |
|-------------|--------|------------------------|--------------------------------------------|---------------|------------------------------------|
| TC-USR-001  | GET    | /users                 | As super_admin                             | 200           | paged list                         |
| TC-USR-002  | GET    | /users                 | As doctor (non-admin)                      | 403           | —                                  |
| TC-USR-003  | POST   | /users                 | Create doctor with all fields              | 201           | employee_id auto-assigned          |
| TC-USR-004  | POST   | /users                 | Duplicate username                         | 400           | detail                             |
| TC-USR-005  | POST   | /users                 | Duplicate email                            | 400           | detail                             |
| TC-USR-006  | POST   | /users                 | Duplicate employee_id                      | 400           | detail                             |
| TC-USR-007  | POST   | /users                 | Invalid role value                         | 422           | —                                  |
| TC-USR-008  | PUT    | /users/{id}            | Update department and phone                | 200           | updated values                     |
| TC-USR-009  | PUT    | /users/{id}            | Update role to super_admin (if allowed)    | 200/403       | —                                  |
| TC-USR-010  | PUT    | /users/{id}            | Non-existent user                          | 404           | —                                  |
| TC-USR-011  | POST   | /users/{id}/reset-password | Reset with valid new password         | 200           | message                            |
| TC-USR-012  | POST   | /users/{id}/reset-password | Too-short password                    | 422           | —                                  |
| TC-USR-013  | DELETE | /users/{id}            | Delete/deactivate user                     | 200/204       | —                                  |
| TC-USR-014  | GET    | /users/me              | Get own profile                            | 200           | own user data                      |
| TC-USR-015  | GET    | /users?search=doctor1  | Search by username                         | 200           | matching user                      |
| TC-USR-016  | GET    | /users?role=doctor     | Filter by role                             | 200           | only doctors                       |
| TC-USR-017  | POST   | /users/{id}/photo      | Upload valid JPEG                          | 200           | photo_url set                      |
| TC-USR-018  | POST   | /users/{id}/photo      | Upload oversized file                      | 400           | size error                         |
| TC-USR-019  | POST   | /users                 | Password is not stored in plaintext        | 201           | password_hash != plain password     |
| TC-USR-020  | GET    | /users/{id}            | Get specific user detail as super_admin    | 200           | full user object                   |

---

### TC-SCH-001 through TC-SCH-020: Doctor Schedules

| ID          | Method | Endpoint                              | Scenario                                  | Expected Code | Notes                            |
|-------------|--------|---------------------------------------|-------------------------------------------|---------------|----------------------------------|
| TC-SCH-001  | GET    | /schedules/doctors                    | List all active doctors                   | 200           | array of doctor objects          |
| TC-SCH-002  | POST   | /schedules/doctors/{id}               | Create schedule for Monday 09:00-17:00    | 201           | schedule object with weekday=0   |
| TC-SCH-003  | POST   | /schedules/doctors/{id}               | End time before start time               | 422           | error                            |
| TC-SCH-004  | POST   | /schedules/doctors/{id}               | slot_duration < 5                        | 422           | —                                |
| TC-SCH-005  | POST   | /schedules/doctors/{id}               | slot_duration > 120                      | 422           | —                                |
| TC-SCH-006  | POST   | /schedules/doctors/{id}               | invalid consultation_type                | 422           | —                                |
| TC-SCH-007  | GET    | /schedules/doctors/{id}               | List doctor's schedules                   | 200           | array                            |
| TC-SCH-008  | POST   | /schedules/doctors/{id}/bulk          | Create 3 days schedule at once            | 201           | array of 3 schedules             |
| TC-SCH-009  | PUT    | /schedules/{id}                       | Update slot_duration                      | 200           | updated value                    |
| TC-SCH-010  | DELETE | /schedules/{id}                       | Delete schedule                           | 204           | —                                |
| TC-SCH-011  | POST   | /schedules/blocked-periods            | Block doctor for a date range             | 201           | blocked period object            |
| TC-SCH-012  | POST   | /schedules/blocked-periods            | end_date before start_date               | 422           | —                                |
| TC-SCH-013  | GET    | /schedules/blocked-periods            | List blocked periods for doctor           | 200           | array                            |
| TC-SCH-014  | DELETE | /schedules/blocked-periods/{id}       | Delete blocked period                     | 204           | —                                |
| TC-SCH-015  | GET    | /schedules/available-slots/{id}/{date}| Get available slots for scheduled day     | 200           | array of slot objects            |
| TC-SCH-016  | GET    | /schedules/available-slots/{id}/{date}| Date is blocked                           | 200           | empty slots or blocked flag      |
| TC-SCH-017  | POST   | /schedules/doctors/{id}               | Doctor creates own schedule               | 201           | allowed                          |
| TC-SCH-018  | POST   | /schedules/doctors/{id}               | Nurse creates schedule for doctor         | 403           | not authorised                   |
| TC-SCH-019  | GET    | /schedules/available-slots/{id}/{date}| Weekend when no schedule set             | 200           | empty slots                      |
| TC-SCH-020  | service| is_date_blocked                       | Date in blocked range                     | True          | unit test                        |

---

### TC-APT-001 through TC-APT-030: Appointments

| ID          | Method | Endpoint                          | Scenario                                        | Expected Code | Notes                             |
|-------------|--------|-----------------------------------|-------------------------------------------------|---------------|-----------------------------------|
| TC-APT-001  | POST   | /appointments                     | Book valid scheduled appointment                | 201           | APT-YYYYMMDD-XXXX number generated|
| TC-APT-002  | POST   | /appointments                     | Book on blocked doctor date                     | 400           | detail: not available             |
| TC-APT-003  | POST   | /appointments                     | Book already taken slot (double booking)        | 400           | slot fully booked                 |
| TC-APT-004  | POST   | /appointments                     | Invalid appointment_type                        | 422           | —                                 |
| TC-APT-005  | POST   | /appointments                     | Invalid consultation_type                       | 422           | —                                 |
| TC-APT-006  | POST   | /appointments                     | Invalid urgency_level                           | 422           | —                                 |
| TC-APT-007  | POST   | /appointments                     | Non-existent patient_id                         | 500/404       | —                                 |
| TC-APT-008  | GET    | /appointments/{id}                | Get existing appointment                        | 200           | enriched with patient/doctor name |
| TC-APT-009  | GET    | /appointments/{id}                | Non-existent appointment                        | 404           | —                                 |
| TC-APT-010  | GET    | /appointments                     | List all appointments                           | 200           | paginated                         |
| TC-APT-011  | GET    | /appointments?status=pending      | Filter by status                                | 200           | only pending                      |
| TC-APT-012  | GET    | /appointments?date_from=2026-01-01| Filter by date range                            | 200           | only in range                     |
| TC-APT-013  | GET    | /appointments?doctor_id=X         | Filter by doctor                                | 200           | only that doctor's appts          |
| TC-APT-014  | GET    | /appointments/my-appointments     | Doctor gets own appointments                    | 200           | only current user's               |
| TC-APT-015  | PATCH  | /appointments/{id}/status         | Update status to confirmed                      | 200           | status=confirmed                  |
| TC-APT-016  | PATCH  | /appointments/{id}/status         | Update with invalid status                      | 422           | —                                 |
| TC-APT-017  | PATCH  | /appointments/{id}/status         | Cancel appointment (status=cancelled)           | 200           | cancelled_at set                  |
| TC-APT-018  | POST   | /appointments/{id}/cancel         | Cancel with reason                              | 200           | cancellation_reason set           |
| TC-APT-019  | POST   | /appointments/{id}/reschedule     | Reschedule to new date+time                     | 200           | status=rescheduled                |
| TC-APT-020  | POST   | /appointments/{id}/reschedule     | Reschedule to blocked date                      | 400           | not available                     |
| TC-APT-021  | PUT    | /appointments/{id}                | Update doctor_notes and diagnosis               | 200           | fields updated                    |
| TC-APT-022  | GET    | /appointments/doctor/{id}/today   | Get today's appointments for doctor             | 200           | array                             |
| TC-APT-023  | POST   | /appointments                     | auto_confirm=true → status=confirmed            | 201           | status=confirmed                  |
| TC-APT-024  | POST   | /appointments                     | auto_confirm=false → status=pending             | 201           | status=pending                    |
| TC-APT-025  | service| check_double_booking              | Same slot same doctor → True                    | True          | unit test                         |
| TC-APT-026  | service| check_double_booking              | Different time same doctor → False              | False         | unit test                         |
| TC-APT-027  | service| generate_appointment_number       | Returns APT-YYYYMMDD-XXXX format                | match regex   | unit test                         |
| TC-APT-028  | service| generate_appointment_number(walk-in)| Returns WLK-YYYYMMDD-XXXX format             | match regex   | unit test                         |
| TC-APT-029  | service| get_appointment_stats             | Zero appointments                               | all zeros     | unit test                         |
| TC-APT-030  | service| get_appointment_stats             | Mixed statuses calculate rates correctly        | rates add up  | unit test                         |

---

### TC-WLK-001 through TC-WLK-015: Walk-ins

| ID          | Method | Endpoint                           | Scenario                                        | Expected Code | Notes                              |
|-------------|--------|------------------------------------|-------------------------------------------------|---------------|------------------------------------|
| TC-WLK-001  | POST   | /walk-ins                          | Register walk-in with patient_id                | 201           | queue_number Q001, status=confirmed|
| TC-WLK-002  | POST   | /walk-ins                          | Second walk-in → Q002                           | 201           | queue_number Q002                  |
| TC-WLK-003  | POST   | /walk-ins                          | Urgency = emergency                             | 201           | urgency_level=emergency            |
| TC-WLK-004  | POST   | /walk-ins                          | Without specifying doctor_id                    | 201           | doctor_id=null accepted            |
| TC-WLK-005  | GET    | /walk-ins/queue                    | Queue overview for today                        | 200           | total_waiting, avg_wait_time       |
| TC-WLK-006  | GET    | /walk-ins/queue?doctor_id=X        | Queue filtered by doctor                        | 200           | only that doctor's queue           |
| TC-WLK-007  | POST   | /walk-ins/{id}/assign-doctor       | Assign doctor to unassigned walk-in             | 200           | doctor_id set                      |
| TC-WLK-008  | POST   | /walk-ins/{id}/assign-doctor       | Non-existent appointment                        | 404           | —                                  |
| TC-WLK-009  | GET    | /walk-ins/today                    | Today's walk-ins                                | 200           | array                              |
| TC-WLK-010  | GET    | /walk-ins/today?doctor_id=X        | Today's walk-ins for specific doctor            | 200           | filtered array                     |
| TC-WLK-011  | service| register_walk_in                   | Queue number format Q001                        | "Q001"        | unit test                          |
| TC-WLK-012  | service| get_queue_status                   | Counts waiting vs in-progress vs completed      | correct counts| unit test                          |
| TC-WLK-013  | service| register_walk_in                   | Estimated wait time = position × 20             | numeric       | unit test                          |
| TC-WLK-014  | POST   | /walk-ins                          | Missing patient_id                              | 422           | —                                  |
| TC-WLK-015  | PATCH  | /appointments/{id}/status          | Set walk-in to in-progress                      | 200           | status=in-progress                 |

---

### TC-WTL-001 through TC-WTL-012: Waitlist

| ID          | Method | Endpoint                  | Scenario                                 | Expected Code | Notes                     |
|-------------|--------|---------------------------|------------------------------------------|---------------|---------------------------|
| TC-WTL-001  | POST   | /waitlist                 | Add patient to waitlist                  | 201           | status=waiting            |
| TC-WTL-002  | GET    | /waitlist                 | List waitlist entries paged              | 200           | pagination                |
| TC-WTL-003  | GET    | /waitlist?doctor_id=X     | Filter by doctor                         | 200           | filtered                  |
| TC-WTL-004  | GET    | /waitlist?status=waiting  | Filter by status                         | 200           | only waiting              |
| TC-WTL-005  | POST   | /waitlist/{id}/confirm    | Confirm waitlist entry                   | 200           | status=confirmed          |
| TC-WTL-006  | POST   | /waitlist/{id}/confirm    | Non-existent entry                       | 404           | —                         |
| TC-WTL-007  | DELETE | /waitlist/{id}            | Cancel / remove entry                    | 204           | —                         |
| TC-WTL-008  | DELETE | /waitlist/{id}            | Non-existent entry                       | 404           | —                         |
| TC-WTL-009  | GET    | /waitlist/my-waitlist     | Doctor's waitlist                        | 200           | own doctor's waitlist     |
| TC-WTL-010  | service| add_to_waitlist           | Creates entry with auto-timestamps       | Waitlist obj  | unit test                 |
| TC-WTL-011  | service| confirm_waitlist          | confirmed_at is set                      | != None       | unit test                 |
| TC-WTL-012  | service| enrich_waitlist           | Adds patient_name + doctor_name          | strings added | unit test                 |

---

### TC-SET-001 through TC-SET-008: Appointment Settings

| ID          | Method | Endpoint                       | Scenario                                     | Expected Code | Notes                         |
|-------------|--------|--------------------------------|----------------------------------------------|---------------|-------------------------------|
| TC-SET-001  | GET    | /appointment-settings          | List all global settings                     | 200           | array of settings             |
| TC-SET-002  | GET    | /appointment-settings?doctor_id=X | Doctor-level + global settings             | 200           | combined results              |
| TC-SET-003  | PUT    | /appointment-settings/{key}    | Update as admin                              | 200           | updated value                 |
| TC-SET-004  | PUT    | /appointment-settings/{key}    | Update as doctor (non-admin)                 | 403           | —                             |
| TC-SET-005  | PUT    | /appointment-settings/{key}    | Non-existent key                             | 404           | —                             |
| TC-SET-006  | service| get_setting_value              | Existing key → value                         | string        | unit test                     |
| TC-SET-007  | service| get_setting_value              | Non-existent key → default ""               | ""            | unit test                     |
| TC-SET-008  | service| auto_confirm effect            | set to "true" → new appt status=confirmed    | confirmed     | integration                   |

---

### TC-RPT-001 through TC-RPT-010: Reports & Statistics

| ID          | Method | Endpoint                              | Scenario                               | Expected Code | Notes                          |
|-------------|--------|---------------------------------------|----------------------------------------|---------------|--------------------------------|
| TC-RPT-001  | GET    | /reports/appointments/statistics      | No date filter                         | 200           | stats object with all keys     |
| TC-RPT-002  | GET    | /reports/appointments/statistics      | With date_from + date_to               | 200           | filtered counts                |
| TC-RPT-003  | GET    | /reports/appointments/statistics      | Specific doctor_id                     | 200           | doctor-specific stats          |
| TC-RPT-004  | GET    | /reports/appointments/statistics      | Date range with no appointments        | 200           | all zeros                      |
| TC-RPT-005  | service| get_appointment_stats                 | completion_rate = completed/total×100  | correct float | unit test                      |
| TC-RPT-006  | service| get_appointment_stats                 | cancellation_rate correct              | correct float | unit test                      |
| TC-RPT-007  | service| get_appointment_stats                 | no_show_rate correct                   | correct float | unit test                      |
| TC-RPT-008  | service| get_appointment_stats                 | average_wait_time based on walk-ins    | correct mean  | unit test                      |
| TC-RPT-009  | GET    | /reports/appointments/statistics      | Unauthenticated request                | 403           | —                              |
| TC-RPT-010  | GET    | /reports/appointments/statistics      | total_scheduled + total_walk_ins = total | correct     | integrity check                |

---

### TC-HOS-001 through TC-HOS-010: Hospital

| ID          | Method | Endpoint         | Scenario                             | Expected Code | Notes                     |
|-------------|--------|------------------|--------------------------------------|---------------|---------------------------|
| TC-HOS-001  | GET    | /hospital        | Get hospital details                 | 200/404       | 200 if configured         |
| TC-HOS-002  | POST   | /hospital        | Create hospital as super_admin       | 201           | is_configured=True        |
| TC-HOS-003  | POST   | /hospital        | Create as doctor (non-admin)         | 403           | —                         |
| TC-HOS-004  | PUT    | /hospital        | Update hospital details              | 200           | updated fields            |
| TC-HOS-005  | POST   | /hospital/logo   | Upload logo (valid JPEG < 500KB)     | 200           | logo_path set             |
| TC-HOS-006  | POST   | /hospital/logo   | Upload non-image file                | 400/422       | —                         |
| TC-HOS-007  | GET    | /hospital        | hospital_code used in Patient ID     | 200           | code in PRN               |
| TC-HOS-008  | GET    | /hospital/setup-status | Check if initial setup done    | 200           | boolean flag              |
| TC-HOS-009  | PUT    | /hospital        | Set working_days as JSON array       | 200           | JSONB stored correctly    |
| TC-HOS-010  | DELETE | /hospital        | Cannot delete hospital record        | 405/404       | constraint prevents it    |

---

## Edge Case & Boundary Tests

### Pagination
- page=0 → 422
- limit=0 → 422
- limit=101 → 422
- page=99999 (beyond data) → 200, empty data[]

### Authorization Matrix

| Endpoint Group    | super_admin | admin | doctor | nurse | staff | unauth |
|-------------------|:-----------:|:-----:|:------:|:-----:|:-----:|:------:|
| GET /users        | ✅          | ❌    | ❌     | ❌    | ❌    | ❌     |
| POST /users       | ✅          | ❌    | ❌     | ❌    | ❌    | ❌     |
| GET /patients     | ✅          | ✅    | ✅     | ✅    | ✅    | ❌     |
| POST /patients    | ✅          | ✅    | ✅     | ✅    | ✅    | ❌     |
| POST /schedules   | ✅          | ✅    | ✅(own)| ❌    | ❌    | ❌     |
| PUT /appt-settings| ✅          | ✅    | ❌     | ❌    | ❌    | ❌     |
| POST /hospital    | ✅          | ❌    | ❌     | ❌    | ❌    | ❌     |

---

## Test Data Constants (to be used across test files)

```
SUPERADMIN_CREDENTIALS = {"username": "superadmin", "password": "Super@123"}
ADMIN_CREDENTIALS      = {"username": "admin",      "password": "Admin@123"}
DOCTOR_CREDENTIALS     = {"username": "doctor1",    "password": "Admin@123"}
NURSE_CREDENTIALS      = {"username": "nurse1",     "password": "Admin@123"}

TEST_PATIENT_MOBILE    = "9000000001"  # Unique test mobile prefix
TEST_PATIENT_EMAIL     = "testpat_{n}@hms-test.com"
```

---

## Test Execution Order

1. `test_01_utils.py` — pure unit, no DB needed
2. `test_02_security.py` — pure unit, no DB needed
3. `test_03_patient_id.py` — unit + DB for sequence
4. `test_04_auth.py` — depends on seed users existing
5. `test_05_patients.py` — depends on auth
6. `test_06_users.py` — depends on auth (super_admin)
7. `test_07_schedules.py` — depends on users (doctors)
8. `test_08_appointments.py` — depends on patients + schedules
9. `test_09_walk_ins.py` — depends on patients
10. `test_10_waitlist.py` — depends on patients + doctors
11. `test_11_settings.py` — depends on auth (admin)
12. `test_12_reports.py` — depends on appointments data
13. `test_13_hospital.py` — depends on auth (super_admin)
14. `test_14_edge_cases.py` — cross-cutting

---

## Running Tests

```powershell
# From backend directory with venv activated
cd p:\Hospital_Management_System\backend
.\venv\Scripts\Activate.ps1

# All tests
pytest tests/ -v

# Single module
pytest tests/test_04_auth.py -v

# With coverage
pip install pytest-cov
pytest tests/ -v --cov=app --cov-report=html

# Fast (unit tests only, skip slow integration)
pytest tests/ -v -m "unit"

# Show only failures
pytest tests/ -v --tb=short -q
```

---

## Known Limitations / Out of Scope for This Plan

- Email sending (SMTP not configured; mocked in tests)
- Frontend E2E (would need Playwright/Cypress)
- Load / performance testing
- File upload size stress tests
- Multi-timezone appointment scheduling
