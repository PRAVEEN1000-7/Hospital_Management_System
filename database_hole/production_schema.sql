-- ==============================================================================
-- PRODUCTION SCHEMA -- the ENTIRE, current database structure in one file
--
-- Generated via `pg_dump --schema-only` against this project's own local
-- database, which already has every schema migration in this folder applied
-- (01_full_schema.sql, 02_eye_hospital_updates.sql, 05, 07, 08, 09, 14, 15,
-- 16, security_token_revocation_combined.sql, workforce_attendance_module_
-- combined.sql, and every dated column-adding migration through the most
-- recent one). This is the authoritative end-state, not a hand-merged copy --
-- generating it from the live database avoids the risk of a manual merge
-- missing something across 15+ separate migration files.
--
-- STRUCTURE: raw pg_dump groups statements by TYPE (every CREATE TABLE, then
-- every constraint, then every index, in separate blocks) -- correct SQL, but
-- reads like a patch trail. This file is the same pg_dump-emitted statements,
-- restructured for a fresh-database build instead:
--   1. Extension, schemas, functions.
--   2. TABLES, grouped by application module (Core/Auth, Patients/Clinical,
--      Billing/Inventory, Pharmacy, Lab, Optical, Workforce/Payroll, SaaS
--      Platform -- see the "MODULE:" banners below). Each table is a single
--      CREATE TABLE -- primary key, unique, and check constraints are
--      written directly into the column list (not a separate ALTER TABLE
--      afterwards), since those only ever reference the table's own
--      columns. Its indexes, triggers, comments, and RLS policies follow
--      right after -- one finalized, readable block per table.
--   3. FOREIGN KEYS, in the same module/table order as the TABLES section.
--      These stay as ALTER TABLE ADD CONSTRAINT and can't be inlined: many
--      tables here reference each other in both directions (e.g.
--      hospitals.created_by -> users.id and users.hospital_id ->
--      hospitals.id), so no table-creation order lets every FK be written
--      inline -- Postgres itself requires creating bare tables first and
--      attaching cross-referencing FKs after, which is what this section is.
--   4. VIEWS (must come last -- they query the tables above).
-- Nothing was hand-transcribed; every statement below is verbatim pg_dump
-- output, only reordered.
--
-- Deploying to a brand-new server now takes exactly 2 files, in this order:
--   1. psql -U hms_user -d hms_db -f database_hole/production_schema.sql
--   2. psql -U hms_user -d hms_db -f database_hole/seed_production_essentials.sql
-- Then create your Super Admin login (see seed_production_essentials.sql's
-- own closing comment) and log in to create your first real hospital.
--
-- Covers both the `public` schema (core HMS tables) and `saas_core` (the
-- multi-tenant platform layer) -- every table, index, function, trigger,
-- view, and Row-Level Security policy currently in use. No data -- this is
-- schema only, exactly like 01_full_schema.sql was.
--
-- Every individual numbered/dated migration file in this folder is UNCHANGED
-- and still here -- this file doesn't replace or delete any of them, it's an
-- additional, consolidated alternative to running them one by one. Use
-- whichever path is more convenient: this single file for a new server, or
-- the step-by-step migrations in README.md if you're patching an existing
-- one incrementally.
--
-- ATOMIC: the whole file runs inside one BEGIN;/COMMIT; transaction. On a
-- genuinely fresh database it applies in full or not at all -- no partial
-- schema left behind if something fails partway through. Intended for a
-- fresh database only: CREATE TABLE/INDEX/SCHEMA are IF-NOT-EXISTS guarded
-- (primary key/unique/check constraints ride along with CREATE TABLE, since
-- they're written inline), but the FOREIGN KEY section's ALTER TABLE ADD
-- CONSTRAINT statements have no such guard -- Postgres has no "IF NOT
-- EXISTS" for constraints -- so re-running this file against a database
-- that already has this schema will fail and roll back the whole
-- transaction (harmless, but it won't get you further seed data either).
-- For patching an existing, differently-shaped database, use the
-- incremental migrations in README.md instead, same as 01_full_schema.sql
-- itself was never meant to be re-run over an existing database.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- ==============================================================================
-- PRODUCTION SCHEMA -- the ENTIRE, current database structure in one file
--
-- Generated via `pg_dump --schema-only` against this project's own local
-- database, which already has every schema migration in this folder applied
-- (01_full_schema.sql, 02_eye_hospital_updates.sql, 05, 07, 08, 09, 14, 15,
-- 16, security_token_revocation_combined.sql, workforce_attendance_module_
-- combined.sql, and every dated column-adding migration through the most
-- recent one). This is the authoritative end-state, not a hand-merged copy --
-- generating it from the live database avoids the risk of a manual merge
-- missing something across 15+ separate migration files.
--
-- LAYOUT: raw pg_dump groups statements by TYPE (every CREATE TABLE, then
-- every constraint, then every index, in separate blocks) -- correct SQL, but
-- reads like a patch trail. This file is the same pg_dump-emitted statements,
-- reordered by TABLE instead: each table appears exactly once, and its own
-- primary key, unique/check constraints, indexes, triggers, comments, RLS
-- policies, and foreign keys all sit directly beneath its CREATE TABLE -- one
-- finalized, readable block per table. Nothing was hand-transcribed; every
-- statement below is verbatim pg_dump output, only moved.
--
-- Deploying to a brand-new server now takes exactly 2 files, in this order:
--   1. psql -U hms_user -d hms_db -f database_hole/production_schema.sql
--   2. psql -U hms_user -d hms_db -f database_hole/seed_production_essentials.sql
-- Then create your Super Admin login (see seed_production_essentials.sql's
-- own closing comment) and log in to create your first real hospital.
--
-- Covers both the `public` schema (core HMS tables) and `saas_core` (the
-- multi-tenant platform layer) -- every table, sequence, index, function,
-- trigger, view, and Row-Level Security policy currently in use. No data --
-- this is schema only, exactly like 01_full_schema.sql was.
--
-- Every individual numbered/dated migration file in this folder is UNCHANGED
-- and still here -- this file doesn't replace or delete any of them, it's an
-- additional, consolidated alternative to running them one by one. Use
-- whichever path is more convenient: this single file for a new server, or
-- the step-by-step migrations in README.md if you're patching an existing
-- one incrementally.
--
-- Safe to re-run CREATE TABLE/INDEX/SCHEMA statements against a database
-- that already has them (all use IF NOT EXISTS). The ADD CONSTRAINT
-- statements (primary keys, foreign keys, unique/check constraints) are
-- plain pg_dump output and are NOT re-run-safe -- pg_dump itself doesn't
-- guard those with IF NOT EXISTS, and Postgres has no such guard for them.
-- Run this file exactly once per database. For patching an existing,
-- differently-shaped database, use the incremental migrations in README.md
-- instead, same as 01_full_schema.sql itself was never meant to be re-run
-- over an existing database.
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- ==============================================================================
-- PRODUCTION SCHEMA — the ENTIRE, current database structure in one file
--
-- Generated via `pg_dump --schema-only` against this project's own local
-- database, which already has every schema migration in this folder applied
-- (01_full_schema.sql, 02_eye_hospital_updates.sql, 05, 07, 08, 09, 14, 15,
-- 16, security_token_revocation_combined.sql, workforce_attendance_module_
-- combined.sql, and every dated column-adding migration through the most
-- recent one). This is the authoritative end-state, not a hand-merged copy —
-- generating it from the live database avoids the risk of a manual merge
-- missing something across 15+ separate migration files.
--
-- Deploying to a brand-new server now takes exactly 2 files, in this order:
--   1. psql -U hms_user -d hms_db -f database_hole/production_schema.sql
--   2. psql -U hms_user -d hms_db -f database_hole/seed_production_essentials.sql
-- Then create your Super Admin login (see seed_production_essentials.sql's
-- own closing comment) and log in to create your first real hospital.
--
-- Covers both the `public` schema (core HMS tables) and `saas_core` (the
-- multi-tenant platform layer) — every table, sequence, index, function,
-- trigger, view, and Row-Level Security policy currently in use. No data —
-- this is schema only, exactly like 01_full_schema.sql was.
--
-- Every individual numbered/dated migration file in this folder is UNCHANGED
-- and still here — this file doesn't replace or delete any of them, it's an
-- additional, consolidated alternative to running them one by one. Use
-- whichever path is more convenient: this single file for a new server, or
-- the step-by-step migrations in README.md if you're patching an existing
-- one incrementally.
--
-- Safe to re-run against a database that already has this exact schema —
-- CREATE SCHEMA/TABLE/INDEX/etc. all use IF NOT EXISTS or an equivalent
-- guard, matching every other file in this folder. NOT safe to run against a
-- database with an OLDER or DIFFERENT schema shape already in it — for that
-- case use the incremental migrations instead (see README.md), the same way
-- 01_full_schema.sql itself was never meant to be re-run over an existing,
-- differently-shaped database.
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--
CREATE SCHEMA IF NOT EXISTS public;
--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--
COMMENT ON SCHEMA public IS 'standard public schema';
--
-- Name: saas_core; Type: SCHEMA; Schema: -; Owner: -
--
CREATE SCHEMA IF NOT EXISTS saas_core;
SET default_table_access_method = heap;

-- ==============================================================================
-- FUNCTIONS (declared before tables since triggers below reference them)
-- ==============================================================================

-- ==============================================================================
-- FUNCTIONS (declared before tables since triggers below reference them)
-- ==============================================================================

-- ==============================================================================
-- FUNCTIONS (declared before tables since triggers below reference them)
-- ==============================================================================

--
-- Name: cleanup_expired_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.cleanup_expired_rate_limits() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM saas_core.rate_limit_buckets 
    WHERE expires_at < NOW();
END;
$$;

--
-- Name: hms_calculate_checksum(character varying); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.hms_calculate_checksum(prefix character varying) RETURNS character
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    total   INTEGER := 0;
    i       INTEGER;
    ch      CHAR(1);
    val     INTEGER;
    check_val INTEGER;
BEGIN
    -- prefix must be exactly 6 characters: HHGYYM
    IF LENGTH(prefix) != 6 THEN
        RAISE EXCEPTION 'Prefix must be exactly 6 characters, got %', LENGTH(prefix);
    END IF;

    FOR i IN 1..6 LOOP
        ch := UPPER(SUBSTRING(prefix FROM i FOR 1));
        IF ch >= '0' AND ch <= '9' THEN
            val := ASCII(ch) - ASCII('0');
        ELSE
            val := ASCII(ch) - 55;   -- A=10, B=11, ...
        END IF;
        total := total + val * i;
    END LOOP;

    check_val := total % 36;
    IF check_val < 10 THEN
        RETURN CHR(ASCII('0') + check_val);
    ELSE
        RETURN CHR(55 + check_val);    -- 10=A, 11=B, ...
    END IF;
END;
$$;

--
-- Name: hms_generate_id(uuid, character, character varying, character, character, character); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.hms_generate_id(p_hospital_id uuid, p_hospital_code character, p_entity_type character varying, p_gender_code character, p_year_code character, p_month_code character) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sequence  INTEGER;
    v_prefix    VARCHAR(6);
    v_checksum  CHAR(1);
    v_id        VARCHAR(12);
BEGIN
    -- Upsert the sequence row and get next value
    INSERT INTO id_sequences (hospital_id, hospital_code, entity_type, role_gender_code, year_code, month_code, last_sequence)
    VALUES (p_hospital_id, p_hospital_code, p_entity_type, p_gender_code, p_year_code, p_month_code, 1)
    ON CONFLICT (hospital_id, entity_type, role_gender_code, year_code, month_code)
    DO UPDATE SET last_sequence = id_sequences.last_sequence + 1, updated_at = NOW()
    RETURNING last_sequence INTO v_sequence;

    -- Build prefix: HH + G + YY + M
    v_prefix := p_hospital_code || p_gender_code || p_year_code || p_month_code;

    -- Calculate checksum
    v_checksum := hms_calculate_checksum(v_prefix);

    -- Build final 12-digit ID
    v_id := v_prefix || v_checksum || LPAD(v_sequence::TEXT, 5, '0');

    RETURN v_id;
END;
$$;

--
-- Name: prevent_duplicate_optical_dispensing(); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.prevent_duplicate_optical_dispensing() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.optical_prescription_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM optical_orders
        WHERE optical_prescription_id = NEW.optical_prescription_id
          AND id <> NEW.id
    ) THEN
        RAISE EXCEPTION 'This prescription has already been dispensed';
    END IF;
    RETURN NEW;
END;
$$;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ==============================================================================
-- TABLES -- grouped by module below. Primary key, unique, and check
-- constraints are written directly inside each CREATE TABLE (a single
-- CREATE statement per table, not CREATE-then-ALTER) since those constraint
-- kinds only ever reference the table's own columns -- no ordering problem.
-- Indexes, triggers, comments, and row-level security for the table follow
-- right after it. Foreign keys are the one exception, in their own section
-- further down: several tables here reference each other in both
-- directions (e.g. hospitals.created_by -> users.id and
-- users.hospital_id -> hospitals.id), so no single table-creation order
-- lets every FK be inlined at creation time -- Postgres itself requires
-- creating the bare tables first and attaching those FKs after.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- MODULE: CORE / AUTH / RBAC / HOSPITAL SETTINGS
-- ------------------------------------------------------------------------------

-- ==============================================================================
-- TABLES -- grouped by module below. Each table's full, finalized definition
-- (columns, primary key, unique/check constraints, indexes, triggers,
-- comments, row-level security) is all together under its own CREATE TABLE.
-- Foreign keys are in their own section further down, after every table
-- exists -- a table's FK can reference a table defined later in this file,
-- so they can't safely live up here.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- MODULE: CORE / AUTH / RBAC / HOSPITAL SETTINGS
-- ------------------------------------------------------------------------------

--
-- Name: hospitals; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.hospitals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(20) NOT NULL,
    logo_url character varying(500),
    address_line_1 character varying(255),
    address_line_2 character varying(255),
    city character varying(100),
    state_province character varying(100),
    postal_code character varying(20),
    country character varying(3) DEFAULT 'USA'::character varying NOT NULL,
    phone character varying(20),
    email character varying(255),
    website character varying(255),
    timezone character varying(50) DEFAULT 'UTC'::character varying NOT NULL,
    default_currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    tax_id character varying(50),
    registration_number character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    specialty character varying(30) DEFAULT 'general'::character varying NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    gstin character varying(15),
    gst_registration_status character varying(20) DEFAULT 'registered'::character varying,
    CONSTRAINT hospitals_specialty_check CHECK (((specialty)::text = ANY ((ARRAY['general'::character varying, 'eye_hospital'::character varying, 'multi_specialty'::character varying])::text[]))),
    CONSTRAINT hospitals_pkey PRIMARY KEY (id),
    CONSTRAINT hospitals_code_key UNIQUE (code)
);
--
-- Name: idx_hospitals_tenant_active; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_hospitals_tenant_active ON public.hospitals USING btree (tenant_id, is_active);
--
-- Name: idx_hospitals_tenant_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_hospitals_tenant_id ON public.hospitals USING btree (tenant_id);

