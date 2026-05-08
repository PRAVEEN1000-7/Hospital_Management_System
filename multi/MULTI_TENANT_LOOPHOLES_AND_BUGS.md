# HMS Multi-Tenant System: Loopholes & Bugs Analysis

## Executive Summary

Based on the architecture diagram and codebase analysis, this document identifies **critical security gaps, data isolation vulnerabilities, and architectural issues** in the HMS multi-tenant implementation. The system attempts to implement multi-tenancy but has significant loopholes that could allow:

- Cross-tenant data leaks
- Privilege escalation 
- Unauthorized module access
- Billing/subscription bypasses
- Data integrity violations

---

## Part 1: Current Data Flow Architecture

### 1.1 User Login & Tenant Resolution Flow

```
┌──────────────┐
│  User Login  │
│ hms-         │
│ platform.com │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 2. LOGIN CREDENTIALS                 │
│ - Email                              │
│ - Password                           │
│ - From user record (NOT tenant-      │
│   dependent at this stage)           │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 3. TENANT IDENTIFICATION             │
│ Query: User → Hospital → Tenant      │
│ (Hospital linked to Tenant)          │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 4. JWT TOKEN CREATION                │
│ Payload:                             │
│ - user_id (UUID)                     │
│ - hospital_id (UUID)                 │
│ - tenant_id (UUID)                   │
│ - roles: [role names]                │
│ - exp: 30 min                        │
│ - iat: timestamp                     │
│ - type: "access"                     │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 5. REFRESH TOKEN                     │
│ - 64-byte random token               │
│ - SHA256 hashed in DB                │
│ - httpOnly cookie (7 days)           │
│ - Stored in refresh_tokens table     │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 6. CLIENT STORES                     │
│ - Access token (JS memory)           │
│ - Refresh token (httpOnly cookie)    │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 7. API REQUEST WITH TENANT CONTEXT   │
│ Header: Authorization: Bearer <JWT>  │
│ Middleware extracts & validates      │
│ Sets: TenantContext, SuperAdminCtx   │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 8. ROW-LEVEL SECURITY                │
│ - Query filters: WHERE hospital_id=X │
│ - Permission checks                  │
│ - Module availability checks         │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 9. DATA RETURNED                     │
│ - Only tenant's data                 │
└──────────────────────────────────────┘
```

### 1.2 Module Assignment Flow

```
SUPER ADMIN
    │
    ├─→ Creates/edits Subscription Plan
    │   (e.g., "PROFESSIONAL" with modules: [Pharmacy, Inventory])
    │
    ├─→ Creates Tenant (Hospital)
    │
    ├─→ Assigns Subscription Plan to Tenant
    │   (Inserts into tenant_subscriptions)
    │
    └─→ System enables modules based on:
        │
        ├─ Subscription plan features_enabled JSON
        ├─ TenantModule entries (active=true)
        └─ User role/permissions
```

### 1.3 Data Isolation Pattern

```
SINGLE DATABASE - ROW-LEVEL ISOLATION

┌─────────────────────────────────────────────────────────┐
│                     PATIENTS TABLE                       │
├─────────────────────────────────────────────────────────┤
│ id    │ hospital_id │ name      │ email                 │
├───────┼─────────────┼───────────┼─────────────────────┤
│ uuid1 │ hosp_A_id   │ John Doe  │ john@hospital-a.com │
│ uuid2 │ hosp_B_id   │ Jane Smith│ jane@hospital-b.com │
│ uuid3 │ hosp_A_id   │ Bob Jones │ bob@hospital-a.com  │
└─────────────────────────────────────────────────────────┘

QUERY FILTER: WHERE hospital_id = hosp_A_id
RESULT: Returns only uuid1, uuid3 ✓
```

---

## Part 2: CRITICAL SECURITY LOOPHOLES & BUGS

### 🔴 CRITICAL ISSUES

#### 1. **JWT Token Tampering - Missing Tenant ID Validation**

**Loophole**: JWT contains `tenant_id` but it's NOT validated on each request.

