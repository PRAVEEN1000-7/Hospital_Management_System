-- ==============================================================================
-- 17 — ENFORCE GLOBAL USERNAME/EMAIL UNIQUENESS
--
-- ROOT CAUSE of "login fails with the correct password" for some hospitals:
-- users.username / users.email are only unique PER HOSPITAL in the base
-- schema (UNIQUE(hospital_id, username), UNIQUE(hospital_id, email)), but
-- authenticate_user() (backend/app/services/auth_service.py) looks a user up
-- by username-or-email ACROSS ALL HOSPITALS with no hospital/tenant filter —
-- the login form only collects username + password, so it has no hospital to
-- scope by. The application layer (routers/users.py, services/tenant_service.py)
-- already enforces global uniqueness for every user created through the app
-- (see the comment at routers/users.py:62), but the DB constraint was never
-- tightened to match, so it can't catch: (a) any row created before that
-- app-level check existed, (b) a direct SQL insert/import that bypassed the
-- app, or (c) a race between two concurrent signups. Whenever two hospitals
-- end up with the same username (e.g. two admins both provisioned as
-- "admin"), login for BOTH becomes non-deterministic — whichever row
-- Postgres returns first for that username gets password-checked, so the
-- correct password for hospital B's account can fail against hospital A's
-- stored hash.
--
-- This migration replaces the composite per-hospital constraints with true
-- global ones, matching what the application already assumes — but only
-- once it has confirmed no existing duplicates would violate them.
--
-- Safe to run against an existing DB. If duplicates are found it does NOT
-- fail the migration — it raises a NOTICE and skips the constraint change so
-- you can resolve the data first, then re-run this file.
-- ==============================================================================

-- Run these on their own first if you want to see exactly which accounts collide:
--
--   SELECT username, array_agg(hospital_id) AS hospital_ids, array_agg(id) AS user_ids
--   FROM users WHERE is_deleted = false
--   GROUP BY username HAVING COUNT(DISTINCT hospital_id) > 1;
--
--   SELECT lower(email) AS email, array_agg(hospital_id) AS hospital_ids, array_agg(id) AS user_ids
--   FROM users WHERE is_deleted = false
--   GROUP BY lower(email) HAVING COUNT(DISTINCT hospital_id) > 1;

DO $$
DECLARE
    dup_usernames INTEGER;
    dup_emails INTEGER;
    r RECORD;
BEGIN
    SELECT COUNT(*) INTO dup_usernames FROM (
        SELECT username FROM users WHERE is_deleted = false
        GROUP BY username HAVING COUNT(DISTINCT hospital_id) > 1
    ) t;

    SELECT COUNT(*) INTO dup_emails FROM (
        SELECT lower(email) AS email FROM users WHERE is_deleted = false
        GROUP BY lower(email) HAVING COUNT(DISTINCT hospital_id) > 1
    ) t;

    IF dup_usernames > 0 OR dup_emails > 0 THEN
        RAISE NOTICE 'Skipping global UNIQUE constraint: % duplicate username group(s) and % duplicate email group(s) span multiple hospitals. Resolve these first (see the queries in this file''s header comment — rename one side or confirm/merge), then re-run this migration.', dup_usernames, dup_emails;
    ELSE
        -- Drop whatever the composite (hospital_id, username)/(hospital_id, email)
        -- unique constraints are actually named (auto-generated names vary by
        -- how the table was created), matched by their columns rather than a
        -- hardcoded name.
        FOR r IN
            SELECT tc.constraint_name, array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) AS cols
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'users' AND tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
            GROUP BY tc.constraint_name
        LOOP
            IF r.cols = ARRAY['hospital_id', 'username'] OR r.cols = ARRAY['hospital_id', 'email'] THEN
                EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', r.constraint_name);
            END IF;
        END LOOP;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key') THEN
            ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
            ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
        END IF;
    END IF;
END $$;