--
-- Name: hospital_settings; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.hospital_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    hospital_code character(2) NOT NULL,
    patient_id_start_number integer DEFAULT 1,
    patient_id_sequence integer DEFAULT 0,
    staff_id_start_number integer DEFAULT 1,
    staff_id_sequence integer DEFAULT 0,
    invoice_prefix character varying(10) DEFAULT 'INV'::character varying,
    invoice_sequence integer DEFAULT 0,
    prescription_prefix character varying(10) DEFAULT 'RX'::character varying,
    prescription_sequence integer DEFAULT 0,
    appointment_slot_duration_minutes integer DEFAULT 15,
    appointment_buffer_minutes integer DEFAULT 5,
    max_daily_appointments_per_doctor integer DEFAULT 40,
    allow_walk_in boolean DEFAULT true,
    allow_emergency_bypass boolean DEFAULT true,
    allow_opd_credit boolean DEFAULT true,
    enable_sms_notifications boolean DEFAULT false,
    enable_email_notifications boolean DEFAULT true,
    enable_whatsapp_notifications boolean DEFAULT false,
    consultation_fee_default numeric(12,2) DEFAULT 0,
    follow_up_validity_days integer DEFAULT 7,
    data_retention_years integer DEFAULT 7,
    branding_primary_color character varying(7) DEFAULT '#1E40AF'::character varying,
    branding_secondary_color character varying(7) DEFAULT '#3B82F6'::character varying,
    print_header_text text,
    print_footer_text text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    queue_display_show_doctor2 boolean DEFAULT true,
    queue_display_show_pharmacy boolean DEFAULT true,
    queue_display_show_opthal boolean DEFAULT true,
    queue_display_refresh_seconds integer DEFAULT 10,
    queue_display_doctor1_id uuid,
    queue_display_doctor2_id uuid,
    opd_morning_start_time character varying(5) DEFAULT '10:00'::character varying,
    opd_morning_end_time character varying(5) DEFAULT '14:00'::character varying,
    opd_evening_start_time character varying(5) DEFAULT '17:00'::character varying,
    opd_evening_end_time character varying(5) DEFAULT '20:30'::character varying,
    paid_leave_uniform boolean DEFAULT false,
    paid_leave_default_days integer DEFAULT 2,
    CONSTRAINT hospital_settings_pkey PRIMARY KEY (id),
    CONSTRAINT hospital_settings_hospital_id_key UNIQUE (hospital_id)
);

--
-- Name: hospital_permission_overrides; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.hospital_permission_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    permission_key character varying(60) NOT NULL,
    role_name character varying(50) NOT NULL,
    access_level character varying(10) DEFAULT 'none'::character varying NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hospital_permission_overrides_access_level_check CHECK (((access_level)::text = ANY ((ARRAY['none'::character varying, 'view'::character varying, 'edit'::character varying])::text[]))),
    CONSTRAINT hospital_permission_overrides_pkey PRIMARY KEY (id),
    CONSTRAINT hospital_permission_overrides_hospital_id_permission_key_ro_key UNIQUE (hospital_id, permission_key, role_name)
);
--
-- Name: idx_hospital_permission_overrides_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_hospital_permission_overrides_hospital ON public.hospital_permission_overrides USING btree (hospital_id);

--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    description text,
    head_doctor_id uuid,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT departments_pkey PRIMARY KEY (id),
    CONSTRAINT departments_hospital_id_code_key UNIQUE (hospital_id, code)
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    reference_number character varying(12) NOT NULL,
    email character varying(255) NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(20),
    avatar_url character varying(500),
    preferred_locale character varying(10) DEFAULT 'en'::character varying,
    preferred_timezone character varying(50),
    is_active boolean DEFAULT true,
    is_mfa_enabled boolean DEFAULT false,
    mfa_secret character varying(255),
    last_login_at timestamp with time zone,
    password_changed_at timestamp with time zone,
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp with time zone,
    must_change_password boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    designation character varying(100),
    date_of_joining date,
    date_of_leaving date,
    employment_type character varying(20),
    bank_account_holder_name character varying(150),
    bank_account_number character varying(50),
    bank_ifsc character varying(20),
    bank_branch character varying(150),
    pf_number character varying(50),
    pan_number character varying(20),
    paid_leave_entitlement integer,
    include_in_payroll boolean DEFAULT true NOT NULL,
    base_salary numeric(12,2),
    shift_id uuid,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_reference_number_key UNIQUE (reference_number),
    CONSTRAINT users_username_key UNIQUE (username)
);
--
-- Name: idx_users_active; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_users_active ON public.users USING btree (is_active, hospital_id);
--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_users_email ON public.users USING btree (email);
--
-- Name: idx_users_hospital_active; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_users_hospital_active ON public.users USING btree (hospital_id, is_deleted, is_active);
--
-- Name: idx_users_refnum; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_users_refnum ON public.users USING btree (reference_number);
--
-- Name: idx_users_shift; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_users_shift ON public.users USING btree (shift_id);

--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid,
    name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    is_system boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT roles_pkey PRIMARY KEY (id),
    CONSTRAINT roles_hospital_id_name_key UNIQUE (hospital_id, name)
);

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module character varying(50) NOT NULL,
    action character varying(20) NOT NULL,
    resource character varying(50) NOT NULL,
    description character varying(255),
    CONSTRAINT permissions_pkey PRIMARY KEY (id),
    CONSTRAINT permissions_module_action_resource_key UNIQUE (module, action, resource)
);

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    CONSTRAINT role_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT role_permissions_role_id_permission_id_key UNIQUE (role_id, permission_id)
);

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now(),
    assigned_by uuid,
    CONSTRAINT user_roles_pkey PRIMARY KEY (id),
    CONSTRAINT user_roles_user_id_role_id_key UNIQUE (user_id, role_id)
);

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    device_info character varying(255),
    ip_address character varying(45),
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);
--
-- Name: idx_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token_hash);
--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id, revoked_at);
--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);

--
-- Name: revoked_tokens; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.revoked_tokens (
    jti uuid NOT NULL,
    user_id uuid NOT NULL,
    revoked_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT revoked_tokens_pkey PRIMARY KEY (jti)
);
--
-- Name: idx_revoked_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_revoked_tokens_expires_at ON public.revoked_tokens USING btree (expires_at);
--
-- Name: idx_revoked_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_revoked_tokens_user_id ON public.revoked_tokens USING btree (user_id);

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash)
);
--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);

--
-- Name: password_emails; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.password_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    sent_by uuid NOT NULL,
    sent_to_email character varying(255) NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    is_temp_password boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT password_emails_pkey PRIMARY KEY (id)
);
--
-- Name: idx_password_emails_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_password_emails_user ON public.password_emails USING btree (user_id, sent_at DESC);

--
-- Name: patient_email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.patient_email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    code_hash character varying(64),
    attempts_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    CONSTRAINT patient_email_verification_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT patient_email_verification_tokens_token_hash_key UNIQUE (token_hash)
);
--
-- Name: idx_patient_email_verif_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_patient_email_verif_patient ON public.patient_email_verification_tokens USING btree (patient_id);

--
-- Name: id_sequences; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.id_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    hospital_code character(2) NOT NULL,
    entity_type character varying(10) NOT NULL,
    role_gender_code character(1) NOT NULL,
    year_code character(2) NOT NULL,
    month_code character(1) NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT id_sequences_pkey PRIMARY KEY (id),
    CONSTRAINT id_sequences_hospital_id_entity_type_role_gender_code_year__key UNIQUE (hospital_id, entity_type, role_gender_code, year_code, month_code)
);

--
-- Name: id_cards; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.id_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    holder_type character varying(10) NOT NULL,
    holder_id uuid NOT NULL,
    reference_number character varying(12) NOT NULL,
    photo_url character varying(500),
    card_data_snapshot jsonb NOT NULL,
    front_design_url character varying(500),
    back_design_url character varying(500),
    issued_at timestamp with time zone DEFAULT now(),
    issued_by uuid,
    revoked_at timestamp with time zone,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT id_cards_pkey PRIMARY KEY (id)
);
--
-- Name: idx_id_cards_holder; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_id_cards_holder ON public.id_cards USING btree (holder_type, holder_id);
--
-- Name: idx_id_cards_refnum; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_id_cards_refnum ON public.id_cards USING btree (reference_number);

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid,
    user_id uuid,
    action character varying(20) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    entity_name character varying(200),
    old_values jsonb,
    new_values jsonb,
    ip_address character varying(45),
    user_agent character varying(500),
    request_path character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id, created_at DESC);
--
-- Name: idx_audit_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_audit_hospital ON public.audit_logs USING btree (hospital_id, created_at DESC);
--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id, created_at DESC);

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    type character varying(30) NOT NULL,
    priority character varying(10) DEFAULT 'normal'::character varying,
    reference_type character varying(30),
    reference_id uuid,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read, created_at DESC);

--
-- Name: notification_queue; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    channel character varying(20) NOT NULL,
    recipient character varying(255) NOT NULL,
    subject character varying(200),
    body text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    attempts integer DEFAULT 0,
    last_attempt_at timestamp with time zone,
    error_message text,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_queue_pkey PRIMARY KEY (id)
);

--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid,
    code character varying(50) NOT NULL,
    channel character varying(20) NOT NULL,
    locale character varying(10) DEFAULT 'en'::character varying,
    subject character varying(200),
    body_template text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_templates_pkey PRIMARY KEY (id),
    CONSTRAINT notification_templates_hospital_id_code_channel_locale_key UNIQUE (hospital_id, code, channel, locale)
);

--
-- Name: queue_display_screens; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.queue_display_screens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    slug character varying(50) NOT NULL,
    display_name character varying(150) NOT NULL,
    department_id uuid,
    doctor_id uuid,
    show_doctor2 boolean DEFAULT false NOT NULL,
    doctor2_id uuid,
    show_pharmacy boolean DEFAULT false NOT NULL,
    show_opthal boolean DEFAULT false NOT NULL,
    token_format character varying(50) DEFAULT '#{n}'::character varying NOT NULL,
    refresh_seconds integer DEFAULT 10 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT queue_display_screens_pkey PRIMARY KEY (id),
    CONSTRAINT queue_display_screens_hospital_id_slug_key UNIQUE (hospital_id, slug)
);
--
-- Name: idx_queue_display_screens_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_queue_display_screens_hospital ON public.queue_display_screens USING btree (hospital_id);

--
-- Name: tax_configurations; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.tax_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    rate_percentage numeric(5,2) NOT NULL,
    applies_to character varying(20) NOT NULL,
    category character varying(50),
    is_compound boolean DEFAULT false,
    is_active boolean DEFAULT true,
    effective_from date NOT NULL,
    effective_to date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tax_configurations_pkey PRIMARY KEY (id),
    CONSTRAINT tax_configurations_hospital_id_code_key UNIQUE (hospital_id, code)
);

--
-- Name: payment_modes; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.payment_modes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payment_modes_pkey PRIMARY KEY (id),
    CONSTRAINT uq_payment_mode_hospital_name UNIQUE (hospital_id, name)
);
--
-- Name: idx_payment_modes_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_payment_modes_hospital ON public.payment_modes USING btree (hospital_id);

-- ------------------------------------------------------------------------------
-- MODULE: PATIENTS / CLINICAL / APPOINTMENTS / PRESCRIPTIONS / INSURANCE
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: PATIENTS / CLINICAL / APPOINTMENTS / PRESCRIPTIONS / INSURANCE
-- ------------------------------------------------------------------------------

--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.patients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    patient_reference_number character varying(12) NOT NULL,
    title character varying(10),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    date_of_birth date,
    age_years integer,
    age_months integer,
    gender character varying(20) NOT NULL,
    blood_group character varying(5),
    marital_status character varying(20),
    phone_country_code character varying(5) DEFAULT '+1'::character varying NOT NULL,
    phone_number character varying(15) NOT NULL,
    secondary_phone character varying(20),
    email character varying(255),
    national_id_type character varying(30),
    national_id_number character varying(50),
    address_line_1 character varying(255),
    address_line_2 character varying(255),
    city character varying(100),
    state_province character varying(100),
    postal_code character varying(20),
    country character varying(100) DEFAULT 'India'::character varying,
    photo_url character varying(500),
    emergency_contact_name character varying(200),
    emergency_contact_phone character varying(20),
    emergency_contact_country_code character varying(5) DEFAULT '+91'::character varying,
    emergency_contact_relation character varying(50),
    known_allergies text,
    chronic_conditions text,
    notes text,
    preferred_language character varying(10) DEFAULT 'en'::character varying,
    is_active boolean DEFAULT true,
    registered_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    reason_for_visit text,
    symptoms jsonb,
    blood_sugar_value numeric(10,2),
    blood_sugar_unit character varying(10),
    is_email_verified boolean DEFAULT false,
    email_verified_at timestamp with time zone,
    is_phone_verified boolean DEFAULT false,
    phone_verified_at timestamp with time zone,
    medical_conditions jsonb,
    CONSTRAINT patients_pkey PRIMARY KEY (id),
    CONSTRAINT patients_hospital_id_patient_reference_number_key UNIQUE (hospital_id, patient_reference_number)
);
--
-- Name: idx_patients_active; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_patients_active ON public.patients USING btree (hospital_id, is_active) WHERE (is_deleted = false);
--
-- Name: idx_patients_hospital_active; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_patients_hospital_active ON public.patients USING btree (hospital_id, is_deleted, registered_at DESC);
--
-- Name: idx_patients_hospital_reference; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_patients_hospital_reference ON public.patients USING btree (hospital_id, patient_reference_number);
--
-- Name: idx_patients_name; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_patients_name ON public.patients USING btree (hospital_id, first_name, last_name) WHERE (is_deleted = false);
--
-- Name: idx_patients_phone; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_patients_phone ON public.patients USING btree (phone_country_code, phone_number) WHERE (is_deleted = false);
--
-- Name: idx_patients_prn; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_patients_prn ON public.patients USING btree (patient_reference_number);
--
-- Name: patients; Type: ROW SECURITY; Schema: public; Owner: -
--
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
--
-- Name: patients patients_hospital_isolation; Type: POLICY; Schema: public; Owner: -
--
CREATE POLICY patients_hospital_isolation ON public.patients USING ((hospital_id IN ( SELECT h.id
   FROM public.hospitals h
  WHERE (h.tenant_id = (current_setting('app.current_tenant_id'::text))::uuid))));

