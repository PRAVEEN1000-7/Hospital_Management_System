-- ==============================================================================
-- 16 — LAB REPORT FINALIZATION, STRUCTURED RESULTS & REPORT TEMPLATES
--
-- Adds a real "report finalized" concept to the lab module, independent of
-- LabOrder.is_finalized (which actually means the doctor finalized the
-- *prescription*, not that the lab report is done — see backend/app/models/
-- lab.py). Doctors should only see a lab report on the patient page once the
-- lab has entered every result AND collected payment AND explicitly
-- finalized — not the moment the order exists.
--
-- Also switches results from a single free-text value per test to a
-- structured JSONB parameter list (lab_order_items.parameters), driven by an
-- optional JSONB report_template on lab_tests, so real multi-parameter
-- report templates (CBC, etc.) can be dropped in later without another
-- migration. Existing single-value result columns are left untouched as a
-- read-only fallback for any rows entered before this change.
--
-- Safe to run against an existing DB — every statement is idempotent
-- (IF NOT EXISTS / guarded UPDATE).
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 16.1 lab_tests.report_template — per-test structured report layout
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE lab_tests
    ADD COLUMN IF NOT EXISTS report_template JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16.2 lab_order_items.parameters — structured result rows
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE lab_order_items
    ADD COLUMN IF NOT EXISTS parameters JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16.3 lab_orders — report finalize lifecycle
-- ─────────────────────────────────────────────────────────────────────────────
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
