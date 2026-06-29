-- ############################################################################
-- HMS Multi-Tenant — EYE HOSPITAL FEATURE PACK (BRD v1.1)
-- ############################################################################
-- Apply AFTER 01_full_schema.sql, on top of an existing hospital/tenant.
-- Run INSIDE the target database (hms_db) as its owner:
--     psql -U hms_user -d hms_db -f 02_eye_hospital_updates.sql
--
-- Everything in this file is additive (ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS / CREATE TABLE IF NOT EXISTS) and gated at the application layer by
-- hospitals.specialty — general hospitals get these columns/tables too (no
-- harm, they're simply never populated), but the features themselves only
-- unlock when is_eye_hospital_feature_enabled() (backend/app/core/
-- tenant_security.py) returns true: specialty = 'eye_hospital' /
-- 'multi_specialty', or super_admin.
--
-- Consolidates, in the order they were introduced:
--   1. Hospital specialty classification    ← 11_hospital_tenant_specialty.sql
--   2. Patient History block                ← 12_patient_history.sql
--   3. Prescription enhancements            ← 13_prescription_enhancements.sql
--   4. Pharmacy/Optical billing queue fields ← 14_pharmacy_optical_billing_queue.sql
--   5. Queue Display customization settings ← 15_hospital_settings_queue_display.sql
--   6. Pharmacy Queue (prescription-triggered) ← 16_pharmacy_queue_entries.sql
--   7. Eye Hospital Drug Prescription eye_side ← 17_prescription_eye_side.sql
-- Safe to re-run (idempotent). local_new_update.sql (an earlier ad-hoc bundle
-- of items 1-6, missing item 7) is superseded by this file.
-- ############################################################################

-- ==============================================================================
-- 1 — HOSPITAL SPECIALTY CLASSIFICATION
-- Source: 11_hospital_tenant_specialty.sql
-- ==============================================================================
-- Gates the entire BRD v1.1 feature pack below (Patient History block, Queue
-- Display, Prescription Opthal toggle + dual letterhead, Pharmacy Queue +
-- payment tracking, Optical/Opthal Billing), enforced in
-- backend/app/core/tenant_security.py (is_eye_hospital_feature_enabled).

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS specialty VARCHAR(30) NOT NULL DEFAULT 'general';
ALTER TABLE hospitals DROP CONSTRAINT IF EXISTS hospitals_specialty_check;
ALTER TABLE hospitals ADD CONSTRAINT hospitals_specialty_check
    CHECK (specialty IN ('general', 'eye_hospital', 'multi_specialty'));

-- Mirrored at the tenant/billing level (saas_core) so it's visible/editable
-- from the Super Admin tenant screens without joining to hospitals.
ALTER TABLE saas_core.tenants ADD COLUMN IF NOT EXISTS specialty VARCHAR(50) DEFAULT 'general';

-- Backfill tenant specialty from its hospital where not already set.
UPDATE saas_core.tenants t
SET specialty = h.specialty
FROM hospitals h
WHERE h.tenant_id = t.id
  AND t.specialty = 'general'
  AND h.specialty != 'general';


-- ==============================================================================
-- 2 — PATIENT HISTORY BLOCK (BRD v1.1 §2)
-- Source: 12_patient_history.sql
-- ==============================================================================
-- Captured at registration, auto-fills into the Prescription form.
-- Eye-hospital feature pack only (general hospitals never set these — see
-- backend/app/routers/patients.py).

ALTER TABLE patients ADD COLUMN IF NOT EXISTS reason_for_visit TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS symptoms JSONB;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_sugar_value NUMERIC(10, 2);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_sugar_unit VARCHAR(10);


-- ==============================================================================
-- 3 — PRESCRIPTION ENHANCEMENTS (BRD v1.1 §4)
-- Source: 13_prescription_enhancements.sql
-- ==============================================================================
-- Dual-letterhead institution selector, Opthal toggle + notes, and Patient
-- History blood-sugar carry-over at consultation time. Eye-hospital feature
-- pack only.

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES hospitals(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS is_opthal BOOLEAN DEFAULT FALSE;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS opthal_notes TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS vitals_blood_sugar VARCHAR(20);


-- ==============================================================================
-- 4 — PHARMACY/OPTICAL BILLING QUEUE FIELDS
-- Source: 14_pharmacy_optical_billing_queue.sql
-- ==============================================================================
-- Shared billing fields (payment tendered/advance/paid/balance/status) added
-- identically to pharmacy_dispensing and optical_orders, computed by one
-- shared backend helper (billing_queue_service.py) so both modules behave the
-- same way. payment_method/payment_status existed only as hardcoded Python
-- defaults before this — never persisted — now real columns.
--
-- Also adds the sale-triggered dispensing-queue columns used by Optical
-- (OpticalSale.queue_token/queue_status) and consultation_fee for Pharmacy
-- billing (BRD §5.5.1). Pharmacy's own queue is NOT sale-triggered — see
-- item 6 below for that (prescription-triggered instead).

ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash';
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS amount_tendered NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS queue_token INTEGER;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS queue_status VARCHAR(20) DEFAULT 'waiting';
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS queue_called_at TIMESTAMPTZ;

ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash';
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS amount_tendered NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS queue_token INTEGER;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS queue_status VARCHAR(20) DEFAULT 'waiting';
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS queue_called_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispensing_queue ON pharmacy_dispensing(hospital_id, queue_status, queue_token);
CREATE INDEX IF NOT EXISTS idx_optical_orders_queue ON optical_orders(hospital_id, queue_status, queue_token);


-- ==============================================================================
-- 5 — QUEUE DISPLAY CUSTOMIZATION SETTINGS (BRD v1.1 §3.4, QD-04/05/06)
-- Source: 15_hospital_settings_queue_display.sql
-- ==============================================================================
-- Per-hospital plug-and-play column toggles, refresh interval, and the two
-- doctor slots, so column headers show real doctor names instead of
-- hardcoded "Doctor 1"/"Doctor 2" labels. Eye-hospital feature pack only.

ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_show_doctor2 BOOLEAN DEFAULT TRUE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_show_pharmacy BOOLEAN DEFAULT TRUE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_show_opthal BOOLEAN DEFAULT TRUE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_refresh_seconds INTEGER DEFAULT 10;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_doctor1_id UUID REFERENCES doctors(id);
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_doctor2_id UUID REFERENCES doctors(id);


-- ==============================================================================
-- 6 — PHARMACY QUEUE, PRESCRIPTION-TRIGGERED (BRD v1.1 PQ-01..06)
-- Source: 16_pharmacy_queue_entries.sql
-- ==============================================================================
-- A token is assigned the moment a doctor finalizes a prescription with
-- medicines, or staff manually add a walk-in — well before any bill exists.
-- Deliberately decoupled from pharmacy_dispensing (the sale/bill); linked to
-- it once dispensing/billing actually happens. See
-- backend/app/services/billing_queue_service.py.

CREATE TABLE IF NOT EXISTS pharmacy_queue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id),
    queue_token INTEGER NOT NULL,
    prescription_id UUID REFERENCES prescriptions(id),
    patient_id UUID REFERENCES patients(id),
    patient_name VARCHAR(200),
    doctor_name VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'being_served', 'collected')),
    sale_id UUID REFERENCES pharmacy_dispensing(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    queue_called_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_queue_entries_hospital_status ON pharmacy_queue_entries(hospital_id, status, queue_token);
CREATE INDEX IF NOT EXISTS idx_pharmacy_queue_entries_prescription ON pharmacy_queue_entries(prescription_id);


-- ==============================================================================
-- 7 — EYE HOSPITAL DRUG PRESCRIPTION: eye_side marker
-- Source: 17_prescription_eye_side.sql
-- ==============================================================================
-- Per-medicine "which eye" marker (RE / LE / Both), distinct from the generic
-- Frequency/Duration/Qty/Route columns used by the normal hospital
-- prescription format. Eye-hospital feature pack only; null for
-- general-hospital prescription items.

ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS eye_side VARCHAR(10);

-- ############################################################################
-- End of 02_eye_hospital_updates.sql
-- ############################################################################
