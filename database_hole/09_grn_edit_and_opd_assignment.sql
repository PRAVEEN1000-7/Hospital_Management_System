-- ==============================================================================
-- 09 — GRN EDIT FIELDS + WALK-IN QUEUE "OPD ASSIGNED" TRACKING
--
-- Two independent, additive changes from the 29-Jul-2026 HMS Enhancement BRD:
--
-- 1. appointment_queue.opd_assigned_at — set once a Walk-in Queue entry has
--    been sent through the new "OPD Assignment" button (BRD 5.2), which
--    navigates to the existing /appointments/book wizard with the patient
--    pre-filled. This is intentionally NOT a new appointment_queue.status
--    value — it doesn't replace or interact with the existing
--    waiting/called/sent_to_doctor/in_consultation/completed/skipped state
--    machine, it's a separate flag purely for (a) showing an "Assigned"
--    badge on the queue row and (b) preventing a second OPD-assignment
--    appointment being created for the same queue entry if the button is
--    clicked again (BRD 5.2 acceptance criteria).
--
-- 2. grn_items.discrepancy_notes — BRD 5.5 extends the existing
--    (already-shipped) GRN item batch-correction endpoint
--    (PUT /grns/{grn_id}/items/{item_id}) to also allow correcting the
--    received quantity (grn_items.quantity_received already exists — no new
--    column needed for that) and recording a discrepancy note, still gated
--    to GRN status == 'pending' (before stock is posted) exactly like the
--    existing batch_number/expiry correction already is.
--
-- Safe to run against an existing DB — every statement is idempotent.
-- ==============================================================================

ALTER TABLE appointment_queue ADD COLUMN IF NOT EXISTS opd_assigned_at TIMESTAMPTZ;

ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS discrepancy_notes TEXT;
