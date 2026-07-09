import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List

# bcrypt is O(len(password)) — cap at 128 chars to prevent DoS via the login
# endpoint (same limit used by UserCreate / PasswordReset in user.py).
_MAX_PASSWORD_LEN = 128
_MIN_PASSWORD_LEN = 8


def _check_password_complexity(v: str) -> str:
    """Shared complexity validator — must match UserCreate / PasswordReset in user.py."""
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
        raise ValueError("Password must contain at least one special character")
    return v


# ── S3: LoginRequest — add max_length to stop bcrypt DoS ─────────────────────
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=_MAX_PASSWORD_LEN)


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    roles: List[str] = []
    permissions: List[str] = []
    hospital_id: Optional[str] = None
    hospital_name: Optional[str] = None
    hospital_code: Optional[str] = None
    hospital_specialty: Optional[str] = None
    hospital_timezone: Optional[str] = None
    reference_number: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


# ── S9: cap token field sizes — large payloads waste parser/DB work ───────────
class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, max_length=512)


class LogoutRequest(BaseModel):
    # Optional — if the client sends the refresh token it was issued, logout
    # revokes that too. Without it, only the current access token is revoked.
    refresh_token: Optional[str] = Field(None, max_length=512)


class TokenData(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None
    roles: Optional[List[str]] = None
    permissions: Optional[List[str]] = None
    hospital_id: Optional[str] = None


# ── S5: ChangePasswordRequest — add length limits + complexity validator ──────
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=_MAX_PASSWORD_LEN)
    new_password: str = Field(..., min_length=_MIN_PASSWORD_LEN, max_length=_MAX_PASSWORD_LEN)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _check_password_complexity(v)


# ── S4: ForgotPasswordRequest — use EmailStr, not raw str ────────────────────
class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254)


# ── S5: ResetPasswordRequest — add length limits + complexity validator ───────
class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=_MIN_PASSWORD_LEN, max_length=_MAX_PASSWORD_LEN)
    confirm_password: str = Field(..., min_length=_MIN_PASSWORD_LEN, max_length=_MAX_PASSWORD_LEN)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _check_password_complexity(v)
