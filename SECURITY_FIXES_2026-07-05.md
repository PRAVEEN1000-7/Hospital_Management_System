# HMS Security Findings & Fix Plan — 2026-07-05

Full-codebase scan covering backend (FastAPI/Python) and frontend (React/TypeScript).
All issues below have been **implemented** on 2026-07-05.

---

## Summary Table

| # | Severity | File(s) | Issue | Status |
|---|----------|---------|-------|--------|
| S1 | 🔴 HIGH | `user_service.py` | User photo upload: no magic-byte check | ✅ Fixed |
| S2 | 🔴 HIGH | `user_service.py` | `.gif` allowed for photos (not for logos — inconsistent) | ✅ Fixed |
| S3 | 🔴 HIGH | `schemas/auth.py` | `LoginRequest` has no max-length — bcrypt DoS vector | ✅ Fixed |
| S4 | 🔴 HIGH | `schemas/auth.py` | `ForgotPasswordRequest.email` is `str`, not `EmailStr` | ✅ Fixed |
| S5 | 🔴 HIGH | `schemas/auth.py` | `ChangePasswordRequest` / `ResetPasswordRequest` have no Pydantic constraints | ✅ Fixed |
| S6 | 🟠 MEDIUM | `routers/auth.py` | Login brute-force rate limit is per-username only — no per-IP check | ✅ Fixed |
| S7 | 🟠 MEDIUM | `hospital_service.py` | Upload error leaks raw exception message (internal path disclosure) | ✅ Fixed |
| S8 | 🟠 MEDIUM | `user_service.py` | Upload error leaks raw exception message (internal path disclosure) | ✅ Fixed |
| S9 | 🟠 MEDIUM | `schemas/auth.py` | `RefreshTokenRequest` / `LogoutRequest` have no max-length on token fields | ✅ Fixed |
| S10 | 🟡 LOW | `main.py` | `/api/v1/config/hospital` is a public unauthenticated endpoint | ✅ Fixed |
| S11 | 🟡 LOW | `authService.ts` + `api.ts` | JWT access + refresh tokens stored in `localStorage` (XSS-accessible) | ⚠️ Deferred — see Out of Scope |

---

## Detailed Findings

---

### S1 — 🔴 HIGH: User photo upload has no magic-byte check

**File:** `backend/app/services/user_service.py` — `save_user_photo()` (~line 257)

**Problem:**
The logo upload (`hospital_service.py`) validates both the file extension AND reads the first 16 bytes to verify the file is actually what it claims to be (PNG/JPEG magic bytes). The user photo upload only checks the extension. An attacker can rename `exploit.html` to `exploit.jpg`, upload it, and it gets served from `/uploads/photos/` on the same origin — enabling stored XSS.

**Current code:**
```python
file_ext = os.path.splitext(file.filename)[1].lower()
if file_ext not in ALLOWED_PHOTO_EXTENSIONS:
    raise HTTPException(...)
# ← No magic-byte check here
```

**Logo upload (correct pattern — same file, different function):**
```python
if not _has_valid_signature(file, file_ext):
    raise HTTPException(status_code=400, detail="File content does not match its extension.")
```

**Fix:** Add `_has_valid_photo_signature()` (same pattern as `_has_valid_signature` in hospital_service.py) and call it before writing the file.

---

### S2 — 🔴 HIGH: `.gif` allowed for user photos

**File:** `backend/app/services/user_service.py` — line 24

**Problem:**
```python
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif"}
```
The logo upload explicitly excludes `.gif`. GIFs served from the app's own origin can be used as tracking pixels and side-channel attack vectors. More importantly, without a magic-byte check (see S1), the `.gif` extension widens the attack surface. The hospital logo upload was deliberately designed to exclude GIF for these reasons.

**Fix:** Remove `.gif` from `ALLOWED_PHOTO_EXTENSIONS` (consistent with logo policy).

---

### S3 — 🔴 HIGH: `LoginRequest` has no max-length — bcrypt DoS

**File:** `backend/app/schemas/auth.py` — `LoginRequest` class

**Problem:**
```python
class LoginRequest(BaseModel):
    username: str    # no max_length
    password: str    # no max_length
```
bcrypt's work factor makes it O(len(password)) — processing a 10,000-character password takes hundreds of milliseconds and pegs a CPU core. An unauthenticated attacker can repeatedly POST `/auth/login` with a massive `password` field to saturate the server. This is a known bcrypt DoS vector.

Compare: `UserCreate.password` in `schemas/user.py` already has `max_length=128` — `LoginRequest` is missing this protection at the entry point where it matters most.

