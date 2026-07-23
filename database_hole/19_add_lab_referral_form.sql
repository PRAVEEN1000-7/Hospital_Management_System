-- ==============================================================================
-- 19 — LAB REFERRAL FORM
--
-- Adds lab_referrals — a printed referral letter lab staff fill in and hand
-- to a patient being sent to an external consultant (e.g. a radiologist for
-- an investigation this hospital doesn't perform in-house, such as a CT
-- scan). Modelled from a real referral letterhead supplied by the customer.
-- This is a printed-document record, not a billable/orderable test, so it's
-- deliberately independent of lab_orders/lab_tests (see 13_add_lab_module.sql)
-- — no price, no queue, no result entry, just who it's addressed to, the case
-- being referred, the investigation requested, remarks, and the referring
-- doctor's name as printed on the letter.
--
-- Safe to run against an existing DB — every statement is idempotent
-- (IF NOT EXISTS).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS lab_referrals (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id            UUID          NOT NULL REFERENCES hospitals(id),
    referral_number        VARCHAR(30)   NOT NULL UNIQUE,
    patient_id             UUID          NOT NULL REFERENCES patients(id),
    recipient_title        VARCHAR(200)  NOT NULL,   -- e.g. "THE CONSULTANT RADIOLOGIST"
    recipient_location     VARCHAR(200),              -- e.g. "GOBI - 638 452"
    case_details           TEXT,                      -- "A case of ..."
    investigation          VARCHAR(200)  NOT NULL,    -- e.g. "CT NECK/THYROID"
    remarks                TEXT,
    referring_doctor_name  VARCHAR(200)  NOT NULL,
    created_by             UUID          REFERENCES users(id),
    created_at             TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_referrals_patient  ON lab_referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_referrals_hospital ON lab_referrals(hospital_id, created_at DESC);