**Attack Scenario**:
```javascript
// Attacker obtains valid JWT from Hospital A
{
  "user_id": "user-123",
  "hospital_id": "hosp_A_id",
  "tenant_id": "tenant_A_id",
  "roles": ["doctor"]
}

// Attacker manually modifies JWT to:
{
  "user_id": "user-123",
  "hospital_id": "hosp_B_id",  // ← Changed!
  "tenant_id": "tenant_B_id",  // ← Changed!
  "roles": ["doctor"]
}

// If JWT signature verification is weak, attacker accesses Hospital B data
```

**Current Code (Vulnerable)**:
```python
# dependencies.py - get_current_user()
payload = decode_access_token(token)  # ← Only verifies signature
user_id_str = payload.get("user_id")
# ❌ Does NOT re-validate hospital_id from DB
user = db.query(User).filter(User.id == user_uuid).first()
# ✓ User fetched, but hospital_id assumed correct from JWT
```

**Risk**: **HIGH** - Lateral movement between tenants

**Fix Required**:
```python
# After decoding JWT:
# 1. Fetch user from DB
user = db.query(User).filter(User.id == user_uuid).first()

# 2. Verify hospital_id in JWT matches user.hospital_id
jwt_hospital_id = payload.get("hospital_id")
if str(user.hospital_id) != jwt_hospital_id:
    raise HTTPException(status_code=403, detail="Invalid token")

# 3. Verify tenant context
expected_tenant = db.query(Tenant).filter(
    Tenant.id == user.hospital.tenant_id
).first()
if not expected_tenant:
    raise HTTPException(status_code=403, detail="Invalid tenant")
```

---

#### 2. **Tenant Resolution Race Condition**

**Loophole**: TenantMiddleware sets tenant context asynchronously but multiple endpoints may process before middleware completes.

**Attack Scenario**:
```
Request 1 (User from Tenant A) arrives
  → TenantMiddleware starts tenant resolution
  
Request 2 (User from Tenant B) arrives  
  → TenantMiddleware starts tenant resolution
  
Context Variables (ContextVar):
  → Request 1 sets tenant_ctx = Tenant A
  → Request 2 sets tenant_ctx = Tenant B
  → ⚠️  Request 1's handler reads tenant_ctx = Tenant B (WRONG!)
```

**Risk**: **CRITICAL** - Data from wrong tenant served to user

**Code Location**: `core/tenant.py - TenantMiddleware`

**Fix Required**:
```python
# Ensure tenant context is verified BEFORE any DB access
# Use request-scoped dependency injection instead of ContextVar
async def get_current_tenant(request: Request) -> Tenant:
    # Extract from token
    # Validate against DB
    # Return (don't set context globally)
    pass

# Use as dependency in every route:
@router.get("/patients")
async def list_patients(
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant)
):
    # tenant is request-scoped, not global
    pass
```

---

#### 3. **Hospital ID Not Enforced in Service Layer**

**Loophole**: Some service methods don't validate `hospital_id` when querying data.

**Attack Scenario**:
```python
# In service layer:
def get_patient(patient_id: str):
    # ❌ VULNERABLE - No hospital_id check
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    return patient
    
    # ✓ CORRECT - Should be:
    # patient = db.query(Patient).filter(
    #     Patient.id == patient_id,
    #     Patient.hospital_id == current_tenant.hospital_id
    # ).first()
```

**Risk**: **HIGH** - Direct access to any patient record by UUID

**Scope**: Affects all 20+ routers and service methods

**Example Files Needing Audit**:
- `routers/patients.py`
- `routers/appointments.py`
- `routers/prescriptions.py`
- `routers/inventory.py`
- `services/*.py`

**Fix Pattern**:
```python
# BEFORE (vulnerable):
patient = db.query(Patient).filter(Patient.id == patient_id).first()

# AFTER (secure):
from ..core.tenant import TenantContext

current_tenant = TenantContext.get_current()
patient = db.query(Patient).filter(
    Patient.id == patient_id,
    Patient.hospital_id == current_tenant.hospital_id
).first()

if not patient:
    raise HTTPException(status_code=404, detail="Patient not found")
```

---

#### 4. **No Subscription Validation for Module Access**

**Loophole**: Routers don't check if tenant has active subscription for accessed module.

