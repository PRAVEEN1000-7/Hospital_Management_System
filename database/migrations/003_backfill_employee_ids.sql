-- Backfill: Generate employee IDs for existing users
-- Date: 2026-02-15
-- Description: Assigns employee IDs to existing users who don't have one

-- Backfill existing users with employee IDs based on their roles
-- Note: This uses the sequences created in 002_add_employee_sequences_and_indexes.sql

-- Update super_admin users
UPDATE users 
SET employee_id = 'ADM-2024-' || LPAD(nextval('seq_employee_admin')::text, 4, '0')
WHERE role = 'super_admin' AND (employee_id IS NULL OR employee_id = '');

-- Update admin users
UPDATE users 
SET employee_id = 'ADM-2024-' || LPAD(nextval('seq_employee_admin')::text, 4, '0')
WHERE role = 'admin' AND (employee_id IS NULL OR employee_id = '');

-- Update doctor users
UPDATE users 
SET employee_id = 'DOC-2024-' || LPAD(nextval('seq_employee_doctor')::text, 4, '0')
WHERE role = 'doctor' AND (employee_id IS NULL OR employee_id = '');

-- Update nurse users
UPDATE users 
SET employee_id = 'NUR-2024-' || LPAD(nextval('seq_employee_nurse')::text, 4, '0')
WHERE role = 'nurse' AND (employee_id IS NULL OR employee_id = '');

-- Update pharmacist users
UPDATE users 
SET employee_id = 'PHA-2024-' || LPAD(nextval('seq_employee_pharmacist')::text, 4, '0')
WHERE role = 'pharmacist' AND (employee_id IS NULL OR employee_id = '');

-- Update receptionist users
UPDATE users 
SET employee_id = 'REC-2024-' || LPAD(nextval('seq_employee_receptionist')::text, 4, '0')
WHERE role = 'receptionist' AND (employee_id IS NULL OR employee_id = '');

-- Update cashier users
UPDATE users 
SET employee_id = 'CSH-2024-' || LPAD(nextval('seq_employee_cashier')::text, 4, '0')
WHERE role = 'cashier' AND (employee_id IS NULL OR employee_id = '');

-- Update inventory_manager users
UPDATE users 
SET employee_id = 'INV-2024-' || LPAD(nextval('seq_employee_inventory_manager')::text, 4, '0')
WHERE role = 'inventory_manager' AND (employee_id IS NULL OR employee_id = '');

-- Update staff users
UPDATE users 
SET employee_id = 'STF-2024-' || LPAD(nextval('seq_employee_staff')::text, 4, '0')
WHERE role = 'staff' AND (employee_id IS NULL OR employee_id = '');

-- Verify results
SELECT id, username, role, employee_id, first_name, last_name
FROM users
ORDER BY id;
