-- ==============================================================================
-- 19 — EXPLICIT PRESENT STATUS
--
-- Previously marking a day 'present' meant "delete the row" (default), so
-- there was no way to tell "explicitly confirmed present" apart from
-- "never touched". Now the Attendance Marking grid needs that distinction
-- (blank/white = untouched, colored = explicitly marked), so 'present'
-- becomes a real stored status alongside 'absent'/'half_day'.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_status_check
    CHECK (status IN ('present', 'absent', 'half_day'));
