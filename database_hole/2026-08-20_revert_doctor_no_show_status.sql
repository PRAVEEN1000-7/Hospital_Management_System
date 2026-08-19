-- ==============================================================================
-- REVERT DOCTOR-TRIGGERED NO-SHOW STATUS (feature removed from doctor login)
--
-- The "No Show" action was removed from the doctor's own screens (My
-- Schedule / DoctorAppointments.tsx, and the Scheduled tab in Walk-in
-- Queue / WalkInQueue.tsx) — it never did anything beyond flip a status
-- label (no slot release, no notification, no billing effect), and its
-- removal would otherwise leave any appointment a doctor had already
-- marked no-show stuck there with no on-screen way for the doctor to
-- undo it. This restores each such appointment to whatever status it
-- held immediately before being marked no-show, recovered from its own
-- appointment_status_log row.
--
-- Scoped narrowly, matching exactly what was removed and nothing more:
--   - Only appointments CURRENTLY 'no-show' are touched — one already
--     moved on to something else since is left alone.
--   - Only reverted when the most recent transition INTO no-show for
--     that appointment was performed by a user holding the 'doctor'
--     role — reception/admin's own no-show marking (still supported,
--     via AppointmentManagement.tsx) is a separate workflow and is
--     deliberately left untouched.
--   - Falls back to 'confirmed' only in the (should-not-happen) case of
--     a no-show log row with no recorded from_status.
--
-- A new appointment_status_log row is written for the revert itself
-- (changed_by = NULL, a note explaining why), so the audit trail stays
-- continuous rather than showing a status change with no logged cause.
--
-- Safe to run against an existing DB — idempotent (a second run is a
-- no-op, since nothing doctor-marked is 'no-show' anymore after the
-- first run).
-- ==============================================================================

WITH latest_no_show_log AS (
    SELECT DISTINCT ON (asl.appointment_id)
        asl.appointment_id,
        asl.from_status,
        asl.changed_by
    FROM appointment_status_log asl
    WHERE asl.to_status = 'no-show'
    ORDER BY asl.appointment_id, asl.created_at DESC
),
to_revert AS (
    SELECT l.appointment_id, COALESCE(l.from_status, 'confirmed') AS revert_to
    FROM latest_no_show_log l
    JOIN appointments a ON a.id = l.appointment_id
    WHERE a.status = 'no-show'
      AND EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = l.changed_by AND r.name = 'doctor'
      )
),
logged AS (
    INSERT INTO appointment_status_log (appointment_id, from_status, to_status, changed_by, notes)
    SELECT appointment_id, 'no-show', revert_to, NULL,
           'Automated revert: doctor-login No Show action removed (2026-08-20_revert_doctor_no_show_status.sql)'
    FROM to_revert
    RETURNING appointment_id
)
UPDATE appointments a
SET status = t.revert_to
FROM to_revert t
WHERE a.id = t.appointment_id;
