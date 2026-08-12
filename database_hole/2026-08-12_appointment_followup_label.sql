-- ==============================================================================
-- 2026-08-12 — APPOINTMENT FOLLOW-UP LABEL (MC1/MC2/.../MCR)
--
-- Tracks how many times, in a row, a patient has returned within a rolling
-- 30-day window: MC1 = first return within a month of their previous visit,
-- MC2 = second consecutive within-a-month return, and so on. MCR ("Renewal")
-- marks the visit that restarts the chain after a gap of more than 30 days
-- since the previous visit. NULL means this is the patient's very first-ever
-- visit (no prior visit to measure a gap against).
--
-- Auto-computed at appointment-creation time
-- (appointment_service.compute_follow_up_label) but overridable — the OPD
-- Assignment screen (AppointmentBooking.tsx) shows the computed value
-- pre-selected in a dropdown and lets staff change it before confirming.
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS follow_up_label VARCHAR(10);
