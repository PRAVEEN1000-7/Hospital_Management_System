-- ==============================================================================
-- 05 — SCHEMA STRUCTURE (all post-base-schema DDL: tables, columns, indexes,
-- constraints, triggers/functions)
--
-- Everything in this file is schema-only (CREATE TABLE / ALTER TABLE ADD
-- COLUMN / ADD CONSTRAINT / CREATE INDEX / CREATE TRIGGER, plus the handful
-- of backfill UPDATEs needed to populate a column this file just added on
-- pre-existing rows). Reference/seed row data (lab test catalog, default
-- payment modes, the visiting_doctor role, the lab module registration row,
-- the optical opening-batch backfill) lives in 06_seed_reference_data.sql —
-- run that AFTER this file.
--
-- Run against an existing DB — every statement is idempotent (IF NOT EXISTS /
-- guarded ADD CONSTRAINT / DROP TRIGGER IF EXISTS), so re-running this file is
-- always a safe no-op once applied.
--
-- Sections:
--   1. Appointments, queue & doctor settings — unified visit token, specialist
--      assignment lock, OPD session times, per-doctor analytics flag.
--   2. Patient email/phone verification columns + verification-token table.
--   3. Pharmacy & Optical Store integrity — optical batch tracking table,
--      widened batch uniqueness (mfg+expiry date), medicine SKU uniqueness,
--      duplicate-optical-dispense trigger.
--   4. Billing — refund-to-invoice-item link, for exact stock restoration.
--   5. Laboratory module — lab_tests/lab_orders/lab_order_items/lab_sales,
--      report finalization + structured results, lab_referrals.
--   6. Auth — global (platform-wide, not per-hospital) username/email
--      uniqueness, root cause fix for a login bug. Self-guarding: skips with
--      a NOTICE instead of failing if existing duplicates would violate it.
--   7. Inventory — purchase-order vendor-payment submodule tables.
-- ==============================================================================


-- ══════════════════════════════════════════════════════════════════════════
-- 1. APPOINTMENTS, QUEUE & DOCTOR SETTINGS
-- ══════════════════════════════════════════════════════════════════════════

-- 1.1 Unified visit token — the doctor queue (AppointmentQueue.queue_number),
-- pharmacy queue (pharmacy_queue_entries.queue_token), and optical queue
-- (optical_orders.queue_token) each used to mint their own independent daily
-- counter, so a patient referred between departments got a DIFFERENT number
-- in each one. Adds a single `visit_token` on `appointments` (the source of
-- truth, assigned once and reused everywhere) plus an `appointment_id` FK on
-- the three downstream tables so each department looks up the same token
-- instead of generating its own. See
-- backend/app/services/billing_queue_service.py::get_or_assign_visit_token.
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS visit_token INTEGER;

-- 1.2 Specialist assignment lock — lets reception mark a walk-in as a
-- "Specialist Assignment": the patient must be consulted by the doctor
-- chosen at registration only. The backend refuses to reassign
-- (POST /walk-ins/{id}/assign-doctor) or refer (POST /walk-ins/refer) a
-- locked patient to a different doctor once this flag is set.
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS is_specialist_assignment BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pharmacy_queue_entries
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);

ALTER TABLE pharmacy_dispensing
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);

ALTER TABLE optical_orders
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);

-- 1.3 OPD session times (VARCHAR(5) 'HH:MM' 24h — matches <input type="time">)
-- — the clinic's standard morning/evening OPD session times as hospital
-- settings, so the Doctor Schedule form can pre-fill start/break/end from
-- them instead of the previously hardcoded 09:00-17:00 defaults in
-- frontend/src/pages/DoctorSchedule.tsx.
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_morning_start_time VARCHAR(5) DEFAULT '10:00';
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_morning_end_time   VARCHAR(5) DEFAULT '14:00';
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_evening_start_time VARCHAR(5) DEFAULT '17:00';
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_evening_end_time   VARCHAR(5) DEFAULT '20:30';

-- Backfill any existing rows whose new columns are NULL (older rows created
-- before these columns existed) with the standard defaults.
UPDATE hospital_settings SET opd_morning_start_time = '10:00' WHERE opd_morning_start_time IS NULL;
UPDATE hospital_settings SET opd_morning_end_time   = '14:00' WHERE opd_morning_end_time   IS NULL;
UPDATE hospital_settings SET opd_evening_start_time = '17:00' WHERE opd_evening_start_time IS NULL;
UPDATE hospital_settings SET opd_evening_end_time   = '20:30' WHERE opd_evening_end_time   IS NULL;

