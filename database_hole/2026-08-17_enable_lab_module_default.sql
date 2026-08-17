-- ==============================================================================
-- 2026-08-17 — ENABLE LAB MODULE BY DEFAULT FOR EVERY HOSPITAL
--
-- Root cause of "Laboratory Tests doesn't show up for some doctors": the lab
-- test catalog itself was already fully seeded for every hospital (33-37
-- active tests each, confirmed) — the actual gap was that most tenants had
-- no saas_core.tenant_modules row (or a disabled one) for the 'lab' module,
-- so is_module_enabled('lab') returned false and PrescriptionBuilder.tsx's
-- entire "Laboratory Tests" card never rendered for their doctors at all,
-- regardless of how full the catalog was.
--
--   1. Adds the 'lab' module to every subscription plan's modules_included
--      array — so any FUTURE hospital that signs up under an existing plan
--      gets it auto-enabled the normal way (tenant_service._enable_modules_for_plan),
--      not just a one-time backfill.
--   2. Enables 'lab' for every EXISTING tenant. Never force-disables anything
--      — only ever flips a missing/disabled row to enabled, same "only
--      upgrade" rule tenant_service.py's own module-enable logic already
--      follows, so a hospital that had it explicitly turned off by a
--      superadmin stays consistent with everywhere else that rule applies.
--
-- Idempotent — safe to re-run.
-- ==============================================================================

UPDATE saas_core.subscription_plans sp
SET modules_included = array_append(sp.modules_included, m.id)
FROM saas_core.modules m
WHERE m.code = 'lab'
  AND NOT (m.id = ANY(sp.modules_included));

INSERT INTO saas_core.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
SELECT t.id, m.id, true, NOW()
FROM saas_core.tenants t
CROSS JOIN saas_core.modules m
WHERE m.code = 'lab'
ON CONFLICT (tenant_id, module_id) DO UPDATE
    SET is_enabled = true,
        enabled_at = COALESCE(saas_core.tenant_modules.enabled_at, NOW())
    WHERE saas_core.tenant_modules.is_enabled = false;
