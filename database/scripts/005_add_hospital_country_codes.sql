-- Migration: Add country code support to hospital_details table
-- Description: Enable international phone numbers with country codes
-- Date: 2026-02-11

-- Add country code columns for phone numbers
ALTER TABLE hospital_details 
ADD COLUMN IF NOT EXISTS primary_phone_country_code VARCHAR(5) DEFAULT '+91',
ADD COLUMN IF NOT EXISTS secondary_phone_country_code VARCHAR(5),
ADD COLUMN IF NOT EXISTS emergency_hotline_country_code VARCHAR(5);

-- Update existing records to extract country codes if they exist
-- (For records that might have country codes in the phone field)
UPDATE hospital_details 
SET primary_phone_country_code = '+91' 
WHERE primary_phone_country_code IS NULL;

-- Add constraints for country code format
ALTER TABLE hospital_details 
ADD CONSTRAINT chk_primary_phone_country_code 
CHECK (primary_phone_country_code ~ '^\+[0-9]{1,4}$');

ALTER TABLE hospital_details 
ADD CONSTRAINT chk_secondary_phone_country_code 
CHECK (secondary_phone_country_code ~ '^\+[0-9]{1,4}$' OR secondary_phone_country_code IS NULL);

ALTER TABLE hospital_details 
ADD CONSTRAINT chk_emergency_hotline_country_code 
CHECK (emergency_hotline_country_code ~ '^\+[0-9]{1,4}$' OR emergency_hotline_country_code IS NULL);

-- Make primary phone country code NOT NULL after setting defaults
ALTER TABLE hospital_details 
ALTER COLUMN primary_phone_country_code SET NOT NULL;

-- Update phone number format constraint to accept digits only (no country code in field)
ALTER TABLE hospital_details 
DROP CONSTRAINT IF EXISTS chk_hospital_phone_format;

ALTER TABLE hospital_details 
ADD CONSTRAINT chk_hospital_phone_format 
CHECK (primary_phone ~ '^\d{4,15}$');

-- Make GST and PAN constraints conditional (only for India)
-- These were previously global, now should only apply when country = 'India'
ALTER TABLE hospital_details 
DROP CONSTRAINT IF EXISTS chk_gst_format;

ALTER TABLE hospital_details 
DROP CONSTRAINT IF EXISTS chk_pan_format;

-- Add new conditional constraints - NULL is allowed, or valid format for India
ALTER TABLE hospital_details 
ADD CONSTRAINT chk_gst_format 
CHECK (
    gst_number IS NULL 
    OR gst_number = '' 
    OR (country = 'India' AND gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
    OR country != 'India'
);

ALTER TABLE hospital_details 
ADD CONSTRAINT chk_pan_format 
CHECK (
    pan_number IS NULL 
    OR pan_number = '' 
    OR (country = 'India' AND pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$')
    OR country != 'India'
);

-- Remove India as default country (should be user-selected)
ALTER TABLE hospital_details 
ALTER COLUMN country DROP DEFAULT;

-- Create index for international lookups
CREATE INDEX IF NOT EXISTS idx_hospital_country ON hospital_details(country);

-- Add comment for documentation
COMMENT ON COLUMN hospital_details.primary_phone_country_code IS 'Country calling code for primary phone (e.g., +1, +91, +44)';
COMMENT ON COLUMN hospital_details.secondary_phone_country_code IS 'Country calling code for secondary phone';
COMMENT ON COLUMN hospital_details.emergency_hotline_country_code IS 'Country calling code for emergency hotline';
COMMENT ON CONSTRAINT chk_gst_format ON hospital_details IS 'GST format validation - applies only to Indian hospitals';
COMMENT ON CONSTRAINT chk_pan_format ON hospital_details IS 'PAN format validation - applies only to Indian hospitals';

-- Verification query (uncomment to run after migration)
-- SELECT 
--     hospital_name, 
--     country,
--     primary_phone_country_code,
--     primary_phone,
--     concat(primary_phone_country_code, ' ', primary_phone) as full_phone
-- FROM hospital_details;
