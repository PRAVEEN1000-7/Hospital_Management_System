# HMS — Security Architecture

## 1. Authentication

### 1.1 JWT Token Strategy

```
┌─────────────┐      POST /auth/login         ┌──────────────┐
│   Browser    │ ──────────────────────────────>│   FastAPI     │
│              │                                │   Backend     │
│              │ <──────────────────────────────│               │
│              │  { access_token, refresh_token }│              │
│              │                                │               │
│  Store:      │                                │  Generates:   │
│  access_token│                                │  access: 30min│
│  in memory   │                                │  refresh: 7d  │
│  (JS var)    │                                │               │
│              │                                │  Stores:      │
│  refresh_token                                │  refresh hash │
│  in httpOnly │                                │  in DB        │
│  cookie      │                                │               │
└─────────────┘                                └──────────────┘
```

**Access Token (JWT):**
- Short-lived: 30 minutes
- Stored in JavaScript memory (NOT localStorage or sessionStorage)
- Contains: `user_id`, `hospital_id`, `roles`, `permissions`, `exp`, `iat`
- Signed with HS256 using `JWT_SECRET_KEY`
- Sent as `Authorization: Bearer <token>` header

**Refresh Token:**
- Long-lived: 7 days
- Stored in httpOnly, Secure, SameSite=Strict cookie
- SHA-256 hash stored in `refresh_tokens` table
- One-time use: new refresh token issued on each refresh
- Revoked on logout, password change, or suspicious activity

**Token Refresh Flow:**
```
1. API call returns 401 (token expired)
2. Frontend interceptor catches 401
3. Calls POST /auth/refresh with refresh token cookie
4. If valid → new access token + new refresh token
5. Retry original request with new access token
6. If refresh fails → redirect to login
7. Prevent parallel refresh calls (use a mutex/queue)
```

### 1.2 Password Security

| Rule | Value |
|------|-------|
| Minimum length | 8 characters |
| Maximum length | 128 characters |
| Require uppercase | At least 1 |
| Require lowercase | At least 1 |
| Require digit | At least 1 |
| Require special character | At least 1 |
| Password history | Cannot reuse last 5 passwords |
| Hashing algorithm | bcrypt (work factor 12) |
| Password expiry | Optional (configurable per hospital) |
| Common password check | Check against top 10,000 common passwords |

### 1.3 Account Lockout

| Event | Action |
|-------|--------|
| 5 failed login attempts | Lock for 15 minutes |
| 10 failed attempts (cumulative) | Lock for 1 hour |
| 20 failed attempts | Lock indefinitely (admin unlock) |
| Successful login | Reset failed attempt counter |
| Admin action | Can unlock any account |

### 1.4 Multi-Factor Authentication (MFA)

- **Method**: TOTP (Time-based One-Time Password) — RFC 6238
- **Apps**: Google Authenticator, Authy, Microsoft Authenticator
- **Flow**:
  1. User enables MFA → backend generates TOTP secret
  2. Backend returns QR code URL + backup recovery codes (10 codes)
  3. User scans QR in authenticator app
  4. User enters TOTP code to verify setup
  5. On login → after password verified → prompt for TOTP
  6. User enters 6-digit code → if valid → issue tokens
- **Backup codes**: One-time use, hashed and stored in DB
- **MFA for**: Optional per user, enforceable per role (e.g., admin required)

### 1.5 Session Management

- Track active sessions per user (in `refresh_tokens` table)
- Device info and IP recorded
- Admin can view all active sessions
- Admin can force-logout any user
- Max concurrent sessions: configurable (default: 5)
- Session timeout on inactivity: 30 minutes (frontend-triggered)

---

## 2. Authorization (RBAC)

### 2.1 Permission Model

```
User ──*── UserRole ──*── Role ──*── RolePermission ──*── Permission
```

**Permission format**: `module:action:resource`
- Example: `patients:create:patient`, `billing:read:invoice`, `reports:export:revenue`

### 2.2 Default Role-Permission Matrix

