-- ==============================================================================
-- 24 — PASSWORD RESET TOKENS
--
-- ROOT CAUSE of "Forgot Password" being broken: backend/app/models/user.py
-- defines PasswordResetToken (used live by routers/auth.py's forgot-password
-- / reset-password endpoints), but no prior migration file — including
-- 01_full_schema.sql itself — ever actually created this table. It was only
-- ever mentioned in passing, in a comment in 05_schema_structure.sql,
-- describing patient_email_verification_tokens as mirroring its shape; that
-- comment assumed this table already existed, which it never did.
--
-- Same shape as the model / as refresh_tokens (01_full_schema.sql §2.6).
--
-- Safe to run against an existing DB — idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id),
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);
