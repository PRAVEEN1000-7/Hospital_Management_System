-- Bug #55: nothing stopped the same eye prescription from being dispensed
-- (sold) more than once — a second tab, a stale "Dispense" link, or
-- revisiting the prescription detail page could all create a second
-- OpticalSale against the same prescription and decrement stock again.
-- The application now rejects this (optical_service.py::create_sale), but
-- this adds the same rule at the database level too, as defense in depth.
--
-- A plain UNIQUE INDEX was tried first and rejected: it requires every
-- EXISTING row to already satisfy uniqueness, and some hospitals' data
-- already has a prescription dispensed twice from before the application
-- check existed. A BEFORE INSERT trigger only validates NEW rows going
-- forward, so it can be created immediately without touching, deleting, or
-- reconciling any pre-existing row — old data is left exactly as it is.
--
-- Written only — do not execute automatically; apply manually after review.

CREATE OR REPLACE FUNCTION prevent_duplicate_optical_dispensing() RETURNS trigger AS $$
BEGIN
    IF NEW.optical_prescription_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM optical_orders
        WHERE optical_prescription_id = NEW.optical_prescription_id
          AND id <> NEW.id
    ) THEN
        RAISE EXCEPTION 'This prescription has already been dispensed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_optical_dispensing ON optical_orders;
CREATE TRIGGER trg_prevent_duplicate_optical_dispensing
    BEFORE INSERT ON optical_orders
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_optical_dispensing();
