-- Migration Script: Hospital Details Module (Task 4)
-- Merged: Includes country code support for international phone numbers
-- Run this to add hospital configuration table

-----------------------------------------------------
-- 1. Create hospital_details table
-----------------------------------------------------
CREATE TABLE IF NOT EXISTS hospital_details (
    id SERIAL PRIMARY KEY,
    
    -- ============================================
    -- BASIC INFORMATION (Required for ID Cards)
    -- ============================================
    hospital_name VARCHAR(200) NOT NULL,
    hospital_code VARCHAR(20),
    registration_number VARCHAR(50),
    established_date DATE,
    hospital_type VARCHAR(50) DEFAULT 'General',
    
    -- ============================================
    -- CONTACT INFORMATION (Required)
    -- Country codes stored separately from phone numbers
    -- ============================================
    primary_phone_country_code VARCHAR(5) NOT NULL DEFAULT '+91',
    primary_phone VARCHAR(20) NOT NULL,
    secondary_phone_country_code VARCHAR(5),
    secondary_phone VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    emergency_hotline_country_code VARCHAR(5),
    emergency_hotline VARCHAR(20),
    
    -- ============================================
    -- ADDRESS (Required for Patient ID Back Side)
    -- ============================================
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    pin_code VARCHAR(10) NOT NULL,
    
    -- ============================================
    -- BRANDING (Logo for ID Cards & Reports)
    -- ============================================
    logo_path VARCHAR(500),
    logo_filename VARCHAR(255),
    logo_mime_type VARCHAR(50),
    logo_size_kb INTEGER,
    
    -- ============================================
    -- LEGAL & TAX (For Future Invoicing)
    -- ============================================
    gst_number VARCHAR(20),
    pan_number VARCHAR(20),
    drug_license_number VARCHAR(50),
    medical_registration_number VARCHAR(50),
    
    -- ============================================
    -- OPERATIONS (For Future Appointments)
    -- ============================================
    working_hours_start TIME DEFAULT '09:00:00',
    working_hours_end TIME DEFAULT '18:00:00',
    working_days JSONB DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]',
    emergency_24_7 BOOLEAN DEFAULT FALSE,
    
    -- ============================================
    -- METADATA
    -- ============================================
    is_configured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    
    -- ============================================
    -- CONSTRAINTS
    -- ============================================
    -- Phone: digits only (country code stored separately)
    CONSTRAINT chk_hospital_phone_format CHECK (primary_phone ~ '^\d{4,15}$'),
    CONSTRAINT chk_hospital_email_format CHECK (email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
    
    -- Country code format: +N to +NNNN
    CONSTRAINT chk_primary_phone_country_code CHECK (primary_phone_country_code ~ '^\+[0-9]{1,4}$'),
    CONSTRAINT chk_secondary_phone_country_code CHECK (secondary_phone_country_code ~ '^\+[0-9]{1,4}$' OR secondary_phone_country_code IS NULL),
    CONSTRAINT chk_emergency_hotline_country_code CHECK (emergency_hotline_country_code ~ '^\+[0-9]{1,4}$' OR emergency_hotline_country_code IS NULL),
    
    -- GST/PAN: validated only for Indian hospitals, NULL or empty always allowed
    CONSTRAINT chk_gst_format CHECK (
        gst_number IS NULL 
        OR gst_number = '' 
        OR (country = 'India' AND gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
        OR country != 'India'
    ),
    CONSTRAINT chk_pan_format CHECK (
        pan_number IS NULL 
        OR pan_number = '' 
        OR (country = 'India' AND pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$')
        OR country != 'India'
    ),
    
    -- Working hours: end must be after start
    CONSTRAINT chk_hospital_working_hours CHECK (working_hours_end > working_hours_start OR working_hours_end IS NULL OR working_hours_start IS NULL)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_hospital_name ON hospital_details(hospital_name);
CREATE INDEX IF NOT EXISTS idx_hospital_code ON hospital_details(hospital_code);
CREATE INDEX IF NOT EXISTS idx_hospital_configured ON hospital_details(is_configured);
CREATE INDEX IF NOT EXISTS idx_hospital_country ON hospital_details(country);

-- ============================================
-- COLUMN COMMENTS
-- ============================================
COMMENT ON COLUMN hospital_details.primary_phone_country_code IS 'Country calling code for primary phone (e.g., +1, +91, +44)';
COMMENT ON COLUMN hospital_details.secondary_phone_country_code IS 'Country calling code for secondary phone';
COMMENT ON COLUMN hospital_details.emergency_hotline_country_code IS 'Country calling code for emergency hotline';
COMMENT ON CONSTRAINT chk_gst_format ON hospital_details IS 'GST format validation - applies only to Indian hospitals';
COMMENT ON CONSTRAINT chk_pan_format ON hospital_details IS 'PAN format validation - applies only to Indian hospitals';

-----------------------------------------------------
-- 2. Trigger for updated_at
-----------------------------------------------------
DROP TRIGGER IF EXISTS update_hospital_details_updated_at ON hospital_details;
CREATE TRIGGER update_hospital_details_updated_at
    BEFORE UPDATE ON hospital_details
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-----------------------------------------------------
-- 3. Trigger to enforce SINGLE hospital record
-----------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_multiple_hospitals()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM hospital_details WHERE id != COALESCE(NEW.id, 0)) > 0 THEN
        RAISE EXCEPTION 'Only one hospital record is allowed. Use UPDATE to modify existing record.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_single_hospital ON hospital_details;
CREATE TRIGGER enforce_single_hospital
    BEFORE INSERT ON hospital_details
    FOR EACH ROW
    EXECUTE FUNCTION prevent_multiple_hospitals();

-----------------------------------------------------
-- 4. Apply audit trigger to hospital_details
-----------------------------------------------------
DROP TRIGGER IF EXISTS audit_hospital_details ON hospital_details;
CREATE TRIGGER audit_hospital_details
    AFTER INSERT OR UPDATE OR DELETE ON hospital_details
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-----------------------------------------------------
-- 5. Migration complete message
-----------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'Hospital Details table created successfully!';
    RAISE NOTICE 'Table: hospital_details (with country code support)';
    RAISE NOTICE 'Constraints: Only ONE hospital record allowed (no delete from app)';
    RAISE NOTICE 'Country codes: primary_phone_country_code, secondary_phone_country_code, emergency_hotline_country_code';
    RAISE NOTICE 'Next step: Use API to create hospital record via super_admin';
END $$;
