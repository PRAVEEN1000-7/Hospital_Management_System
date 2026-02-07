-- Migration: Add photo_url column to patients table
-- Run this after 002_migrate_patient_fields.sql

-- Add photo_url column
ALTER TABLE patients ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);

-- Comment
COMMENT ON COLUMN patients.photo_url IS 'URL path to patient photo (relative to uploads directory)';