| Permission | Super Admin | Admin | Doctor | Receptionist | Pharmacist | Optical Staff | Cashier | Inventory Mgr | Report Viewer |
|-----------|:-----------:|:-----:|:------:|:------------:|:----------:|:-------------:|:-------:|:-------------:|:------------:|
| **Patients** |
| patients:create | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| patients:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| patients:update | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| patients:delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Appointments** |
| appointments:create | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| appointments:read | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| appointments:update | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| appointments:manage_queue | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Prescriptions** |
| prescriptions:create | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| prescriptions:read | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| prescriptions:update | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Pharmacy** |
| pharmacy:dispense | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| pharmacy:manage_medicines | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| pharmacy:returns | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Optical** |
| optical:manage | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| optical:prescriptions | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Billing** |
| billing:create | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| billing:read | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| billing:refund | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| billing:approve_refund | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Inventory** |
| inventory:manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| inventory:approve_po | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reports** |
| reports:read | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| reports:export | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| reports:financial | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Admin** |
| admin:users | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| admin:roles | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| admin:settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| admin:audit_logs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 2.3 Backend Permission Enforcement

```python
# In dependencies.py
class PermissionChecker:
    def __init__(self, required_permissions: list[str]):
        self.required_permissions = required_permissions

    async def __call__(self, current_user: User = Depends(get_current_user)):
        user_permissions = await get_user_permissions(current_user.id)
        for perm in self.required_permissions:
            if perm not in user_permissions:
                raise HTTPException(
                    status_code=403,
                    detail={"code": "PERMISSION_DENIED", "message": f"Missing: {perm}"}
                )
        return current_user

# Usage in routes:
@router.post("/patients")
async def create_patient(
    data: PatientCreate,
    current_user: User = Depends(PermissionChecker(["patients:create:patient"]))
):
    ...
```

### 2.4 Frontend Permission Enforcement

```tsx
// usePermission hook
const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermission();

// In components
{hasPermission('patients:create:patient') && (
    <Button onClick={handleCreate}>Register Patient</Button>
)}

// Route guard
<RoleGuard permissions={['billing:create:invoice']}>
    <InvoiceCreatePage />
</RoleGuard>

// Sidebar filtering
const sidebarItems = allItems.filter(item =>
    item.permissions.some(p => hasPermission(p))
);
```

---

## 3. API Security

### 3.1 CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),  # Strict origin list
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Total-Count", "X-Request-ID"],
    max_age=600,  # Preflight cache 10 minutes
)
```

### 3.2 Security Headers (Middleware)
```python
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "connect-src 'self' wss:; "
        "font-src 'self';"
    )
    return response
```

### 3.3 Rate Limiting
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, ...):
    ...

@router.post("/auth/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(request: Request, ...):
    ...
```

### 3.4 Input Validation & Sanitization

**Backend (Pydantic v2):**
```python
from pydantic import BaseModel, Field, field_validator
import bleach

class PatientCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone_number: str = Field(..., pattern=r'^\d{6,15}$')
    email: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator('first_name', 'last_name')
    @classmethod
    def sanitize_name(cls, v):
        # Allow only letters, hyphens, apostrophes, spaces
        if not re.match(r"^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF '-]+$", v):
            raise ValueError('Name contains invalid characters')
        return bleach.clean(v.strip())

    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        if v and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v.lower().strip() if v else v
```

**Frontend (Zod):**
```typescript
import { z } from 'zod';

export const patientSchema = z.object({
    first_name: z.string()
        .min(1, 'First name is required')
        .max(100, 'First name too long')
        .regex(/^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF '\-]+$/, 'Invalid characters'),
    last_name: z.string().min(1).max(100),
    phone_number: z.string()
        .min(6, 'Phone number too short')
        .max(15, 'Phone number too long')
        .regex(/^\d+$/, 'Only digits allowed'),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    date_of_birth: z.string().optional().refine(
        val => !val || new Date(val) <= new Date(),
        'Date of birth cannot be in the future'
    ),
    gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
});
```

