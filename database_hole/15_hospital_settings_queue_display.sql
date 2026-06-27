-- ============================================================================
-- 15_hospital_settings_queue_display.sql
-- Queue Display "Customization Settings" (BRD v1.1 §3.4, QD-04/05/06) —
-- per-hospital plug-and-play column toggles, refresh interval, and the two
-- doctor slots, so column headers show real doctor names instead of
-- hardcoded "Doctor 1"/"Doctor 2" labels. Eye-hospital feature pack only.
-- ============================================================================

ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_show_doctor2 BOOLEAN DEFAULT TRUE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_show_pharmacy BOOLEAN DEFAULT TRUE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_show_opthal BOOLEAN DEFAULT TRUE;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_refresh_seconds INTEGER DEFAULT 10;
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_doctor1_id UUID REFERENCES doctors(id);
ALTER TABLE hospital_settings ADD COLUMN IF NOT EXISTS queue_display_doctor2_id UUID REFERENCES doctors(id);