**Attack Scenario**:
```
Hospital A (FREE plan - no Pharmacy module)
User logs in
  → JWT created (roles loaded)
  → User tries: GET /pharmacy/medications
  → ❌ NO CHECK: Is Pharmacy enabled for this tenant?
  → Returns data anyway!
```

**Current Code (Vulnerable)**:
```python
# routers/pharmacy.py
@router.get("/medications")
async def list_medications(
    current_user: User = Depends(get_current_active_user),
):
    # ❌ No subscription check!
    medications = db.query(Medication).filter(
        Medication.hospital_id == current_user.hospital_id
    ).all()
    return medications
```

**Risk**: **HIGH** - Users access paid features without paying

**Scope**: Affects 8+ optional modules:
- Pharmacy
- Inventory 
- Optical
- Reports
- Billing (partial)
- Insurance

**Fix Required**:
```python
from ..core.permissions import require_permission
from ..core.subscription import require_module_access

@router.get("/medications")
async def list_medications(
    current_user: User = Depends(get_current_active_user),
    _: User = Depends(require_module_access("pharmacy")),  # ← New
):
    medications = db.query(Medication).filter(
        Medication.hospital_id == current_user.hospital_id
    ).all()
    return medications
```

**New Dependency**:
```python
# core/subscription.py
async def require_module_access(module_name: str):
    async def _check(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ) -> User:
        # Check tenant's active subscription
        tenant = db.query(Tenant).join(User).filter(
            User.id == current_user.id
        ).first()
        
        subscription = tenant.active_subscription
        if not subscription:
            raise HTTPException(status_code=403, detail="No active subscription")
        
        # Check if module enabled
        if not subscription.is_module_enabled(module_name):
            raise HTTPException(status_code=403, detail=f"Module '{module_name}' not available")
        
        return current_user
    
    return _check
```

---

#### 5. **Super Admin Can Access/Modify All Data Without Row-Level Isolation**

**Loophole**: Super admins bypass hospital_id checks but may access wrong tenant's users.

**Attack Scenario**:
```python
# Super admin endpoint:
@router.get("/users")
async def list_all_users(
    _: User = Depends(require_super_admin)
):
    # Returns ALL users across ALL hospitals!
    users = db.query(User).all()
    
    # Should be:
    # users = db.query(User).filter(
    #     User.hospital_id.in_(
    #         db.query(Hospital.id).join(Tenant).filter(
    #             Tenant.id == current_tenant_id
    #         )
    #     )
    # ).all()
```

**Risk**: **MEDIUM** - Overly broad data access

**Scope**: All superadmin endpoints in `routers/superadmin.py`

---

### 🟡 HIGH PRIORITY ISSUES

#### 6. **No Audit Logging for Cross-Tenant Operations**

**Problem**: When super admin accesses Hospital A data, action not logged with clear tenant context.

**Impact**: Compliance violation, cannot track who did what in multi-tenant environment.

**Loophole**:
```python
# logs/audit.log entries don't include tenant_id
# Example:
# "user_id=user-123 action=CREATE resource=patient" 
# ❌ Missing: which tenant/hospital?

# Should be:
# "tenant_id=tenant-A user_id=user-123 action=CREATE resource=patient"
```

**Fix**: Add tenant_id to all audit log entries

---

#### 7. **Soft Delete (is_deleted) Not Tenant-Scoped**

**Problem**: Deleted records still exist, could be restored to wrong tenant.

**Attack Scenario**:
```sql
-- Hospital A deletes a patient (soft delete)
UPDATE patients SET is_deleted=true, deleted_at=NOW() 
WHERE id='patient-uuid-123' AND hospital_id='hosp_A_id';

-- Super admin restores without verifying hospital_id
UPDATE patients SET is_deleted=false, deleted_at=NULL 
WHERE id='patient-uuid-123';
-- ❌ Could be restored to wrong hospital if FK is broken
```

**Risk**: **MEDIUM** - Data integrity issues

---

#### 8. **User Creation Doesn't Validate Tenant Capacity**

**Loophole**: Super admin creates unlimited users for "FREE" plan tenant.

**Attack Scenario**:
```python
# Subscription plan: FREE plan = max_users: 5
# Hospital A has 5 users
# Super admin tries to create 6th user
# ❌ NO CHECK: Is subscription capacity exceeded?
# User created anyway!
```

