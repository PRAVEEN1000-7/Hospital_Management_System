-- ==============================================================================
-- 07 — QUEUE DISPLAY MULTI-SCREEN CONFIGURATION (BRD-005)
--
-- Adds multi-screen support for the public queue display kiosk. Today a
-- hospital has exactly ONE queue-display config (hospital_settings.queue_
-- display_* columns, added in 02_eye_hospital_updates.sql) and ONE public URL
-- (/public/queue/:hospitalCode). This is purely additive on top of that —
-- the existing single-config columns/route/UI are completely untouched, so
-- any hospital already using the old URL keeps working exactly as before.
--
-- A hospital can now define several named screens (e.g. "Ground Floor",
-- "First Floor Waiting Area"), each with its own department/doctor/token
-- format, each reachable at its own public URL
-- (/public/queue/:hospitalCode/:slug). "Configured" (BRD-005's "enabled after
-- configuration" / "validate mandatory settings") is computed at query time
-- from whether display_name/department_id/doctor_id/slug/token_format are
-- all non-blank — not a stored flag, so it can never drift out of sync.
--
-- Safe to run against an existing DB — every statement is idempotent
-- (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS queue_display_screens (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID          NOT NULL REFERENCES hospitals(id),
    slug            VARCHAR(50)   NOT NULL,              -- URL segment, e.g. "ground-floor"
    display_name    VARCHAR(150)  NOT NULL,               -- "Display Name" — shown as the screen's header
    department_id   UUID          REFERENCES departments(id),  -- "Department"
    doctor_id       UUID          REFERENCES doctors(id),       -- "Doctor" (primary column)
    show_doctor2    BOOLEAN       NOT NULL DEFAULT false,
    doctor2_id      UUID          REFERENCES doctors(id),
    show_pharmacy   BOOLEAN       NOT NULL DEFAULT false,
    show_opthal     BOOLEAN       NOT NULL DEFAULT false,
    token_format    VARCHAR(50)   NOT NULL DEFAULT '#{n}',  -- "Token Format" — display template,
                                                              -- {n} substituted with the token number
    refresh_seconds INTEGER       NOT NULL DEFAULT 10,
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (hospital_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_queue_display_screens_hospital ON queue_display_screens(hospital_id);
