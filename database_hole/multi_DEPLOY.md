# HMS Multi-Tenant — Database Deployment Guide

Clean, consolidated SQL set for a **first-time deployment on a new machine**.
All deployment files are prefixed `multi_` and are organized by function.

## Files (run in this order)

| Order | File | Purpose | Run as |
|-------|------|---------|--------|
| 0 (optional) | `multi_00_reset.sql` | **Destructive** teardown — drops `hms_db`. Only for a clean re-deploy. | `postgres` (superuser), **not** inside `hms_db` |
| 1 | `multi_01_schema.sql` | Complete schema: core HMS (public) + `saas_core` multi-tenant + tenant links/RLS + inventory & common-medicine adjustments. | `hms_user`, inside `hms_db` |
| 2 | `multi_02_seed.sql` | Sample/seed data (core + inventory). Optional for production. | `hms_user`, inside `hms_db` |
| — | `multi_03_queries.sql` | **Reference only** — common queries grouped by functional area. Never executed during deploy. | n/a |

> The original numbered files (`01..09`, `inventory_alter.sql`) are kept for history/recovery. The `multi_*` set is the canonical first-time deploy. Recovery-only scripts **`06_fix_multi_tenant.sql`** (drops `saas_core`) and **`08_fix_hospitals_tenant_id.sql`** (bootstrap for DBs created with only `01`) are **intentionally excluded** from the clean set.

## Step-by-step (fresh machine)

```bash
# 1. Create the database + app role (run once, as a Postgres superuser)
psql -U postgres -c "CREATE USER hms_user WITH PASSWORD '<STRONG_PASSWORD>';"
psql -U postgres -c "CREATE DATABASE hms_db OWNER hms_user;"

# 2. Create the schema (as the owner, inside hms_db)
psql -U hms_user -d hms_db -f multi_01_schema.sql

# 3. (optional) Load seed/sample data
psql -U hms_user -d hms_db -f multi_02_seed.sql
```

Then set `backend/.env`:
```
DATABASE_URL=postgresql://hms_user:<STRONG_PASSWORD>@localhost:5432/hms_db
SECRET_KEY=<python -c "import secrets; print(secrets.token_hex(32))">
DEBUG=false
```

## What `multi_01_schema.sql` contains (in dependency order)

1. **Core HMS (public)** — hospitals, users/roles/permissions, departments, doctors & schedules, hospital_settings, patients, appointments/queues/waitlist, prescriptions (+items/templates/versions), medicines, pharmacy (batches/sales), inventory (suppliers/POs/GRNs/stock movements/adjustments/cycle counts), optical, billing (tax configs, invoices, payments, refunds, settlements, insurance), notifications.
2. **`saas_core`** — tenants, subscription_plans, tenant_subscriptions, modules, tenant_modules, usage_tracking, audit_logs, system_settings.
3. **Tenant links / security** — `hospitals.tenant_id` + indexes, extended `audit_logs`, module_dependencies, usage_metrics, rate_limit_buckets, tenant_onboarding, and Row-Level-Security policies.
4. **Adjustments** — `suppliers.product_categories`; `medicines.is_global` + nullable `hospital_id` (enables platform-wide **common medicines** for hospitals without the inventory module).

## Important notes

- **Run `multi_01_schema.sql` as the table owner (`hms_user`).** Section 3 enables Row-Level Security on a few tables; the table owner bypasses RLS, and the application enforces tenant isolation at the query layer (`hospital_id`). If you deploy under a different role, review the RLS policies first.
- **Idempotency:** the schema uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` widely, but treat `multi_01_schema.sql` as a first-time install. To re-deploy cleanly, run `multi_00_reset.sql` first.
- **Common medicines** require the `medicines.is_global` column — it's already included here (Section 5), so no separate migration is needed on a fresh deploy.
- Seed data is for dev/demo. For production, skip `multi_02_seed.sql` and onboard the first tenant/super-admin through the application.