**Risk**: **MEDIUM** - Revenue leak, SaaS business model broken

---

#### 9. **Token Refresh Doesn't Re-Validate Tenant Status**

**Loophole**: Tenant can be suspended but users keep using old refresh tokens.

**Attack Scenario**:
```
Hospital A:
  - Status: "active" (users can log in)
  - User X logs in, gets refresh token
  
Later:
  - Status changed to: "suspended"
  - User X's old refresh token still valid!
  - Can call refresh endpoint, get new access token
  - Access continues despite suspension
```

**Current Code (Vulnerable)**:
```python
# auth.py - refresh_token endpoint
def refresh_access_token(refresh_token: str, db: Session):
    # Validate refresh token hash
    token_record = db.query(RefreshToken).filter(
        RefreshToken.hashed_token == hash(refresh_token)
    ).first()
    
    # Get user
    user = db.query(User).filter(User.id == token_record.user_id).first()
    
    # ❌ NO CHECK: Is user's hospital/tenant active?
    # ❌ NO CHECK: Did subscription expire?
    
    # Create new access token
    return create_access_token({...})
```

**Risk**: **HIGH** - Suspended tenants retain access

**Fix Required**:
```python
def refresh_access_token(refresh_token: str, db: Session):
    token_record = db.query(RefreshToken).filter(...).first()
    user = db.query(User).filter(...).first()
    
    # ✓ NEW: Validate tenant status
    tenant = db.query(Tenant).join(Hospital).join(User).filter(
        User.id == user.id
    ).first()
    
    if not tenant or tenant.status != "active":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # ✓ NEW: Validate subscription
    subscription = tenant.active_subscription
    if not subscription:
        raise HTTPException(status_code=403, detail="No active subscription")
    
    return create_access_token({...})
```

---

#### 10. **Module Permission Caching Not Tenant-Aware**

**Problem**: Permissions cached in user object on login, but module availability can change.

**Attack Scenario**:
```
T1: Hospital A enables Pharmacy module
    User X logs in
    JWT includes: "permissions": ["pharmacy:read", "pharmacy:write"]
    
T2: Super admin DISABLES Pharmacy for Hospital A
    User X's token still valid (30 min TTL)
    User X can still access pharmacy endpoints!
    Access should be revoked immediately
```

**Risk**: **MEDIUM** - Real-time feature toggling doesn't work

---

### 🟠 MEDIUM PRIORITY ISSUES

#### 11. **Hospital ID and Tenant ID Mismatch Possible**

**Problem**: User record has `hospital_id` but could theoretically be linked to multiple tenants (data inconsistency).

**Current Schema**:
```
User ─FK─> Hospital (hospital_id)
Hospital ─FK─> ??? Tenant (MISSING!)
```

**Issue**: No explicit FK from Hospital to Tenant, so Hospital could be orphaned or linked to wrong tenant.

**Fix**: Ensure Hospital table has tenant_id FK:
```sql
ALTER TABLE hospitals ADD COLUMN tenant_id UUID REFERENCES saas_core.tenants(id);
CREATE INDEX idx_hospitals_tenant ON hospitals(tenant_id);
```

---

#### 12. **No Rate Limiting Per Tenant**

**Problem**: One tenant's API spam affects others (noisy neighbor problem).

**Attack Scenario**:
```
Hospital A user scripts 100K requests/min
  → Database gets overloaded
  → Slow response for Hospital B, Hospital C
  → Bad experience for legitimate users
```

**Fix**: Implement per-tenant rate limiting:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=lambda: f"{current_tenant.id}")

@router.get("/patients")
@limiter.limit("1000/hour")  # per tenant
async def list_patients(...):
    pass
```

---

#### 13. **Orphaned Data When Tenant Deleted**

**Problem**: If tenant is deleted, cascade deletes could corrupt data or block deletion.

**Attack Scenario**:
```sql
-- Super admin deletes Tenant A
DELETE FROM tenants WHERE id='tenant-A-id';

-- ❌ What happens to:
-- - Hospitals linked to Tenant A?
-- - Users in those hospitals?
-- - Patients?
-- - Prescriptions?
-- - Invoices (billing records)?

