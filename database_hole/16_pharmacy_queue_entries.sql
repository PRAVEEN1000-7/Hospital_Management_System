-- ============================================================================
-- 16_pharmacy_queue_entries.sql
-- Pharmacy Queue (BRD v1.1 PQ-01..06) — a token is assigned the moment a
-- doctor finalizes a prescription with medicines, or staff manually add a
-- walk-in — well before any bill exists. Deliberately decoupled from
-- pharmacy_dispensing (the sale/bill); linked to it once dispensing/billing
-- actually happens. See backend/app/services/billing_queue_service.py.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pharmacy_queue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id),
    queue_token INTEGER NOT NULL,
    prescription_id UUID REFERENCES prescriptions(id),
    patient_id UUID REFERENCES patients(id),
    patient_name VARCHAR(200),
    doctor_name VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'being_served', 'collected')),
    sale_id UUID REFERENCES pharmacy_dispensing(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    queue_called_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_queue_entries_hospital_status ON pharmacy_queue_entries(hospital_id, status, queue_token);
CREATE INDEX IF NOT EXISTS idx_pharmacy_queue_entries_prescription ON pharmacy_queue_entries(prescription_id);