-- 1.4 Per-doctor analytics visibility flag (BUG-16) — Analytics should be
-- available only to in-house doctors, not guest doctors. A checkbox at staff
-- creation/edit toggles this per doctor. Defaults TRUE so every existing
-- doctor keeps the access they have today.
ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS analytics_enabled BOOLEAN DEFAULT TRUE;


-- ══════════════════════════════════════════════════════════════════════════
-- 2. PATIENT EMAIL/PHONE VERIFICATION (BRD_OP_1 §3.2)
-- ══════════════════════════════════════════════════════════════════════════

-- A "verified" checkmark shown against a patient's name across the app
-- requires BOTH is_email_verified AND is_phone_verified to be true (see
-- backend/app/schemas/patient.py computed `is_verified`). Email verification
-- (send + confirm) is fully implemented, using a single-use hashed token
-- table mirroring the existing password_reset_tokens pattern. Each row
-- carries BOTH a link token (token_hash) and a 6-digit code (code_hash)
-- issued together — the patient can confirm via either the emailed link or
-- by reading the code back to the front desk (BRD_OP_1.md §3.2.1,
-- "link or code"). Phone/SMS OTP verification is OUT OF SCOPE (no SMS
-- gateway integrated) — is_phone_verified/phone_verified_at exist now so the
-- schema/UI can be built ahead of a future pass; until then this column
-- stays FALSE for every patient.
ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS patient_email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    code_hash VARCHAR(64),
    attempts_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_email_verif_patient ON patient_email_verification_tokens(patient_id);

-- Backfill guard: if this table already existed from before code-based
-- verification was added, these ALTERs add the newer columns on top (the
-- CREATE TABLE above is then a no-op).
ALTER TABLE patient_email_verification_tokens
    ADD COLUMN IF NOT EXISTS code_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS attempts_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;


-- ══════════════════════════════════════════════════════════════════════════
-- 3. PHARMACY & OPTICAL STORE DATA INTEGRITY
-- ══════════════════════════════════════════════════════════════════════════

