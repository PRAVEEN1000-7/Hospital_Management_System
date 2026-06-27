-- ============================================================================
-- 14_pharmacy_optical_billing_queue.sql
-- Shared billing fields (payment tendered/advance/paid/balance/status) added
-- identically to pharmacy_dispensing and optical_orders, computed by one
-- shared backend helper (billing_queue_service.py) so both modules behave
-- the same way. payment_method/payment_status existed only as hardcoded
-- Python defaults before this — never persisted — now real columns.
--
-- Also adds the sale-triggered dispensing-queue columns used by Optical
-- (OpticalSale.queue_token/queue_status) and consultation_fee for Pharmacy
-- billing (BRD §5.5.1). Pharmacy's own queue is NOT sale-triggered — see
-- 16_pharmacy_queue_entries.sql for that (prescription-triggered instead).
-- ============================================================================

ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash';
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS amount_tendered NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS queue_token INTEGER;
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS queue_status VARCHAR(20) DEFAULT 'waiting';
ALTER TABLE pharmacy_dispensing ADD COLUMN IF NOT EXISTS queue_called_at TIMESTAMPTZ;

ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash';
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS amount_tendered NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS queue_token INTEGER;
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS queue_status VARCHAR(20) DEFAULT 'waiting';
ALTER TABLE optical_orders ADD COLUMN IF NOT EXISTS queue_called_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispensing_queue ON pharmacy_dispensing(hospital_id, queue_status, queue_token);
CREATE INDEX IF NOT EXISTS idx_optical_orders_queue ON optical_orders(hospital_id, queue_status, queue_token);
