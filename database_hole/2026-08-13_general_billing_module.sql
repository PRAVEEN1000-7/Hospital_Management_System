-- ==============================================================================
-- 2026-08-13 — GENERAL BILLING MODULE
--
-- Registers "General Billing" as a selectable module (Super Admin module
-- toggle + Subscription Plan editor), same mechanism as every other optional
-- module. It is a dependent add-on of Billing — required_modules ensures
-- enabling it for a hospital auto-enables "billing" too (identical pattern
-- to how the 'insurance' module depends on 'billing', see the original seed
-- at database_hole/01_full_schema.sql). No new tables: General Billing
-- invoices are plain Invoice/InvoiceItem rows with invoice_type='general',
-- handled entirely by the existing invoices/payments routers and services.
--
-- Safe to run against an existing DB — idempotent (ON CONFLICT DO NOTHING).
-- ==============================================================================

INSERT INTO saas_core.modules (code, name, description, category, frontend_route_prefix, api_prefix, icon, is_core, required_modules) VALUES
('general_billing', 'General Billing', 'Free-form billing for miscellaneous charges not tied to OPD, Pharmacy, or Optical', 'financial', '/billing/general-billing', '/api/v1/invoices', 'point_of_sale', false, '{"billing"}')
ON CONFLICT (code) DO NOTHING;
