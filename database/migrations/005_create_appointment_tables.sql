-- ============================================================================
-- Migration 005: Appointment Booking System Tables
-- Date: 2026-02-22
-- Description: Creates tables for doctor schedules, appointments, walk-ins,
--              waitlist, appointment settings, and audit logging
-- ============================================================================

BEGIN;

-- 1. Doctor Schedules
CREATE TABLE IF NOT EXISTS doctor_schedules (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration INTEGER NOT NULL DEFAULT 30,
    consultation_type VARCHAR(20) NOT NULL DEFAULT 'both',
    max_patients_per_slot INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(doctor_id, weekday, start_time)
);

CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor ON doctor_schedules(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_weekday ON doctor_schedules(weekday);

-- 2. Blocked Periods (holidays, leaves)
CREATE TABLE IF NOT EXISTS blocked_periods (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255),
    block_type VARCHAR(20) DEFAULT 'leave',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_blocked_periods_doctor ON blocked_periods(doctor_id);
CREATE INDEX IF NOT EXISTS idx_blocked_periods_dates ON blocked_periods(start_date, end_date);

-- 3. Appointments (scheduled + walk-in)
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    appointment_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    appointment_type VARCHAR(20) NOT NULL,
    consultation_type VARCHAR(20) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME,
    slot_duration INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Walk-in specific
    queue_number VARCHAR(20),
    queue_position INTEGER,
    estimated_wait_time INTEGER,
    walk_in_registered_at TIMESTAMP WITH TIME ZONE,
    urgency_level VARCHAR(20),
    
    -- Online consultation
    zoom_meeting_id VARCHAR(255),
    zoom_meeting_link TEXT,
    zoom_password VARCHAR(50),
    
    -- General info
    reason_for_visit TEXT,
    doctor_notes TEXT,
    diagnosis TEXT,
    prescription TEXT,
    fees DECIMAL(10, 2),
    payment_status VARCHAR(20) DEFAULT 'pending',
    
    -- Notifications
    confirmation_sent BOOLEAN DEFAULT FALSE,
    reminder_sent BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    booked_by INTEGER REFERENCES users(id),
    cancelled_by INTEGER REFERENCES users(id),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS appointment_seq START 1;
CREATE SEQUENCE IF NOT EXISTS walk_in_seq START 1;

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_type ON appointments(appointment_type);

-- 4. Waitlist
CREATE TABLE IF NOT EXISTS waitlist (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preferred_date DATE NOT NULL,
    preferred_time TIME,
    consultation_type VARCHAR(20) NOT NULL,
    reason_for_visit TEXT,
    status VARCHAR(20) DEFAULT 'waiting',
    priority INTEGER DEFAULT 0,
    notified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_patient ON waitlist(patient_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_doctor_date ON waitlist(doctor_id, preferred_date);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

-- 5. Appointment Settings
CREATE TABLE IF NOT EXISTS appointment_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    value_type VARCHAR(20) DEFAULT 'string',
    description TEXT,
    is_global BOOLEAN DEFAULT TRUE,
    doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default settings
INSERT INTO appointment_settings (setting_key, setting_value, value_type, description) VALUES
('default_slot_duration', '30', 'integer', 'Default appointment duration in minutes'),
('advance_booking_days', '30', 'integer', 'Maximum days in advance for booking'),
('cancellation_deadline_hours', '24', 'integer', 'Minimum hours before appointment to cancel'),
('buffer_time_minutes', '10', 'integer', 'Buffer time between consecutive appointments'),
('walk_in_enabled', 'true', 'boolean', 'Enable walk-in appointments'),
('max_walk_ins_per_doctor_per_day', '20', 'integer', 'Daily walk-in capacity per doctor'),
('walk_in_priority', 'fifo', 'string', 'Queue priority: fifo or urgent_first'),
('max_queue_length', '50', 'integer', 'Maximum walk-in queue length'),
('reminder_hours_before', '24', 'integer', 'Hours before appointment to send reminder'),
('auto_confirm_appointments', 'true', 'boolean', 'Auto-confirm or require manual confirmation'),
('zoom_enabled', 'false', 'boolean', 'Enable Zoom for online consultations')
ON CONFLICT (setting_key) DO NOTHING;

-- 6. Appointment Audit Log
CREATE TABLE IF NOT EXISTS appointment_audit_log (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    performed_by INTEGER REFERENCES users(id),
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_audit_appointment ON appointment_audit_log(appointment_id);

-- Add updated_at triggers for new tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_doctor_schedules_updated_at ON doctor_schedules;
CREATE TRIGGER update_doctor_schedules_updated_at
    BEFORE UPDATE ON doctor_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointment_settings_updated_at ON appointment_settings;
CREATE TRIGGER update_appointment_settings_updated_at
    BEFORE UPDATE ON appointment_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
