-- Confirmatory diagnosis for lab orders — the doctor's diagnosis once lab
-- results come back, distinct from the provisional diagnosis recorded on
-- the prescription at order time. Idempotent.
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS confirmatory_diagnosis TEXT;
