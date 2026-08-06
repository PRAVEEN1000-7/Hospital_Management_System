-- ==============================================================================
-- 15 — SHIFT MANAGEMENT
--
-- shifts: shift definitions (Day/Night, hospital-configurable), one row per
-- hospital per shift name.
-- users.shift_id: the employee's CURRENT shift only — no history table, same
-- pattern as department_id/designation etc. (11_add_employee_fields_to_users.sql).
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS shifts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID NOT NULL REFERENCES hospitals(id),
    name         VARCHAR(50) NOT NULL,
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, name)
);

CREATE INDEX IF NOT EXISTS idx_shifts_hospital ON shifts(hospital_id);

DROP TRIGGER IF EXISTS update_shifts_updated_at ON shifts;
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id);
CREATE INDEX IF NOT EXISTS idx_users_shift ON users(shift_id);

-- Seed Day/Night for every existing hospital so the picker isn't empty on
-- first use (same lesson as the empty department dropdown earlier).
INSERT INTO shifts (hospital_id, name, start_time, end_time)
SELECT id, 'Day Shift', '09:00', '17:00' FROM hospitals
ON CONFLICT (hospital_id, name) DO NOTHING;

INSERT INTO shifts (hospital_id, name, start_time, end_time)
SELECT id, 'Night Shift', '21:00', '06:00' FROM hospitals
ON CONFLICT (hospital_id, name) DO NOTHING;