--
-- Name: patient_consents; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.patient_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consent_type character varying(50) NOT NULL,
    consent_text text NOT NULL,
    is_accepted boolean NOT NULL,
    signature_url character varying(500),
    consented_at timestamp with time zone NOT NULL,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT patient_consents_pkey PRIMARY KEY (id)
);

--
-- Name: patient_documents; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.patient_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    document_type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    file_url character varying(500) NOT NULL,
    file_type character varying(20) NOT NULL,
    file_size_bytes integer,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false,
    CONSTRAINT patient_documents_pkey PRIMARY KEY (id)
);

--
-- Name: doctors; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.doctors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    hospital_id uuid NOT NULL,
    department_id uuid,
    employee_id character varying(30),
    specialization character varying(100) NOT NULL,
    qualification character varying(255) NOT NULL,
    registration_number character varying(50) NOT NULL,
    registration_authority character varying(100),
    experience_years integer,
    bio text,
    doctor_sequence integer,
    consultation_fee numeric(12,2) DEFAULT 0,
    follow_up_fee numeric(12,2) DEFAULT 0,
    is_available boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    is_deleted boolean DEFAULT false,
    analytics_enabled boolean DEFAULT true,
    CONSTRAINT doctors_pkey PRIMARY KEY (id),
    CONSTRAINT doctors_user_id_key UNIQUE (user_id)
);
--
-- Name: idx_doctors_dept; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_doctors_dept ON public.doctors USING btree (department_id);
--
-- Name: idx_doctors_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_doctors_hospital ON public.doctors USING btree (hospital_id, is_active);

--
-- Name: doctor_schedules; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.doctor_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doctor_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    shift_name character varying(50) DEFAULT 'default'::character varying,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    break_start_time time without time zone,
    break_end_time time without time zone,
    slot_duration_minutes integer DEFAULT 15 NOT NULL,
    max_patients integer DEFAULT 20,
    is_active boolean DEFAULT true,
    effective_from date NOT NULL,
    effective_to date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT doctor_schedules_pkey PRIMARY KEY (id),
    CONSTRAINT doctor_schedules_doctor_id_day_of_week_shift_name_effective_key UNIQUE (doctor_id, day_of_week, shift_name, effective_from)
);

--
-- Name: doctor_leaves; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.doctor_leaves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doctor_id uuid NOT NULL,
    leave_date date NOT NULL,
    leave_type character varying(30) DEFAULT 'full_day'::character varying,
    reason character varying(255),
    approved_by uuid,
    status character varying(20) DEFAULT 'approved'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT doctor_leaves_pkey PRIMARY KEY (id),
    CONSTRAINT doctor_leaves_doctor_id_leave_date_leave_type_key UNIQUE (doctor_id, leave_date, leave_type)
);

--
-- Name: doctor_fees; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.doctor_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doctor_id uuid NOT NULL,
    fee_type character varying(30) NOT NULL,
    service_name character varying(100) NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    effective_from date NOT NULL,
    effective_to date,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT doctor_fees_pkey PRIMARY KEY (id)
);

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    appointment_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    appointment_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone,
    appointment_type character varying(20) NOT NULL,
    visit_type character varying(20) DEFAULT 'new'::character varying,
    priority character varying(10) DEFAULT 'normal'::character varying,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    current_doctor_sequence integer DEFAULT 1,
    parent_appointment_id uuid,
    chief_complaint text,
    cancel_reason character varying(255),
    reschedule_reason character varying(255),
    reschedule_count integer DEFAULT 0,
    check_in_at timestamp with time zone,
    consultation_start_at timestamp with time zone,
    consultation_end_at timestamp with time zone,
    notes text,
    consultation_fee numeric(12,2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    is_deleted boolean DEFAULT false,
    visit_token integer,
    is_specialist_assignment boolean DEFAULT false NOT NULL,
    follow_up_label character varying(10),
    CONSTRAINT appointments_pkey PRIMARY KEY (id),
    CONSTRAINT appointments_appointment_number_key UNIQUE (appointment_number)
);
--
-- Name: idx_appointments_doctor_date; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_appointments_doctor_date ON public.appointments USING btree (doctor_id, appointment_date) WHERE (is_deleted = false);
--
-- Name: idx_appointments_hospital_date; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_appointments_hospital_date ON public.appointments USING btree (hospital_id, appointment_date DESC);
--
-- Name: idx_appointments_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_appointments_patient ON public.appointments USING btree (patient_id, appointment_date DESC) WHERE (is_deleted = false);
--
-- Name: idx_appointments_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_appointments_status ON public.appointments USING btree (hospital_id, appointment_date, status) WHERE (is_deleted = false);
--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_queue; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.appointment_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    queue_date date NOT NULL,
    queue_number integer,
    "position" integer NOT NULL,
    status character varying(20) DEFAULT 'waiting'::character varying,
    called_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    opd_assigned_at timestamp with time zone,
    CONSTRAINT appointment_queue_pkey PRIMARY KEY (id),
    CONSTRAINT appointment_queue_doctor_id_queue_date_queue_number_key UNIQUE (doctor_id, queue_date, queue_number)
);
--
-- Name: idx_queue_doctor_date; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_queue_doctor_date ON public.appointment_queue USING btree (doctor_id, queue_date, "position");
--
-- Name: idx_queue_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_queue_status ON public.appointment_queue USING btree (doctor_id, queue_date, status);

--
-- Name: appointment_status_log; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.appointment_status_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid NOT NULL,
    from_status character varying(20),
    to_status character varying(20) NOT NULL,
    changed_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT appointment_status_log_pkey PRIMARY KEY (id)
);

--
-- Name: waitlists; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.waitlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    preferred_date date NOT NULL,
    preferred_time time without time zone,
    appointment_type character varying(20) DEFAULT 'walk-in'::character varying NOT NULL,
    priority character varying(10) DEFAULT 'normal'::character varying,
    chief_complaint text,
    reason text,
    status character varying(20) DEFAULT 'waiting'::character varying,
    "position" integer DEFAULT 0 NOT NULL,
    booked_appointment_id uuid,
    notified_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false,
    CONSTRAINT waitlists_pkey PRIMARY KEY (id)
);
--
-- Name: idx_waitlist_doctor_date; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_waitlist_doctor_date ON public.waitlists USING btree (doctor_id, preferred_date) WHERE (is_deleted = false);
--
-- Name: idx_waitlist_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_waitlist_patient ON public.waitlists USING btree (patient_id, preferred_date) WHERE (is_deleted = false);
--
-- Name: idx_waitlist_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_waitlist_status ON public.waitlists USING btree (status);

--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.prescriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    prescription_number character varying(30) NOT NULL,
    appointment_id uuid,
    patient_id uuid NOT NULL,
    doctor_id uuid,
    diagnosis text,
    clinical_notes text,
    advice text,
    vitals_bp character varying(20),
    vitals_pulse character varying(10),
    vitals_temp character varying(10),
    vitals_weight character varying(10),
    vitals_spo2 character varying(10),
    follow_up_date date,
    queue_id uuid,
    version integer DEFAULT 1,
    status character varying(20) DEFAULT 'draft'::character varying,
    is_finalized boolean DEFAULT false,
    finalized_at timestamp with time zone,
    valid_until date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    is_deleted boolean DEFAULT false,
    institution_id uuid,
    is_opthal boolean DEFAULT false,
    opthal_notes text,
    vitals_blood_sugar character varying(20),
    CONSTRAINT prescriptions_pkey PRIMARY KEY (id),
    CONSTRAINT prescriptions_prescription_number_key UNIQUE (prescription_number)
);
--
-- Name: idx_prescriptions_appointment; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescriptions_appointment ON public.prescriptions USING btree (appointment_id);
--
-- Name: idx_prescriptions_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescriptions_created ON public.prescriptions USING btree (created_at);
--
-- Name: idx_prescriptions_doctor; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescriptions_doctor ON public.prescriptions USING btree (doctor_id);
--
-- Name: idx_prescriptions_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescriptions_patient ON public.prescriptions USING btree (patient_id);
--
-- Name: idx_prescriptions_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescriptions_status ON public.prescriptions USING btree (status);
--
-- Name: prescriptions; Type: ROW SECURITY; Schema: public; Owner: -
--
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: prescription_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.prescription_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prescription_id uuid NOT NULL,
    medicine_id uuid,
    medicine_name character varying(200) NOT NULL,
    generic_name character varying(200),
    dosage character varying(50) NOT NULL,
    frequency character varying(50) NOT NULL,
    duration_value integer,
    duration_unit character varying(10),
    route character varying(30),
    instructions text,
    quantity integer,
    allow_substitution boolean DEFAULT true,
    is_dispensed boolean DEFAULT false,
    dispensed_quantity integer DEFAULT 0,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    eye_side character varying(10),
    CONSTRAINT prescription_items_pkey PRIMARY KEY (id)
);
--
-- Name: idx_prescription_items_rx; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescription_items_rx ON public.prescription_items USING btree (prescription_id);

--
-- Name: prescription_versions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.prescription_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prescription_id uuid NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    changed_by uuid,
    change_reason text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT prescription_versions_pkey PRIMARY KEY (id)
);
--
-- Name: idx_prescription_versions_rx; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescription_versions_rx ON public.prescription_versions USING btree (prescription_id);

--
-- Name: prescription_templates; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.prescription_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doctor_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    diagnosis character varying(255),
    items jsonb NOT NULL,
    advice text,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT prescription_templates_pkey PRIMARY KEY (id)
);
--
-- Name: idx_prescription_templates_doctor; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_prescription_templates_doctor ON public.prescription_templates USING btree (doctor_id);

--
-- Name: clinical_note_ngrams; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.clinical_note_ngrams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    n smallint NOT NULL,
    context text NOT NULL,
    next_token text NOT NULL,
    frequency integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    field_type text DEFAULT 'clinical_notes'::text NOT NULL,
    CONSTRAINT clinical_note_ngrams_n_check CHECK ((n = ANY (ARRAY[2, 3]))),
    CONSTRAINT clinical_note_ngrams_pkey PRIMARY KEY (id),
    CONSTRAINT uq_clinical_note_ngrams_key UNIQUE (hospital_id, field_type, n, context, next_token)
);
--
-- Name: idx_clinical_note_ngrams_lookup; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_clinical_note_ngrams_lookup ON public.clinical_note_ngrams USING btree (hospital_id, field_type, n, context, frequency DESC);

--
-- Name: insurance_providers; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.insurance_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    code character varying(20) NOT NULL,
    contact_person character varying(100),
    phone character varying(20),
    email character varying(255),
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT insurance_providers_pkey PRIMARY KEY (id)
);

--
-- Name: insurance_policies; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.insurance_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    policy_number character varying(50) NOT NULL,
    group_number character varying(50),
    member_id character varying(50),
    plan_name character varying(100),
    coverage_type character varying(30),
    coverage_amount numeric(12,2),
    deductible numeric(12,2),
    copay_percent numeric(5,2),
    effective_from date NOT NULL,
    effective_to date,
    is_primary boolean DEFAULT true,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT insurance_policies_pkey PRIMARY KEY (id)
);

--
-- Name: insurance_claims; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.insurance_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    claim_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    policy_id uuid NOT NULL,
    invoice_id uuid,
    claim_amount numeric(12,2) NOT NULL,
    approved_amount numeric(12,2),
    status character varying(20) DEFAULT 'submitted'::character varying,
    submission_date date,
    response_date date,
    rejection_reason text,
    notes text,
    documents jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT insurance_claims_pkey PRIMARY KEY (id),
    CONSTRAINT insurance_claims_claim_number_key UNIQUE (claim_number)
);

--
-- Name: pre_authorizations; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pre_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    policy_id uuid NOT NULL,
    service_description text NOT NULL,
    estimated_cost numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'requested'::character varying,
    auth_number character varying(50),
    approved_amount numeric(12,2),
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pre_authorizations_pkey PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------------
-- MODULE: BILLING / INVENTORY / PURCHASING
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: BILLING / INVENTORY / PURCHASING
-- ------------------------------------------------------------------------------

--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    code character varying(20) NOT NULL,
    contact_person character varying(100),
    phone character varying(20),
    email character varying(255),
    address text,
    tax_id character varying(50),
    payment_terms character varying(50),
    lead_time_days integer,
    rating numeric(3,1),
    product_categories text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    country character varying(100) DEFAULT 'India'::character varying,
    gstin character varying(15),
    gst_registration_status character varying(20) DEFAULT 'unregistered'::character varying,
    state character varying(100),
    CONSTRAINT suppliers_pkey PRIMARY KEY (id),
    CONSTRAINT suppliers_hospital_id_code_key UNIQUE (hospital_id, code)
);
--
-- Name: COLUMN suppliers.product_categories; Type: COMMENT; Schema: public; Owner: -
--
COMMENT ON COLUMN public.suppliers.product_categories IS 'Array of product categories supplied by this vendor: medicine, optical, surgical, equipment, laboratory, disposable, other';

--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    po_number character varying(30) NOT NULL,
    supplier_id uuid NOT NULL,
    order_date date NOT NULL,
    expected_delivery_date date,
    status character varying(20) DEFAULT 'draft'::character varying,
    total_amount numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    notes text,
    approved_by uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    discount_amount numeric(12,2) DEFAULT 0,
    taxable_amount numeric(12,2) DEFAULT 0,
    cgst_amount numeric(12,2) DEFAULT 0,
    sgst_amount numeric(12,2) DEFAULT 0,
    igst_amount numeric(12,2) DEFAULT 0,
    ugst_amount numeric(12,2) DEFAULT 0,
    place_of_supply_type character varying(20),
    subtotal numeric(12,2) DEFAULT 0,
    CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number)
);

--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    item_type character varying(20) NOT NULL,
    item_id uuid NOT NULL,
    quantity_ordered integer NOT NULL,
    quantity_received integer DEFAULT 0,
    unit_price numeric(12,2) NOT NULL,
    total_price numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    discount_amount numeric(12,2) DEFAULT 0,
    gst_rate numeric(5,2) DEFAULT 0,
    taxable_amount numeric(12,2) DEFAULT 0,
    cgst_amount numeric(12,2) DEFAULT 0,
    sgst_amount numeric(12,2) DEFAULT 0,
    igst_amount numeric(12,2) DEFAULT 0,
    ugst_amount numeric(12,2) DEFAULT 0,
    discount_percent numeric(5,2) DEFAULT 0,
    CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id)
);

