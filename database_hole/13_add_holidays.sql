-- ==============================================================================
-- 13 — HOLIDAYS (monthly holiday allocation)
--
-- One row per hospital per month, storing which day-of-month numbers are
-- marked as holidays (e.g. holiday_days = {6,13,20,27} for July's Sundays).
-- Plain marks only — no per-day name/label. Backed by the `attendance`
-- module already registered in 10_add_attendance_module.sql.
--
-- Sundays being a "default" holiday is a FRONTEND behavior only (the
-- calendar pre-checks Sundays when a month has no saved row yet) — nothing
-- here enforces it, so hospitals that work Sundays can save a row with no
-- Sundays in holiday_days at all.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS holidays (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   UUID NOT NULL REFERENCES hospitals(id),
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    holiday_days  INTEGER[] NOT NULL DEFAULT '{}',
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_holidays_hospital_year_month ON holidays(hospital_id, year, month);

DROP TRIGGER IF EXISTS update_holidays_updated_at ON holidays;
CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON holidays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
