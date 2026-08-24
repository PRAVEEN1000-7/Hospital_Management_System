-- Machine Prescribed vs Doctor Prescribed split for optical prescriptions —
-- the existing right_sph/right_cyl/right_axis/right_add (and left_*) columns
-- stay as the DOCTOR-prescribed final values (unchanged meaning); these new
-- machine_* columns hold the auto-refractometer/measurement-machine reading
-- taken before the doctor reviews and finalizes. Both are stored and shown
-- separately — see NewOpticalPrescription.tsx / OpticalPrescriptionDetail.tsx.
-- Idempotent.
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS right_machine_sph NUMERIC(5,2);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS right_machine_cyl NUMERIC(5,2);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS right_machine_axis INTEGER;
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS right_machine_add NUMERIC(4,2);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS left_machine_sph NUMERIC(5,2);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS left_machine_cyl NUMERIC(5,2);
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS left_machine_axis INTEGER;
ALTER TABLE optical_prescriptions ADD COLUMN IF NOT EXISTS left_machine_add NUMERIC(4,2);
