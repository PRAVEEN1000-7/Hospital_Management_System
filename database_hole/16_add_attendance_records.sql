-- ==============================================================================
-- 16 — ATTENDANCE RECORDS (daily present/absent/leave marking)
--
-- One row per (user, date) — but ONLY for days that deviate from the
-- default. A working day with no row is assumed Present; HR/Admin clicks a
-- day cell in the Attendance Report UI to mark it Absent or On Leave
-- (stores a row), clicking again clears it back to the Present default
-- (deletes the row).
--
-- Two other day-statuses shown in the report are NOT stored here at all —
-- they're computed on read from tables that already exist:
--   - Week-Off / Holiday: any day-of-month present in holidays.holiday_days
--     for that hospital/year/month (13_add_holidays.sql).
--   - Not Applicable (NA): any date outside [users.date_of_joining,
--     users.date_of_leaving] (11_add_employee_fields_to_users.sql).
-- This keeps attendance_records small (exceptions only) and means Holiday
-- Calendar stays the single source of truth for holidays — nothing here
-- can disagree with it.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS attendance_records (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id  UUID NOT NULL REFERENCES hospitals(id),
    user_id      UUID NOT NULL REFERENCES users(id),
    date         DATE NOT NULL,
    status       VARCHAR(10) NOT NULL CHECK (status IN ('absent', 'leave')),
    marked_by    UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_hospital_date ON attendance_records(hospital_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user ON attendance_records(user_id);

DROP TRIGGER IF EXISTS update_attendance_records_updated_at ON attendance_records;
CREATE TRIGGER update_attendance_records_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
