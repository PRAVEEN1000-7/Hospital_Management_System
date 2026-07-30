-- ==============================================================================
-- 14 — WORKFORCE MANAGEMENT — PHASE 3: LEAVE TABLES
--
-- Companion code for Workforce_Management_Implementation_Plan.md /
-- Workforce_Management_Modules_MWMS_to_HMS.md §4.7-4.8. Creates
-- `leave_records` (HR data-entry — `status` defaults 'approved', matching the
-- existing `doctor_leaves` precedent, not a self-service request queue) and
-- `leave_balances` (per employee/year, `allocated` auto-seeded from
-- employee_profiles.paid_leave_entitlement the first time a balance is
-- needed for that employee/year — see leave_service.get_or_create_balance).
--
-- Idempotent — CREATE TABLE IF NOT EXISTS, matching this project's
-- convention (05_schema_structure.sql).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS leave_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    employee_id     UUID NOT NULL REFERENCES users(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    reason          VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'approved',
    entered_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_records_employee ON leave_records(employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_records_hospital ON leave_records(hospital_id);

CREATE TABLE IF NOT EXISTS leave_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES users(id),
    year            INTEGER NOT NULL,
    allocated       INTEGER NOT NULL DEFAULT 0,
    used            INTEGER NOT NULL DEFAULT 0,
    UNIQUE(employee_id, year)
);
