-- Drop database and user for HMS
-- Run with: psql -U postgres -f database_hole/99_drop_database.sql

-- Terminate all active connections to hms_db
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'hms_db';

-- Drop the database
DROP DATABASE IF EXISTS hms_db;

-- Reassign ownership from hms_user to postgres
REASSIGN OWNED BY hms_user TO postgres;

-- Drop any remaining privileges held by hms_user
DROP OWNED BY hms_user;

-- Drop the user role
DROP ROLE IF EXISTS hms_user;
