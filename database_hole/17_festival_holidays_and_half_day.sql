-- ==============================================================================
-- 17 — FESTIVAL HOLIDAYS + HALF DAY ATTENDANCE
--
-- holidays.festival_days: a SECOND day-of-month array, parallel to the
-- existing holiday_days. holiday_days = regular/weekly-off (e.g. Sundays) —
-- these ARE subtracted when computing working_days for payroll.
-- festival_days = festival/local holidays (e.g. Diwali) — these are still
-- non-attendance days in the Attendance grid, but are deliberately NOT
-- subtracted from working_days, because they're paid regardless of
-- attendance (the whole month's salary already covers them).
--
-- attendance_records.status: drop 'leave', add 'half_day'. Manual marking
-- is now exactly Present (no row) / Absent / Half Day — "Leave" as a
-- separate manual status is replaced by the paid-leave-entitlement vs.
-- Absent-count deduction math computed in the Attendance Report instead.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE holidays ADD COLUMN IF NOT EXISTS festival_days INTEGER[] NOT NULL DEFAULT '{}';

ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;
UPDATE attendance_records SET status = 'absent' WHERE status = 'leave';
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_status_check
    CHECK (status IN ('absent', 'half_day'));
