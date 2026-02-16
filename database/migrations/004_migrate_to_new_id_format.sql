-- ============================================================
-- Migration: Convert Old ID Format to New ID Format
-- ============================================================
-- Description: This migration updates all existing IDs to the new format
--              OLD: HMS-000001, DOC-2026-0001 (with hyphens)
--              NEW: HC2026000001, HCDOC2026001 (without hyphens)
-- Date: February 16, 2026
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Ensure Default Hospital Exists
-- ============================================================
-- Update existing hospital to "HMS Core" or insert if not exists
-- This is required for ID generation to work properly

DO $$
DECLARE
    hospital_count INTEGER;
BEGIN
    -- Check if any hospital exists
    SELECT COUNT(*) INTO hospital_count FROM hospital_details;
    
    IF hospital_count = 0 THEN
        -- No hospital exists, insert default
        INSERT INTO hospital_details (
            hospital_name,
            email,
            primary_phone,
            address_line1,
            city,
            state,
            pin_code,
            country,
            is_configured
        ) VALUES (
            'HMS Core',
            'info@hmscore.com',
            '5551234567',
            'Default Hospital Address',
            'Default City',
            'Default State',
            '000000',
            'India',
            false
        );
        RAISE NOTICE 'Created default hospital: HMS Core';
    ELSE
        -- Hospital exists, update name to HMS Core if not already set
        UPDATE hospital_details 
        SET hospital_name = COALESCE(NULLIF(hospital_name, ''), 'HMS Core')
        WHERE id = (SELECT MIN(id) FROM hospital_details);
        RAISE NOTICE 'Hospital already exists, using existing record';
    END IF;
END $$;

-- ============================================================
-- STEP 2: Update Patient PRNs (Registration Numbers)
-- ============================================================
-- Convert from: HMS-000001 → HC2026000001
-- Format: [HOSPITAL_PREFIX][YEAR][6-DIGIT-NUMBER]

DO $$
DECLARE
    hospital_prefix TEXT;
    year_part TEXT := '2026';
    patient_record RECORD;
    old_prn TEXT;
    new_prn TEXT;
    prn_number TEXT;
BEGIN
    -- Get hospital prefix (first letter of each word)
    SELECT string_agg(SUBSTRING(word FROM 1 FOR 1), '')
    INTO hospital_prefix
    FROM (
        SELECT unnest(string_to_array(hospital_name, ' ')) AS word
        FROM hospital_details
        LIMIT 1
    ) words;
    
    -- Default to 'HC' if no hospital found
    IF hospital_prefix IS NULL THEN
        hospital_prefix := 'HC';
    END IF;
    
    RAISE NOTICE 'Using hospital prefix: %', hospital_prefix;
    RAISE NOTICE 'Starting Patient PRN migration...';
    
    -- Update all patients with old format PRNs
    FOR patient_record IN 
        SELECT id, prn 
        FROM patients 
        WHERE prn LIKE '%-%' -- Only update old format with hyphens
    LOOP
        old_prn := patient_record.prn;
        
        -- Extract the numeric part from old PRN (HMS-000001 → 000001)
        prn_number := regexp_replace(old_prn, '^[A-Z]+-', '');
        
        -- Create new PRN: HC2026000001
        new_prn := hospital_prefix || year_part || prn_number;
        
        -- Update the patient record
        UPDATE patients 
        SET prn = new_prn 
        WHERE id = patient_record.id;
        
        RAISE NOTICE 'Updated Patient: % → %', old_prn, new_prn;
    END LOOP;
    
    RAISE NOTICE 'Patient PRN migration completed!';
END $$;

-- ============================================================
-- STEP 3: Update Employee IDs
-- ============================================================
-- Convert from: DOC-2026-0001 → HCDOC2026001
-- Format: [HOSPITAL_PREFIX][ROLE_CODE][YEAR][4-DIGIT-NUMBER]

DO $$
DECLARE
    hospital_prefix TEXT;
    user_record RECORD;
    old_emp_id TEXT;
    new_emp_id TEXT;
    role_code TEXT;
    year_part TEXT;
    emp_number TEXT;
    role_prefix TEXT;
