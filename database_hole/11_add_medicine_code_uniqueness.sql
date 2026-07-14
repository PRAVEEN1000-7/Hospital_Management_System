-- ==============================================================================
-- 11 — Enforce uniqueness on auto-generated medicine codes (sku)
--
-- Medicine codes are now server-generated in the format
-- {HOSPITAL_CODE}MD{TYPE_LETTER}_{SEQ:03d} (e.g. QXMDT_001) — see
-- pharmacy_service.generate_medicine_code(). The application already
-- guarantees uniqueness on generation (collision-retry loop), but there was
-- no database-level guarantee backing that. This adds one, matching the
-- same pattern already used for supplier codes (uq_supplier_code_hospital).
--
-- Uses a partial unique index — NULL and blank sku values (existing
-- medicines created before this feature) are excluded from the uniqueness
-- check entirely, so this applies cleanly without needing to touch/backfill
-- any historical data.
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_medicine_sku_hospital
    ON medicines (hospital_id, sku)
    WHERE sku IS NOT NULL AND sku <> '';
