-- Bug #55: nothing stopped the same eye prescription from being dispensed
-- (sold) more than once — a second tab, a stale "Dispense" link, or
-- revisiting the prescription detail page could all create a second
-- OpticalSale against the same prescription and decrement stock again.
-- The application now rejects this (optical_service.py::create_sale), but
-- a partial unique index closes the same race at the database level too.
-- Nullable prescription_id (pure walk-in sales with no Rx) is unaffected —
-- a partial index only enforces uniqueness where the column is not null.
--
-- Written only — do not execute automatically; apply manually after review.

CREATE UNIQUE INDEX IF NOT EXISTS uq_optical_orders_prescription_id
  ON optical_orders (optical_prescription_id)
  WHERE optical_prescription_id IS NOT NULL;
