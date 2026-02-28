# HMS — DB Use Case Flows (All Phases)

> A quick-read script-style guide showing how users interact with the database in each phase.
> Each phase includes a **flow script** and a **table summary**.

---

## Phase 0 — Foundation & Setup (11 Tables)

### Flow Script

```
1. Super Admin logs in → system checks `users` table → validates password (bcrypt hash)
2. JWT access token issued → `refresh_tokens` stored for session persistence
3. Super Admin creates the hospital → inserts into `hospitals` → configures `hospital_settings` (logo, timezone, fiscal year)
4. Adds departments (OPD, Pharmacy, Lab…) → each row in `departments` links to the hospital
5. Sets up tax rules (GST/VAT) → `tax_configurations` table holds tax name, rate, applicability
6. Creates roles (Doctor, Receptionist, Cashier…) → `roles` table → assigns granular permissions from `permissions` via `role_permissions`
7. Creates staff user accounts → `users` table → links each user to one or more roles via `user_roles`
8. If a user forgets password → system generates reset token → stored in `password_emails` → user resets via email link
```

### Tables at a Glance

| Table | Purpose |
|-------|---------|
| `hospitals` | Core hospital record — name, address, license, contact |
| `departments` | Hospital departments (OPD, Pharmacy, Lab, etc.) |
| `hospital_settings` | Key-value config — logo, timezone, currency, fiscal year |
| `tax_configurations` | Tax rules — GST, VAT, rates, applicability |
| `users` | All system users — email, hashed password, phone, status |
| `roles` | Named roles — Doctor, Receptionist, Admin, etc. |
| `permissions` | Granular action permissions — `patients.create`, `billing.view` |
| `user_roles` | Maps users ↔ roles (many-to-many) |
| `role_permissions` | Maps roles ↔ permissions (many-to-many) |
| `refresh_tokens` | JWT refresh tokens for session management |
| `password_emails` | Password reset tokens with expiry |

---

## Phase 1 — Core Operations (12 Tables)

### Flow Script

```
1. Patient walks in → Receptionist opens registration form → inserts into `patients` (name, DOB, blood group, contact, address)
2. System auto-generates patient ID (e.g., PAT-2026-00001) using `id_sequences` → prints `id_cards` (barcode/QR)
3. Patient signs consent form → stored in `patient_consents` → uploads documents (Aadhaar, insurance) → `patient_documents`
4. Receptionist checks doctor availability → reads `doctor_schedules` (day, slots, max patients) and `doctor_leaves`
5. Books an appointment → inserts into `appointments` (patient, doctor, date, time, type) → status logged in `appointment_status_log`
6. Patient enters waiting room → added to `appointment_queue` (queue number, priority, estimated wait)
7. Nurse calls next patient from queue → updates queue status → Doctor starts consultation
8. Doctor's profile, specialization, and consultation fees live in `doctors` and `doctor_fees` tables
```

### Tables at a Glance

| Table | Purpose |
|-------|---------|
| `patients` | Patient demographics — name, DOB, gender, blood group, contact, address |
| `patient_consents` | Consent records — type, version, signed date, IP address |
| `patient_documents` | Uploaded docs — Aadhaar, insurance card, lab reports |
| `doctors` | Doctor profiles — specialization, qualification, license number |
| `doctor_schedules` | Weekly schedule — day, time slots, max patients per slot |
| `doctor_leaves` | Leave records — date range, reason, status |
| `doctor_fees` | Consultation fees by type — OPD, follow-up, emergency |
| `appointments` | Booked appointments — patient, doctor, date, time, type, status |
| `appointment_status_log` | Status history — booked → checked-in → in-progress → completed |
| `appointment_queue` | Live queue — queue number, priority, estimated wait time |
| `id_sequences` | Auto-increment counters for ID generation (PAT, APT, INV…) |
| `id_cards` | Printed ID cards — patient ref, barcode data, QR code, template |

---

## Phase 2 — Clinical Workflows (16 Tables)

### Flow Script

```
1. Doctor opens patient's appointment → writes prescription → inserts into `prescriptions` (diagnosis, notes, follow-up date)
2. Adds medicines to prescription → each medicine is a row in `prescription_items` (medicine, dosage, frequency, duration)
3. Doctor can save reusable templates → `prescription_templates` → and every edit creates a version in `prescription_versions`
4. Prescription sent to Pharmacy → Pharmacist searches `medicines` catalog → checks `medicine_batches` for stock & expiry (FEFO)
5. Dispenses medicines → creates `pharmacy_dispensing` header + `pharmacy_dispensing_items` (batch, quantity, price per item)
6. If patient returns unused medicines → Pharmacist creates `pharmacy_returns` + `pharmacy_return_items` → stock restored to batch
7. For eye patients → Doctor writes optical Rx → `optical_prescriptions` (sphere, cylinder, axis, add power for each eye)
8. Optical Staff creates order from Rx → `optical_orders` + `optical_order_items` (frame, lens from `optical_products` catalog)
9. Patient brings broken glasses → Optical Staff logs `optical_repairs` (issue, cost, status, estimated completion)
```

### Tables at a Glance

