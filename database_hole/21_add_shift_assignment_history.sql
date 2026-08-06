-- ==============================================================================
-- 21 — SHIFT ASSIGNMENT HISTORY
--
-- Problem: users.shift_id (15_add_shift_management.sql) only ever holds the
-- employee's CURRENT shift. The Attendance Report reads it via a live join,
-- so reassigning someone from Day → Night today silently rewrites what every
-- PAST month's report shows for them — there was never a historical record
-- of "which shift were they on during July" as distinct from "which shift
-- are they on right now".
--
-- Fix: shift_assignments is an effective-dated history — one open-ended row
-- per employee at a time (effective_to IS NULL = current), closed out and
-- replaced whenever their shift changes. Any report resolves "the shift
-- effective as of <end of that report's month>" from this table instead of
-- reading users.shift_id directly. users.shift_id is kept as-is for
-- quick "current shift" lookups (Attendance Marking grid, assignment UI) —
-- both are now written together on every change, one is just the fast
-- pointer and the other is the audit trail.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS shift_assignments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID NOT NULL REFERENCES hospitals(id),
    user_id        UUID NOT NULL REFERENCES users(id),
    shift_id       UUID NOT NULL REFERENCES shifts(id),
    effective_from DATE NOT NULL,
    effective_to   DATE,  -- NULL = still current
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_hospital_user_from
    ON shift_assignments(hospital_id, user_id, effective_from DESC);

-- Backfill: give every currently-assigned employee an open-ended assignment
-- row, so month-end resolution has something to find for all of history up
-- to now. effective_from uses date_of_joining when known (falls back to
-- created_at's date otherwise) — an approximation for months before this
-- migration ran, since no real history exists before this point.
INSERT INTO shift_assignments (hospital_id, user_id, shift_id, effective_from)
SELECT u.hospital_id, u.id, u.shift_id, COALESCE(u.date_of_joining, u.created_at::date)
FROM users u
WHERE u.shift_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM shift_assignments sa
      WHERE sa.user_id = u.id AND sa.effective_to IS NULL
  );
