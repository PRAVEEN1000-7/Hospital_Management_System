-- ==============================================================================
-- 2026-09-18 — Follow-up bookings that still carry a booking-time token
--
-- SYMPTOM
--   Reception's Walk-in Queue shows follow-up patients ("Follow-up for RX-...")
--   in the New/Waiting tab with a real token (e.g. 11, 12, 13) instead of in
--   the Follow-up tab, where a follow-up must sit as "NT" (No Token) until
--   reception clicks "Assign Token". Only the most recent follow-ups behave.
--
-- CAUSE
--   The NT behaviour (appointment_queue.queue_number NULL for follow-up
--   bookings) was introduced in commit c989868 (2026-09-02). Follow-ups booked
--   BEFORE that release was deployed had a token minted for them at booking
--   time and kept it. The UI defines the Follow-up tab as "queue_number IS
--   NULL", so those older rows land in the waiting queue. New follow-ups are
--   already created correctly (NT) — this only repairs the existing rows.
--
-- WHAT THIS DOES
--   For follow-up appointments queued for today or a later hospital-local date
--   that are still exactly as they were created — status 'waiting', never
--   called, never OPD-assigned, and the queue row never modified since
--   insertion (a token given via "Assign Token" or any status change bumps
--   updated_at, so those are left alone) — it sets queue_number and
--   appointments.visit_token back to NULL. Reception's "Assign Token" then
--   mints the next number at click time, as designed.
--
-- HOW TO USE
--   1. Run PART 1 (read-only) and check the rows it lists are the ones you
--      expect (the tokened follow-ups nobody has touched).
--   2. Run PART 2 (it is wrapped in a transaction and reports the row count).
--   Idempotent: running it again changes nothing.
-- ==============================================================================

-- ─── PART 1 — PREVIEW (read-only) ─────────────────────────────────────────────
SELECT h.code                      AS hospital,
       q.queue_date,
       q.queue_number              AS token_now,
       a.appointment_number,
       left(a.chief_complaint, 30) AS complaint,
       q.status,
       q.created_at,
       q.updated_at
FROM   appointment_queue q
JOIN   appointments a ON a.id = q.appointment_id
JOIN   hospitals    h ON h.id = a.hospital_id
WHERE  a.appointment_type IN ('follow-up', 'follow_up')
  AND  a.is_deleted = false
  AND  q.queue_number IS NOT NULL
  AND  q.status = 'waiting'
  AND  q.called_at IS NULL
  AND  q.opd_assigned_at IS NULL
  AND  q.updated_at <= q.created_at + interval '5 seconds'
  AND  q.queue_date >= (now() AT TIME ZONE COALESCE(h.timezone, 'UTC'))::date
ORDER  BY h.code, q.queue_date, q.queue_number;

-- ─── PART 2 — APPLY ───────────────────────────────────────────────────────────
BEGIN;

WITH legacy AS (
    SELECT q.id AS queue_id, a.id AS appointment_id, q.queue_number
    FROM   appointment_queue q
    JOIN   appointments a ON a.id = q.appointment_id
    JOIN   hospitals    h ON h.id = a.hospital_id
    WHERE  a.appointment_type IN ('follow-up', 'follow_up')
      AND  a.is_deleted = false
      AND  q.queue_number IS NOT NULL
      AND  q.status = 'waiting'
      AND  q.called_at IS NULL
      AND  q.opd_assigned_at IS NULL
      AND  q.updated_at <= q.created_at + interval '5 seconds'
      AND  q.queue_date >= (now() AT TIME ZONE COALESCE(h.timezone, 'UTC'))::date
),
clear_queue AS (
    UPDATE appointment_queue q
    SET    queue_number = NULL
    FROM   legacy l
    WHERE  q.id = l.queue_id
    RETURNING q.id
),
clear_visit AS (
    UPDATE appointments a
    SET    visit_token = NULL
    FROM   legacy l
    WHERE  a.id = l.appointment_id
      AND  a.visit_token IS NOT DISTINCT FROM l.queue_number   -- only if it is the same booking-time token
    RETURNING a.id
)
SELECT (SELECT count(*) FROM clear_queue) AS queue_rows_reset_to_nt,
       (SELECT count(*) FROM clear_visit) AS appointment_tokens_cleared;

COMMIT;