--
-- Name: purchase_order_payments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.purchase_order_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    payment_number character varying(30) NOT NULL,
    invoice_number character varying(50),
    amount numeric(12,2) NOT NULL,
    payment_mode_id uuid NOT NULL,
    payment_date date NOT NULL,
    reference_note text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT purchase_order_payments_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_order_payments_payment_number_key UNIQUE (payment_number)
);
--
-- Name: idx_po_payments_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_po_payments_hospital ON public.purchase_order_payments USING btree (hospital_id, created_at DESC);
--
-- Name: idx_po_payments_po; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_po_payments_po ON public.purchase_order_payments USING btree (purchase_order_id);

--
-- Name: goods_receipt_notes; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.goods_receipt_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    grn_number character varying(30) NOT NULL,
    purchase_order_id uuid,
    supplier_id uuid NOT NULL,
    receipt_date date NOT NULL,
    invoice_number character varying(50),
    invoice_date date,
    total_amount numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    verified_by uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT goods_receipt_notes_pkey PRIMARY KEY (id),
    CONSTRAINT goods_receipt_notes_grn_number_key UNIQUE (grn_number)
);

--
-- Name: grn_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.grn_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grn_id uuid NOT NULL,
    item_type character varying(20) NOT NULL,
    item_id uuid NOT NULL,
    batch_number character varying(50),
    manufactured_date date,
    expiry_date date,
    quantity_received integer NOT NULL,
    quantity_accepted integer,
    quantity_rejected integer DEFAULT 0,
    unit_price numeric(12,2) NOT NULL,
    total_price numeric(12,2) NOT NULL,
    rejection_reason character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    discrepancy_notes text,
    CONSTRAINT grn_items_pkey PRIMARY KEY (id)
);

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    invoice_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    appointment_id uuid,
    invoice_type character varying(20) NOT NULL,
    invoice_date date NOT NULL,
    due_date date,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0,
    discount_reason character varying(255),
    tax_amount numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0,
    balance_amount numeric(12,2) DEFAULT 0,
    currency character varying(3) DEFAULT 'USD'::character varying,
    status character varying(20) DEFAULT 'draft'::character varying,
    notes text,
    insurance_claim_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    is_deleted boolean DEFAULT false,
    CONSTRAINT invoices_pkey PRIMARY KEY (id),
    CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number)
);
--
-- Name: idx_invoices_date_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_invoices_date_status ON public.invoices USING btree (hospital_id, invoice_date, status) WHERE (is_deleted = false);
--
-- Name: idx_invoices_hospital_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_invoices_hospital_created ON public.invoices USING btree (hospital_id, created_at DESC);
--
-- Name: idx_invoices_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_invoices_patient ON public.invoices USING btree (patient_id, invoice_date DESC) WHERE (is_deleted = false);
--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);
--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    item_type character varying(20) NOT NULL,
    reference_id uuid,
    description character varying(255) NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    tax_config_id uuid,
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_price numeric(12,2) NOT NULL,
    display_order integer DEFAULT 0,
    batch_number character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT invoice_items_pkey PRIMARY KEY (id)
);

--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    payment_number character varying(30) NOT NULL,
    invoice_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    payment_mode character varying(20) NOT NULL,
    payment_reference character varying(100),
    payment_date date NOT NULL,
    payment_time time without time zone,
    status character varying(20) DEFAULT 'completed'::character varying,
    received_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payments_pkey PRIMARY KEY (id),
    CONSTRAINT payments_payment_number_key UNIQUE (payment_number)
);

--
-- Name: credit_notes; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.credit_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    credit_note_number character varying(30) NOT NULL,
    invoice_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    status character varying(20) DEFAULT 'issued'::character varying,
    applied_to_invoice_id uuid,
    valid_until date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT credit_notes_pkey PRIMARY KEY (id),
    CONSTRAINT credit_notes_credit_note_number_key UNIQUE (credit_note_number)
);

--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    refund_number character varying(30) NOT NULL,
    invoice_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason_code character varying(50) NOT NULL,
    reason_detail text,
    status character varying(20) DEFAULT 'pending'::character varying,
    refund_mode character varying(20),
    refund_reference character varying(100),
    requested_by uuid,
    approved_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    invoice_item_id uuid,
    restock_quantity numeric(10,2),
    CONSTRAINT refunds_pkey PRIMARY KEY (id),
    CONSTRAINT refunds_refund_number_key UNIQUE (refund_number)
);

--
-- Name: daily_settlements; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.daily_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    settlement_date date NOT NULL,
    cashier_user_id uuid NOT NULL,
    total_cash numeric(12,2) DEFAULT 0,
    total_card numeric(12,2) DEFAULT 0,
    total_online numeric(12,2) DEFAULT 0,
    total_other numeric(12,2) DEFAULT 0,
    total_collected numeric(12,2) DEFAULT 0,
    total_refunds numeric(12,2) DEFAULT 0,
    net_amount numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'open'::character varying,
    verified_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT daily_settlements_pkey PRIMARY KEY (id),
    CONSTRAINT daily_settlements_hospital_id_settlement_date_cashier_user__key UNIQUE (hospital_id, settlement_date, cashier_user_id)
);

--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    adjustment_number character varying(30) NOT NULL,
    item_type character varying(20) NOT NULL,
    item_id uuid NOT NULL,
    batch_id uuid,
    adjustment_type character varying(20) NOT NULL,
    quantity integer NOT NULL,
    reason character varying(255) NOT NULL,
    approved_by uuid,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id),
    CONSTRAINT stock_adjustments_adjustment_number_key UNIQUE (adjustment_number)
);

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    item_type character varying(20) NOT NULL,
    item_id uuid NOT NULL,
    batch_id uuid,
    movement_type character varying(20) NOT NULL,
    reference_type character varying(30),
    reference_id uuid,
    quantity integer NOT NULL,
    balance_after integer NOT NULL,
    unit_cost numeric(12,2),
    notes character varying(255),
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stock_movements_pkey PRIMARY KEY (id)
);
--
-- Name: idx_stock_movements_item; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_stock_movements_item ON public.stock_movements USING btree (item_type, item_id, created_at DESC);

--
-- Name: cycle_counts; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.cycle_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    count_number character varying(30) NOT NULL,
    count_date date NOT NULL,
    status character varying(20) DEFAULT 'in_progress'::character varying,
    notes text,
    counted_by uuid,
    verified_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cycle_counts_pkey PRIMARY KEY (id),
    CONSTRAINT cycle_counts_count_number_key UNIQUE (count_number)
);

--
-- Name: cycle_count_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.cycle_count_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_count_id uuid NOT NULL,
    item_type character varying(20) NOT NULL,
    item_id uuid NOT NULL,
    batch_id uuid,
    system_quantity integer NOT NULL,
    counted_quantity integer NOT NULL,
    variance integer NOT NULL,
    variance_reason character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cycle_count_items_pkey PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------------
-- MODULE: PHARMACY
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: PHARMACY
-- ------------------------------------------------------------------------------

--
-- Name: medicines; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.medicines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid,
    name character varying(200) NOT NULL,
    generic_name character varying(200) NOT NULL,
    category character varying(50),
    manufacturer character varying(200),
    composition text,
    strength character varying(50),
    unit_of_measure character varying(20) NOT NULL,
    units_per_pack integer DEFAULT 1,
    hsn_code character varying(20),
    sku character varying(50),
    barcode character varying(50),
    requires_prescription boolean DEFAULT true,
    is_controlled boolean DEFAULT false,
    selling_price numeric(12,2) NOT NULL,
    purchase_price numeric(12,2),
    tax_config_id uuid,
    reorder_level integer DEFAULT 10,
    max_stock_level integer,
    storage_instructions character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_global boolean DEFAULT false NOT NULL,
    dosage_form character varying(100),
    schedule_type character varying(10),
    rack_location character varying(100),
    drug_interaction_notes text,
    side_effects text,
    brand character varying(200),
    CONSTRAINT medicines_pkey PRIMARY KEY (id)
);
--
-- Name: idx_medicines_barcode; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_medicines_barcode ON public.medicines USING btree (barcode) WHERE (barcode IS NOT NULL);
--
-- Name: idx_medicines_generic; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_medicines_generic ON public.medicines USING btree (generic_name);
--
-- Name: idx_medicines_is_global; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_medicines_is_global ON public.medicines USING btree (is_global) WHERE (is_global = true);
--
-- Name: idx_medicines_name; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_medicines_name ON public.medicines USING btree (hospital_id, name);
--
-- Name: uq_medicine_sku_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE UNIQUE INDEX uq_medicine_sku_hospital ON public.medicines USING btree (hospital_id, sku) WHERE ((sku IS NOT NULL) AND ((sku)::text <> ''::text));

--
-- Name: medicine_batches; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.medicine_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    medicine_id uuid NOT NULL,
    batch_number character varying(50) NOT NULL,
    grn_id uuid,
    manufactured_date date,
    expiry_date date NOT NULL,
    purchase_price numeric(12,2),
    selling_price numeric(12,2),
    initial_quantity integer NOT NULL,
    current_quantity integer NOT NULL,
    is_expired boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    supplier_id uuid,
    mrp numeric(12,2),
    CONSTRAINT medicine_batches_pkey PRIMARY KEY (id),
    CONSTRAINT medicine_batches_medicine_id_batch_number_key UNIQUE (medicine_id, batch_number),
    CONSTRAINT uq_medicine_batch UNIQUE (medicine_id, batch_number, manufactured_date, expiry_date)
);
--
-- Name: idx_batches_expiry; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_batches_expiry ON public.medicine_batches USING btree (expiry_date) WHERE (is_active = true);
--
-- Name: idx_batches_stock; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_batches_stock ON public.medicine_batches USING btree (medicine_id, is_active, current_quantity);

--
-- Name: pharmacy_dispensing; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pharmacy_dispensing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    dispensing_number character varying(30) NOT NULL,
    prescription_id uuid,
    patient_id uuid,
    sale_type character varying(20) NOT NULL,
    invoice_id uuid,
    status character varying(20) DEFAULT 'pending'::character varying,
    total_amount numeric(12,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    net_amount numeric(12,2) DEFAULT 0,
    dispensed_by uuid,
    dispensed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_method character varying(20) DEFAULT 'cash'::character varying,
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    amount_tendered numeric(12,2) DEFAULT 0,
    advance_amount numeric(12,2) DEFAULT 0,
    paid_amount numeric(12,2) DEFAULT 0,
    balance_amount numeric(12,2) DEFAULT 0,
    queue_token integer,
    queue_status character varying(20) DEFAULT 'waiting'::character varying,
    queue_called_at timestamp with time zone,
    consultation_fee numeric(12,2) DEFAULT 0,
    appointment_id uuid,
    CONSTRAINT pharmacy_dispensing_pkey PRIMARY KEY (id),
    CONSTRAINT pharmacy_dispensing_dispensing_number_key UNIQUE (dispensing_number)
);
--
-- Name: idx_pharmacy_dispensing_queue; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pharmacy_dispensing_queue ON public.pharmacy_dispensing USING btree (hospital_id, queue_status, queue_token);

--
-- Name: pharmacy_dispensing_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pharmacy_dispensing_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispensing_id uuid NOT NULL,
    prescription_item_id uuid,
    medicine_id uuid NOT NULL,
    medicine_batch_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_price numeric(12,2) NOT NULL,
    substituted boolean DEFAULT false,
    original_medicine_name character varying(200),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pharmacy_dispensing_items_pkey PRIMARY KEY (id)
);

--
-- Name: pharmacy_queue_entries; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pharmacy_queue_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    queue_token integer NOT NULL,
    prescription_id uuid,
    patient_id uuid,
    patient_name character varying(200),
    doctor_name character varying(200),
    status character varying(20) DEFAULT 'waiting'::character varying NOT NULL,
    sale_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    queue_called_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    appointment_id uuid,
    CONSTRAINT pharmacy_queue_entries_status_check CHECK (((status)::text = ANY ((ARRAY['waiting'::character varying, 'being_served'::character varying, 'collected'::character varying])::text[]))),
    CONSTRAINT pharmacy_queue_entries_pkey PRIMARY KEY (id)
);
--
-- Name: idx_pharmacy_queue_entries_hospital_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pharmacy_queue_entries_hospital_status ON public.pharmacy_queue_entries USING btree (hospital_id, status, queue_token);
--
-- Name: idx_pharmacy_queue_entries_prescription; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pharmacy_queue_entries_prescription ON public.pharmacy_queue_entries USING btree (prescription_id);

--
-- Name: pharmacy_returns; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pharmacy_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    return_number character varying(30) NOT NULL,
    dispensing_id uuid NOT NULL,
    patient_id uuid,
    reason character varying(255) NOT NULL,
    total_refund numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    approved_by uuid,
    restock boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pharmacy_returns_pkey PRIMARY KEY (id),
    CONSTRAINT pharmacy_returns_return_number_key UNIQUE (return_number)
);

--
-- Name: pharmacy_return_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pharmacy_return_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_id uuid NOT NULL,
    dispensing_item_id uuid NOT NULL,
    medicine_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    quantity integer NOT NULL,
    refund_amount numeric(12,2) NOT NULL,
    restocked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pharmacy_return_items_pkey PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------------
-- MODULE: LAB
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: LAB
-- ------------------------------------------------------------------------------

--
-- Name: lab_tests; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.lab_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    code character varying(30) NOT NULL,
    category character varying(100),
    sample_type character varying(50),
    price numeric(12,2) DEFAULT 0 NOT NULL,
    unit character varying(30),
    reference_range character varying(200),
    turnaround_hours integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    report_template jsonb,
    CONSTRAINT lab_tests_pkey PRIMARY KEY (id),
    CONSTRAINT lab_tests_hospital_id_code_key UNIQUE (hospital_id, code)
);

--
-- Name: lab_test_panels; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.lab_test_panels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    code character varying(30) NOT NULL,
    test_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lab_test_panels_pkey PRIMARY KEY (id),
    CONSTRAINT lab_test_panels_hospital_id_code_key UNIQUE (hospital_id, code)
);
--
-- Name: idx_lab_test_panels_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_test_panels_hospital ON public.lab_test_panels USING btree (hospital_id);

