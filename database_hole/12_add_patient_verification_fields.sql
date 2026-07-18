-- ==============================================================================
-- 12 — PATIENT EMAIL/PHONE VERIFICATION (BRD_OP_1)
--
-- Adds verification status tracking for patient email and mobile number, per
-- Updates/BRD_OP_1.md §3.2 (see Updates/BRD_OP_1_Development_Plan.md Phase 3
-- for the full design). A "verified" checkmark shown against a patient's
-- name across the app requires BOTH is_email_verified AND is_phone_verified
-- to be true (see backend/app/schemas/patient.py computed `is_verified`).
--
-- Email verification (send + confirm) is fully implemented this pass, using
-- a single-use hashed token table mirroring the existing
-- password_reset_tokens pattern (backend/app/models/user.py::PasswordResetToken).
-- Each row carries BOTH a link token (token_hash) and a 6-digit code
-- (code_hash) issued together — the patient can confirm via either the
-- emailed link or by reading the code back to the front desk, per
-- BRD_OP_1.md §3.2.1 ("link or code"). The code path is rate-limited via
-- attempts_count/max_attempts since it's guessable in a way a 32-byte
-- token isn't.
--
-- Phone/SMS OTP verification is OUT OF SCOPE this pass (no SMS gateway
-- integrated, no OTP generation/storage logic built — by explicit decision,
-- not even in log-only mode). is_phone_verified/phone_verified_at exist now
-- so the schema/UI can be built ahead of a future pass that adds real OTP
-- send/verify logic; until then this column stays FALSE for every patient,
-- and the combined checkmark is correctly never shown.
--
-- Safe to run against an existing production DB — purely additive
-- (new nullable/defaulted columns, new table), no drops, no backfill
-- required. Per this project's convention, this file is written but not
-- executed by the assistant — apply manually:
--   psql -U hms_user -d hms_db -f database_hole/12_add_patient_verification_fields.sql
-- ==============================================================================

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS patient_email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    code_hash VARCHAR(64),
    attempts_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_email_verif_patient ON patient_email_verification_tokens(patient_id);

-- If this migration was already applied before code-based verification was
-- added, these ALTERs backfill the new columns on the existing table
-- (the CREATE TABLE above is a no-op once the table exists).
ALTER TABLE patient_email_verification_tokens
    ADD COLUMN IF NOT EXISTS code_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS attempts_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;
