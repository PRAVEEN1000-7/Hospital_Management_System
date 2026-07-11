-- ==============================================================================
-- 06 — UNIFIED VISIT TOKEN across doctor queue, pharmacy, and optical
--
-- Today, the doctor queue (AppointmentQueue.queue_number), pharmacy queue
-- (pharmacy_queue_entries.queue_token), and optical queue
-- (optical_orders.queue_token) each mint their own independent daily
-- counter. A patient referred from doctor 1 to doctor 2, or moving on to
-- pharmacy/optical after their consultation, gets a DIFFERENT number in
-- each department instead of keeping the same token for their whole visit.
--
-- This adds a single `visit_token` on `appointments` (the source of truth
-- for a visit's token, assigned once and reused everywhere), plus an
-- `appointment_id` FK on the three downstream tables so each department can
-- look up the same token instead of generating its own. See
-- backend/app/services/billing_queue_service.py::get_or_assign_visit_token.
--
-- Safe to run against an existing production DB — every statement is
-- idempotent (IF NOT EXISTS) and purely additive: new nullable columns
-- only, no drops, no backfill required (existing rows simply have no
-- visit_token/appointment_id until they're next touched).
-- ==============================================================================

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS visit_token INTEGER;

ALTER TABLE pharmacy_queue_entries
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);

ALTER TABLE pharmacy_dispensing
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);

ALTER TABLE optical_orders
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);
