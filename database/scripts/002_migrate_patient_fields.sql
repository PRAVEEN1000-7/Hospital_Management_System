-- Migration Script: Update patients table with new fields
-- Run this ONLY if you already have the old schema in your database.
-- If setting up fresh, just run 001_create_schema.sql instead.

-----------------------------------------------------
-- Step 1: Drop old constraints
-----------------------------------------------------
ALTER TABLE patients DROP CONSTRAINT IF EXISTS chk_mobile_format;

-----------------------------------------------------
-- Step 2: Add new columns
-----------------------------------------------------
ALTER TABLE patients ADD COLUMN IF NOT EXISTS prn VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS title VARCHAR(10);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS country_code VARCHAR(5) DEFAULT '+91';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_country_code VARCHAR(5) DEFAULT '+91';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50);

-----------------------------------------------------
-- Step 3: Migrate data from full_name to first_name/last_name
-----------------------------------------------------
UPDATE patients SET
    title = 'Mr.',
    first_name = SPLIT_PART(full_name, ' ', 1),
    last_name = COALESCE(NULLIF(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1), ''), SPLIT_PART(full_name, ' ', 1))
WHERE first_name IS NULL;

-----------------------------------------------------
-- Step 4: Migrate mobile_number (strip +91 prefix if present)
-----------------------------------------------------
UPDATE patients SET
    country_code = '+91',
    mobile_number = REGEXP_REPLACE(mobile_number, '^\+91', '')
WHERE mobile_number LIKE '+%';

-- Same for emergency contact mobile
UPDATE patients SET
    emergency_contact_country_code = '+91',
    emergency_contact_mobile = REGEXP_REPLACE(emergency_contact_mobile, '^\+91', '')
WHERE emergency_contact_mobile LIKE '+%';

-----------------------------------------------------
-- Step 5: Create PRN sequence and assign PRNs
-----------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS prn_sequence START WITH 1 INCREMENT BY 1;

-- Assign PRNs to existing patients
DO $$
DECLARE
    patient_rec RECORD;
    next_prn INTEGER;
BEGIN
    FOR patient_rec IN SELECT id FROM patients WHERE prn IS NULL ORDER BY id LOOP
        next_prn := nextval('prn_sequence');
        UPDATE patients SET prn = 'HMS-' || LPAD(next_prn::TEXT, 6, '0') WHERE id = patient_rec.id;
    END LOOP;
END $$;

-----------------------------------------------------
-- Step 6: Set NOT NULL constraints on new required columns
-----------------------------------------------------
ALTER TABLE patients ALTER COLUMN prn SET NOT NULL;
ALTER TABLE patients ALTER COLUMN title SET NOT NULL;
ALTER TABLE patients ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE patients ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE patients ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE patients ALTER COLUMN country_code SET DEFAULT '+91';

-----------------------------------------------------
-- Step 7: Add new constraints
-----------------------------------------------------
ALTER TABLE patients ADD CONSTRAINT chk_prn_unique UNIQUE (prn);
ALTER TABLE patients ADD CONSTRAINT chk_title CHECK (title IN ('Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'));
ALTER TABLE patients ADD CONSTRAINT chk_blood_group CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') OR blood_group IS NULL);
ALTER TABLE patients ADD CONSTRAINT chk_mobile_format CHECK (mobile_number ~ '^[6-9][0-9]{9}$');
ALTER TABLE patients ADD CONSTRAINT chk_country_code CHECK (country_code ~ '^\+[0-9]{1,4}$');
ALTER TABLE patients ADD CONSTRAINT chk_emergency_relationship CHECK (
    emergency_contact_relationship IN (
        'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
        'Brother', 'Sister', 'Friend', 'Guardian', 'Other'
    ) OR emergency_contact_relationship IS NULL
);

-----------------------------------------------------
-- Step 8: Add new indexes
-----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_patients_prn ON patients(prn);
DROP INDEX IF EXISTS idx_patients_name;
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(first_name, last_name);

-----------------------------------------------------
-- Step 9: Drop old column (optional - keep for backward compatibility)
-----------------------------------------------------
-- ALTER TABLE patients DROP COLUMN IF EXISTS full_name;
-- Uncomment the line above only after verifying migration is complete

SELECT 'Migration complete! ' || COUNT(*) || ' patients updated.' AS result FROM patients;