--
-- Name: lab_orders; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.lab_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    order_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid,
    appointment_id uuid,
    prescription_id uuid,
    notes text,
    is_finalized boolean DEFAULT false,
    status character varying(20) DEFAULT 'ordered'::character varying,
    queue_token integer,
    queue_status character varying(20) DEFAULT 'waiting'::character varying,
    queue_called_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    report_status character varying(20) DEFAULT 'pending'::character varying,
    finalized_at timestamp with time zone,
    finalized_by uuid,
    confirmatory_diagnosis text,
    CONSTRAINT lab_orders_queue_status_check CHECK (((queue_status)::text = ANY ((ARRAY['waiting'::character varying, 'being_served'::character varying, 'collected'::character varying])::text[]))),
    CONSTRAINT lab_orders_report_status_check CHECK (((report_status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'finalized'::character varying])::text[]))),
    CONSTRAINT lab_orders_pkey PRIMARY KEY (id),
    CONSTRAINT lab_orders_order_number_key UNIQUE (order_number)
);
--
-- Name: idx_lab_orders_appointment; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_orders_appointment ON public.lab_orders USING btree (appointment_id);
--
-- Name: idx_lab_orders_hospital_queue; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_orders_hospital_queue ON public.lab_orders USING btree (hospital_id, queue_status, queue_token);
--
-- Name: idx_lab_orders_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_orders_patient ON public.lab_orders USING btree (patient_id);

--
-- Name: lab_order_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.lab_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lab_order_id uuid NOT NULL,
    lab_test_id uuid NOT NULL,
    test_name character varying(200) NOT NULL,
    price numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ordered'::character varying,
    result_value character varying(200),
    result_unit character varying(30),
    reference_range character varying(200),
    result_flag character varying(20),
    result_notes text,
    resulted_at timestamp with time zone,
    resulted_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    parameters jsonb,
    billed_name character varying(200),
    CONSTRAINT lab_order_items_pkey PRIMARY KEY (id)
);
--
-- Name: idx_lab_order_items_order; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_order_items_order ON public.lab_order_items USING btree (lab_order_id);

--
-- Name: lab_referrals; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.lab_referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    referral_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    recipient_title character varying(200) NOT NULL,
    recipient_location character varying(200),
    case_details text,
    investigation character varying(200) NOT NULL,
    remarks text,
    referring_doctor_name character varying(200) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lab_referrals_pkey PRIMARY KEY (id),
    CONSTRAINT lab_referrals_referral_number_key UNIQUE (referral_number)
);
--
-- Name: idx_lab_referrals_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_referrals_hospital ON public.lab_referrals USING btree (hospital_id, created_at DESC);
--
-- Name: idx_lab_referrals_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_referrals_patient ON public.lab_referrals USING btree (patient_id);

--
-- Name: lab_sales; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.lab_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    sale_number character varying(30) NOT NULL,
    lab_order_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    invoice_id uuid,
    subtotal numeric(12,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) DEFAULT 0,
    payment_method character varying(20) DEFAULT 'cash'::character varying,
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    amount_tendered numeric(12,2) DEFAULT 0,
    advance_amount numeric(12,2) DEFAULT 0,
    paid_amount numeric(12,2) DEFAULT 0,
    balance_amount numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lab_sales_pkey PRIMARY KEY (id),
    CONSTRAINT lab_sales_lab_order_id_key UNIQUE (lab_order_id),
    CONSTRAINT lab_sales_sale_number_key UNIQUE (sale_number)
);
--
-- Name: idx_lab_sales_patient; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lab_sales_patient ON public.lab_sales USING btree (patient_id);

-- ------------------------------------------------------------------------------
-- MODULE: OPTICAL
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: OPTICAL
-- ------------------------------------------------------------------------------

--
-- Name: optical_products; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.optical_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    category character varying(50) NOT NULL,
    brand character varying(100),
    model_number character varying(50),
    color character varying(30),
    material character varying(50),
    size character varying(20),
    gender character varying(10),
    sku character varying(50),
    barcode character varying(50),
    selling_price numeric(12,2) NOT NULL,
    purchase_price numeric(12,2),
    tax_config_id uuid,
    current_stock integer DEFAULT 0,
    reorder_level integer DEFAULT 5,
    lens_type character varying(30),
    lens_index character varying(10),
    lens_coating character varying(50),
    image_url character varying(500),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT optical_products_pkey PRIMARY KEY (id)
);
--
-- Name: COLUMN optical_products.current_stock; Type: COMMENT; Schema: public; Owner: -
--
COMMENT ON COLUMN public.optical_products.current_stock IS 'DEPRECATED — unused since optical_batches was introduced. Stock is now SUM(optical_batches.current_quantity) for active batches, mirroring Medicine/MedicineBatch.';

--
-- Name: optical_batches; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.optical_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    optical_product_id uuid NOT NULL,
    batch_number character varying(50) NOT NULL,
    grn_id uuid,
    manufactured_date date,
    expiry_date date,
    purchase_price numeric,
    selling_price numeric,
    initial_quantity integer DEFAULT 0 NOT NULL,
    current_quantity integer DEFAULT 0 NOT NULL,
    is_expired boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT optical_batches_pkey PRIMARY KEY (id),
    CONSTRAINT optical_batches_optical_product_id_batch_number_key UNIQUE (optical_product_id, batch_number),
    CONSTRAINT uq_optical_batch UNIQUE (optical_product_id, batch_number, manufactured_date, expiry_date)
);
--
-- Name: idx_optical_batches_expiry; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_optical_batches_expiry ON public.optical_batches USING btree (expiry_date);
--
-- Name: idx_optical_batches_product; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_optical_batches_product ON public.optical_batches USING btree (optical_product_id);

--
-- Name: optical_orders; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.optical_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    order_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    optical_prescription_id uuid,
    invoice_id uuid,
    order_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'placed'::character varying,
    frame_product_id uuid,
    right_lens_product_id uuid,
    left_lens_product_id uuid,
    fitting_measurements jsonb,
    total_amount numeric(12,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    net_amount numeric(12,2) DEFAULT 0,
    estimated_delivery_date date,
    delivered_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_method character varying(20) DEFAULT 'cash'::character varying,
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    amount_tendered numeric(12,2) DEFAULT 0,
    advance_amount numeric(12,2) DEFAULT 0,
    paid_amount numeric(12,2) DEFAULT 0,
    balance_amount numeric(12,2) DEFAULT 0,
    queue_token integer,
    queue_status character varying(20) DEFAULT 'waiting'::character varying,
    queue_called_at timestamp with time zone,
    appointment_id uuid,
    CONSTRAINT optical_orders_pkey PRIMARY KEY (id),
    CONSTRAINT optical_orders_order_number_key UNIQUE (order_number)
);
--
-- Name: idx_optical_orders_queue; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_optical_orders_queue ON public.optical_orders USING btree (hospital_id, queue_status, queue_token);
--
-- Name: optical_orders trg_prevent_duplicate_optical_dispensing; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER trg_prevent_duplicate_optical_dispensing BEFORE INSERT ON public.optical_orders FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_optical_dispensing();

--
-- Name: optical_order_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.optical_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_price numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    batch_id uuid,
    CONSTRAINT optical_order_items_pkey PRIMARY KEY (id)
);

--
-- Name: optical_prescriptions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.optical_prescriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    prescription_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid,
    appointment_id uuid,
    right_sph numeric(5,2),
    right_cyl numeric(5,2),
    right_axis integer,
    right_add numeric(4,2),
    right_va character varying(20),
    left_sph numeric(5,2),
    left_cyl numeric(5,2),
    left_axis integer,
    left_add numeric(4,2),
    left_va character varying(20),
    pd_distance numeric(4,1),
    pd_near numeric(4,1),
    pd_right numeric(4,1),
    pd_left numeric(4,1),
    notes text,
    is_finalized boolean DEFAULT false,
    valid_until date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    right_vision character varying(20),
    left_vision character varying(20),
    right_iop character varying(20),
    left_iop character varying(20),
    right_nld character varying(50),
    left_nld character varying(50),
    right_machine_sph numeric(5,2),
    right_machine_cyl numeric(5,2),
    right_machine_axis integer,
    right_machine_add numeric(4,2),
    left_machine_sph numeric(5,2),
    left_machine_cyl numeric(5,2),
    left_machine_axis integer,
    left_machine_add numeric(4,2),
    CONSTRAINT optical_prescriptions_pkey PRIMARY KEY (id),
    CONSTRAINT optical_prescriptions_prescription_number_key UNIQUE (prescription_number)
);

--
-- Name: optical_repairs; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.optical_repairs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    repair_number character varying(30) NOT NULL,
    patient_id uuid NOT NULL,
    item_description character varying(255) NOT NULL,
    issue_description text NOT NULL,
    status character varying(20) DEFAULT 'received'::character varying,
    estimated_cost numeric(12,2),
    actual_cost numeric(12,2),
    invoice_id uuid,
    estimated_completion date,
    completed_at timestamp with time zone,
    delivered_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT optical_repairs_pkey PRIMARY KEY (id),
    CONSTRAINT optical_repairs_repair_number_key UNIQUE (repair_number)
);

-- ------------------------------------------------------------------------------
-- MODULE: WORKFORCE / ATTENDANCE / PAYROLL
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: WORKFORCE / ATTENDANCE / PAYROLL
-- ------------------------------------------------------------------------------

--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT shifts_pkey PRIMARY KEY (id)
);
--
-- Name: idx_shifts_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_shifts_hospital ON public.shifts USING btree (hospital_id);
--
-- Name: shifts update_shifts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: shift_assignments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.shift_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    user_id uuid NOT NULL,
    shift_id uuid NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shift_assignments_pkey PRIMARY KEY (id)
);
--
-- Name: idx_shift_assignments_hospital_user_from; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_shift_assignments_hospital_user_from ON public.shift_assignments USING btree (hospital_id, user_id, effective_from DESC);

--
-- Name: employee_profiles; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.employee_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    hospital_id uuid NOT NULL,
    department_id uuid,
    designation character varying(100),
    date_of_joining date,
    date_of_leaving date,
    employment_type character varying(20) DEFAULT 'full_time'::character varying,
    bank_account_holder_name character varying(150),
    bank_account_number character varying(30),
    bank_ifsc character varying(15),
    bank_branch character varying(150),
    pf_number character varying(30),
    pan_number character varying(15),
    reporting_manager_id uuid,
    paid_leave_entitlement integer DEFAULT 0,
    include_in_payroll boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT employee_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT employee_profiles_user_id_key UNIQUE (user_id)
);
--
-- Name: idx_employee_profiles_department; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_employee_profiles_department ON public.employee_profiles USING btree (department_id);
--
-- Name: idx_employee_profiles_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_employee_profiles_hospital ON public.employee_profiles USING btree (hospital_id);

--
-- Name: employee_salary; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.employee_salary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    hospital_id uuid NOT NULL,
    basic_salary numeric(12,2) NOT NULL,
    per_day_salary numeric(12,2) NOT NULL,
    flexi_allowance numeric(12,2) DEFAULT 0,
    pf_contribution_employee numeric(12,2) DEFAULT 0,
    effective_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT employee_salary_pkey PRIMARY KEY (id)
);
--
-- Name: idx_employee_salary_employee; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_employee_salary_employee ON public.employee_salary USING btree (employee_id, effective_from DESC);

--
-- Name: employee_shift_assignments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.employee_shift_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    shift_id uuid NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    assigned_by uuid NOT NULL,
    reason character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT employee_shift_assignments_pkey PRIMARY KEY (id)
);
--
-- Name: idx_shift_assignments_employee; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_shift_assignments_employee ON public.employee_shift_assignments USING btree (employee_id, effective_from DESC);

--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    festival_days integer[] DEFAULT '{}'::integer[] NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    holiday_days integer[] DEFAULT '{}'::integer[] NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT holidays_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT holidays_pkey PRIMARY KEY (id),
    CONSTRAINT uq_holidays_hospital_year_month UNIQUE (hospital_id, year, month)
);
--
-- Name: idx_holidays_hospital_year_month; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_holidays_hospital_year_month ON public.holidays USING btree (hospital_id, year, month);
--
-- Name: holidays update_holidays_updated_at; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    date date NOT NULL,
    status character varying(20) DEFAULT 'not_marked'::character varying NOT NULL,
    marked_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reason character varying(255),
    user_id uuid NOT NULL,
    CONSTRAINT attendance_records_status_check CHECK (((status)::text = ANY ((ARRAY['present'::character varying, 'absent'::character varying, 'half_day'::character varying])::text[]))),
    CONSTRAINT attendance_records_pkey PRIMARY KEY (id),
    CONSTRAINT uq_attendance_records_user_date UNIQUE (user_id, date)
);
--
-- Name: idx_attendance_hospital_date; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attendance_hospital_date ON public.attendance_records USING btree (hospital_id, date);
--
-- Name: idx_attendance_records_hospital_date; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attendance_records_hospital_date ON public.attendance_records USING btree (hospital_id, date);
--
-- Name: idx_attendance_records_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attendance_records_user ON public.attendance_records USING btree (user_id);
--
-- Name: attendance_records update_attendance_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--
CREATE TRIGGER update_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: leave_balances; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.leave_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    year integer NOT NULL,
    allocated integer DEFAULT 0 NOT NULL,
    used integer DEFAULT 0 NOT NULL,
    CONSTRAINT leave_balances_pkey PRIMARY KEY (id),
    CONSTRAINT leave_balances_employee_id_year_key UNIQUE (employee_id, year)
);

--
-- Name: leave_records; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.leave_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason character varying(255),
    status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    entered_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT leave_records_pkey PRIMARY KEY (id)
);
--
-- Name: idx_leave_records_employee; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_leave_records_employee ON public.leave_records USING btree (employee_id, start_date DESC);
--
-- Name: idx_leave_records_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_leave_records_hospital ON public.leave_records USING btree (hospital_id);

--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.payroll_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    month integer CONSTRAINT payroll_runs_period_month_not_null NOT NULL,
    year integer CONSTRAINT payroll_runs_period_year_not_null NOT NULL,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payroll_runs_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT payroll_runs_pkey PRIMARY KEY (id),
    CONSTRAINT uq_payroll_runs_hospital_year_month UNIQUE (hospital_id, year, month)
);

--
-- Name: payroll_items; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.payroll_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_run_id uuid NOT NULL,
    user_id uuid NOT NULL,
    present_count numeric(5,1) DEFAULT 0 NOT NULL,
    absent_count numeric(5,1) DEFAULT 0 NOT NULL,
    paid_leave_entitlement integer DEFAULT 0 NOT NULL,
    working_days integer DEFAULT 0 NOT NULL,
    base_salary numeric(12,2) DEFAULT 0 NOT NULL,
    per_day_salary numeric(12,2) DEFAULT 0 NOT NULL,
    deduction_days numeric(5,1) DEFAULT 0 NOT NULL,
    deduction_amount numeric(12,2) DEFAULT 0 NOT NULL,
    net_payable numeric(12,2) DEFAULT 0 NOT NULL,
    allowance_added numeric(12,2) DEFAULT 0 NOT NULL,
    incentive_added numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT payroll_items_pkey PRIMARY KEY (id),
    CONSTRAINT payroll_items_payroll_run_id_user_id_key UNIQUE (payroll_run_id, user_id)
);
--
-- Name: idx_payroll_items_run; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_payroll_items_run ON public.payroll_items USING btree (payroll_run_id);

