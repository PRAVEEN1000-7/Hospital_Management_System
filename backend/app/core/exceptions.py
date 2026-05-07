"""
Custom exception hierarchy for HMS.

Raising these exceptions anywhere in the service/repository layers
will produce consistent JSON error responses via the registered handlers.
"""
from typing import Any, Optional


class HMSException(Exception):
    """Base class for all HMS business exceptions."""
    status_code: int = 400
    error_code: str = "HMS_ERROR"

    def __init__(self, message: str, detail: Optional[Any] = None):
        self.message = message
        self.detail = detail
        super().__init__(message)


class NotFoundError(HMSException):
    """Resource not found (404)."""
    status_code = 404
    error_code = "NOT_FOUND"


class ForbiddenError(HMSException):
    """Access forbidden (403)."""
    status_code = 403
    error_code = "FORBIDDEN"


class ValidationError(HMSException):
    """Business-rule validation failed (422)."""
    status_code = 422
    error_code = "VALIDATION_ERROR"


class ConflictError(HMSException):
    """Duplicate / conflict (409)."""
    status_code = 409
    error_code = "CONFLICT"


class AuthenticationError(HMSException):
    """Authentication failed (401)."""
    status_code = 401
    error_code = "AUTHENTICATION_ERROR"


class AccountLockedError(HMSException):
    """Account is locked (423)."""
    status_code = 423
    error_code = "ACCOUNT_LOCKED"
