-- ============================================================================
-- HMS — Waitlist Table Migration
-- Run AFTER 01_schema.sql + 02_seed_data.sql
-- ============================================================================
-- Adds the `waitlists` table for managing patients waiting for doctor slots.
-- When a doctor's available slots are all booked, walk-in patients are
-- automatically added to the waitlist instead of being rejected.
-- ============================================================================

CREATE TABLE IF NOT EXISTS waitlists (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id             UUID        NOT NULL REFERENCES hospitals(id),
    patient_id              UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id               UUID        NOT NULL REFERENCES doctors(id),
    department_id           UUID        REFERENCES departments(id),
    preferred_date          DATE        NOT NULL,
    preferred_time          TIME,
    appointment_type        VARCHAR(20) NOT NULL DEFAULT 'walk-in',   -- walk-in, scheduled
    priority                VARCHAR(10) DEFAULT 'normal',             -- normal, urgent, emergency
    chief_complaint         TEXT,
    reason                  TEXT,
    status                  VARCHAR(20) DEFAULT 'waiting',            -- waiting, notified, booked, cancelled, expired
    position                INTEGER     NOT NULL DEFAULT 0,
    booked_appointment_id   UUID        REFERENCES appointments(id),
    notified_at             TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ,
    created_by              UUID        REFERENCES users(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    is_deleted              BOOLEAN     DEFAULT false
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_waitlist_doctor_date
    ON waitlists (doctor_id, preferred_date)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_waitlist_patient
    ON waitlists (patient_id, preferred_date)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_waitlist_status
    ON waitlists (status)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_waitlist_hospital
    ON waitlists (hospital_id, status)
    WHERE is_deleted = false;
