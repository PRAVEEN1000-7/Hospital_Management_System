-- ============================================================
-- 05_pharmacy_tables.sql  —  Pharmacy module tables
-- Run this against hms_db to create the pharmacy schema.
-- ============================================================

-- 1. Suppliers (must exist before medicine_batches / purchase_orders)
CREATE TABLE IF NOT EXISTS suppliers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    name            VARCHAR(200) NOT NULL,
    contact_person  VARCHAR(200),
    phone           VARCHAR(20),
    email           VARCHAR(255),
    address         TEXT,
    gst_number      VARCHAR(20),
    drug_license_number VARCHAR(50),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_supplier_name UNIQUE (hospital_id, name)
);

-- 2. Medicines (master catalogue)
CREATE TABLE IF NOT EXISTS medicines (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id          UUID NOT NULL REFERENCES hospitals(id),
    name                 VARCHAR(200) NOT NULL,
    generic_name         VARCHAR(200),
    brand                VARCHAR(200),
    category             VARCHAR(100),
    dosage_form          VARCHAR(100),
    strength             VARCHAR(100),
    manufacturer         VARCHAR(200),
    hsn_code             VARCHAR(20),
    sku                  VARCHAR(50),
    barcode              VARCHAR(50),
    unit                 VARCHAR(30) DEFAULT 'Nos',
    description          TEXT,
    requires_prescription BOOLEAN DEFAULT FALSE,
    is_active            BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),
    created_by           UUID REFERENCES users(id),
    CONSTRAINT uq_medicine_name_strength UNIQUE (hospital_id, name, strength)
);

-- 3. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id       UUID NOT NULL REFERENCES hospitals(id),
    supplier_id       UUID NOT NULL REFERENCES suppliers(id),
    order_number      VARCHAR(30) NOT NULL,
    order_date        DATE DEFAULT CURRENT_DATE,
    expected_delivery DATE,
    status            VARCHAR(20) DEFAULT 'draft',
    total_amount      NUMERIC(14,2) DEFAULT 0,
    notes             TEXT,
    created_by        UUID REFERENCES users(id),
    received_by       UUID REFERENCES users(id),
    received_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_po_number UNIQUE (hospital_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_po_order_number ON purchase_orders(order_number);

-- 4. Medicine Batches (depends on medicines, suppliers, purchase_orders)
CREATE TABLE IF NOT EXISTS medicine_batches (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id       UUID NOT NULL REFERENCES medicines(id),
    batch_number      VARCHAR(50) NOT NULL,
    expiry_date       DATE NOT NULL,
    quantity          INTEGER NOT NULL DEFAULT 0,
    purchase_price    NUMERIC(12,2) NOT NULL,
    selling_price     NUMERIC(12,2) NOT NULL,
    mrp               NUMERIC(12,2),
    tax_percent       NUMERIC(5,2) DEFAULT 0,
    received_date     DATE DEFAULT CURRENT_DATE,
    supplier_id       UUID REFERENCES suppliers(id),
    purchase_order_id UUID REFERENCES purchase_orders(id),
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_medicine_batch UNIQUE (medicine_id, batch_number),
    CONSTRAINT ck_batch_qty_non_negative CHECK (quantity >= 0)
);

-- 5. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    medicine_id       UUID NOT NULL REFERENCES medicines(id),
    quantity_ordered  INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_price        NUMERIC(12,2) NOT NULL,
    total_price       NUMERIC(14,2) NOT NULL,
    batch_number      VARCHAR(50),
    expiry_date       DATE
);

-- 6. Pharmacy Sales
CREATE TABLE IF NOT EXISTS pharmacy_sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    invoice_number  VARCHAR(30) NOT NULL,
    sale_date       TIMESTAMPTZ DEFAULT now(),
    patient_id      UUID REFERENCES patients(id),
    patient_name    VARCHAR(200),
    doctor_name     VARCHAR(200),
    subtotal        NUMERIC(14,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    tax_amount      NUMERIC(12,2) DEFAULT 0,
    total_amount    NUMERIC(14,2) DEFAULT 0,
    payment_method  VARCHAR(30) DEFAULT 'cash',
    payment_status  VARCHAR(20) DEFAULT 'paid',
    status          VARCHAR(20) DEFAULT 'completed',
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_sale_invoice UNIQUE (hospital_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_sale_invoice ON pharmacy_sales(invoice_number);

-- 7. Pharmacy Sale Items
CREATE TABLE IF NOT EXISTS pharmacy_sale_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id         UUID NOT NULL REFERENCES pharmacy_sales(id),
    medicine_id     UUID NOT NULL REFERENCES medicines(id),
    batch_id        UUID REFERENCES medicine_batches(id),
    medicine_name   VARCHAR(200) NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      NUMERIC(12,2) NOT NULL,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    tax_percent     NUMERIC(5,2) DEFAULT 0,
    total_price     NUMERIC(14,2) NOT NULL
);

-- 8. Stock Adjustments
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    medicine_id     UUID NOT NULL REFERENCES medicines(id),
    batch_id        UUID REFERENCES medicine_batches(id),
    adjustment_type VARCHAR(30) NOT NULL,
    quantity        INTEGER NOT NULL,
    reason          TEXT,
    adjusted_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Done ✓