-- Should be: SOFT DELETE + archive
-- Not hard delete!
```

**Risk**: **LOW** - But impacts data integrity

---

#### 14. **No Tenant Data Export/Import on Signup**

**Problem**: Multi-tenant platform has no way to onboard new hospitals with existing data.

**Example**: Hospital merges with another, wants to import patient records from old system.

**Impact**: Limits market expansion, creates barriers to adoption.

---

#### 15. **Module Dependencies Not Enforced**

**Problem**: Pharmacy module requires Patients module, but no validation.

**Attack Scenario**:
```
Hospital A subscription: Pharmacy only (no Patients)
  → Pharmacy needs to query patients
  → ❌ Module check only sees "pharmacy=enabled"
  → Doesn't verify dependency "patients=enabled"
  → Queries fail or return incomplete data
```

**Fix**: Create module dependency graph:
```python
MODULE_DEPENDENCIES = {
    "pharmacy": ["patients", "users"],
    "inventory": ["suppliers", "appointments"],
    "optical": ["patients", "prescriptions"],
    "billing": ["invoices", "insurance", "patients"],
}

def validate_module_dependencies(module: str, tenant_modules: List[str]):
    required = MODULE_DEPENDENCIES.get(module, [])
    missing = [m for m in required if m not in tenant_modules]
    if missing:
        raise ValueError(f"Module {module} requires: {missing}")
```

---

### 🟡 ADDITIONAL CONCERNS

#### 16. **No Tenant Admin Cannot Cross-Tenant Access But Can See User List**

**Problem**: Hospital Admin should only see users in their hospital, but endpoint might be unfiltered.

**Code Location**: `routers/users.py`

```python
@router.get("/users")
async def list_users(
    current_user: User = Depends(get_current_active_user)
):
    # For hospital admin:
    # Should filter by hospital_id
    users = db.query(User).all()  # ❌ WRONG - all users!
```

---

#### 17. **Appointment Booking Doesn't Check Doctor's Hospital**

**Scenario**:
```
Hospital A user tries to book appointment with Doctor from Hospital B
  → No FK validation that doctor belongs to same hospital
  → Creates cross-hospital appointment record
```

**Risk**: **MEDIUM** - Data consistency

---

#### 18. **Inventory Stock Movements Not Tenant-Validated**

**Problem**: Stock movements between hospitals not prevented.

**Scenario**:
```
Hospital A has 10 units of Drug X
Hospital B has 0 units of Drug X

If stock movement doesn't validate hospital_id:
  → Drug could be "moved" from A to B
  → Actually creating phantom stock
```

---

#### 19. **Billing/Invoice Not Isolating By Tenant**

**Problem**: Invoice queries might return data from multiple tenants.

```python
@router.get("/invoices")
async def list_invoices(...):
    # ❌ Missing hospital_id filter
    invoices = db.query(Invoice).all()
```

---

#### 20. **API Documentation Leaks Tenant Information**

**Problem**: Swagger/Redoc docs at `/api/docs` shows schema but might allow anonymous access and hint at multi-tenancy.

**Attack Scenario**:
```
Attacker visits: https://hms-platform.com/api/docs
  → Sees all endpoints
  → Sees that queries use hospital_id
  → Now knows to try hospital_id manipulation