-- 3.1 Optical batch/lot stock tracking — mirrors medicine_batches for
-- Pharmacy. The app already degrades gracefully when this table is missing
-- (optical low-stock lookups are wrapped in try/except and just log a
-- warning), but optical batch/FEFO stock tracking won't work at all until
-- this exists. The opening-batch backfill for existing stock lives in
-- 06_seed_reference_data.sql (it's a data insert, not schema).
CREATE TABLE IF NOT EXISTS optical_batches (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    optical_product_id  UUID          NOT NULL REFERENCES optical_products(id),
    batch_number        VARCHAR(50)   NOT NULL,
    grn_id              UUID          REFERENCES goods_receipt_notes(id),
    manufactured_date   DATE,
    expiry_date         DATE,
    purchase_price      NUMERIC,
    selling_price       NUMERIC,
    initial_quantity    INTEGER       NOT NULL DEFAULT 0,
    current_quantity    INTEGER       NOT NULL DEFAULT 0,
    is_expired          BOOLEAN       DEFAULT false,
    is_active           BOOLEAN       DEFAULT true,
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (optical_product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_optical_batches_product ON optical_batches(optical_product_id);
CREATE INDEX IF NOT EXISTS idx_optical_batches_expiry ON optical_batches(expiry_date);

-- optical_order_items needs a batch reference now that sales decrement a
-- specific batch (FEFO) instead of a flat current_stock counter.
ALTER TABLE optical_order_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES optical_batches(id);

-- optical_products.current_stock is superseded by SUM(optical_batches) —
-- mirrors how Medicine has no stock column at all, batches are the only
-- source of truth. Not dropping the column (no destructive drops in this
-- migration history); just marking it dead so it isn't read by mistake.
COMMENT ON COLUMN optical_products.current_stock IS
  'DEPRECATED — unused since optical_batches was introduced. Stock is now SUM(optical_batches.current_quantity) for active batches, mirroring Medicine/MedicineBatch.';

-- 3.2 Batch uniqueness widened to include manufactured/expiry date (Bug #50)
-- — a supplier can legitimately re-use the same batch number across
-- shipments with different manufacturing/expiry dates; the old uniqueness
-- (item + batch_number only) silently merged these into one row instead of
-- tracking each physically distinct batch.
ALTER TABLE medicine_batches DROP CONSTRAINT IF EXISTS uq_medicine_batch;
ALTER TABLE medicine_batches ADD CONSTRAINT uq_medicine_batch
  UNIQUE (medicine_id, batch_number, manufactured_date, expiry_date);

ALTER TABLE optical_batches DROP CONSTRAINT IF EXISTS uq_optical_batch;
ALTER TABLE optical_batches ADD CONSTRAINT uq_optical_batch
  UNIQUE (optical_product_id, batch_number, manufactured_date, expiry_date);

-- 3.3 Medicine SKU uniqueness — server-generated medicine codes already get
-- collision-retry uniqueness at the application layer
-- (pharmacy_service.generate_medicine_code()); this backs it with a
-- DB-level guarantee, matching the existing pattern for supplier codes
-- (uq_supplier_code_hospital). A partial unique index excludes NULL/blank
-- sku values (pre-existing medicines) from the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicine_sku_hospital
    ON medicines (hospital_id, sku)
    WHERE sku IS NOT NULL AND sku <> '';

-- 3.4 Duplicate-optical-dispense guard (Bug #55) — nothing stopped the same
-- eye prescription from being dispensed (sold) more than once. The
-- application already rejects this (optical_service.py::create_sale); this
-- adds the same rule at the database level as defense in depth. A BEFORE
-- INSERT trigger (not a plain UNIQUE INDEX) because some hospitals' existing
-- data already has a prescription dispensed twice from before the
-- application check existed — a trigger only validates NEW rows going
-- forward, so it applies cleanly without touching/reconciling pre-existing
-- rows.
CREATE OR REPLACE FUNCTION prevent_duplicate_optical_dispensing() RETURNS trigger AS $$
BEGIN
    IF NEW.optical_prescription_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM optical_orders
        WHERE optical_prescription_id = NEW.optical_prescription_id
          AND id <> NEW.id
    ) THEN
        RAISE EXCEPTION 'This prescription has already been dispensed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_optical_dispensing ON optical_orders;
CREATE TRIGGER trg_prevent_duplicate_optical_dispensing
    BEFORE INSERT ON optical_orders
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_optical_dispensing();


-- ══════════════════════════════════════════════════════════════════════════
-- 4. BILLING — REFUND-TO-ITEM LINK
-- ══════════════════════════════════════════════════════════════════════════

-- Links a refund to the specific invoice line item (and quantity) it covers,
-- so a medicine refund can restore the exact stock quantity to the exact
-- batch it was dispensed from, instead of only adjusting money. Both columns
-- are nullable / additive: a refund with no invoice_item_id behaves exactly
-- as before (a plain monetary refund, nothing to restock). Only refunds that
-- explicitly target a "medicine" line item carry a restock_quantity and
-- trigger stock restoration in refund_service.process_refund.
ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS invoice_item_id UUID REFERENCES invoice_items(id);

ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS restock_quantity NUMERIC(10, 2);


-- ══════════════════════════════════════════════════════════════════════════
-- 5. LABORATORY MODULE
-- ══════════════════════════════════════════════════════════════════════════

-- A Laboratory department on par with Pharmacy/Optical: doctors order tests
-- from the Prescription Builder (lab_orders/lab_order_items, mirrors
-- optical_prescriptions), lab staff collect payment and enter results
-- (lab_sales mirrors optical_orders' billing columns; results live directly
-- on lab_order_items since there's no batch/inventory concept to split out
-- the way pharmacy_dispensing_items needs one). The queue token lives on
-- lab_orders (not lab_sales) because finalize_prescription must hand out a
-- token the moment the doctor finalizes, before any bill exists to attach it
-- to. See backend/app/services/billing_queue_service.py::get_or_assign_visit_token.
-- The module-registration row and the standard test catalog seed live in
-- 06_seed_reference_data.sql (data, not schema) — run that after this file.

-- 5.1 lab_tests — catalog
CREATE TABLE IF NOT EXISTS lab_tests (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id      UUID          NOT NULL REFERENCES hospitals(id),
    name             VARCHAR(200)  NOT NULL,
    code             VARCHAR(30)   NOT NULL,
    category         VARCHAR(100),
    sample_type      VARCHAR(50),
    price            DECIMAL(12,2) NOT NULL DEFAULT 0,
    unit             VARCHAR(30),
    reference_range  VARCHAR(200),
    turnaround_hours INTEGER,
    is_active        BOOLEAN       DEFAULT true,
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

-- 5.2 lab_orders — doctor's order; also carries the queue fields (see
-- header note on why the token lives here rather than on lab_sales).
--
-- The base schema (01_full_schema.sql §6.5) ships a legacy, UNUSED
-- `lab_orders` stub with a different shape (no hospital_id, no
-- order_number, no queue fields) that no application code ever reads or
-- writes. Without this drop, CREATE TABLE IF NOT EXISTS below would
-- silently no-op against that stub. The drop is guarded to fire ONLY on
-- that legacy shape (has test_name, lacks hospital_id), so re-running
-- against a DB that already has this module's real table (with data) is a
-- safe no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lab_orders' AND column_name = 'test_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lab_orders' AND column_name = 'hospital_id'
    ) THEN
        DROP TABLE lab_orders CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS lab_orders (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID          NOT NULL REFERENCES hospitals(id),
    order_number    VARCHAR(30)   NOT NULL UNIQUE,
    patient_id      UUID          NOT NULL REFERENCES patients(id),
    doctor_id       UUID          NOT NULL REFERENCES doctors(id),
    appointment_id  UUID          REFERENCES appointments(id),
    prescription_id UUID          REFERENCES prescriptions(id),
    notes           TEXT,
    is_finalized    BOOLEAN       DEFAULT false,
    status          VARCHAR(20)   DEFAULT 'ordered',   -- 'ordered','in_progress','completed','cancelled'
    queue_token     INTEGER,
    queue_status    VARCHAR(20)   DEFAULT 'waiting' CHECK (queue_status IN ('waiting', 'being_served', 'collected')),
    queue_called_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_hospital_queue ON lab_orders(hospital_id, queue_status, queue_token);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient         ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_appointment     ON lab_orders(appointment_id);

-- 5.3 lab_order_items — one row per ordered test; holds the eventual result
CREATE TABLE IF NOT EXISTS lab_order_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_id    UUID          NOT NULL REFERENCES lab_orders(id),
    lab_test_id     UUID          NOT NULL REFERENCES lab_tests(id),
    test_name       VARCHAR(200)  NOT NULL,   -- snapshot at order time (same pattern as PrescriptionItem.medicine_name)
    price           DECIMAL(12,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20)   DEFAULT 'ordered',   -- 'ordered','sample_collected','in_progress','completed','cancelled'
    result_value    VARCHAR(200),
    result_unit     VARCHAR(30),
    reference_range VARCHAR(200),              -- snapshot at result time
    result_flag     VARCHAR(20),               -- 'normal','high','low','abnormal'
    result_notes    TEXT,
    resulted_at     TIMESTAMPTZ,
    resulted_by     UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_order_items_order ON lab_order_items(lab_order_id);

-- 5.4 lab_sales — billing only; created when lab staff starts checkout
-- (mirrors optical_orders' payment columns, minus queue fields since those
-- live on lab_orders instead)
CREATE TABLE IF NOT EXISTS lab_sales (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID          NOT NULL REFERENCES hospitals(id),
    sale_number     VARCHAR(30)   NOT NULL UNIQUE,
    lab_order_id    UUID          NOT NULL REFERENCES lab_orders(id),
    patient_id      UUID          NOT NULL REFERENCES patients(id),
    invoice_id      UUID          REFERENCES invoices(id),
    subtotal        DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_amount      DECIMAL(12,2) DEFAULT 0,
    total_amount    DECIMAL(12,2) DEFAULT 0,
    payment_method  VARCHAR(20)   DEFAULT 'cash',
    payment_status  VARCHAR(20)   DEFAULT 'pending',   -- 'pending','partial','paid'
    amount_tendered DECIMAL(12,2) DEFAULT 0,
    advance_amount  DECIMAL(12,2) DEFAULT 0,
    paid_amount     DECIMAL(12,2) DEFAULT 0,
    balance_amount  DECIMAL(12,2) DEFAULT 0,
    status          VARCHAR(20)   DEFAULT 'pending',   -- 'pending','completed','cancelled'
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (lab_order_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_sales_patient ON lab_sales(patient_id);

-- 5.5 Report finalization, structured results & report templates — adds a
-- real "report finalized" concept, independent of LabOrder.is_finalized
-- (which actually means the doctor finalized the *prescription*, not that
-- the lab report is done). Doctors should only see a lab report on the
-- patient page once the lab has entered every result AND collected payment
-- AND explicitly finalized. Also switches results from a single free-text
-- value per test to a structured JSONB parameter list
-- (lab_order_items.parameters), driven by an optional JSONB report_template
-- on lab_tests. Existing single-value result columns are left untouched as
-- a read-only fallback for rows entered before this change.
ALTER TABLE lab_tests
    ADD COLUMN IF NOT EXISTS report_template JSONB;

ALTER TABLE lab_order_items
    ADD COLUMN IF NOT EXISTS parameters JSONB;

ALTER TABLE lab_orders
    ADD COLUMN IF NOT EXISTS report_status VARCHAR(20) DEFAULT 'pending';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'lab_orders_report_status_check'
    ) THEN
        ALTER TABLE lab_orders
            ADD CONSTRAINT lab_orders_report_status_check
            CHECK (report_status IN ('pending', 'completed', 'finalized'));
    END IF;
END $$;

ALTER TABLE lab_orders
    ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

ALTER TABLE lab_orders
    ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users(id);

-- Backfill: orders whose items are already all completed shouldn't sit at
-- 'pending' just because they predate this column.
UPDATE lab_orders SET report_status = 'completed'
WHERE status = 'completed' AND report_status = 'pending';

-- 5.6 lab_referrals — printed referral letter lab staff fill in and hand to
-- a patient being sent to an external consultant (e.g. a radiologist for an
-- investigation this hospital doesn't perform in-house). This is a
-- printed-document record, not a billable/orderable test, so it's
-- deliberately independent of lab_orders/lab_tests — no price, no queue, no
-- result entry.
CREATE TABLE IF NOT EXISTS lab_referrals (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id            UUID          NOT NULL REFERENCES hospitals(id),
    referral_number        VARCHAR(30)   NOT NULL UNIQUE,
    patient_id             UUID          NOT NULL REFERENCES patients(id),
    recipient_title        VARCHAR(200)  NOT NULL,   -- e.g. "THE CONSULTANT RADIOLOGIST"
    recipient_location     VARCHAR(200),              -- e.g. "GOBI - 638 452"
    case_details           TEXT,                      -- "A case of ..."
    investigation          VARCHAR(200)  NOT NULL,    -- e.g. "CT NECK/THYROID"
    remarks                TEXT,
    referring_doctor_name  VARCHAR(200)  NOT NULL,
    created_by             UUID          REFERENCES users(id),
    created_at             TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_referrals_patient  ON lab_referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_referrals_hospital ON lab_referrals(hospital_id, created_at DESC);


-- ══════════════════════════════════════════════════════════════════════════
-- 6. AUTH — GLOBAL USERNAME/EMAIL UNIQUENESS
-- ══════════════════════════════════════════════════════════════════════════

-- ROOT CAUSE of "login fails with the correct password" for some hospitals:
-- users.username / users.email are only unique PER HOSPITAL in the base
-- schema (UNIQUE(hospital_id, username), UNIQUE(hospital_id, email)), but
-- authenticate_user() (backend/app/services/auth_service.py) looks a user up
-- by username-or-email ACROSS ALL HOSPITALS with no hospital/tenant filter —
-- the login form only collects username + password, so it has no hospital to
-- scope by. The application layer already enforces global uniqueness for
-- every user created through the app, but the DB constraint was never
-- tightened to match, so it can't catch rows created before that check
-- existed, direct SQL inserts/imports, or a race between two concurrent
-- signups. This replaces the composite per-hospital constraints with true
-- global ones — but only once it has confirmed no existing duplicates would
-- violate them.
--
-- If duplicates are found this does NOT fail the migration — it raises a
-- NOTICE and skips the constraint change so you can resolve the data first,
-- then re-run this file. To see exactly which accounts collide:
--
--   SELECT username, array_agg(hospital_id) AS hospital_ids, array_agg(id) AS user_ids
--   FROM users WHERE is_deleted = false
--   GROUP BY username HAVING COUNT(DISTINCT hospital_id) > 1;
--
--   SELECT lower(email) AS email, array_agg(hospital_id) AS hospital_ids, array_agg(id) AS user_ids
--   FROM users WHERE is_deleted = false
--   GROUP BY lower(email) HAVING COUNT(DISTINCT hospital_id) > 1;
DO $$
DECLARE
    dup_usernames INTEGER;
    dup_emails INTEGER;
    r RECORD;
BEGIN
    SELECT COUNT(*) INTO dup_usernames FROM (
        SELECT username FROM users WHERE is_deleted = false
        GROUP BY username HAVING COUNT(DISTINCT hospital_id) > 1
    ) t;

    SELECT COUNT(*) INTO dup_emails FROM (
        SELECT lower(email) AS email FROM users WHERE is_deleted = false
        GROUP BY lower(email) HAVING COUNT(DISTINCT hospital_id) > 1
    ) t;

    IF dup_usernames > 0 OR dup_emails > 0 THEN
        RAISE NOTICE 'Skipping global UNIQUE constraint: % duplicate username group(s) and % duplicate email group(s) span multiple hospitals. Resolve these first (see the queries in this file''s header comment — rename one side or confirm/merge), then re-run this migration.', dup_usernames, dup_emails;
    ELSE
        -- Drop whatever the composite (hospital_id, username)/(hospital_id, email)
        -- unique constraints are actually named (auto-generated names vary by
        -- how the table was created), matched by their columns rather than a
        -- hardcoded name.
        FOR r IN
            SELECT tc.constraint_name, array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) AS cols
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'users' AND tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
            GROUP BY tc.constraint_name
        LOOP
            IF r.cols = ARRAY['hospital_id', 'username'] OR r.cols = ARRAY['hospital_id', 'email'] THEN
                EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', r.constraint_name);
            END IF;
        END LOOP;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key') THEN
            ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
            ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
        END IF;
    END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════
-- 7. INVENTORY — PURCHASE ORDER PAYMENT SUBMODULE
-- ══════════════════════════════════════════════════════════════════════════

-- Adds a vendor-payment step to the existing Purchase Order lifecycle (see
-- 01_full_schema.sql's inventory tables: suppliers / purchase_orders /
-- purchase_order_items / goods_receipt_notes). Today a PO's lifecycle stops
-- at goods receipt — there is no record of the hospital actually paying the
-- supplier. payment_modes is a per-hospital, admin-manageable directory of
-- transfer modes, scoped to this PO payment submodule only — the existing
-- hardcoded payment-mode lists used by consultation fees / lab / invoices /
-- optical sales are untouched. Default-mode seed rows live in
-- 06_seed_reference_data.sql.
CREATE TABLE IF NOT EXISTS payment_modes (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   UUID          NOT NULL REFERENCES hospitals(id),
    name          VARCHAR(50)   NOT NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ   DEFAULT NOW(),
    CONSTRAINT uq_payment_mode_hospital_name UNIQUE (hospital_id, name)
);

CREATE INDEX IF NOT EXISTS idx_payment_modes_hospital ON payment_modes(hospital_id);

-- purchase_order_payments — one row per vendor payment recorded against a PO
-- (supplier is read via the PO's own supplier_id — not duplicated here).
CREATE TABLE IF NOT EXISTS purchase_order_payments (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id        UUID          NOT NULL REFERENCES hospitals(id),
    purchase_order_id  UUID          NOT NULL REFERENCES purchase_orders(id),
    payment_number     VARCHAR(30)   NOT NULL UNIQUE,
    invoice_number     VARCHAR(50),
    amount             NUMERIC(12,2) NOT NULL,
    payment_mode_id    UUID          NOT NULL REFERENCES payment_modes(id),
    payment_date       DATE          NOT NULL,
    reference_note     TEXT,
    recorded_by        UUID          REFERENCES users(id),
    created_at         TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_payments_po       ON purchase_order_payments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_payments_hospital ON purchase_order_payments(hospital_id, created_at DESC);
