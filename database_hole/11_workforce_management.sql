-- ==============================================================================
-- 11 — WORKFORCE MANAGEMENT — PHASE 0: FOUNDATION PLUMBING
--
-- Companion code for Workforce_Management_Implementation_Plan.md /
-- Workforce_Management_Modules_MWMS_to_HMS.md. Phase 0 only: module registry
-- rows + the new hr_manager system role. No new tables yet — those arrive in
-- Phases 1-3/5 as employee_profiles / holidays / shifts / attendance_records /
-- leave_records / payroll_runs get built.
--
-- Idempotent — ON CONFLICT DO NOTHING / a NOT EXISTS guard, matching the
-- convention in 01_full_schema.sql (module seed) and 06_seed_reference_data.sql
-- (visiting_doctor role seed).
-- ==============================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- 1. MODULE REGISTRY — 6 new opt-in, per-hospital toggleable modules
-- ══════════════════════════════════════════════════════════════════════════

-- Global rows only — same as every other module (lab, optical, analytics, ...).
-- A hospital must still explicitly enable each one via the existing Super
-- Admin "Modules" tab (saas_core.tenant_modules); no tenant_modules rows are
-- seeded here, matching the opt-in-by-default pattern used everywhere else.
INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('employee_management', 'Employee Management', 'Employee profiles, designation, and effective-dated salary history', 'workforce', '/workforce/employees', '/api/v1/employees', 'badge', false, '{}'),
('holiday_management', 'Holiday Management', 'Hospital holiday calendar, used by attendance auto-marking', 'workforce', '/workforce/holidays', '/api/v1/holidays', 'calendar-heart', false, '{"employee_management"}'),
('shift_management', 'Shift Management', 'Shift definitions and employee shift assignment', 'workforce', '/workforce/shifts', '/api/v1/shifts', 'clock', false, '{"employee_management"}'),
('attendance', 'Attendance', 'Daily attendance marking and verification', 'workforce', '/workforce/attendance', '/api/v1/attendance', 'check-square', false, '{"employee_management"}'),
('leave_management', 'Leave Management', 'Employee leave records, balances, and loss-of-pay calculation', 'workforce', '/workforce/leave', '/api/v1/leave', 'calendar-x', false, '{"employee_management"}'),
('payroll', 'Payroll', 'Payroll runs and payslip generation (feed only — no disbursement)', 'workforce', '/workforce/payroll', '/api/v1/payroll', 'wallet', false, '{"employee_management","attendance","leave_management"}')
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. ROLES — hr_manager (global system role, hospital_id IS NULL)
-- ══════════════════════════════════════════════════════════════════════════

-- Follows the exact visiting_doctor precedent (06_seed_reference_data.sql):
-- one global row, not one per hospital — user->role assignment is looked up
-- by name only (user_service.py), so a single row covers every hospital.
INSERT INTO roles (id, hospital_id, name, display_name, description, is_system, is_active)
SELECT
    'e0000000-0000-0000-0000-000000000013', NULL, 'hr_manager',
    'HR Manager',
    'Manages employee records, holidays, shifts, attendance, leave, and payroll — no clinical or billing access.',
    true, true
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE name = 'hr_manager' AND hospital_id IS NULL
);