### 3.5 SQL Injection Prevention
- **ORM-only queries**: All DB access through SQLAlchemy ORM
- **No raw SQL**: Prohibited in code reviews
- **Parameterized queries**: When raw SQL absolutely necessary, use `text()` with bind params
- **Input validation**: All inputs validated before reaching ORM

### 3.6 XSS Prevention
- React's default JSX escaping (no `dangerouslySetInnerHTML`)
- Server-side output encoding
- Content Security Policy headers
- Sanitize user-generated content with `bleach` (backend) before storage
- Sanitize HTML if rich text ever needed (not in v1)

### 3.7 File Upload Security
```python
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png'}
ALLOWED_DOC_TYPES = {'application/pdf', 'image/jpeg', 'image/png'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

async def validate_upload(file: UploadFile):
    # 1. Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large")

    # 2. Check MIME type (magic bytes, not extension)
    import magic
    detected_type = magic.from_buffer(content, mime=True)
    if detected_type not in ALLOWED_IMAGE_TYPES | ALLOWED_DOC_TYPES:
        raise HTTPException(415, "File type not allowed")

    # 3. Sanitize filename
    safe_name = secure_filename(file.filename)

    # 4. Generate unique storage path (prevent path traversal)
    storage_path = f"{uuid4()}/{safe_name}"

    # 5. Reset file pointer
    await file.seek(0)

    return content, storage_path, detected_type
```

---

## 4. Data Protection

### 4.1 Encryption

| Data | At Rest | In Transit |
|------|---------|------------|
| Passwords | bcrypt hash (irreversible) | TLS 1.2+ |
| National ID numbers | AES-256-GCM encryption | TLS 1.2+ |
| MFA secrets | AES-256-GCM encryption | TLS 1.2+ |
| Patient photos | Filesystem (access-controlled) | TLS 1.2+ |
| All API traffic | — | TLS 1.2+ (enforced) |
| Database connections | — | TLS (if remote DB) |
| Backup files | AES-256 encryption | Encrypted transfer |

### 4.2 PII Handling

```python
# crypto_utils.py
from cryptography.fernet import Fernet

class PIIEncryptor:
    def __init__(self, key: str):
        self.fernet = Fernet(key.encode())

    def encrypt(self, plaintext: str) -> str:
        return self.fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        return self.fernet.decrypt(ciphertext.encode()).decode()

# Usage in patient service:
patient.national_id_number = pii_encryptor.encrypt(data.national_id_number)

# In API response:
response.national_id_number = mask_id(pii_encryptor.decrypt(patient.national_id_number))
# e.g., "***-**-1234" or "XXXX XXXX 5678"
```

### 4.3 PII Masking in API Responses

| Field | Display Format | Full Access |
|-------|---------------|-------------|
| National ID | `***-**-1234` | Admin only (audit logged) |
| Phone | `+1-***-***-1234` | Authorized roles |
| Email | `j***@example.com` | Authorized roles |
| Patient photo | Accessible via auth'd URL | Authorized roles |

### 4.4 Data Retention

- Patient records: Configurable (default 7 years after last visit)
- Audit logs: Minimum 3 years
- Financial records: As per local tax law (typically 7 years)
- Session data: 30 days after expiry
- Deleted records: Soft deleted, permanently purged after retention period

---

## 5. Audit Logging

### 5.1 What Gets Logged

| Category | Events |
|----------|--------|
| Authentication | Login success, login failure, logout, password change, MFA events |
| Patient | Create, update, delete, photo upload, consent, document upload |
| Appointment | Create, cancel, reschedule, status change, transfer |
| Prescription | Create, update, finalize, version change |
| Pharmacy | Dispense, return, stock adjustment |
| Billing | Invoice create, payment, refund, void, settlement |
| Inventory | PO create, GRN, stock adjustment, write-off |
| Admin | User create/update, role change, permission change, settings change |
| Data Access | PII field access, report export, bulk data access |

### 5.2 Audit Log Entry Format

