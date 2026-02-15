-- Migration Script: Global support + User Management enhancements
-- Run this AFTER 001_create_schema.sql and optionally 002_migrate_patient_fields.sql

-----------------------------------------------------
-- 1. Update user roles to include super_admin and other roles
-----------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_role;
ALTER TABLE users ADD CONSTRAINT chk_role CHECK (
    role IN ('super_admin', 'admin', 'doctor', 'nurse', 'staff', 'receptionist', 'pharmacist', 'cashier', 'inventory_manager')
);

-----------------------------------------------------
-- 2. Update mobile number constraint for global support
--    Old: ^[6-9][0-9]{9}$  (India only)
--    New: ^\d{4,15}$       (Global: 4-15 digits)
-----------------------------------------------------
ALTER TABLE patients DROP CONSTRAINT IF EXISTS chk_mobile_format;
ALTER TABLE patients ADD CONSTRAINT chk_mobile_format CHECK (mobile_number ~ '^\d{4,15}$');

-----------------------------------------------------
-- 3. Update PIN code constraint for global support
--    Old: ^[1-9][0-9]{5}$  (India only)
--    New: ^[A-Za-z0-9 \-]{3,10}$  (Global postal codes)
-----------------------------------------------------
ALTER TABLE patients DROP CONSTRAINT IF EXISTS chk_pin_code;
ALTER TABLE patients ADD CONSTRAINT chk_pin_code CHECK (
    pin_code ~ '^[A-Za-z0-9 \-]{3,10}$' OR pin_code IS NULL
);

-----------------------------------------------------
-- 4. Insert default Super Admin user
--    Password: <set your own>  (bcrypt hash with rounds=12)
-----------------------------------------------------
INSERT INTO users (username, email, password_hash, full_name, role)
VALUES (
    'superadmin',
    'superadmin@hms.com',
    '$2b$12$eXcJvdukvD3awfuhvmX0zuCdjxUhryfOw8rKiFWrX0bTYU8D7da.y',
    'Super Administrator',
    'super_admin'
)
ON CONFLICT (username) DO UPDATE SET role = 'super_admin';

-- Also upgrade existing admin to super_admin if desired
-- UPDATE users SET role = 'super_admin' WHERE username = 'admin';

-----------------------------------------------------
-- 5. Verify changes
-----------------------------------------------------
SELECT 'Migration 003 complete.' AS status;
SELECT username, role, is_active FROM users ORDER BY id;
