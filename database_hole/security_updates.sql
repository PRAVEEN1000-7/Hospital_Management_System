-- ############################################################################
-- HMS Multi-Tenant — SECURITY UPDATES (token revocation + blocklist)
-- ############################################################################
-- Addresses audit findings C1 (logout is a no-op) and C2 (no real refresh-token
-- rotation) from SECURITY_AUDIT.md.
--
-- This migration adds the access-token blocklist table (`revoked_tokens`).
-- The `refresh_tokens` table already exists in the schema (see multi_01_schema.sql
-- / user.py::RefreshToken) and is REUSED as-is for real refresh-token rotation.
--
-- Apply INSIDE the target database (hms_db) as its owner:
--     psql -U hms_user -d hms_db -f security_updates.sql
--
-- Safe to re-run (idempotent).
-- ############################################################################

-- ─────────────────────────────────────────────────────────────────────────────
-- revoked_tokens — access-token (JWT) blocklist
-- ─────────────────────────────────────────────────────────────────────────────
-- Every logout / password-change / account-deactivation inserts the `jti` of the
-- still-valid access token here so `get_current_user` can reject it (C1).
-- Rows are pruned once the underlying token would have expired anyway.
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti           UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL
);

-- Used by prune_expired() housekeeping.
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens (expires_at);

-- Used to revoke all outstanding sessions for a user (password change / disable).
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user_id ON revoked_tokens (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- refresh_tokens — already exists; ensure an index on token_hash for fast
-- lookup during /auth/refresh (rotated, single-use). Safe if already present.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Housekeeping view (optional): tokens still blocking that are past expiry.
-- Useful for ops monitoring; drop-if-exists keeps re-runs clean.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_revoked_tokens_expired AS
SELECT jti, user_id, revoked_at, expires_at
FROM revoked_tokens
WHERE expires_at < now();

-- ############################################################################
-- End of security_updates.sql
-- ############################################################################