```json
{
  "id": "uuid",
  "timestamp": "2026-02-15T10:30:00Z",
  "user_id": "uuid",
  "user_email": "doctor@hospital.com",
  "action": "update",
  "entity_type": "patient",
  "entity_id": "uuid",
  "entity_name": "Jane Doe (PAT-2026-00001)",
  "old_values": { "phone_number": "+12025551234" },
  "new_values": { "phone_number": "+12025559876" },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0 ...",
  "request_path": "PUT /api/v1/patients/uuid"
}
```

### 5.3 Implementation

```python
# Decorator for automatic audit logging
def audit_log(action: str, entity_type: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Capture old state if update/delete
            old_values = None
            if action in ('update', 'delete'):
                old_values = await get_entity_state(entity_type, kwargs.get('id'))

            result = await func(*args, **kwargs)

            # Log asynchronously (don't block the response)
            background_tasks.add_task(
                create_audit_log,
                action=action,
                entity_type=entity_type,
                entity_id=result.id if hasattr(result, 'id') else kwargs.get('id'),
                old_values=old_values,
                new_values=result.dict() if hasattr(result, 'dict') else None,
                user_id=current_user.id,
                ip_address=request.client.host,
                user_agent=request.headers.get('user-agent'),
                request_path=str(request.url)
            )
            return result
        return wrapper
    return decorator
```

---

## 6. Infrastructure Security

### 6.1 Network
- HTTPS enforced (HSTS header)
- API behind reverse proxy (Nginx)
- Database not exposed publicly (internal network only)
- Redis not exposed publicly
- MinIO/S3 not exposed publicly

### 6.2 Docker Security
- Non-root container user
- Read-only filesystem where possible
- Resource limits (CPU, memory)
- No privileged mode
- Minimal base images (python:3.12-slim, node:22-slim)
- Security scanning of images (Trivy/Snyk)

### 6.3 Environment Variables
- Never committed to git
- `.env.example` with dummy values committed
- Production secrets in vault/secret manager
- Different keys for dev/staging/prod

### 6.4 Dependency Security
- `pip-audit` for Python dependency vulnerability scanning
- `npm audit` for Node.js dependencies
- Dependabot / Renovate for automated dependency updates
- Pin all dependency versions
- Weekly security scan in CI pipeline

---

## 7. OWASP Top 10 Mitigations

| # | Vulnerability | Mitigation |
|---|--------------|------------|
| A01 | Broken Access Control | RBAC on every endpoint, object-level auth, frontend guards |
| A02 | Cryptographic Failures | bcrypt passwords, AES-256 PII, TLS everywhere |
| A03 | Injection | ORM-only queries, Pydantic validation, parameterized queries |
| A04 | Insecure Design | Threat modeling, secure defaults, defense in depth |
| A05 | Security Misconfiguration | Security headers, minimal permissions, no defaults |
| A06 | Vulnerable Components | Dependency scanning, pinned versions, automated updates |
| A07 | Auth Failures | account lockout, MFA, token rotation, session management |
| A08 | Data Integrity Failures | Input validation, signed tokens, code review |
| A09 | Logging Failures | Comprehensive audit logging, monitoring, alerting |
| A10 | SSRF | No user-controlled URLs in server requests, allowlist |

---

## 8. Compliance Readiness

### Supported Regulatory Frameworks
The system is designed to be configurable for:

| Framework | Region | Key Requirements |
|-----------|--------|-----------------|
| HIPAA | USA | PHI protection, access controls, audit trails |
| GDPR | EU | Data minimization, right to erasure, consent |
| PDPA | Thailand | Consent, data protection officer |
| PDPA | Singapore | Consent, purpose limitation |
| DISHA | India | Health data protection (draft) |
| POPIA | South Africa | Data privacy |

### Implementation:
- **Consent management**: Configurable consent types, recorded and auditable
- **Data minimization**: Only collect what's needed
- **Right to erasure**: Soft delete + scheduled permanent purge (when legally allowed)
- **Access logging**: All PII access logged
- **Data export**: Patient data export in machine-readable format
- **Breach notification**: Audit log alerting for suspicious patterns
