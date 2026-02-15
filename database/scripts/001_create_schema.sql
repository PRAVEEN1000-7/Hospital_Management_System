-- Hospital Management System - Database Schema
-- PostgreSQL 15+

-- Create database (run separately as superuser)
-- CREATE DATABASE hospital_management;

-- Create extension for UUID if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-----------------------------------------------------
-- 1. Users Table
-----------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    employee_id VARCHAR(50) UNIQUE,
    department VARCHAR(100),
    phone_number VARCHAR(20),
    photo_url VARCHAR(500),
    
    CONSTRAINT chk_role CHECK (role IN ('super_admin', 'admin', 'doctor', 'nurse', 'staff', 'receptionist', 'pharmacist', 'cashier', 'inventory_manager'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_department_role ON users(department, role);
CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON users(created_at DESC);

-----------------------------------------------------
-- 1a. Employee ID Sequences
-----------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_employee_doctor START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_nurse START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_admin START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_pharmacist START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_receptionist START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_cashier START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_inventory_manager START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_staff START WITH 1 INCREMENT BY 1;

-----------------------------------------------------
-- 2. Patients Table
-----------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    prn VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(10) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10) NOT NULL,
    blood_group VARCHAR(5),
    country_code VARCHAR(5) NOT NULL DEFAULT '+91',
    mobile_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    pin_code VARCHAR(10),
    country VARCHAR(100) DEFAULT 'India',
    emergency_contact_name VARCHAR(255),
    emergency_contact_country_code VARCHAR(5) DEFAULT '+91',
    emergency_contact_mobile VARCHAR(15),
    emergency_contact_relationship VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_title CHECK (title IN ('Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby')),
    CONSTRAINT chk_gender CHECK (gender IN ('Male', 'Female', 'Other')),
    CONSTRAINT chk_blood_group CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') OR blood_group IS NULL),
    CONSTRAINT chk_dob CHECK (date_of_birth <= CURRENT_DATE),
    CONSTRAINT chk_mobile_format CHECK (mobile_number ~ '^\d{4,15}$'),
    CONSTRAINT chk_country_code CHECK (country_code ~ '^\+[0-9]{1,4}$'),
    CONSTRAINT chk_email_format CHECK (email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' OR email IS NULL),
    CONSTRAINT chk_pin_code CHECK (pin_code ~ '^[A-Za-z0-9 \-]{3,10}$' OR pin_code IS NULL),
    CONSTRAINT chk_emergency_relationship CHECK (
        emergency_contact_relationship IN (
            'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
            'Brother', 'Sister', 'Friend', 'Guardian', 'Other'
        ) OR emergency_contact_relationship IS NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_patients_prn ON patients(prn);
CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients(mobile_number);
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at);

-----------------------------------------------------
-- 2a. PRN Sequence
-----------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS prn_sequence START WITH 1 INCREMENT BY 1;

-----------------------------------------------------
-- 3. Audit Log Table
-----------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id INTEGER REFERENCES users(id),
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-----------------------------------------------------
-- 4. Refresh Tokens Table
-----------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-----------------------------------------------------
-- 5. Functions and Triggers
-----------------------------------------------------

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply to patients table
DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Audit trail trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_values)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_values)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW));
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to patients table
DROP TRIGGER IF EXISTS audit_patients ON patients;
CREATE TRIGGER audit_patients
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