BEGIN
    -- Get hospital prefix (first letter of each word)
    SELECT string_agg(SUBSTRING(word FROM 1 FOR 1), '')
    INTO hospital_prefix
    FROM (
        SELECT unnest(string_to_array(hospital_name, ' ')) AS word
        FROM hospital_details
        LIMIT 1
    ) words;
    
    -- Default to 'HC' if no hospital found
    IF hospital_prefix IS NULL THEN
        hospital_prefix := 'HC';
    END IF;
    
    RAISE NOTICE 'Using hospital prefix: %', hospital_prefix;
    RAISE NOTICE 'Starting Employee ID migration...';
    
    -- Update all users with old format employee IDs
    FOR user_record IN 
        SELECT id, employee_id, role 
        FROM users 
        WHERE employee_id IS NOT NULL 
        AND employee_id LIKE '%-%' -- Only update old format with hyphens
    LOOP
        old_emp_id := user_record.employee_id;
        
        -- Determine role prefix based on user role
        CASE user_record.role
            WHEN 'super_admin' THEN role_prefix := 'SADM';
            WHEN 'admin' THEN role_prefix := 'ADM';
            WHEN 'doctor' THEN role_prefix := 'DOC';
            WHEN 'nurse' THEN role_prefix := 'NUR';
            WHEN 'receptionist' THEN role_prefix := 'REC';
            WHEN 'pharmacist' THEN role_prefix := 'PHA';
            WHEN 'cashier' THEN role_prefix := 'CSH';
            WHEN 'inventory_manager' THEN role_prefix := 'INV';
            ELSE role_prefix := 'STF';
        END CASE;
        
        -- Parse old employee ID (EMP-2024-001 or DOC-2026-0001)
        -- Extract year and number parts
        IF old_emp_id ~ '^[A-Z]+-[0-9]{4}-[0-9]+$' THEN
            -- Format: DOC-2026-0001
            year_part := split_part(old_emp_id, '-', 2);
            emp_number := lpad(split_part(old_emp_id, '-', 3), 4, '0');
        ELSIF old_emp_id ~ '^[A-Z]+-[0-9]+-[0-9]+$' THEN
            -- Format: EMP-2024-001 (old seed data)
            year_part := split_part(old_emp_id, '-', 2);
            emp_number := lpad(split_part(old_emp_id, '-', 3), 4, '0');
        ELSE
            -- Unknown format, skip
            RAISE NOTICE 'Skipping unknown format: %', old_emp_id;
            CONTINUE;
        END IF;
        
        -- Create new employee ID: HCDOC2026001
        new_emp_id := hospital_prefix || role_prefix || year_part || emp_number;
        
        -- Update the user record
        UPDATE users 
        SET employee_id = new_emp_id 
        WHERE id = user_record.id;
        
        RAISE NOTICE 'Updated User (% - %): % → %', 
                     user_record.id, user_record.role, old_emp_id, new_emp_id;
    END LOOP;
    
    RAISE NOTICE 'Employee ID migration completed!';
END $$;

-- ============================================================
-- STEP 4: Verify Migration Results
-- ============================================================

DO $$
DECLARE
    old_format_patients INTEGER;
    old_format_users INTEGER;
    total_patients INTEGER;
    total_users INTEGER;
BEGIN
    -- Count remaining old format records
    SELECT COUNT(*) INTO old_format_patients 
    FROM patients WHERE prn LIKE '%-%';
    
    SELECT COUNT(*) INTO old_format_users 
    FROM users WHERE employee_id LIKE '%-%';
    
    SELECT COUNT(*) INTO total_patients FROM patients;
    SELECT COUNT(*) INTO total_users FROM users WHERE employee_id IS NOT NULL;
    
    -- Display summary
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION SUMMARY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Patients:';
    RAISE NOTICE '  Total: %', total_patients;
    RAISE NOTICE '  Old format remaining: %', old_format_patients;
    RAISE NOTICE '  Migrated: %', total_patients - old_format_patients;
    RAISE NOTICE '';
    RAISE NOTICE 'Employees:';
    RAISE NOTICE '  Total: %', total_users;
    RAISE NOTICE '  Old format remaining: %', old_format_users;
    RAISE NOTICE '  Migrated: %', total_users - old_format_users;
    RAISE NOTICE '========================================';
    
    -- Warn if any old format remains
    IF old_format_patients > 0 THEN
        RAISE WARNING 'Some patients still have old format PRNs!';
    END IF;
    
    IF old_format_users > 0 THEN
        RAISE WARNING 'Some users still have old format employee IDs!';
    END IF;
    
    -- Success message
    IF old_format_patients = 0 AND old_format_users = 0 THEN
        RAISE NOTICE '✓ Migration completed successfully!';
    END IF;
END $$;

-- ============================================================
-- STEP 5: Display Sample Results
-- ============================================================

-- Show sample of migrated patients
SELECT 'PATIENTS (Sample)' AS table_name;
SELECT prn, first_name, last_name, created_at 
FROM patients 
ORDER BY id 
LIMIT 5;

-- Show sample of migrated employees
SELECT 'EMPLOYEES (Sample)' AS table_name;
SELECT employee_id, username, role, full_name 
FROM users 
WHERE employee_id IS NOT NULL 
ORDER BY id 
LIMIT 5;

COMMIT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
-- 
-- USAGE INSTRUCTIONS:
-- -------------------
-- Run this script using PowerShell:
--
-- cd d:\HMS\v1\database
-- $env:PGPASSWORD="HMS@2026"
-- psql -h localhost -U hospital_admin -d hospital_management -f migrations\004_migrate_to_new_id_format.sql
--
-- WHAT THIS SCRIPT DOES:
-- ----------------------
-- 1. Creates/ensures "HMS Core" hospital exists
-- 2. Updates all patient PRNs: HMS-000001 → HC2026000001
-- 3. Updates all employee IDs: DOC-2026-0001 → HCDOC2026001
-- 4. Provides migration summary and verification
-- 5. Shows sample of migrated records
--
-- SAFE TO RUN MULTIPLE TIMES:
-- ---------------------------
-- This script uses ON CONFLICT and WHERE clauses to ensure
-- it only updates old format IDs, making it safe to run
-- multiple times without side effects.
--
-- ============================================================