--
-- Name: payslips; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.payslips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_run_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    present_days integer DEFAULT 0,
    absent_days integer DEFAULT 0,
    leave_days_taken integer DEFAULT 0,
    holiday_days integer DEFAULT 0,
    lop_days integer DEFAULT 0,
    per_day_rate numeric(12,2) DEFAULT 0,
    deduction_amount numeric(12,2) DEFAULT 0,
    gross_salary numeric(12,2) DEFAULT 0,
    net_salary numeric(12,2) DEFAULT 0,
    generated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payslips_pkey PRIMARY KEY (id),
    CONSTRAINT payslips_payroll_run_id_employee_id_key UNIQUE (payroll_run_id, employee_id)
);
--
-- Name: idx_payslips_employee; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_payslips_employee ON public.payslips USING btree (employee_id);
--
-- Name: idx_payslips_run; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_payslips_run ON public.payslips USING btree (payroll_run_id);

--
-- Name: allowances; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.allowances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason character varying(255) NOT NULL,
    allowance_type character varying(20) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT allowances_allowance_type_check CHECK (((allowance_type)::text = ANY ((ARRAY['in_hand'::character varying, 'added_to_salary'::character varying])::text[]))),
    CONSTRAINT allowances_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT allowances_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT allowances_pkey PRIMARY KEY (id)
);
--
-- Name: idx_allowances_hospital_year_month; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_allowances_hospital_year_month ON public.allowances USING btree (hospital_id, year, month);
--
-- Name: idx_allowances_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_allowances_user ON public.allowances USING btree (user_id);

--
-- Name: incentives; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.incentives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    sales_amount numeric(12,2) NOT NULL,
    incentive_percent numeric(5,2) NOT NULL,
    incentive_amount numeric(12,2) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT incentives_incentive_amount_check CHECK ((incentive_amount >= (0)::numeric)),
    CONSTRAINT incentives_incentive_percent_check CHECK ((incentive_percent > (0)::numeric)),
    CONSTRAINT incentives_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT incentives_sales_amount_check CHECK ((sales_amount > (0)::numeric)),
    CONSTRAINT incentives_pkey PRIMARY KEY (id)
);
--
-- Name: idx_incentives_hospital_year_month; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_incentives_hospital_year_month ON public.incentives USING btree (hospital_id, year, month);
--
-- Name: idx_incentives_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_incentives_user ON public.incentives USING btree (user_id);

-- ==============================================================================
-- TABLES -- each table's full, finalized definition: columns, primary key,
-- unique/check constraints, indexes, triggers, comments, and row-level
-- security, all together. Foreign keys are in their own section further
-- down, after every table exists -- a table's FK can reference a table
-- defined later in this file, so they can't safely live up here.
-- ==============================================================================

--
-- Name: advance_payments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.advance_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hospital_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    installments integer NOT NULL,
    emi_amount numeric(12,2) NOT NULL,
    start_year integer NOT NULL,
    start_month integer NOT NULL,
    reason character varying(255) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT advance_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT advance_payments_emi_amount_check CHECK ((emi_amount > (0)::numeric)),
    CONSTRAINT advance_payments_installments_check CHECK ((installments > 0)),
    CONSTRAINT advance_payments_start_month_check CHECK (((start_month >= 1) AND (start_month <= 12))),
    CONSTRAINT advance_payments_pkey PRIMARY KEY (id)
);
--
-- Name: idx_advance_payments_hospital; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_advance_payments_hospital ON public.advance_payments USING btree (hospital_id);
--
-- Name: idx_advance_payments_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_advance_payments_user ON public.advance_payments USING btree (user_id);

-- ------------------------------------------------------------------------------
-- MODULE: SAAS PLATFORM (saas_core schema) -- multi-tenant billing/subscriptions/modules
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: SAAS PLATFORM (saas_core schema) -- multi-tenant billing/subscriptions/modules
-- ------------------------------------------------------------------------------

--
-- Name: tenants; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(50) NOT NULL,
    code character varying(20) NOT NULL,
    logo_url character varying(500),
    primary_color character varying(7) DEFAULT '#1E40AF'::character varying,
    secondary_color character varying(7) DEFAULT '#3B82F6'::character varying,
    email character varying(255) NOT NULL,
    phone character varying(20),
    address_line_1 character varying(255),
    address_line_2 character varying(255),
    city character varying(100),
    state_province character varying(100),
    postal_code character varying(20),
    country character varying(3) DEFAULT 'USA'::character varying,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    default_currency character varying(3) DEFAULT 'USD'::character varying,
    registration_number character varying(100),
    tax_id character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying,
    is_verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    onboarding_completed boolean DEFAULT false,
    onboarding_step character varying(50) DEFAULT 'profile'::character varying,
    admin_user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    specialty character varying(50) DEFAULT 'general'::character varying,
    CONSTRAINT check_tenant_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'suspended'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT tenants_pkey PRIMARY KEY (id),
    CONSTRAINT tenants_code_key UNIQUE (code),
    CONSTRAINT tenants_slug_key UNIQUE (slug)
);
--
-- Name: idx_tenants_slug; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_tenants_slug ON saas_core.tenants USING btree (slug);
--
-- Name: idx_tenants_status; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_tenants_status ON saas_core.tenants USING btree (status);
--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: saas_core; Owner: -
--
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON saas_core.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: tenant_onboarding; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.tenant_onboarding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    profile_completed boolean DEFAULT false,
    billing_completed boolean DEFAULT false,
    team_invited boolean DEFAULT false,
    first_patient_created boolean DEFAULT false,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT tenant_onboarding_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_onboarding_tenant_id_key UNIQUE (tenant_id)
);
--
-- Name: idx_onboarding_tenant; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_onboarding_tenant ON saas_core.tenant_onboarding USING btree (tenant_id);

--
-- Name: tenant_modules; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.tenant_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    module_id uuid NOT NULL,
    is_enabled boolean DEFAULT true,
    enabled_at timestamp with time zone,
    enabled_by uuid,
    feature_config jsonb DEFAULT '{}'::jsonb,
    custom_limits jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tenant_modules_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_modules_tenant_id_module_id_key UNIQUE (tenant_id, module_id)
);
--
-- Name: idx_tenant_modules_enabled; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_tenant_modules_enabled ON saas_core.tenant_modules USING btree (tenant_id, is_enabled);
--
-- Name: idx_tenant_modules_tenant; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_tenant_modules_tenant ON saas_core.tenant_modules USING btree (tenant_id);
--
-- Name: tenant_modules update_tenant_modules_updated_at; Type: TRIGGER; Schema: saas_core; Owner: -
--
CREATE TRIGGER update_tenant_modules_updated_at BEFORE UPDATE ON saas_core.tenant_modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: tenant_subscriptions; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.tenant_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status character varying(20) DEFAULT 'trialing'::character varying,
    trial_ends_at timestamp with time zone,
    current_period_start timestamp with time zone DEFAULT now() NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    cancel_at_period_end boolean DEFAULT false,
    cancelled_at timestamp with time zone,
    cancellation_reason character varying(255),
    payment_method character varying(20),
    billing_email character varying(255),
    custom_features jsonb DEFAULT '{}'::jsonb,
    custom_limits jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_subscription_status CHECK (((status)::text = ANY ((ARRAY['trialing'::character varying, 'active'::character varying, 'past_due'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[]))),
    CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (id)
);
--
-- Name: idx_subscriptions_active_unique; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE UNIQUE INDEX idx_subscriptions_active_unique ON saas_core.tenant_subscriptions USING btree (tenant_id) WHERE ((status)::text = ANY ((ARRAY['trialing'::character varying, 'active'::character varying, 'past_due'::character varying])::text[]));
--
-- Name: idx_subscriptions_period_end; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_subscriptions_period_end ON saas_core.tenant_subscriptions USING btree (current_period_end);
--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_subscriptions_status ON saas_core.tenant_subscriptions USING btree (status);
--
-- Name: idx_subscriptions_tenant; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_subscriptions_tenant ON saas_core.tenant_subscriptions USING btree (tenant_id);
--
-- Name: tenant_subscriptions update_subscriptions_updated_at; Type: TRIGGER; Schema: saas_core; Owner: -
--
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON saas_core.tenant_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: modules; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    category character varying(50) NOT NULL,
    frontend_route_prefix character varying(50),
    api_prefix character varying(50),
    icon character varying(50),
    required_modules character varying(50)[] DEFAULT '{}'::character varying[],
    default_permissions jsonb DEFAULT '{}'::jsonb,
    is_core boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT modules_pkey PRIMARY KEY (id),
    CONSTRAINT modules_code_key UNIQUE (code)
);
--
-- Name: idx_modules_category; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_modules_category ON saas_core.modules USING btree (category);
--
-- Name: idx_modules_core; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_modules_core ON saas_core.modules USING btree (is_core);
--
-- Name: modules update_modules_updated_at; Type: TRIGGER; Schema: saas_core; Owner: -
--
CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON saas_core.modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: module_dependencies; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.module_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_name character varying(50) NOT NULL,
    depends_on character varying(50) NOT NULL,
    is_optional boolean DEFAULT false,
    CONSTRAINT module_dependencies_pkey PRIMARY KEY (id),
    CONSTRAINT module_dependencies_module_name_depends_on_key UNIQUE (module_name, depends_on)
);

--
-- Name: subscription_plans; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    base_price numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    max_users integer,
    max_patients integer,
    max_storage_gb integer,
    max_appointments_monthly integer,
    features_enabled jsonb DEFAULT '{}'::jsonb,
    modules_included uuid[] DEFAULT '{}'::uuid[],
    is_public boolean DEFAULT true,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscription_plans_pkey PRIMARY KEY (id),
    CONSTRAINT subscription_plans_code_key UNIQUE (code)
);
--
-- Name: subscription_plans update_plans_updated_at; Type: TRIGGER; Schema: saas_core; Owner: -
--
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON saas_core.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: system_settings; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    setting_type character varying(20) DEFAULT 'string'::character varying NOT NULL,
    description text,
    is_editable boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT system_settings_pkey PRIMARY KEY (id),
    CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key)
);

--
-- Name: usage_metrics; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.usage_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    metric_date date NOT NULL,
    api_calls_count bigint DEFAULT 0,
    users_count integer DEFAULT 0,
    patients_count integer DEFAULT 0,
    appointments_count integer DEFAULT 0,
    storage_bytes_used bigint DEFAULT 0,
    recorded_at timestamp with time zone DEFAULT now(),
    CONSTRAINT usage_metrics_pkey PRIMARY KEY (id),
    CONSTRAINT usage_metrics_tenant_id_metric_date_key UNIQUE (tenant_id, metric_date)
);
--
-- Name: idx_usage_tenant_date; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_usage_tenant_date ON saas_core.usage_metrics USING btree (tenant_id, metric_date DESC);
--
-- Name: TABLE usage_metrics; Type: COMMENT; Schema: saas_core; Owner: -
--
COMMENT ON TABLE saas_core.usage_metrics IS 'Daily usage metrics per tenant for billing and monitoring';

--
-- Name: usage_tracking; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.usage_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_type character varying(50) NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    usage_count integer DEFAULT 0,
    limit_reached_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT usage_tracking_pkey PRIMARY KEY (id),
    CONSTRAINT usage_tracking_tenant_id_resource_type_period_year_period_m_key UNIQUE (tenant_id, resource_type, period_year, period_month)
);
--
-- Name: idx_usage_period; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_usage_period ON saas_core.usage_tracking USING btree (period_year, period_month);
--
-- Name: idx_usage_tenant; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_usage_tenant ON saas_core.usage_tracking USING btree (tenant_id);
--
-- Name: usage_tracking update_usage_updated_at; Type: TRIGGER; Schema: saas_core; Owner: -
--
CREATE TRIGGER update_usage_updated_at BEFORE UPDATE ON saas_core.usage_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: rate_limit_buckets; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.rate_limit_buckets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_duration_seconds integer DEFAULT 60 NOT NULL,
    request_count integer DEFAULT 0,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT rate_limit_buckets_pkey PRIMARY KEY (id),
    CONSTRAINT rate_limit_buckets_tenant_id_window_start_window_duration_s_key UNIQUE (tenant_id, window_start, window_duration_seconds)
);
--
-- Name: idx_rate_limit_expires; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_rate_limit_expires ON saas_core.rate_limit_buckets USING btree (expires_at);

--
-- Name: billing_invoices; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.billing_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subscription_id uuid,
    invoice_number character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    subtotal numeric(12,2) NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0,
    total numeric(12,2) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0,
    amount_due numeric(12,2) NOT NULL,
    invoice_date date NOT NULL,
    due_date date NOT NULL,
    paid_at timestamp with time zone,
    line_items jsonb NOT NULL,
    payment_method character varying(20),
    payment_reference character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT billing_invoices_pkey PRIMARY KEY (id),
    CONSTRAINT billing_invoices_invoice_number_key UNIQUE (invoice_number)
);
--
-- Name: idx_invoices_status; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_invoices_status ON saas_core.billing_invoices USING btree (status);
--
-- Name: idx_invoices_tenant; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_invoices_tenant ON saas_core.billing_invoices USING btree (tenant_id);
--
-- Name: billing_invoices update_invoices_updated_at; Type: TRIGGER; Schema: saas_core; Owner: -
--
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON saas_core.billing_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: audit_logs; Type: TABLE; Schema: saas_core; Owner: -
--
CREATE TABLE saas_core.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    user_type character varying(20) DEFAULT 'hospital'::character varying NOT NULL,
    action character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    entity_name character varying(200),
    old_values jsonb,
    new_values jsonb,
    ip_address character varying(45),
    user_agent character varying(500),
    request_path character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    hospital_id uuid,
    resource_type character varying(50),
    resource_id uuid,
    severity character varying(20) DEFAULT 'INFO'::character varying,
    error_message text,
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
--
-- Name: idx_audit_action_severity; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_audit_action_severity ON saas_core.audit_logs USING btree (action, severity, created_at DESC);
--
-- Name: idx_audit_entity; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_audit_entity ON saas_core.audit_logs USING btree (entity_type, entity_id);
--
-- Name: idx_audit_tenant; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_audit_tenant ON saas_core.audit_logs USING btree (tenant_id, created_at DESC);
--
-- Name: idx_audit_tenant_created; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_audit_tenant_created ON saas_core.audit_logs USING btree (tenant_id, created_at DESC);
--
-- Name: idx_audit_user; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_audit_user ON saas_core.audit_logs USING btree (user_id, created_at DESC);
--
-- Name: idx_audit_user_created; Type: INDEX; Schema: saas_core; Owner: -
--
CREATE INDEX idx_audit_user_created ON saas_core.audit_logs USING btree (user_id, created_at DESC);
--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: saas_core; Owner: -
--
COMMENT ON TABLE saas_core.audit_logs IS 'Immutable audit trail for compliance and security forensics';

