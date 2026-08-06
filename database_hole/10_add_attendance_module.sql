-- ==============================================================================
-- 10 — ATTENDANCE MODULE (catalog registration only)
--
-- Registers 'attendance' in saas_core.modules so it appears as a selectable,
-- non-core module in the Super Admin Subscription Plans editor
-- (SuperAdminPlans.tsx's "Included Modules" grid) and the per-hospital module
-- toggle UI (SuperAdminHospitalDetail.tsx) — no frontend change needed for
-- that, per the existing pattern (see 06_seed_reference_data.sql's 'lab' row).
--
-- This is catalog/registration ONLY: no backend router, no frontend page
-- exists yet for Attendance. The module can be toggled on for a plan/hospital
-- today, but there is nothing behind it until a future migration adds the
-- attendance_records table, service, router, and grid UI.
--
-- Safe to run against an existing DB — idempotent (ON CONFLICT DO NOTHING).
-- ==============================================================================

INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('attendance', 'Attendance', 'Staff attendance marking, verification, and reporting', 'hr', '/attendance', '/api/v1/attendance', 'event_available', false, '{}')
ON CONFLICT (code) DO NOTHING;
