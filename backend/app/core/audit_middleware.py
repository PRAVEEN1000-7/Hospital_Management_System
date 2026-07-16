"""
Automatic audit logging for every mutating API request.

A single HTTP middleware records all create/update/delete actions across the
whole application into the ``saas_core.audit_logs`` table so the super admin
can review who did what, where and when. It is intentionally best-effort:
any failure here is swallowed so it can never break a real request.
"""
import logging
import uuid

from ..database import SessionLocal
from ..utils.security import decode_access_token

logger = logging.getLogger(__name__)

# Map HTTP verb → human action suffix.
_VERB = {"POST": "created", "PUT": "updated", "PATCH": "updated", "DELETE": "deleted"}
AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Path prefixes (relative to /api/v1/) that we do NOT auto-audit here:
#   auth/       → no token before login; auth events logged separately
#   superadmin/ → every mutating action is already audited explicitly with diffs
#   logs/       → frontend log ingestion, pure noise
_SKIP_PREFIXES = ("auth/", "superadmin/", "logs/")


def _as_uuid(value) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def _looks_like_id(seg: str) -> bool:
    return _as_uuid(seg) is not None or seg.isdigit()


def _derive(method: str, after: str):
    """Return (action, entity_type, entity_uuid) from the request path.

    Examples:
      POST   /api/v1/patients                  → ("patient_created",    "patient",      None)
      PUT    /api/v1/patients/<uuid>            → ("patient_updated",    "patient",      <uuid>)
      POST   /api/v1/prescriptions/<uuid>/finalize → ("prescription_finalize", "prescription", <uuid>)
    """
    parts = [p for p in after.split("/") if p]
    if not parts:
        return None, None, None
    resource = parts[0]
    entity = resource[:-1] if resource.endswith("s") else resource
    sub = parts[-1] if len(parts) >= 3 and not _looks_like_id(parts[-1]) else None
    action = f"{entity}_{sub}" if sub else f"{entity}_{_VERB.get(method, method.lower())}"
    entity_uuid = next((_as_uuid(p) for p in parts[1:] if _as_uuid(p)), None)
    return action, entity, entity_uuid


def _client_ip(request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "")


def record_audit_event(method: str, path: str, headers: dict, client_ip: str, status_code: int):
    """Persist a best-effort audit row for a mutating API request."""
    try:
        if "/api/v1/" not in path:
            return
        after = path.split("/api/v1/", 1)[-1]
        if after.startswith(_SKIP_PREFIXES):
            return

        auth = headers.get("authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else None
        payload = decode_access_token(token) if token else None
        if not payload:
            return  # only audit authenticated actions

        action, entity, entity_uuid = _derive(method, after)
        if not action:
            return

        # Same fix as audit_logger.py: use the caller's actual role instead of
        # collapsing every non-super-admin action to the literal "hospital".
        roles = payload.get("roles") or []
        if "super_admin" in roles:
            user_type = "superadmin"
        elif roles:
            user_type = roles[0][:20]
        else:
            user_type = "hospital"

        from ..models.tenant import AuditLog
        db = SessionLocal()
        try:
            db.add(AuditLog(
                tenant_id=_as_uuid(payload.get("tenant_id")),
                user_id=_as_uuid(payload.get("user_id")),
                user_type=user_type,
                action=action,
                entity_type=entity,
                entity_id=entity_uuid,
                new_values={"method": method, "status": status_code},
                ip_address=client_ip or None,
                user_agent=(headers.get("user-agent") or "")[:500] or None,
                request_path=path[:255],
            ))
            db.commit()
        finally:
            db.close()
    except Exception as exc:  # never break the request because of auditing
        logger.debug("Audit middleware skipped event: %s", exc)
