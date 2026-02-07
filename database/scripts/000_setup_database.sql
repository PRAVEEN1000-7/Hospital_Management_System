-- ================================================================
-- Hospital Management System — Initial Database Setup
-- ================================================================
-- PURPOSE: Creates the database, user, and grants permissions.
-- RUN AS:  PostgreSQL superuser (postgres)
--
-- HOW TO RUN:
--   1. Set DB_PASSWORD env var first (or replace the placeholder below)
--
--   Option A — psql command line:
--     set DB_PASSWORD=YourStrongPasswordHere
--     psql -U postgres -v db_pass="'%DB_PASSWORD%'" -f database/scripts/000_setup_database.sql
--
--   Option B — pgAdmin / manual:
--     Replace <CHANGE_ME_DB_PASSWORD> below with your chosen password,
--     then run in the Query Tool connected as postgres.
--
-- IMPORTANT: Do NOT commit this file with a real password!
--
-- AFTER THIS: Run 001_create_schema.sql as hospital_admin.
-- ================================================================

-- 1. Create the application user (skip if already exists)
-- ⚠️  CHANGE the password below before running!
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hospital_admin') THEN
        CREATE ROLE hospital_admin WITH LOGIN PASSWORD '<CHANGE_ME_DB_PASSWORD>';
        RAISE NOTICE 'Created role: hospital_admin  *** CHANGE THE DEFAULT PASSWORD! ***';
    ELSE
        RAISE NOTICE 'Role hospital_admin already exists — skipping';
    END IF;
END
$$;

-- 2. Create the database (skip if already exists)
-- NOTE: CREATE DATABASE cannot run inside a transaction block.
--       If the database already exists, this will raise a notice and continue.
SELECT 'CREATE DATABASE hospital_management OWNER hospital_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hospital_management');
\gexec

-- If the above \gexec didn't run (DB already exists), ensure ownership:
-- ALTER DATABASE hospital_management OWNER TO hospital_admin;

-- 3. Connect to the new database
\connect hospital_management

-- 4. Grant schema permissions (CRITICAL for PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO hospital_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hospital_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hospital_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO hospital_admin;

-- 5. Grant connect
GRANT CONNECT ON DATABASE hospital_management TO hospital_admin;

-- Done!
-- Now run: psql -U hospital_admin -d hospital_management -f database/scripts/001_create_schema.sql
