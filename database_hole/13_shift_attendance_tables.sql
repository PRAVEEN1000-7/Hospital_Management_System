-- ==============================================================================
-- 13 — WORKFORCE MANAGEMENT — PHASE 2: SHIFT + ATTENDANCE TABLES
--
-- Companion code for Workforce_Management_Implementation_Plan.md /
-- Workforce_Management_Modules_MWMS_to_HMS.md §4.4-4.6. Creates `shifts`,
-- `employee_shift_assignments` (effective-dated, one row per reassignment,
-- `reason` mandatory per BRD REQ-SHF-02), and `attendance_records` (one row
-- per employee per date — a grid click is always an upsert on
-- (hospital_id, employee_id, date); deliberately no "marked time" column,
-- since there's no reliable way to know an employee's actual arrival time
-- without hardware, and capturing one would risk being misread as real).
--
-- Idempotent — CREATE TABLE IF NOT EXISTS throughout, matching this
-- project's convention (05_schema_structure.sql).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS shifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    name            VARCHAR(50) NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_hospital ON shifts(hospital_id);

CREATE TABLE IF NOT EXISTS employee_shift_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES users(id),
    shift_id        UUID NOT NULL REFERENCES shifts(id),
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    assigned_by     UUID NOT NULL REFERENCES users(id),
    reason          VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee ON employee_shift_assignments(employee_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS attendance_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    employee_id     UUID NOT NULL REFERENCES users(id),
    date            DATE NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'not_marked',
    is_verified     BOOLEAN NOT NULL DEFAULT false,
    marked_by       UUID REFERENCES users(id),
    verified_by     UUID REFERENCES users(id),
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(hospital_id, employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_hospital_date ON attendance_records(hospital_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date);
