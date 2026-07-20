-- ==============================================================================
-- 13 — LABORATORY MODULE
--
-- Adds a Laboratory department on par with Pharmacy/Optical: doctors order
-- tests from the Prescription Builder (lab_orders/lab_order_items, mirrors
-- optical_prescriptions), lab staff collect payment and enter results
-- (lab_sales mirrors optical_orders' billing columns; results live directly
-- on lab_order_items since there's no batch/inventory concept to split out
-- the way pharmacy_dispensing_items needs one).
--
-- The queue token lives on lab_orders (not lab_sales) because
-- finalize_prescription must hand out a token the moment the doctor
-- finalizes, before any bill exists to attach it to — same reason
-- pharmacy_queue_entries is a separate table from pharmacy_dispensing. See
-- backend/app/services/billing_queue_service.py::get_or_assign_visit_token.
--
-- Safe to run against an existing DB — every statement is idempotent
-- (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ==============================================================================

-- Module registration — makes 'lab' appear in the existing generic
-- super-admin per-tenant module toggle UI (SuperAdminHospitalDetail.tsx)
-- once this row exists; no frontend change needed for that to work.
-- required_modules includes 'prescriptions' (unlike optical, which was
-- deliberately trimmed to not require it) because lab's only order entry
-- point is the Prescription Builder.
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('lab', 'Laboratory', 'Lab test catalog, ordering, sample tracking, and results', 'clinical', '/lab', '/api/v1/lab', 'flask', false, '{"patients","prescriptions"}')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.1 lab_tests — catalog
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.2 lab_orders — doctor's order; also carries the queue fields (see
-- header note on why the token lives here rather than on lab_sales)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.3 lab_order_items — one row per ordered test; holds the eventual result
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.4 lab_sales — billing only; created when lab staff starts checkout
-- (mirrors optical_orders' payment columns, minus queue fields since those
-- live on lab_orders instead)
-- ─────────────────────────────────────────────────────────────────────────────
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
