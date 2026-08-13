-- ==============================================================================
-- SECURITY — access-token revocation blocklist — one-shot patch for an
-- EXISTING database
--
-- IMPORTANT: this schema is NOT missing from 01_full_schema.sql. It's
-- already there in full, as Section 7 ("SECURITY: access-token revocation
-- (blocklist)"). Any BRAND NEW install that runs 01_full_schema.sql fresh
-- already has this table; this file is not part of the normal setup path.
--
-- This file exists for the other case: a database that was already
-- bootstrapped from an OLDER copy of 01_full_schema.sql, before Section 7
-- was added to it. That's exactly what produces the CRITICAL log line seen
-- in production:
--
--   revoked_tokens table is missing — token revocation is NOT enforced.
--   Run database_hole/security_updates.sql against this database.
--
-- That referenced file (security_updates.sql) no longer exists as a
-- standalone file — its content was folded into 01_full_schema.sql as
-- Section 7 (see that file's own "Source: security_updates.sql" comment),
-- but the log message pointing at it was never updated. This file is the
-- extraction back out of that consolidation, safe to run standalone against
-- an existing database — 01_full_schema.sql itself is NOT safe to re-run in
-- full (documented in database_hole/README.md §4 — most of it is plain
-- CREATE TABLE, not idempotent).
--
-- Effect while this table is missing (see backend/app/dependencies.py,
-- services/auth_service.py, core/tenant.py): the app "fails open" rather
-- than 500 every authenticated request — logout, password change, and
-- account deactivation all silently do NOT invalidate the JWT the user
-- already has; it stays valid until it naturally expires (default token
-- lifetime, not "as soon as the user logs out"). Not a request-breaking
-- bug, but a real security gap.
--
-- Safe to run against an existing DB — every statement is individually
-- idempotent (CREATE TABLE/INDEX/VIEW IF NOT EXISTS or OR REPLACE).
-- Wrapped in one transaction so a server run either applies cleanly in full
-- or leaves the schema untouched.
--
-- Run with:
--   psql -h <host> -U <user> -d <db> -v ON_ERROR_STOP=1 -f security_token_revocation_combined.sql
-- ==============================================================================

BEGIN;

-- Every logout / password-change / account-deactivation inserts the `jti` of
-- the still-valid access token here so get_current_user can reject it.
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

-- Fast lookup during /auth/refresh (rotated, single-use refresh tokens).
-- refresh_tokens itself already exists (01_full_schema.sql Section 1) on
-- every database old enough to be missing Section 7 — these two indexes are
-- purely a performance addition on top of it, not a new table.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- Housekeeping view: tokens still blocking that are past expiry. Useful for
-- ops monitoring; CREATE OR REPLACE keeps re-runs clean.
CREATE OR REPLACE VIEW v_revoked_tokens_expired AS
SELECT jti, user_id, revoked_at, expires_at
FROM revoked_tokens
WHERE expires_at < now();

COMMIT;