-- ==============================================================================
-- FOREIGN KEYS -- grouped by module and table, same order as the TABLES section
-- above. Placed after every CREATE TABLE since a FK can reference a table that
-- appears in a later module.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- MODULE: CORE / AUTH / RBAC / HOSPITAL SETTINGS
-- ------------------------------------------------------------------------------

-- ==============================================================================
-- FOREIGN KEYS -- grouped by module and table, same order as the TABLES section
-- above. Placed after every CREATE TABLE since a FK can reference a table that
-- appears in a later module.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- MODULE: CORE / AUTH / RBAC / HOSPITAL SETTINGS
-- ------------------------------------------------------------------------------

--
-- Name: hospitals hospitals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hospitals
    ADD CONSTRAINT hospitals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
--
-- Name: hospital_settings hospital_settings_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hospital_settings
    ADD CONSTRAINT hospital_settings_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: hospital_settings hospital_settings_queue_display_doctor1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hospital_settings
    ADD CONSTRAINT hospital_settings_queue_display_doctor1_id_fkey FOREIGN KEY (queue_display_doctor1_id) REFERENCES public.doctors(id);
--
-- Name: hospital_settings hospital_settings_queue_display_doctor2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hospital_settings
    ADD CONSTRAINT hospital_settings_queue_display_doctor2_id_fkey FOREIGN KEY (queue_display_doctor2_id) REFERENCES public.doctors(id);
--
-- Name: hospital_permission_overrides hospital_permission_overrides_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hospital_permission_overrides
    ADD CONSTRAINT hospital_permission_overrides_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: hospital_permission_overrides hospital_permission_overrides_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hospital_permission_overrides
    ADD CONSTRAINT hospital_permission_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);
--
-- Name: departments departments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: departments fk_departments_head_doctor; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_head_doctor FOREIGN KEY (head_doctor_id) REFERENCES public.doctors(id);
--
-- Name: users users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--
-- Name: users users_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: users users_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);
--
-- Name: roles roles_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id);
--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);
--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);
--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);
--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: revoked_tokens revoked_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.revoked_tokens
    ADD CONSTRAINT revoked_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: password_emails password_emails_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.password_emails
    ADD CONSTRAINT password_emails_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id);
--
-- Name: password_emails password_emails_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.password_emails
    ADD CONSTRAINT password_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: patient_email_verification_tokens patient_email_verification_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patient_email_verification_tokens
    ADD CONSTRAINT patient_email_verification_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: patient_email_verification_tokens patient_email_verification_tokens_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patient_email_verification_tokens
    ADD CONSTRAINT patient_email_verification_tokens_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
--
-- Name: id_sequences id_sequences_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.id_sequences
    ADD CONSTRAINT id_sequences_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: id_cards id_cards_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.id_cards
    ADD CONSTRAINT id_cards_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: id_cards id_cards_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.id_cards
    ADD CONSTRAINT id_cards_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id);
--
-- Name: audit_logs audit_logs_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: notifications notifications_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: notification_queue notification_queue_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: notification_templates notification_templates_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: queue_display_screens queue_display_screens_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.queue_display_screens
    ADD CONSTRAINT queue_display_screens_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);
--
-- Name: queue_display_screens queue_display_screens_doctor2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.queue_display_screens
    ADD CONSTRAINT queue_display_screens_doctor2_id_fkey FOREIGN KEY (doctor2_id) REFERENCES public.doctors(id);
--
-- Name: queue_display_screens queue_display_screens_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.queue_display_screens
    ADD CONSTRAINT queue_display_screens_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: queue_display_screens queue_display_screens_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.queue_display_screens
    ADD CONSTRAINT queue_display_screens_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: tax_configurations tax_configurations_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.tax_configurations
    ADD CONSTRAINT tax_configurations_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: payment_modes payment_modes_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payment_modes
    ADD CONSTRAINT payment_modes_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);

-- ------------------------------------------------------------------------------
-- MODULE: PATIENTS / CLINICAL / APPOINTMENTS / PRESCRIPTIONS / INSURANCE
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: PATIENTS / CLINICAL / APPOINTMENTS / PRESCRIPTIONS / INSURANCE
-- ------------------------------------------------------------------------------

--
-- Name: patients patients_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--
-- Name: patients patients_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: patients patients_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
--
-- Name: patient_consents patient_consents_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patient_consents
    ADD CONSTRAINT patient_consents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: patient_documents patient_documents_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT patient_documents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: patient_documents patient_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT patient_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);
--
-- Name: doctors doctors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: doctors doctors_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);
--
-- Name: doctors doctors_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: doctors doctors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: doctor_schedules doctor_schedules_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctor_schedules
    ADD CONSTRAINT doctor_schedules_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: doctor_leaves doctor_leaves_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctor_leaves
    ADD CONSTRAINT doctor_leaves_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);
--
-- Name: doctor_leaves doctor_leaves_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctor_leaves
    ADD CONSTRAINT doctor_leaves_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: doctor_fees doctor_fees_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.doctor_fees
    ADD CONSTRAINT doctor_fees_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: appointments appointments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: appointments appointments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);
--
-- Name: appointments appointments_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: appointments appointments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: appointments appointments_parent_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_parent_appointment_id_fkey FOREIGN KEY (parent_appointment_id) REFERENCES public.appointments(id);
--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: appointment_queue appointment_queue_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointment_queue
    ADD CONSTRAINT appointment_queue_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: appointment_queue appointment_queue_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointment_queue
    ADD CONSTRAINT appointment_queue_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: appointment_status_log appointment_status_log_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointment_status_log
    ADD CONSTRAINT appointment_status_log_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: appointment_status_log appointment_status_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.appointment_status_log
    ADD CONSTRAINT appointment_status_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);
--
-- Name: waitlists waitlists_booked_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.waitlists
    ADD CONSTRAINT waitlists_booked_appointment_id_fkey FOREIGN KEY (booked_appointment_id) REFERENCES public.appointments(id);
--
-- Name: waitlists waitlists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.waitlists
    ADD CONSTRAINT waitlists_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: waitlists waitlists_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.waitlists
    ADD CONSTRAINT waitlists_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);
--
-- Name: waitlists waitlists_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.waitlists
    ADD CONSTRAINT waitlists_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: waitlists waitlists_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.waitlists
    ADD CONSTRAINT waitlists_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: waitlists waitlists_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.waitlists
    ADD CONSTRAINT waitlists_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
--
-- Name: prescriptions prescriptions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: prescriptions prescriptions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: prescriptions prescriptions_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: prescriptions prescriptions_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: prescriptions prescriptions_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.hospitals(id);
--
-- Name: prescriptions prescriptions_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: prescriptions prescriptions_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.appointment_queue(id);
--
-- Name: prescription_items prescription_items_medicine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescription_items
    ADD CONSTRAINT prescription_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id);
--
-- Name: prescription_items prescription_items_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescription_items
    ADD CONSTRAINT prescription_items_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);
--
-- Name: prescription_versions prescription_versions_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescription_versions
    ADD CONSTRAINT prescription_versions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);
--
-- Name: prescription_versions prescription_versions_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescription_versions
    ADD CONSTRAINT prescription_versions_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);
--
-- Name: prescription_templates prescription_templates_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.prescription_templates
    ADD CONSTRAINT prescription_templates_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: clinical_note_ngrams clinical_note_ngrams_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.clinical_note_ngrams
    ADD CONSTRAINT clinical_note_ngrams_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: insurance_providers insurance_providers_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_providers
    ADD CONSTRAINT insurance_providers_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: insurance_policies insurance_policies_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: insurance_policies insurance_policies_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.insurance_providers(id);
--
-- Name: insurance_claims insurance_claims_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: insurance_claims insurance_claims_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: insurance_claims insurance_claims_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: insurance_claims insurance_claims_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: insurance_claims insurance_claims_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.insurance_policies(id);
--
-- Name: pre_authorizations pre_authorizations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pre_authorizations
    ADD CONSTRAINT pre_authorizations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: pre_authorizations pre_authorizations_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pre_authorizations
    ADD CONSTRAINT pre_authorizations_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.insurance_policies(id);

-- ------------------------------------------------------------------------------
-- MODULE: BILLING / INVENTORY / PURCHASING
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: BILLING / INVENTORY / PURCHASING
-- ------------------------------------------------------------------------------

--
-- Name: suppliers suppliers_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: purchase_orders purchase_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);
--
-- Name: purchase_orders purchase_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: purchase_orders purchase_orders_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);
--
-- Name: purchase_order_payments purchase_order_payments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_order_payments
    ADD CONSTRAINT purchase_order_payments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: purchase_order_payments purchase_order_payments_payment_mode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_order_payments
    ADD CONSTRAINT purchase_order_payments_payment_mode_id_fkey FOREIGN KEY (payment_mode_id) REFERENCES public.payment_modes(id);
--
-- Name: purchase_order_payments purchase_order_payments_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_order_payments
    ADD CONSTRAINT purchase_order_payments_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);
--
-- Name: purchase_order_payments purchase_order_payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.purchase_order_payments
    ADD CONSTRAINT purchase_order_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);
--
-- Name: goods_receipt_notes goods_receipt_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: goods_receipt_notes goods_receipt_notes_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: goods_receipt_notes goods_receipt_notes_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);
--
-- Name: goods_receipt_notes goods_receipt_notes_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
--
-- Name: goods_receipt_notes goods_receipt_notes_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);
--
-- Name: grn_items grn_items_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id);
--
-- Name: invoices fk_invoices_insurance_claim; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT fk_invoices_insurance_claim FOREIGN KEY (insurance_claim_id) REFERENCES public.insurance_claims(id);
--
-- Name: invoices invoices_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: invoices invoices_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: invoices invoices_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: invoice_items invoice_items_tax_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_tax_config_id_fkey FOREIGN KEY (tax_config_id) REFERENCES public.tax_configurations(id);
--
-- Name: payments payments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: payments payments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: payments payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);
--
-- Name: credit_notes credit_notes_applied_to_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_applied_to_invoice_id_fkey FOREIGN KEY (applied_to_invoice_id) REFERENCES public.invoices(id);
--
-- Name: credit_notes credit_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: credit_notes credit_notes_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: credit_notes credit_notes_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: credit_notes credit_notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: refunds refunds_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);
--
-- Name: refunds refunds_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: refunds refunds_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: refunds refunds_invoice_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_invoice_item_id_fkey FOREIGN KEY (invoice_item_id) REFERENCES public.invoice_items(id);
--
-- Name: refunds refunds_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: refunds refunds_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);
--
-- Name: refunds refunds_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);
--
-- Name: daily_settlements daily_settlements_cashier_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.daily_settlements
    ADD CONSTRAINT daily_settlements_cashier_user_id_fkey FOREIGN KEY (cashier_user_id) REFERENCES public.users(id);
--
-- Name: daily_settlements daily_settlements_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.daily_settlements
    ADD CONSTRAINT daily_settlements_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: daily_settlements daily_settlements_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.daily_settlements
    ADD CONSTRAINT daily_settlements_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);
--
-- Name: stock_adjustments stock_adjustments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);
--
-- Name: stock_adjustments stock_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: stock_adjustments stock_adjustments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: stock_movements stock_movements_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: stock_movements stock_movements_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);
--
-- Name: cycle_counts cycle_counts_counted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.cycle_counts
    ADD CONSTRAINT cycle_counts_counted_by_fkey FOREIGN KEY (counted_by) REFERENCES public.users(id);
--
-- Name: cycle_counts cycle_counts_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.cycle_counts
    ADD CONSTRAINT cycle_counts_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: cycle_counts cycle_counts_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.cycle_counts
    ADD CONSTRAINT cycle_counts_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);
--
-- Name: cycle_count_items cycle_count_items_cycle_count_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.cycle_count_items
    ADD CONSTRAINT cycle_count_items_cycle_count_id_fkey FOREIGN KEY (cycle_count_id) REFERENCES public.cycle_counts(id);

-- ------------------------------------------------------------------------------
-- MODULE: PHARMACY
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: PHARMACY
-- ------------------------------------------------------------------------------

--
-- Name: medicines medicines_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT medicines_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: medicines medicines_tax_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT medicines_tax_config_id_fkey FOREIGN KEY (tax_config_id) REFERENCES public.tax_configurations(id);
--
-- Name: medicine_batches fk_medicine_batches_grn; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.medicine_batches
    ADD CONSTRAINT fk_medicine_batches_grn FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id);
--
-- Name: medicine_batches medicine_batches_medicine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.medicine_batches
    ADD CONSTRAINT medicine_batches_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id);
--
-- Name: medicine_batches medicine_batches_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.medicine_batches
    ADD CONSTRAINT medicine_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
--
-- Name: pharmacy_dispensing pharmacy_dispensing_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing
    ADD CONSTRAINT pharmacy_dispensing_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: pharmacy_dispensing pharmacy_dispensing_dispensed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing
    ADD CONSTRAINT pharmacy_dispensing_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES public.users(id);
--
-- Name: pharmacy_dispensing pharmacy_dispensing_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing
    ADD CONSTRAINT pharmacy_dispensing_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: pharmacy_dispensing pharmacy_dispensing_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing
    ADD CONSTRAINT pharmacy_dispensing_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: pharmacy_dispensing pharmacy_dispensing_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing
    ADD CONSTRAINT pharmacy_dispensing_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: pharmacy_dispensing pharmacy_dispensing_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing
    ADD CONSTRAINT pharmacy_dispensing_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);
--
-- Name: pharmacy_dispensing_items pharmacy_dispensing_items_dispensing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing_items
    ADD CONSTRAINT pharmacy_dispensing_items_dispensing_id_fkey FOREIGN KEY (dispensing_id) REFERENCES public.pharmacy_dispensing(id);
--
-- Name: pharmacy_dispensing_items pharmacy_dispensing_items_medicine_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing_items
    ADD CONSTRAINT pharmacy_dispensing_items_medicine_batch_id_fkey FOREIGN KEY (medicine_batch_id) REFERENCES public.medicine_batches(id);
--
-- Name: pharmacy_dispensing_items pharmacy_dispensing_items_medicine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing_items
    ADD CONSTRAINT pharmacy_dispensing_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id);
