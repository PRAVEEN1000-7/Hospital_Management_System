-- ============================================================================
-- Fix GRN Segregation Trigger - Allow Admin to Create & Verify
-- ============================================================================
-- Admin and Super Admin can bypass segregation of duties
-- Regular users (inventory_manager, pharmacist) must have different creator/verifier
-- ============================================================================

DROP TRIGGER IF EXISTS trg_grn_segregation ON goods_receipt_notes;

CREATE OR REPLACE FUNCTION enforce_grn_segregation()
RETURNS TRIGGER AS $$
DECLARE
    creator_role TEXT;
BEGIN
    -- Get the role of the creator
    SELECT r.name INTO creator_role
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = NEW.created_by
    LIMIT 1;
    
    -- Allow admin and super_admin to create and verify (they have override permissions)
    IF creator_role IN ('admin', 'super_admin') THEN
        RETURN NEW;
    END IF;
    
    -- For other users, enforce segregation of duties
    IF NEW.created_by IS NOT NULL AND NEW.verified_by IS NOT NULL AND NEW.created_by = NEW.verified_by THEN
        RAISE EXCEPTION 'Segregation of duties violation: GRN creator cannot be the verifier. Please have an admin or different user verify this GRN.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grn_segregation
    BEFORE INSERT OR UPDATE OF verified_by ON goods_receipt_notes
    FOR EACH ROW
    EXECUTE FUNCTION enforce_grn_segregation();

-- ============================================================================
-- Test Query (Optional)
-- ============================================================================
-- Check current user roles:
-- SELECT u.id, u.username, r.name as role_name
-- FROM users u
-- JOIN user_roles ur ON u.id = ur.user_id
-- JOIN roles r ON ur.role_id = r.id
-- WHERE u.id = '10000000-0000-0000-0000-000000000002';
-- ============================================================================