| Table | Purpose |
|-------|---------|
| `prescriptions` | Prescription header — patient, doctor, diagnosis, notes, follow-up |
| `prescription_items` | Individual medicines in a prescription — dosage, frequency, duration |
| `prescription_templates` | Reusable prescription templates for common diagnoses |
| `prescription_versions` | Version history — tracks every edit to a prescription |
| `medicines` | Medicine catalog — name, generic name, category, manufacturer |
| `medicine_batches` | Batch-level stock — batch number, expiry date, quantity, cost price |
| `pharmacy_dispensing` | Dispensing header — linked to prescription, total amount, status |
| `pharmacy_dispensing_items` | Each dispensed item — medicine, batch, quantity, unit price |
| `pharmacy_returns` | Return header — reason, refund amount, status |
| `pharmacy_return_items` | Each returned item — medicine, batch, quantity returned |
| `optical_products` | Optical catalog — frames, lenses, solutions, accessories |
| `optical_prescriptions` | Eye Rx — sphere, cylinder, axis, add power, PD for each eye |
| `optical_orders` | Optical order header — patient, Rx reference, total, status |
| `optical_order_items` | Order line items — product, quantity, price, customization |
| `optical_repairs` | Repair jobs — issue description, cost, status, completion date |
| `lab_orders` | Lab test orders — patient, doctor, test type, status, results |

---

## Phase 3 — Billing & Inventory (19 Tables)

### Flow Script

```
1. After consultation/dispensing → Cashier generates invoice → `invoices` (patient, total, tax, discount, status)
2. Each charge is a line item → `invoice_items` (consultation fee, medicine, lab test, optical — with tax breakup)
3. Patient pays → `payments` recorded (cash/card/UPI, amount, transaction ref) → invoice marked as paid
4. If overpaid or cancelled → Cashier creates `refunds` or `credit_notes` → linked back to original invoice/payment
5. At end of day → Cashier runs daily settlement → `daily_settlements` (total collected, by payment method, discrepancies)
6. For insured patients → Receptionist selects `insurance_providers` → links patient's `insurance_policies`
7. Submits `pre_authorizations` before treatment → after treatment, files `insurance_claims` (amount, documents, status tracking)
8. Inventory Manager creates `purchase_orders` + `purchase_order_items` → sends to `suppliers`
9. Goods arrive → creates `goods_receipt_notes` + `grn_items` → auto-creates `medicine_batches` with expiry dates
10. Every stock movement (dispense, return, transfer, adjustment) logged in `stock_movements` → periodic `cycle_counts` verify physical vs system stock
```

### Tables at a Glance

| Table | Purpose |
|-------|---------|
| `invoices` | Invoice header — patient, date, subtotal, tax, discount, grand total |
| `invoice_items` | Line items — service/product, quantity, rate, tax, amount |
| `payments` | Payment records — method (cash/card/UPI), amount, reference |
| `refunds` | Refund records — reason, amount, linked to original payment |
| `credit_notes` | Credit notes — adjustments against invoices |
| `daily_settlements` | End-of-day cash/card reconciliation summary |
| `insurance_providers` | Insurance company master — name, contact, claim submission details |
| `insurance_policies` | Patient's insurance policies — provider, policy number, coverage |
| `insurance_claims` | Claims filed — treatment details, amount, documents, status |
| `pre_authorizations` | Pre-approval requests — treatment plan, estimated cost, approval status |
| `suppliers` | Supplier/vendor master — name, contact, GST number, payment terms |
| `purchase_orders` | PO header — supplier, order date, expected delivery, total, status |
| `purchase_order_items` | PO line items — product, quantity, unit price |
| `goods_receipt_notes` | GRN header — PO reference, received date, inspector |
| `grn_items` | GRN line items — received qty, accepted qty, batch, expiry |
| `stock_movements` | Every stock in/out — type (dispense/return/adjust), quantity, reference |
| `stock_adjustments` | Manual corrections — reason, approved by, quantity change |
| `cycle_counts` | Physical stock verification — scheduled date, status, discrepancies |
| `cycle_count_items` | Per-item count — system qty vs physical qty, variance |

---

## Phase 4 — Notifications, Audit & Reports (4 Tables)

### Flow Script

```
1. Any action in the system (login, patient created, invoice paid…) → System writes to `audit_logs` (who, what, when, before/after values, IP)
2. Admin configures notification templates → `notification_templates` (appointment reminder, payment receipt — with placeholders like {patient_name})
3. When an event triggers (appointment booked, payment done) → System creates `notifications` for the target user (in-app, read/unread)
4. For SMS/email/WhatsApp delivery → notification pushed to `notification_queue` (channel, recipient, payload, retry count)
5. System processes queue → sends message → updates status (sent/failed) → retries failed ones up to max attempts
6. Admin pulls reports → queries across all phase tables → filters by date, department, doctor, payment method
7. Audit logs provide full traceability → Super Admin can search by user, action, date range, or entity type
```

### Tables at a Glance

| Table | Purpose |
|-------|---------|
| `audit_logs` | Complete action trail — user, action, entity, old/new values, IP, timestamp |
| `notification_templates` | Message templates — type, channel, subject, body with placeholders |
| `notifications` | In-app notifications — user, title, message, read/unread status |
| `notification_queue` | Outbound message queue — channel (SMS/email/WhatsApp), status, retry count |

---

## Quick Reference — Full Patient Journey

```
Registration (Phase 1)
  └→ patients + id_cards + patient_consents
       └→ Appointment Booking
            └→ appointments + appointment_queue + appointment_status_log
                 └→ Doctor Consultation (Phase 2)
                      ├→ prescriptions + prescription_items
                      │    └→ Pharmacy Dispensing
                      │         └→ pharmacy_dispensing + medicine_batches (stock ↓)
                      └→ optical_prescriptions
                           └→ optical_orders + optical_order_items
                                └→ Billing (Phase 3)
                                     ├→ invoices + invoice_items
                                     ├→ payments
                                     └→ insurance_claims (if insured)
                                          └→ Audit & Notifications (Phase 4)
                                               ├→ audit_logs (every step logged)
                                               └→ notifications + notification_queue
```