**Fix:**
```python
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)
```

---

### S4 — 🔴 HIGH: `ForgotPasswordRequest.email` is raw `str`

**File:** `backend/app/schemas/auth.py` — `ForgotPasswordRequest` class

**Problem:**
```python
class ForgotPasswordRequest(BaseModel):
    email: str    # should be EmailStr
```
`ForgotPasswordRequest` uses a plain `str`. Any value passes Pydantic validation — a non-email string, a very long string, or a value with special characters. In contrast, every other email field in the codebase (`UserCreate`, `UserUpdate`, auth schemas `UserResponse`) uses `EmailStr`. An attacker can send garbage values through the forgot-password endpoint to probe the system or attempt email header injection.

**Fix:**
```python
class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254)
```

---

### S5 — 🔴 HIGH: `ChangePasswordRequest` / `ResetPasswordRequest` have no Pydantic constraints

**File:** `backend/app/schemas/auth.py`

**Problem:**

`ChangePasswordRequest`:
```python
class ChangePasswordRequest(BaseModel):
    current_password: str    # no length constraint
    new_password: str        # no length constraint, no complexity validator
```
The handler checks `len(payload.new_password) < 8` manually, but there is no max-length (bcrypt DoS, same as S3), and no complexity validator (unlike `UserCreate.password` and `PasswordReset.new_password` in `user.py` which enforce upper/lower/digit/special).

`ResetPasswordRequest`:
```python
class ResetPasswordRequest(BaseModel):
    token: str           # no max_length — could accept arbitrarily large payload
    new_password: str    # same issues as ChangePasswordRequest
    confirm_password: str
```

**Fix:** Apply `Field(min_length=..., max_length=...)` and a `@field_validator` for password complexity on both schemas, consistent with the existing `PasswordReset` schema in `user.py`.

---

### S6 — 🟠 MEDIUM: Login brute-force rate limit is per-username only

**File:** `backend/app/routers/auth.py` — `login()` handler (~line 105)

**Problem:**
The existing rate limiter calls `limiter.check_login_limit(credentials.username)`, which uses the username as the key. This protects individual accounts (also backed by the DB-level account lockout), but does **not** protect against:
- Credential stuffing: attacker tries 5 username/password pairs per account, rotates, hits 10,000 accounts from one IP
- Username enumeration at scale from one IP

The frontend log endpoint (`routers/logs.py`) already has per-IP limiting as a pattern:
```python
_login_ip_log: Dict[str, list] = {}
def _check_ip_rate_limit(client_ip: str) -> bool: ...
```

**Fix:** Add a per-IP sliding-window check (e.g., 20 attempts per 5 minutes per IP) alongside the existing per-username limit, using the same in-memory pattern from `routers/logs.py`.

---

### S7 — 🟠 MEDIUM: Logo upload error leaks raw exception string

**File:** `backend/app/services/hospital_service.py` — `save_hospital_logo()` (~line 163)

**Problem:**
```python
except Exception as e:
    raise HTTPException(
        status_code=500,
        detail=f"Failed to save logo: {str(e)}",   # ← leaks internal detail
    )
```
`str(e)` on a filesystem exception can contain the full server-side file path (e.g., `/home/hmsadmin/projects/.../uploads/hospital/...`), OS error codes, or library internals. This is returned verbatim to the client in the 500 response body.

**Fix:** Log the exception server-side and return a generic message:
```python
except Exception as e:
    logger.error("Failed to save hospital logo for hospital %s: %s", hospital_id, e)
    raise HTTPException(status_code=500, detail="Failed to save logo. Please try again.")
```

---

### S8 — 🟠 MEDIUM: Photo upload error leaks raw exception string

**File:** `backend/app/services/user_service.py` — `save_user_photo()` (~line 302)

**Problem:** Same pattern as S7:
```python
except Exception as e:
    raise HTTPException(
        status_code=500,
        detail=f"Failed to save photo: {str(e)}",   # ← leaks internal detail
    )
```

**Fix:** Same pattern — log server-side, return generic message.

---

### S9 — 🟠 MEDIUM: `RefreshTokenRequest` / `LogoutRequest` have no max-length

**File:** `backend/app/schemas/auth.py`

**Problem:**
```python
class RefreshTokenRequest(BaseModel):
    refresh_token: str    # no max_length

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None    # no max_length
```
The refresh token is a 128-hex-char string. Allowing an arbitrarily large value enables a request body size attack on these endpoints. Should be capped to a sensible maximum.

**Fix:**
```python
class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, max_length=512)

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = Field(None, max_length=512)
```

---

