-- ==============================================================================
-- 14 — OPD SESSION TIMINGS (configurable)
--
-- Adds the clinic's standard morning/evening OPD session times as hospital
-- settings so the Doctor Schedule form can pre-fill start/break/end from them
-- (start = morning start, break = morning end → evening start, end = evening
-- end) instead of the previously hardcoded 09:00–17:00 defaults in
-- frontend/src/pages/DoctorSchedule.tsx.
--
-- Stored as VARCHAR(5) 'HH:MM' (24h) to match the <input type="time"> values
-- the frontend sends and the string times the schedule form already uses.
--
-- Safe to run against an existing DB — every statement is idempotent
-- (ADD COLUMN IF NOT EXISTS).
-- ==============================================================================

ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_morning_start_time VARCHAR(5) DEFAULT '10:00';
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_morning_end_time   VARCHAR(5) DEFAULT '14:00';
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_evening_start_time VARCHAR(5) DEFAULT '17:00';
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS opd_evening_end_time   VARCHAR(5) DEFAULT '20:30';

-- Backfill any existing rows whose new columns are NULL (older rows created
-- before these columns existed) with the standard defaults.
UPDATE hospital_settings SET opd_morning_start_time = '10:00' WHERE opd_morning_start_time IS NULL;
UPDATE hospital_settings SET opd_morning_end_time   = '14:00' WHERE opd_morning_end_time   IS NULL;
UPDATE hospital_settings SET opd_evening_start_time = '17:00' WHERE opd_evening_start_time IS NULL;
UPDATE hospital_settings SET opd_evening_end_time   = '20:30' WHERE opd_evening_end_time   IS NULL;
