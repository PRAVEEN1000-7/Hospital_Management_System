# HMS Security Audit Report

**Project:** Hospital Management System (HMS)  
**Audit Date:** March 15, 2026  
**Auditor:** AI Code Analysis  
**Version:** 1.0.0  

---

## Executive Summary

This security audit identified **28 vulnerabilities** across the HMS codebase, ranging from critical security flaws to code quality issues. The system requires immediate attention to address authentication, authorization, and data integrity vulnerabilities before production deployment.

### Vulnerability Distribution

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 **Critical** | 6 | Immediate action required |
| 🟠 **High** | 7 | Fix within 1 week |
| 🟡 **Medium** | 10 | Fix within 1 month |
| ⚪ **Low** | 5 | Address in next sprint |

---

## Table of Contents

1. [Critical Vulnerabilities](#1-critical-vulnerabilities)
2. [High Severity Bugs](#2-high-severity-bugs)
3. [Medium Severity Issues](#3-medium-severity-issues)
4. [Low Severity / Code Quality](#4-low-severity--code-quality)
5. [Recommendations](#5-recommendations)

---

## 1. Critical Vulnerabilities

### 1.1 No Rate Limiting on Login Endpoint

**ID:** `CRIT-001`  
**Severity:** 🔴 Critical  
**CVSS Score:** 9.1  

**Location:** `backend/app/routers/auth.py`

**Description:**
The login endpoint has no rate limiting or brute-force protection. While `failed_login_attempts` counter exists, there's no account lockout mechanism implemented.

**Vulnerable Code:**
```python
# backend/app/routers/auth.py
@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, credentials.username, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
```

```python
# backend/app/services/auth_service.py
if not verify_password(password, user.password_hash):
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    db.commit()
    return None  # ← No lockout check!
```

**Impact:**
- Attackers can perform unlimited brute-force attacks
- Credential stuffing attacks are possible
- Account takeover risk

**Exploit Scenario:**
```bash
# Attacker can run unlimited login attempts
for i in {1..10000}; do
    curl -X POST http://localhost:8000/api/v1/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"password'$i'"}'
done
```

**Fix:**
```python
# backend/app/services/auth_service.py
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 30

if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        logger.warning(f"Account locked: {username}")
        return None
    else:
        # Reset after lockout period expires
        user.failed_login_attempts = 0
        user.locked_until = None

if not verify_password(password, user.password_hash):
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
    db.commit()
    return None
```

---

### 1.2 JWT Token Never Expires on Logout

**ID:** `CRIT-002`  
**Severity:** 🔴 Critical  
**CVSS Score:** 8.6  

**Location:** `backend/app/routers/auth.py:88-91`

**Description:**
The logout endpoint doesn't invalidate the JWT token. Tokens remain valid until natural expiration (60 minutes).

**Vulnerable Code:**
```python
@router.post("/logout")
async def logout(current_user: User = Depends(get_current_active_user)):
    """Logout user (client should discard token)."""
    return {"message": "Successfully logged out"}
```

**Impact:**
- Stolen tokens remain usable for 60 minutes after logout
- No way to force session termination
- Session hijacking attacks are more effective

**Fix:**
```python
# Add token blacklist table
CREATE TABLE token_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

# Update logout endpoint
@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    # Add to blacklist
    from ..models.user import TokenBlacklist
    payload = decode_access_token(token)
    expires_at = datetime.fromtimestamp(payload['exp'])
    
    blacklist_entry = TokenBlacklist(
        token_hash=token_hash,
        expires_at=expires_at
    )
    db.add(blacklist_entry)
    db.commit()
    
    return {"message": "Successfully logged out"}

# Update get_current_user to check blacklist
async def get_current_user(...):
    token = credentials.credentials
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    # Check blacklist
    blacklisted = db.query(TokenBlacklist).filter(
        TokenBlacklist.token_hash == token_hash,
        TokenBlacklist.expires_at > datetime.now(timezone.utc)
    ).first()
    
    if blacklisted:
        raise credentials_exception
```

---

### 1.3 No Password Complexity Validation

**ID:** `CRIT-003`  
**Severity:** 🔴 Critical  
**CVSS Score:** 8.1  

**Location:** `backend/app/services/user_service.py`

**Description:**
Passwords are accepted without any complexity requirements. Users can set weak passwords like `123456` or `password`.

**Vulnerable Code:**
```python
def create_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    ...
) -> User:
    password_hash = get_password_hash(password)  # ← No validation!
```

**Impact:**
- Users can set easily guessable passwords
- Increased risk of account compromise
- Non-compliance with security best practices

**Fix:**
```python
# backend/app/utils/security.py
import re

class PasswordValidationError(Exception):
    pass

def validate_password_strength(password: str) -> bool:
    """Validate password meets minimum security requirements."""
    errors = []
    
    if len(password) < 8:
        errors.append("Password must be at least 8 characters long")
    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        errors.append("Password must contain at least one number")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        errors.append("Password must contain at least one special character")
    
    if errors:
        raise PasswordValidationError("; ".join(errors))
    
    return True

# backend/app/services/user_service.py
from ..utils.security import get_password_hash, validate_password_strength

def create_user(...):
    validate_password_strength(password)  # ← Add validation
    password_hash = get_password_hash(password)
```

---

### 1.4 Hospital Isolation Bypass

**ID:** `CRIT-004`  
**Severity:** 🔴 Critical  
**CVSS Score:** 8.5  

**Location:** `backend/app/routers/users.py:120-135`

**Description:**
The user listing endpoint doesn't filter by hospital_id, allowing admins from one hospital to see users from all hospitals.

**Vulnerable Code:**
```python
@router.get("", response_model=UserListResponse)
async def get_users(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    result = list_users(db, page, limit, search)  # ← No hospital_id filter!
```

**Impact:**
- Cross-hospital data leakage
- Privacy violation (HIPAA/GDPR compliance issue)
- Unauthorized access to sensitive user data

**Fix:**
```python
# backend/app/services/user_service.py
def list_users(
    db: Session,
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    hospital_id: Optional[uuid.UUID] = None,  # ← Add parameter
):
    query = (
        db.query(User)
        .filter(User.is_deleted == False)
    )
    
    if hospital_id:
        query = query.filter(User.hospital_id == hospital_id)  # ← Add filter
```

```python
# backend/app/routers/users.py
@router.get("", response_model=UserListResponse)
async def get_users(...):
    result = list_users(db, page, limit, search, hospital_id=current_user.hospital_id)
```

---

### 1.5 Hardcoded Default Secret Key

**ID:** `CRIT-005`  
**Severity:** 🔴 Critical  
**CVSS Score:** 9.8  

**Location:** `backend/app/config.py:27-28`

**Description:**
The default SECRET_KEY is a known value. If developers forget to change it, all installations share the same key.

**Vulnerable Code:**
```python
class Settings(BaseSettings):
    SECRET_KEY: str = "CHANGE-ME-generate-with-secrets-token-hex-32"
```

**Impact:**
- Attackers can forge JWT tokens if they know the default key
- Complete authentication bypass possible
- All installations with default key are compromised

**Fix:**
```python
# backend/app/config.py
class Settings(BaseSettings):
    SECRET_KEY: str = "CHANGE-ME-generate-with-secrets-token-hex-32"
    
    @validator('SECRET_KEY')
    def validate_secret_key(cls, v):
        if v.startswith("CHANGE-ME"):
            raise ValueError(
                "SECRET_KEY must be set in environment. "
                "Generate with: python -c 'import secrets; print(secrets.token_hex(32))'"
            )
        return v

settings = Settings()
```

---

### 1.6 DEBUG Logging in Production

**ID:** `CRIT-006`  
**Severity:** 🔴 Critical  
**CVSS Score:** 7.5  

**Location:** `backend/app/routers/auth.py:25-26`, `backend/app/config.py:20`

**Description:**
Debug logging statements and DEBUG=True default configuration can expose sensitive information.

**Vulnerable Code:**
```python
# backend/app/routers/auth.py
# DEBUG: Log incoming credentials (remove in production!)
logger.info(f"LOGIN ATTEMPT: username='{credentials.username}', password_length={len(credentials.password)}")

# backend/app/config.py
DEBUG: bool = True  # ← Default True!
```

**Impact:**
- Sensitive information in logs
- Verbose error messages expose system details
- Performance degradation

**Fix:**
```python
# backend/app/config.py
DEBUG: bool = False  # ← Default False

# backend/app/routers/auth.py
# Remove debug logging
logger.info(f"LOGIN ATTEMPT: username='{credentials.username}'")
```

---

## 2. High Severity Bugs

### 2.1 Race Condition in ID Generation

**ID:** `HIGH-001`  
**Severity:** 🟠 High  
**CVSS Score:** 7.3  

**Location:** `backend/app/services/patient_id_service.py:160-180`

**Description:**
Despite using `with_for_update()`, concurrent requests can receive duplicate sequence numbers due to transaction isolation issues.

**Vulnerable Code:**
```python
def _get_next_sequence(...) -> int:
    seq_row = db.query(IdSequence).filter(...).with_for_update().first()
    
    if seq_row:
        seq_row.last_sequence += 1
        db.flush()
        return seq_row.last_sequence
```

**Impact:**
- Duplicate patient IDs
- Data integrity issues
- Patient record collisions

**Fix:**
```python
from sqlalchemy import text

def _get_next_sequence(...) -> int:
    # Use PostgreSQL advisory locks for guaranteed uniqueness
    lock_id = hash(f"{hospital_id}:{entity_type}:{code}:{year_code}:{month_code}")
    
    db.execute(text(f"SELECT pg_advisory_xact_lock({lock_id})"))
    
    seq_row = db.query(IdSequence).filter(...).first()
    
    if seq_row:
        seq_row.last_sequence += 1
    else:
        seq_row = IdSequence(...)
        seq_row.last_sequence = 1
        db.add(seq_row)
    
    db.flush()
    return seq_row.last_sequence
```

---

### 2.2 Double-Booking Race Condition

**ID:** `HIGH-002`  
**Severity:** 🟠 High  
**CVSS Score:** 7.5  

**Location:** `backend/app/routers/appointments.py:47-57`

**Description:**
Time-of-check to time-of-use (TOCTOU) vulnerability allows double-booking when two requests arrive simultaneously.

**Vulnerable Code:**
```python
@router.post("", response_model=AppointmentResponse)
async def book_appointment(...):
    if check_double_booking(db, data.doctor_id, data.appointment_date, data.start_time):
        raise HTTPException(status_code=400, detail="Slot already booked")
    
    appt = create_appointment(db, data.model_dump(), current_user.id, current_user.hospital_id)
```

**Impact:**
- Two patients booked for same time slot
- Schedule conflicts
- Patient dissatisfaction

**Fix:**
```python
# backend/app/models/appointment.py
from sqlalchemy import UniqueConstraint

class Appointment(Base):
    __tablename__ = "appointments"
    
    __table_args__ = (
        UniqueConstraint(
            'doctor_id', 'appointment_date', 'start_time',
            name='unique_doctor_timeslot',
            postgresql_where=func.not_(Appointment.status.in_(['cancelled', 'rescheduled']))
        ),
    )

# backend/app/routers/appointments.py
from sqlalchemy.exc import IntegrityError

@router.post("", response_model=AppointmentResponse)
async def book_appointment(...):
    try:
        appt = create_appointment(db, data.model_dump(), current_user.id, current_user.hospital_id)
        return enrich_appointment(db, appt)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Selected time slot is no longer available"
        )
```

---

### 2.3 Pharmacy Stock Can Go Negative

**ID:** `HIGH-003`  
**Severity:** 🟠 High  
**CVSS Score:** 7.0  

**Location:** `backend/app/services/pharmacy_service.py`

**Description:**
No validation prevents medicine stock quantities from going negative during sales.

**Impact:**
- Inventory tracking becomes inaccurate
- Sales can exceed physical stock
- Financial discrepancies

**Fix:**
```python
# backend/app/services/pharmacy_service.py
def create_sale(db: Session, hospital_id: uuid.UUID, data: dict, created_by: uuid.UUID):
    for item in data.get("items", []):
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.id == item["batch_id"]
        ).first()
        
        if batch.current_quantity < item["quantity"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {batch.medicine.name}"
            )
        
        batch.current_quantity -= item["quantity"]
```

---

### 2.4 No Validation on Appointment Date

**ID:** `HIGH-004`  
**Severity:** 🟠 High  
**CVSS Score:** 6.5  

**Location:** `backend/app/routers/appointments.py`

**Description:**
Appointments can be booked for past dates.

**Vulnerable Code:**
```python
@router.post("", response_model=AppointmentResponse)
async def book_appointment(data: AppointmentCreate, ...):
    # No date validation
    appt = create_appointment(db, data.model_dump(), ...)
```

**Impact:**
- Data integrity issues
- Reporting inaccuracies
- Potential fraud (backdating appointments)

**Fix:**
```python
from datetime import date

@router.post("", response_model=AppointmentResponse)
async def book_appointment(data: AppointmentCreate, ...):
    if data.appointment_date < date.today():
        raise HTTPException(
            status_code=400,
            detail="Cannot book appointments for past dates"
        )
```

---

### 2.5 Token Stored in LocalStorage (XSS Vulnerable)

**ID:** `HIGH-005`  
**Severity:** 🟠 High  
**CVSS Score:** 7.1  

**Location:** `frontend/src/services/authService.ts:8-9`

**Description:**
JWT tokens stored in localStorage are vulnerable to XSS attacks.

**Vulnerable Code:**
```typescript
// frontend/src/services/authService.ts
localStorage.setItem('access_token', data.access_token);
localStorage.setItem('user', JSON.stringify(data.user));
```

**Impact:**
- Token theft via XSS
- Account takeover
- Session hijacking

**Fix:**
```typescript
// Use httpOnly cookies instead (requires backend changes)
// backend/app/routers/auth.py
@router.post("/login", response_model=TokenResponse)
async def login(...):
    response = JSONResponse(content=token_data)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,  # HTTPS only
        samesite="strict",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    return response
```

---

### 2.6 Missing Null Check on Patient Email

**ID:** `HIGH-006`  
**Severity:** 🟠 High  
**CVSS Score:** 6.0  

**Location:** `backend/app/routers/appointments.py:72-83`

**Description:**
Email validation doesn't check for empty strings, only None.

**Vulnerable Code:**
```python
patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
if patient and getattr(patient, "email", None):
    send_appointment_confirmation_email(
        to_email=patient.email,  # ← Could be ""
```

**Fix:**
```python
if patient and patient.email and "@" in patient.email:
    send_appointment_confirmation_email(...)
```

---

### 2.7 No CSRF Protection

**ID:** `HIGH-007`  
**Severity:** 🟠 High  
**CVSS Score:** 6.5  

**Location:** Frontend API configuration

**Description:**
No CSRF token validation is implemented.

**Impact:**
- Cross-site request forgery attacks
- Unauthorized state-changing operations

**Fix:**
```python
# backend/app/main.py
from fastapi_csrf_protect import CsrfProtect

@app.post("/api/v1/auth/login")
@CsrfProtect.limit()
async def login(...):
```

---

## 3. Medium Severity Issues

### 3.1 Inconsistent Error Handling

**ID:** `MED-001`  
**Severity:** 🟡 Medium  

**Location:** Multiple routers

**Description:**
Some endpoints use `db.rollback()` in error handlers, others don't.

**Fix:**
```python
# Standardize error handling pattern
try:
    # Operation
    db.commit()
except HTTPException:
    raise
except Exception as e:
    db.rollback()
    logger.error(f"Error: {e}", exc_info=True)
    raise HTTPException(status_code=500, detail="Operation failed")
```

---

### 3.2 No Audit Trail for Critical Operations

**ID:** `MED-002`  
**Severity:** 🟡 Medium  

**Location:** Multiple routers

**Description:**
Critical operations (user deletion, password reset, stock adjustments) lack audit logging.

**Fix:**
```python
# backend/app/models/audit_log.py
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

# Log critical operations
def log_audit(db, user_id, action, entity_type, entity_id, old_values=None, new_values=None):
    audit = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values
    )
    db.add(audit)
    db.commit()
```

---

### 3.3 No Validation on File Uploads

**ID:** `MED-003`  
**Severity:** 🟡 Medium  

**Location:** `backend/app/services/user_service.py:230-250`

**Description:**
Only file extension is checked, not actual file content.

**Fix:**
```python
import magic

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif"}

def save_user_photo(file: UploadFile, user_id: str) -> str:
    # Check MIME type
    file_content = file.file.read()
    mime = magic.from_buffer(file_content, mime=True)
    
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    # Check extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file extension")
```

---

### 3.4 Email Sending Failures Silently Ignored

**ID:** `MED-004`  
**Severity:** 🟡 Medium  

**Location:** Multiple routers

**Description:**
Email failures are logged but not reported or retried.

**Fix:**
```python
# Use Celery or similar for async email with retry
from celery import Celery

@celery.task(bind=True, max_retries=3)
def send_email_task(self, to_email, subject, body):
    try:
        send_email(to_email, subject, body)
    except Exception as e:
        self.retry(exc=e, countdown=60 * (2 ** self.request.retries))
```

---

### 3.5 Missing Input Sanitization

**ID:** `MED-005`  
**Severity:** 🟡 Medium  

**Location:** Search endpoints

**Description:**
Search input isn't sanitized for XSS when displayed.

**Fix:**
```typescript
// frontend/src/components/SearchResults.tsx
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(searchTerm) }} />
```

---

### 3.6 Password Reset Without Notification

**ID:** `MED-006`  
**Severity:** 🟡 Medium  

**Location:** `backend/app/routers/users.py:282-300`

**Description:**
Admin password resets don't notify the affected user.

**Fix:**
```python
@router.post("/{user_id}/reset-password", response_model=dict)
async def reset_user_password(...):
    reset_password(db, user_id, password_data.new_password)
    
    # Send notification
    user = get_user_by_id(db, user_id)
    send_password_reset_notification(
        to_email=user.email,
        reset_by=current_user.username
    )
    
    return {"message": "Password reset successfully"}
```

---

### 3.7 No Self-Deletion Prevention

**ID:** `MED-007`  
**Severity:** 🟡 Medium  

**Location:** `backend/app/routers/users.py`

**Description:**
Users can potentially delete their own accounts.

**Fix:**
```python
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_endpoint(...):
    if str(current_user.id) == user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account"
        )
```

---

### 3.8 Missing Database Health Check

**ID:** `MED-008`  
**Severity:** 🟡 Medium  

**Location:** `backend/app/main.py`

**Description:**
Health endpoint doesn't verify database connectivity.

**Fix:**
```python
@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}
```

---

### 3.9 No Request/Response Logging

**ID:** `MED-009`  
**Severity:** 🟡 Medium  

**Location:** `backend/app/main.py`

**Description:**
No middleware for logging request/response times.

**Fix:**
```python
# backend/app/main.py
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    logger.info(
        f"{request.method} {request.url.path} - "
        f"Status: {response.status_code} - "
        f"Duration: {duration:.3f}s"
    )
    
    return response
```

---

### 3.10 Inconsistent Status Codes

**ID:** `MED-010`  
**Severity:** 🟡 Medium  

**Description:**
Some endpoints return inconsistent HTTP status codes.

**Fix:**
Standardize:
- `200 OK` - Successful GET, PUT, PATCH
- `201 Created` - Successful POST (create)
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Client error
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## 4. Low Severity / Code Quality

### 4.1 Magic Numbers

**ID:** `LOW-001`  
**Severity:** ⚪ Low  

**Location:** Multiple files

**Description:**
Hardcoded values without documentation.

**Fix:**
```python
# backend/app/config.py
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
REFRESH_TOKEN_EXPIRE_DAYS: int = 7
MAX_FILE_SIZE_MB: int = 2
MAX_FAILED_LOGIN_ATTEMPTS: int = 5
ACCOUNT_LOCKOUT_DURATION_MINUTES: int = 30
```

---

### 4.2 No API Versioning Strategy

**ID:** `LOW-002`  
**Severity:** ⚪ Low  

**Description:**
Routes are under `/api/v1` but no deprecation strategy exists.

**Fix:**
```python
# Document deprecation policy
# /docs/api-versioning.md
"""
API Versioning Policy:
- v1: Current stable version
- v2: In development
- Deprecation notice: 6 months before sunset
- Sunset: 12 months after deprecation
"""
```

---

### 4.3 Missing Type Hints

**ID:** `LOW-003`  
**Severity:** ⚪ Low  

**Location:** Multiple service files

**Description:**
Some functions lack type hints.

**Fix:**
```python
def create_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role_name: str,
    hospital_id: uuid.UUID,
) -> User:
```

---

### 4.4 Inconsistent Naming Conventions

**ID:** `LOW-004`  
**Severity:** ⚪ Low  

**Description:**
Mixed naming conventions (snake_case vs camelCase).

**Fix:**
Standardize on snake_case for Python, camelCase for TypeScript.

---

### 4.5 No Unit Tests

**ID:** `LOW-005`  
**Severity:** ⚪ Low  

**Location:** `backend/tests/`

**Description:**
Limited test coverage.

**Fix:**
```python
# backend/tests/test_auth.py
def test_login_success():
    response = client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "Admin@123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login_rate_limiting():
    for i in range(10):
        response = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": "wrong"
        })
    assert response.status_code == 429  # Too Many Requests
```

---

## 5. Recommendations

### Immediate Actions (Within 24 Hours)

1. **Implement rate limiting** on login endpoint
2. **Add account lockout** after 5 failed attempts
3. **Change default SECRET_KEY** validation
4. **Fix hospital isolation** in user listing
5. **Set DEBUG=False** in production

### Short-term Actions (Within 1 Week)

1. **Add password complexity validation**
2. **Implement token blacklist** for logout
3. **Add unique constraints** for appointment booking
4. **Validate appointment dates** (no past bookings)
5. **Add stock quantity validation** in pharmacy

### Medium-term Actions (Within 1 Month)

1. **Implement audit logging** for critical operations
2. **Add file upload validation** (MIME type checking)
3. **Implement email retry queue**
4. **Add CSRF protection**
5. **Migrate to httpOnly cookies** for token storage

### Long-term Actions (Within 3 Months)

1. **Implement comprehensive test suite**
2. **Add API documentation** with OpenAPI/Swagger
3. **Implement monitoring and alerting**
4. **Conduct penetration testing**
5. **Achieve HIPAA/GDPR compliance certification**

---

## Appendix A: Compliance Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| HIPAA Data Encryption | ⚠️ Partial | TLS in transit, needs at-rest encryption |
| HIPAA Audit Logs | ❌ Missing | Implement audit_logs table |
| HIPAA Access Controls | ⚠️ Partial | RBAC exists, needs refinement |
| GDPR Right to Erasure | ❌ Missing | Soft delete only, no hard delete option |
| GDPR Data Portability | ❌ Missing | No export functionality |
| PCI-DSS (if payments) | ❌ Not Applicable | No payment processing yet |

---

## Appendix B: Security Headers

Add these security headers to `backend/app/main.py`:

```python
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

# HTTPS redirect (production)
# app.add_middleware(HTTPSRedirectMiddleware)

# Security headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response
```

---

## Appendix C: Environment Variables Checklist

```bash
# Required environment variables for production
APP_NAME=Hospital Management System
APP_VERSION=1.0.0
DEBUG=False

# Database
DATABASE_URL=postgresql://hms_user:STRONG_PASSWORD@localhost:5432/hms_db
DB_ECHO=False

# Security (GENERATE UNIQUE VALUES!)
SECRET_KEY=<64-character-hex-string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
CORS_ORIGINS=["https://your-domain.com"]

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=noreply@your-domain.com
SMTP_PASSWORD=<app-password>
SMTP_FROM_EMAIL=noreply@your-domain.com
SMTP_FROM_NAME=Hospital Management System

# Hospital Details
HOSPITAL_NAME=Your Hospital Name
HOSPITAL_ADDRESS=123 Medical Drive
HOSPITAL_CITY=City
HOSPITAL_STATE=State
HOSPITAL_COUNTRY=Country
HOSPITAL_PIN_CODE=12345
HOSPITAL_PHONE=+1234567890
HOSPITAL_EMAIL=info@your-hospital.com
HOSPITAL_WEBSITE=https://your-hospital.com
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | AI Auditor | Initial security audit report |

---

*This report is confidential and intended for the HMS development team only.*
