-- ============================================================================
-- HMS - Centralized Products Master Table (Simplified)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CREATE CENTRALIZED PRODUCTS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    product_name VARCHAR(200) NOT NULL,
    generic_name VARCHAR(200),
    brand_name VARCHAR(200),
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(100),
    sku VARCHAR(50),
    barcode VARCHAR(100),
    manufacturer VARCHAR(200),
    supplier_id UUID REFERENCES suppliers(id),
    purchase_price NUMERIC(12, 2) DEFAULT 0,
    selling_price NUMERIC(12, 2) DEFAULT 0,
    mrp NUMERIC(12, 2) DEFAULT 0,
    tax_percentage NUMERIC(5, 2) DEFAULT 0,
    unit_type VARCHAR(50) DEFAULT 'unit',
    pack_size INTEGER DEFAULT 1,
    min_stock_level INTEGER DEFAULT 10,
    max_stock_level INTEGER DEFAULT 1000,
    reorder_level INTEGER DEFAULT 20,
    storage_conditions TEXT,
    shelf_life_days INTEGER,
    requires_refrigeration BOOLEAN DEFAULT FALSE,
    is_hazardous BOOLEAN DEFAULT FALSE,
    is_narcotic BOOLEAN DEFAULT FALSE,
    requires_prescription BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_hospital ON products(hospital_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CREATE STOCK SUMMARY TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    total_stock INTEGER DEFAULT 0,
    available_stock INTEGER DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    damaged_stock INTEGER DEFAULT 0,
    expired_stock INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    earliest_expiry DATE,
    avg_cost_price NUMERIC(12, 2) DEFAULT 0,
    total_value NUMERIC(14, 2) DEFAULT 0,
    is_low_stock BOOLEAN DEFAULT FALSE,
    is_expiring_soon BOOLEAN DEFAULT FALSE,
    last_movement_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_summary_hospital ON stock_summary(hospital_id);
CREATE INDEX IF NOT EXISTS idx_stock_summary_low_stock ON stock_summary(hospital_id, is_low_stock) WHERE is_low_stock = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CREATE STOCK ALERTS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    current_stock INTEGER,
    threshold_stock INTEGER,
    expiry_date DATE,
    days_until_expiry INTEGER,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_hospital ON stock_alerts(hospital_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_unresolved ON stock_alerts(hospital_id, is_resolved) WHERE is_resolved = FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ADD GRN CONSTRAINT FOR SEGREGATION OF DUTIES (Future GRNs only)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add a trigger to enforce segregation of duties for NEW/UPDATED GRNs
-- Existing GRNs are grandfathered in

CREATE OR REPLACE FUNCTION enforce_grn_segregation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NOT NULL AND NEW.verified_by IS NOT NULL AND NEW.created_by = NEW.verified_by THEN
        RAISE EXCEPTION 'Segregation of duties violation: GRN creator cannot be the verifier';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_grn_segregation ON goods_receipt_notes;

CREATE TRIGGER trg_grn_segregation
    BEFORE INSERT OR UPDATE OF verified_by ON goods_receipt_notes
    FOR EACH ROW
    EXECUTE FUNCTION enforce_grn_segregation();

-- ============================================================================
-- END OF PRODUCTS MASTER TABLE SCRIPT
-- ============================================================================