--
-- Name: pharmacy_dispensing_items pharmacy_dispensing_items_prescription_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_dispensing_items
    ADD CONSTRAINT pharmacy_dispensing_items_prescription_item_id_fkey FOREIGN KEY (prescription_item_id) REFERENCES public.prescription_items(id);
--
-- Name: pharmacy_queue_entries pharmacy_queue_entries_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_queue_entries
    ADD CONSTRAINT pharmacy_queue_entries_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: pharmacy_queue_entries pharmacy_queue_entries_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_queue_entries
    ADD CONSTRAINT pharmacy_queue_entries_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: pharmacy_queue_entries pharmacy_queue_entries_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_queue_entries
    ADD CONSTRAINT pharmacy_queue_entries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: pharmacy_queue_entries pharmacy_queue_entries_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_queue_entries
    ADD CONSTRAINT pharmacy_queue_entries_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);
--
-- Name: pharmacy_queue_entries pharmacy_queue_entries_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_queue_entries
    ADD CONSTRAINT pharmacy_queue_entries_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.pharmacy_dispensing(id);
--
-- Name: pharmacy_returns pharmacy_returns_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);
--
-- Name: pharmacy_returns pharmacy_returns_dispensing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_dispensing_id_fkey FOREIGN KEY (dispensing_id) REFERENCES public.pharmacy_dispensing(id);
--
-- Name: pharmacy_returns pharmacy_returns_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: pharmacy_returns pharmacy_returns_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: pharmacy_return_items pharmacy_return_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_return_items
    ADD CONSTRAINT pharmacy_return_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.medicine_batches(id);
--
-- Name: pharmacy_return_items pharmacy_return_items_dispensing_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_return_items
    ADD CONSTRAINT pharmacy_return_items_dispensing_item_id_fkey FOREIGN KEY (dispensing_item_id) REFERENCES public.pharmacy_dispensing_items(id);
--
-- Name: pharmacy_return_items pharmacy_return_items_medicine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_return_items
    ADD CONSTRAINT pharmacy_return_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id);
--
-- Name: pharmacy_return_items pharmacy_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pharmacy_return_items
    ADD CONSTRAINT pharmacy_return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.pharmacy_returns(id);

-- ------------------------------------------------------------------------------
-- MODULE: LAB
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: LAB
-- ------------------------------------------------------------------------------

--
-- Name: lab_tests lab_tests_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_tests
    ADD CONSTRAINT lab_tests_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: lab_test_panels lab_test_panels_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_test_panels
    ADD CONSTRAINT lab_test_panels_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: lab_orders lab_orders_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: lab_orders lab_orders_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: lab_orders lab_orders_finalized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.users(id);
--
-- Name: lab_orders lab_orders_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: lab_orders lab_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: lab_orders lab_orders_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);
--
-- Name: lab_order_items lab_order_items_lab_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_order_items
    ADD CONSTRAINT lab_order_items_lab_order_id_fkey FOREIGN KEY (lab_order_id) REFERENCES public.lab_orders(id);
--
-- Name: lab_order_items lab_order_items_lab_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_order_items
    ADD CONSTRAINT lab_order_items_lab_test_id_fkey FOREIGN KEY (lab_test_id) REFERENCES public.lab_tests(id);
--
-- Name: lab_order_items lab_order_items_resulted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_order_items
    ADD CONSTRAINT lab_order_items_resulted_by_fkey FOREIGN KEY (resulted_by) REFERENCES public.users(id);
--
-- Name: lab_referrals lab_referrals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_referrals
    ADD CONSTRAINT lab_referrals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: lab_referrals lab_referrals_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_referrals
    ADD CONSTRAINT lab_referrals_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: lab_referrals lab_referrals_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_referrals
    ADD CONSTRAINT lab_referrals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: lab_sales lab_sales_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_sales
    ADD CONSTRAINT lab_sales_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: lab_sales lab_sales_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_sales
    ADD CONSTRAINT lab_sales_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: lab_sales lab_sales_lab_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_sales
    ADD CONSTRAINT lab_sales_lab_order_id_fkey FOREIGN KEY (lab_order_id) REFERENCES public.lab_orders(id);
--
-- Name: lab_sales lab_sales_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.lab_sales
    ADD CONSTRAINT lab_sales_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);

-- ------------------------------------------------------------------------------
-- MODULE: OPTICAL
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: OPTICAL
-- ------------------------------------------------------------------------------

--
-- Name: optical_products optical_products_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_products
    ADD CONSTRAINT optical_products_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: optical_products optical_products_tax_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_products
    ADD CONSTRAINT optical_products_tax_config_id_fkey FOREIGN KEY (tax_config_id) REFERENCES public.tax_configurations(id);
--
-- Name: optical_batches optical_batches_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_batches
    ADD CONSTRAINT optical_batches_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id);
--
-- Name: optical_batches optical_batches_optical_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_batches
    ADD CONSTRAINT optical_batches_optical_product_id_fkey FOREIGN KEY (optical_product_id) REFERENCES public.optical_products(id);
--
-- Name: optical_orders optical_orders_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: optical_orders optical_orders_frame_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_frame_product_id_fkey FOREIGN KEY (frame_product_id) REFERENCES public.optical_products(id);
--
-- Name: optical_orders optical_orders_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: optical_orders optical_orders_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: optical_orders optical_orders_left_lens_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_left_lens_product_id_fkey FOREIGN KEY (left_lens_product_id) REFERENCES public.optical_products(id);
--
-- Name: optical_orders optical_orders_optical_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_optical_prescription_id_fkey FOREIGN KEY (optical_prescription_id) REFERENCES public.optical_prescriptions(id);
--
-- Name: optical_orders optical_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: optical_orders optical_orders_right_lens_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_orders
    ADD CONSTRAINT optical_orders_right_lens_product_id_fkey FOREIGN KEY (right_lens_product_id) REFERENCES public.optical_products(id);
--
-- Name: optical_order_items optical_order_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_order_items
    ADD CONSTRAINT optical_order_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.optical_batches(id);
--
-- Name: optical_order_items optical_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_order_items
    ADD CONSTRAINT optical_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.optical_orders(id);
--
-- Name: optical_order_items optical_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_order_items
    ADD CONSTRAINT optical_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.optical_products(id);
--
-- Name: optical_prescriptions optical_prescriptions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_prescriptions
    ADD CONSTRAINT optical_prescriptions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
--
-- Name: optical_prescriptions optical_prescriptions_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_prescriptions
    ADD CONSTRAINT optical_prescriptions_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);
--
-- Name: optical_prescriptions optical_prescriptions_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_prescriptions
    ADD CONSTRAINT optical_prescriptions_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: optical_prescriptions optical_prescriptions_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_prescriptions
    ADD CONSTRAINT optical_prescriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
--
-- Name: optical_repairs optical_repairs_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_repairs
    ADD CONSTRAINT optical_repairs_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: optical_repairs optical_repairs_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_repairs
    ADD CONSTRAINT optical_repairs_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
--
-- Name: optical_repairs optical_repairs_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.optical_repairs
    ADD CONSTRAINT optical_repairs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);

-- ------------------------------------------------------------------------------
-- MODULE: WORKFORCE / ATTENDANCE / PAYROLL
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: WORKFORCE / ATTENDANCE / PAYROLL
-- ------------------------------------------------------------------------------

--
-- Name: shifts shifts_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: shift_assignments shift_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: shift_assignments shift_assignments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: shift_assignments shift_assignments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);
--
-- Name: shift_assignments shift_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: employee_profiles employee_profiles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);
--
-- Name: employee_profiles employee_profiles_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: employee_profiles employee_profiles_reporting_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_reporting_manager_id_fkey FOREIGN KEY (reporting_manager_id) REFERENCES public.users(id);
--
-- Name: employee_profiles employee_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: employee_salary employee_salary_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_salary
    ADD CONSTRAINT employee_salary_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id);
--
-- Name: employee_salary employee_salary_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_salary
    ADD CONSTRAINT employee_salary_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: employee_shift_assignments employee_shift_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);
--
-- Name: employee_shift_assignments employee_shift_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id);
--
-- Name: employee_shift_assignments employee_shift_assignments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);
--
-- Name: holidays holidays_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: holidays holidays_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: attendance_records attendance_records_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: attendance_records attendance_records_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id);
--
-- Name: attendance_records attendance_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: leave_balances leave_balances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id);
--
-- Name: leave_records leave_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.leave_records
    ADD CONSTRAINT leave_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id);
--
-- Name: leave_records leave_records_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.leave_records
    ADD CONSTRAINT leave_records_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.users(id);
--
-- Name: leave_records leave_records_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.leave_records
    ADD CONSTRAINT leave_records_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: payroll_runs payroll_runs_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.users(id);
--
-- Name: payroll_runs payroll_runs_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: payroll_items payroll_items_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payroll_items
    ADD CONSTRAINT payroll_items_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON DELETE CASCADE;
--
-- Name: payroll_items payroll_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payroll_items
    ADD CONSTRAINT payroll_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: payslips payslips_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id);
--
-- Name: payslips payslips_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id);
--
-- Name: allowances allowances_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.allowances
    ADD CONSTRAINT allowances_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: allowances allowances_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.allowances
    ADD CONSTRAINT allowances_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: allowances allowances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.allowances
    ADD CONSTRAINT allowances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
--
-- Name: incentives incentives_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.incentives
    ADD CONSTRAINT incentives_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: incentives incentives_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.incentives
    ADD CONSTRAINT incentives_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: incentives incentives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.incentives
    ADD CONSTRAINT incentives_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
-- ==============================================================================
-- FOREIGN KEYS -- grouped by the table they're added to, same order as above.
-- Placed after every CREATE TABLE since a FK can reference a table that
-- appears later in the TABLES section.
-- ==============================================================================

--
-- Name: advance_payments advance_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.advance_payments
    ADD CONSTRAINT advance_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
--
-- Name: advance_payments advance_payments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.advance_payments
    ADD CONSTRAINT advance_payments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
--
-- Name: advance_payments advance_payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.advance_payments
    ADD CONSTRAINT advance_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- ------------------------------------------------------------------------------
-- MODULE: SAAS PLATFORM (saas_core schema) -- multi-tenant billing/subscriptions/modules
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- MODULE: SAAS PLATFORM (saas_core schema) -- multi-tenant billing/subscriptions/modules
-- ------------------------------------------------------------------------------

--
-- Name: tenant_onboarding tenant_onboarding_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.tenant_onboarding
    ADD CONSTRAINT tenant_onboarding_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id) ON DELETE CASCADE;
--
-- Name: tenant_modules tenant_modules_module_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.tenant_modules
    ADD CONSTRAINT tenant_modules_module_id_fkey FOREIGN KEY (module_id) REFERENCES saas_core.modules(id);
--
-- Name: tenant_modules tenant_modules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.tenant_modules
    ADD CONSTRAINT tenant_modules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
--
-- Name: tenant_subscriptions tenant_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES saas_core.subscription_plans(id);
--
-- Name: tenant_subscriptions tenant_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
--
-- Name: usage_metrics usage_metrics_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.usage_metrics
    ADD CONSTRAINT usage_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id) ON DELETE CASCADE;
--
-- Name: usage_tracking usage_tracking_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.usage_tracking
    ADD CONSTRAINT usage_tracking_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
--
-- Name: rate_limit_buckets rate_limit_buckets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.rate_limit_buckets
    ADD CONSTRAINT rate_limit_buckets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
--
-- Name: billing_invoices billing_invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.billing_invoices
    ADD CONSTRAINT billing_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES saas_core.tenant_subscriptions(id);
--
-- Name: billing_invoices billing_invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.billing_invoices
    ADD CONSTRAINT billing_invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);
--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: saas_core; Owner: -
--
ALTER TABLE ONLY saas_core.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES saas_core.tenants(id);

-- ==============================================================================
-- VIEWS
-- ==============================================================================

-- ==============================================================================
-- VIEWS
-- ==============================================================================

-- ==============================================================================
-- VIEWS
-- ==============================================================================

--
-- Name: v_revoked_tokens_expired; Type: VIEW; Schema: public; Owner: -
--
CREATE VIEW public.v_revoked_tokens_expired AS
 SELECT jti,
    user_id,
    revoked_at,
    expires_at
   FROM public.revoked_tokens
  WHERE (expires_at < now());

--
-- Name: v_active_tenants; Type: VIEW; Schema: saas_core; Owner: -
--
CREATE VIEW saas_core.v_active_tenants AS
 SELECT t.id,
    t.name,
    t.slug,
    t.code,
    t.logo_url,
    t.primary_color,
    t.secondary_color,
    t.email,
    t.phone,
    t.address_line_1,
    t.address_line_2,
    t.city,
    t.state_province,
    t.postal_code,
    t.country,
    t.timezone,
    t.default_currency,
    t.registration_number,
    t.tax_id,
    t.status,
    t.is_verified,
    t.verified_at,
    t.onboarding_completed,
    t.onboarding_step,
    t.admin_user_id,
    t.created_at,
    t.updated_at,
    sp.name AS plan_name,
    sp.code AS plan_code,
    ts.status AS subscription_status,
    ts.current_period_end,
        CASE
            WHEN ((ts.status)::text = 'trialing'::text) THEN 'Trial'::text
            WHEN ((ts.status)::text = 'active'::text) THEN 'Active'::text
            WHEN ((ts.status)::text = 'past_due'::text) THEN 'Past Due'::text
            WHEN ((ts.status)::text = 'suspended'::text) THEN 'Suspended'::text
            ELSE 'Unknown'::text
        END AS display_status
   FROM ((saas_core.tenants t
     LEFT JOIN saas_core.tenant_subscriptions ts ON (((t.id = ts.tenant_id) AND ((ts.status)::text = ANY ((ARRAY['trialing'::character varying, 'active'::character varying, 'past_due'::character varying])::text[])))))
     LEFT JOIN saas_core.subscription_plans sp ON ((ts.plan_id = sp.id)))
  WHERE ((t.status)::text = 'active'::text);

--
-- Name: v_tenant_modules; Type: VIEW; Schema: saas_core; Owner: -
--
CREATE VIEW saas_core.v_tenant_modules AS
 SELECT tm.id,
    tm.tenant_id,
    tm.module_id,
    tm.is_enabled,
    tm.enabled_at,
    tm.enabled_by,
    tm.feature_config,
    tm.custom_limits,
    tm.created_at,
    tm.updated_at,
    m.code AS module_code,
    m.name AS module_name,
    m.description AS module_description,
    m.category,
    m.is_core,
    m.icon,
    m.frontend_route_prefix,
    m.api_prefix
   FROM (saas_core.tenant_modules tm
     JOIN saas_core.modules m ON ((tm.module_id = m.id)));

COMMIT;