### S10 — 🟡 LOW: Unauthenticated `/api/v1/config/hospital` endpoint

**File:** `backend/app/main.py` — lines 312-325

**Problem:**
```python
@app.get("/api/v1/config/hospital")
async def get_hospital_config():
    """Get hospital configuration (for ID cards, reports, etc.)"""
    return {
        "hospital_name": settings.HOSPITAL_NAME,
        "hospital_address": settings.HOSPITAL_ADDRESS,
        ...
        "hospital_email": settings.HOSPITAL_EMAIL,
        "hospital_website": settings.HOSPITAL_WEBSITE,
    }
```
This endpoint has no authentication dependency. It exposes hospital contact details (address, phone, email, website) to anyone with network access to the server. On a public-facing deployment, this is unnecessary information exposure.

**Fix:** Add `current_user: User = Depends(get_current_active_user)` dependency, or at minimum restrict to specific roles. If this is genuinely needed for unauthenticated use (e.g., on the login page), limit what fields are returned.

---

### S11 — 🟡 LOW (Architecture): JWT tokens stored in `localStorage`

**File:** `frontend/src/services/authService.ts` (lines 9-11), `frontend/src/services/api.ts` (lines 40-48)

**Problem:**
```typescript
// authService.ts
localStorage.setItem('access_token', data.access_token);
localStorage.setItem('refresh_token', data.refresh_token);
localStorage.setItem('user', JSON.stringify(data.user));
```
`localStorage` is readable by any JavaScript executing on the same origin. If an XSS vulnerability is ever found (even a minor one), an attacker can exfiltrate both the access token AND the long-lived 7-day refresh token.

The backend spec comment says "access token 30 min **in JS memory**" — the intent was in-memory storage. The refresh token is especially risky in localStorage because of its 7-day lifetime.

**Note:** This is an architectural change — moving to `httpOnly` cookies for the refresh token requires backend changes (set-cookie on login, read cookie on refresh). The access token can stay in memory (a module-level variable), but survives only the current tab and is lost on refresh (that's fine — the refresh token flow handles re-issuance).

**Recommended fix (two-phase):**
1. **Phase 1 (low risk):** Move access token to an in-memory variable in `authService.ts` (not localStorage). On page reload, use the refresh token to get a new access token.
2. **Phase 2 (backend change required):** Move refresh token to `httpOnly; SameSite=Strict` cookie so JS can never read it.

**Current risk is MITIGATED by:**
- CSP blocks `unsafe-inline` and `unsafe-eval` (reduces XSS surface)
- No `dangerouslySetInnerHTML` usage found anywhere in frontend
- Short (60-min) access token lifetime
- Token revocation on logout and password change

---

## What Needs Changing — Grouped by File

### `backend/app/schemas/auth.py`
- Add `Field(min_length, max_length)` to `LoginRequest.username`, `LoginRequest.password`
- Change `ForgotPasswordRequest.email: str` → `EmailStr` with `max_length=254`
- Add `Field` constraints + `@field_validator` for complexity to `ChangePasswordRequest.new_password`
- Add `Field` constraints + `@field_validator` for complexity to `ResetPasswordRequest.new_password`
- Add `max_length=512` to `RefreshTokenRequest.refresh_token` and `LogoutRequest.refresh_token`

### `backend/app/services/user_service.py`
- Remove `.gif` from `ALLOWED_PHOTO_EXTENSIONS`
- Add `_has_valid_photo_signature()` (magic-byte check) and call it after the extension check
- Replace `detail=f"Failed to save photo: {str(e)}"` with generic message + server-side log

### `backend/app/services/hospital_service.py`
- Replace `detail=f"Failed to save logo: {str(e)}"` with generic message + server-side log

### `backend/app/routers/auth.py`
- Add per-IP sliding-window rate limiter for the login endpoint (20 attempts / 5 min per IP)

### `backend/app/main.py` (optional / low priority)
- Add auth dependency to `/api/v1/config/hospital`

---

## Out of Scope for This Round

- **S11 localStorage → httpOnly cookie migration**: Requires backend set-cookie changes, frontend interceptor rewrite, and nginx changes (forward cookie on proxy). Too large for a single PR. Risk is currently mitigated (see above).
- **Redis-backed rate limiter**: The current in-memory limiter is per-process (single-server). For a multi-worker deployment, replace with Redis. Not blocking — noted in the existing `rate_limiter.py` comments.
- **HTTPS/TLS**: The nginx.conf has HSTS headers but the server only listens on port 80. HTTPS setup requires cert provisioning (Let's Encrypt or self-managed). Out of scope for code review.