```

**Fix**: Require authentication for `/api/docs`

---

## Part 3: Data Flow Issues

### Missing Data Isolation Checks

| Endpoint | Current Behavior | Issue | Fix |
|----------|------------------|-------|-----|
| GET /patients/{id} | Query by UUID | No hospital_id check | Add hospital_id filter |
| GET /appointments | No filter | Returns all appointments | Filter by hospital_id |
| PUT /prescription/{id} | Update by ID | No tenant validation | Verify hospital_id before update |
| DELETE /patient/{id} | Soft delete | No cascading cleanup | Ensure related records deleted |
| POST /pharmacy/stock | Create stock | No hospital validation | Validate hospital_id from JWT |

---

## Part 4: Recommended Priority Fixes

### 🔴 CRITICAL (Fix Immediately)

1. **JWT token hospital_id re-validation** - Cross-tenant access risk
2. **Tenant context race condition** - Wrong tenant data served
3. **Hospital_id enforcement in ALL queries** - Fundamental isolation break
4. **Subscription module access validation** - Revenue leak
5. **Tenant status check on token refresh** - Suspended tenant access

### 🟡 HIGH (Fix This Week)

6. Module dependency validation
7. Audit logging with tenant context
8. Per-tenant rate limiting
9. Soft delete cascade validation
10. Hospital-Tenant FK relationship

### 🟠 MEDIUM (Fix This Sprint)

11. User capacity validation
12. Data export/import for tenant onboarding
13. Tenant admin cross-boundary access checks
14. Appointment cross-hospital validation
15. Inventory stock movement validation

### 🟢 LOW (Backlog)

16. Documentation authentication
17. Refund/settlement tenant isolation
18. Notification routing by tenant
19. Audit trail cleanup for deleted tenants

---

## Part 5: Testing Strategy

### Security Tests Required

```python
# test_multi_tenant_security.py

def test_user_cannot_access_other_tenant_patient():
    """Verify user from Hospital A cannot read Hospital B's patient"""
    pass

def test_jwt_hospital_id_tampering():
    """Verify modified JWT hospital_id is rejected"""
    pass

def test_suspended_tenant_cannot_refresh_token():
    """Verify suspended tenant's refresh token fails"""
    pass

def test_free_plan_cannot_access_pharmacy():
    """Verify module access control works"""
    pass

def test_superadmin_audit_logging():
    """Verify super admin access logged with tenant_id"""
    pass

def test_concurrent_requests_dont_mix_tenants():
    """Verify race condition is fixed"""
    pass

def test_service_layer_hospital_id_validation():
    """Verify all service methods check hospital_id"""
    pass
```

---

## Part 6: Code Review Checklist

When implementing fixes, ensure:

- [ ] Every DB query includes hospital_id filter
- [ ] TenantContext is request-scoped, not global
- [ ] JWT re-validated against DB on each request
- [ ] Subscription plan checked before module access
- [ ] Soft deletes don't orphan data
- [ ] Audit logs include tenant_id
- [ ] Super admin actions are logged
- [ ] Rate limiting per tenant
- [ ] Cascading deletes tested
- [ ] All tests pass with multi-tenant data

---

## Part 7: Database Schema Improvements

### Recommended Alterations

```sql
-- 1. Add tenant_id to hospitals (explicit relationship)
ALTER TABLE hospitals ADD COLUMN tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id);
CREATE INDEX idx_hospitals_tenant_id ON hospitals(tenant_id);

-- 2. Add audit trail for tenant status changes
CREATE TABLE saas_core.tenant_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id),
    action VARCHAR(50),  -- 'created', 'status_changed', 'subscription_updated'
    old_values JSONB,
    new_values JSONB,
    changed_by UUID,  -- super admin user id
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add soft delete to subscription (don't hard delete plans)
ALTER TABLE saas_core.subscription_plans ADD COLUMN is_deleted BOOLEAN DEFAULT false;
ALTER TABLE saas_core.subscription_plans ADD COLUMN deleted_at TIMESTAMPTZ;

-- 4. Add tenant usage tracking
CREATE TABLE saas_core.usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES saas_core.tenants(id),
    metric VARCHAR(100),  -- 'users_count', 'patients_created', 'api_calls'
    value BIGINT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, metric, recorded_at::date)
);

-- 5. Ensure data consistency constraints
ALTER TABLE patients ADD CONSTRAINT fk_patient_hospital 
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id);
```

---

## Conclusion

The HMS multi-tenant architecture has **solid foundational concepts** (row-level isolation, RBAC, subscription models) but **critical implementation gaps** that must be fixed before production deployment.

**Most Critical Fixes**:
1. Re-validate JWT hospital_id against DB
2. Fix tenant context race condition  
3. Add hospital_id filter to ALL queries
4. Implement subscription module access checks
5. Validate tenant status on token refresh

**Estimated Effort**: 40-60 hours for critical fixes, 20-30 hours for high-priority items.

**Recommendation**: Freeze feature development until security audit is complete and fixes are implemented.

