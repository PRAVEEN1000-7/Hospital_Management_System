-- Fix script: Drop and recreate saas_core schema
-- Run this first, then re-run 05_multi_tenant_schema.sql

DROP SCHEMA IF EXISTS saas_core CASCADE;

-- Now run: psql -U hms_user -d hms_db -f database_hole/05_multi_tenant_schema.sql
