-- ==============================================================================
-- 18 — ATTENDANCE REASON (feeds Leave Management)
--
-- attendance_records.reason: free-text reason captured when HR marks a day
-- Absent or Half Day (e.g. "Fever", "Emergency"). Nullable — old rows and
-- any future non-UI writes have no reason. The Leave Management page is
-- just a read view over attendance_records WHERE status IN ('absent',
-- 'half_day'), joined to the user — no separate table needed.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS reason VARCHAR(255);
