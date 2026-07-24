-- ==============================================================================
-- 20 — PURCHASE ORDER PAYMENT SUBMODULE
--
-- Adds a vendor-payment step to the existing Purchase Order lifecycle
-- (see 13_add_lab_module.sql's sibling inventory tables in 01_full_schema.sql:
-- suppliers / purchase_orders / purchase_order_items / goods_receipt_notes).
-- Today a PO's lifecycle stops at goods receipt — there is no record of the
-- hospital actually paying the supplier. This adds:
--
--   * payment_modes           — a per-hospital, admin-manageable directory of
--                                transfer modes (Cash, Cheque, Bank Transfer,
--                                UPI, ...), seeded with sane defaults. Scoped
--                                to this PO payment submodule only — the
--                                existing hardcoded payment-mode lists used by
--                                consultation fees / lab / invoices / optical
--                                sales are untouched.
--   * purchase_order_payments — one row per vendor payment recorded against a
--                                PO (supplier is read via the PO's own
--                                supplier_id — not duplicated here).
--
-- Safe to run against an existing DB — every statement is idempotent
-- (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payment_modes (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id   UUID          NOT NULL REFERENCES hospitals(id),
    name          VARCHAR(50)   NOT NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ   DEFAULT NOW(),
    CONSTRAINT uq_payment_mode_hospital_name UNIQUE (hospital_id, name)
);

CREATE INDEX IF NOT EXISTS idx_payment_modes_hospital ON payment_modes(hospital_id);

-- Seed default modes for every existing hospital.
INSERT INTO payment_modes (hospital_id, name)
SELECT h.id, m.name
FROM hospitals h
CROSS JOIN (VALUES ('Cash'), ('Cheque'), ('Bank Transfer'), ('UPI'), ('NEFT/RTGS'), ('Card'), ('Online')) AS m(name)
ON CONFLICT (hospital_id, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS purchase_order_payments (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id        UUID          NOT NULL REFERENCES hospitals(id),
    purchase_order_id  UUID          NOT NULL REFERENCES purchase_orders(id),
    payment_number     VARCHAR(30)   NOT NULL UNIQUE,
    invoice_number     VARCHAR(50),
    amount             NUMERIC(12,2) NOT NULL,
    payment_mode_id    UUID          NOT NULL REFERENCES payment_modes(id),
    payment_date       DATE          NOT NULL,
    reference_note     TEXT,
    recorded_by        UUID          REFERENCES users(id),
    created_at         TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_payments_po       ON purchase_order_payments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_payments_hospital ON purchase_order_payments(hospital_id, created_at DESC);
