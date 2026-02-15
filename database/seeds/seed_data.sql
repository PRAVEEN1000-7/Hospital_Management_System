-- Hospital Management System - Seed Data

-- Create default users
-- Passwords are hashed with bcrypt (rounds=12)
-- Passwords:
--   superadmin: <set your own strong password>
--   admin/doctor1/nurse1: <set your own strong password>
INSERT INTO users (username, email, password_hash, full_name, first_name, last_name, role, employee_id, department, phone_number)
VALUES 
    ('superadmin', 'superadmin@hms.com', '$2b$12$eXcJvdukvD3awfuhvmX0zuCdjxUhryfOw8rKiFWrX0bTYU8D7da.y', 'Super Administrator', 'Super', 'Administrator', 'super_admin', 'EMP-2024-001', 'Administration', '+1-555-0001'),
    ('admin', 'admin@hms.com', '$2b$12$57j65e3svieVI8JtnNUiRe.Q0ejZZ3AW3LLCZWYJp0KKBw0fRMu56', 'System Administrator', 'System', 'Administrator', 'admin', 'EMP-2024-002', 'Administration', '+1-555-0002'),
    ('doctor1', 'doctor1@hms.com', '$2b$12$57j65e3svieVI8JtnNUiRe.Q0ejZZ3AW3LLCZWYJp0KKBw0fRMu56', 'Dr. Sakthivel', 'Sakthivel', 'Kumar', 'doctor', 'EMP-2024-003', 'Cardiology', '+1-555-0003'),
    ('nurse1', 'nurse1@hms.com', '$2b$12$57j65e3svieVI8JtnNUiRe.Q0ejZZ3AW3LLCZWYJp0KKBw0fRMu56', 'Nurse Sharumathi', 'Sharumathi', 'Devi', 'nurse', 'EMP-2024-004', 'General Ward', '+1-555-0004')
ON CONFLICT (username) DO NOTHING;

-- Initialize PRN sequence (start from 1 if not already set)
-- The sequence is created in 001_create_schema.sql

-- Create sample patients
INSERT INTO patients (prn, title, first_name, last_name, date_of_birth, gender, blood_group, country_code, mobile_number, email, address_line1, city, state, pin_code, country, emergency_contact_name, emergency_contact_country_code, emergency_contact_mobile, emergency_contact_relationship, created_by)
VALUES 
    ('HMS-000001', 'Mr.', 'Praveen', 'S', '1985-03-15', 'Male', 'O+', '+91', '9876543210', 'praveen.s@example.com', '123 MG Road', 'Mumbai', 'Maharashtra', '400001', 'India', 'Lakshmi S', '+91', '9876543200', 'Mother', 1),
    ('HMS-000002', 'Mrs.', 'Pavithran', 'K', '1990-07-22', 'Female', 'A+', '+91', '9876543211', 'pavithran@example.com', '456 Anna Salai', 'Chennai', 'Tamil Nadu', '600002', 'India', 'Kumar K', '+91', '9876543201', 'Husband', 1),
    ('HMS-000003', 'Ms.', 'Subhasini', 'R T', '1987-04-18', 'Female', 'B+', '+91', '9999888877', 'subhasini.rt@example.com', '789 Brigade Road', 'Bengaluru', 'Karnataka', '560001', 'India', 'Ramesh T', '+91', '9999888800', 'Father', 1),
    ('HMS-000004', 'Mr.', 'Naveen', 'Raj B', '1992-09-10', 'Male', 'AB-', '+91', '8888777766', 'naveen.raj@example.com', '101 Mount Road', 'Chennai', 'Tamil Nadu', '600018', 'India', 'Priya B', '+91', '8888777700', 'Wife', 1)
ON CONFLICT (mobile_number) DO NOTHING;

-- Advance the PRN sequence to match the seed data
SELECT setval('prn_sequence', 4);
