-- ============================================================================
-- HMS — Country Code Support Migration
-- Adds phone country code columns and related indexes/check constraints.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- hospitals
-- --------------------------------------------------------------------------
ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(5);

UPDATE hospitals
SET phone_country_code = COALESCE(NULLIF(phone_country_code, ''), '+1');

ALTER TABLE hospitals
    ALTER COLUMN phone_country_code SET DEFAULT '+1';

ALTER TABLE hospitals
    ALTER COLUMN phone_country_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_hospitals_phone_country_code'
    ) THEN
        ALTER TABLE hospitals
            ADD CONSTRAINT chk_hospitals_phone_country_code
            CHECK (phone_country_code ~ '^\+[0-9]{1,4}$');
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(5);

UPDATE users
SET phone_country_code = COALESCE(NULLIF(phone_country_code, ''), '+1');

ALTER TABLE users
    ALTER COLUMN phone_country_code SET DEFAULT '+1';

ALTER TABLE users
    ALTER COLUMN phone_country_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_users_phone_country_code'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT chk_users_phone_country_code
            CHECK (phone_country_code ~ '^\+[0-9]{1,4}$');
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- doctors
-- --------------------------------------------------------------------------
ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(5);

UPDATE doctors
SET phone_country_code = COALESCE(NULLIF(phone_country_code, ''), '+1');

ALTER TABLE doctors
    ALTER COLUMN phone_country_code SET DEFAULT '+1';

ALTER TABLE doctors
    ALTER COLUMN phone_country_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_doctors_phone_country_code'
    ) THEN
        ALTER TABLE doctors
            ADD CONSTRAINT chk_doctors_phone_country_code
            CHECK (phone_country_code ~ '^\+[0-9]{1,4}$');
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- patients (already present in new schema, kept for backward compatibility)
-- --------------------------------------------------------------------------
ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(5);

UPDATE patients
SET phone_country_code = COALESCE(NULLIF(phone_country_code, ''), '+1');

ALTER TABLE patients
    ALTER COLUMN phone_country_code SET DEFAULT '+1';

ALTER TABLE patients
    ALTER COLUMN phone_country_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_patients_phone_country_code'
    ) THEN
        ALTER TABLE patients
            ADD CONSTRAINT chk_patients_phone_country_code
            CHECK (phone_country_code ~ '^\+[0-9]{1,4}$');
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- suppliers (already present in new schema, kept for backward compatibility)
-- --------------------------------------------------------------------------
ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(5);

UPDATE suppliers
SET phone_country_code = COALESCE(NULLIF(phone_country_code, ''), '+1');

ALTER TABLE suppliers
    ALTER COLUMN phone_country_code SET DEFAULT '+1';

ALTER TABLE suppliers
    ALTER COLUMN phone_country_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_suppliers_phone_country_code'
    ) THEN
        ALTER TABLE suppliers
            ADD CONSTRAINT chk_suppliers_phone_country_code
            CHECK (phone_country_code ~ '^\+[0-9]{1,4}$');
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hospitals_phone_country_code
    ON hospitals(phone_country_code);

CREATE INDEX IF NOT EXISTS idx_users_phone_country_code
    ON users(phone_country_code);

CREATE INDEX IF NOT EXISTS idx_doctors_phone_country_code
    ON doctors(phone_country_code);

CREATE INDEX IF NOT EXISTS idx_patients_phone_country_number
    ON patients(phone_country_code, phone_number)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_suppliers_phone_country
    ON suppliers(phone_country_code, phone);

COMMIT;