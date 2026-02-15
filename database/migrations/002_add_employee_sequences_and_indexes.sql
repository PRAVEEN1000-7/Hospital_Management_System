-- Migration: Add employee ID sequences and performance indexes
-- Date: 2026-02-15
-- Description: Creates sequences for employee ID generation and adds performance indexes

-- Create sequences for employee ID generation (per role)
CREATE SEQUENCE IF NOT EXISTS seq_employee_doctor START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_nurse START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_admin START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_pharmacist START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_receptionist START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_cashier START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_inventory_manager START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS seq_employee_staff START WITH 1 INCREMENT BY 1;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_department_role ON users(department, role);
CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON users(created_at DESC);

-- Comment: These composite indexes dramatically improve common query patterns:
-- 1. idx_users_role_active: Fast filtering of active staff by role (most common query)
-- 2. idx_users_department_role: Department-specific staff listings
-- 3. idx_users_created_at_desc: Recent staff additions/reports
