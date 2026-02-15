-- Migration: Add profile fields to users table
-- Date: 2026-02-15
-- Description: Adds first_name, last_name, employee_id, department, phone_number, and photo_url fields

-- Add new columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);

-- Create index on employee_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

-- Update existing records: split full_name into first_name and last_name
UPDATE users 
SET first_name = SPLIT_PART(full_name, ' ', 1),
    last_name = CASE 
        WHEN ARRAY_LENGTH(STRING_TO_ARRAY(full_name, ' '), 1) > 1 
        THEN SPLIT_PART(full_name, ' ', ARRAY_LENGTH(STRING_TO_ARRAY(full_name, ' '), 1))
        ELSE SPLIT_PART(full_name, ' ', 1)
    END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Optional: Add check constraint to ensure employee_id format (if needed)
-- ALTER TABLE users ADD CONSTRAINT chk_employee_id_format CHECK (employee_id ~ '^[A-Z]{3}-\d{4}-\d{3}$' OR employee_id IS NULL);
