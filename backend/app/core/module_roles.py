"""
Shared module/role permission matrix, transcribed directly from the client's
"HMS Roles & Permissions.xlsx". Mirrored in
frontend/src/config/modulePermissions.ts — keep both in sync.

Decisions confirmed with the client (see
docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md):
  - Implemented literally, including the unusually broad cells (pharmacist
    edit on "rx.all", doctor edit on "general.staff_directory").
  - "Edit" implies delete — there is no separate delete tier.
  - The Lab role (lab_technician) is intentionally absent from this matrix;
    lab.py's own LAB_STAFF_ROLES/LAB_VIEW_ROLES/LAB_ORDER_ROLES are untouched.
  - super_admin is not listed per-row; it is added automatically and always
    gets edit access to every key.

A role/key combination not present in the table below means "no access".

--------------------------------------------------------------------------
Per-hospital overrides (added for the Roles & Permissions admin UI)
--------------------------------------------------------------------------
MODULE_ROLES above remains the GLOBAL DEFAULT for every hospital. A hospital
admin can override individual (key, role) cells for their own hospital via
`hospital_permission_overrides` (see models.user.HospitalPermissionOverride) —
only the cells they've actually changed get a row; everything else falls
through to the default here. `get_effective_matrix()` merges the two and
caches the result in-process (invalidated by `invalidate_hospital_matrix_cache`
whenever an admin saves a change), so the hot request path is a dict lookup,
not a query, in the common case. `require_permission()`/`check_permission()`
are the hospital-aware replacements for `require_any_role(*edit_roles(...))` —
routers should use these going forward so overrides actually take effect
(the old view_roles()/edit_roles() helpers still work but only ever see the
static default, since they're evaluated once at import time before any
hospital is known).
"""
import logging
from typing import Dict, Optional, Tuple

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_VIEW = "view"
_EDIT = "edit"
_LEVELS = {_VIEW: 0, _EDIT: 1}

MODULE_ROLES: Dict[str, Dict[str, str]] = {
    "general.dashboard": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "general.patients": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "general.staff_directory": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _VIEW, "receptionist": _VIEW,
        "report_viewer": _VIEW,
    },
    "general.analytics": {
        "admin": _EDIT, "doctor": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.opd_assignment": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.walkin_queue": {
        "admin": _EDIT, "doctor": _EDIT, "visiting_doctor": _VIEW,
        "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.queue_display": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.doctor_schedule": {
        "admin": _EDIT, "doctor": _EDIT, "visiting_doctor": _EDIT,
        "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.manage": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.waitlist": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.reports": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
        "report_viewer": _VIEW,
    },
    "appt.settings": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _EDIT, "receptionist": _EDIT,
    },
    "rx.all": {
        "admin": _EDIT, "doctor": _EDIT, "nurse": _VIEW, "pharmacist": _EDIT,
    },
    "rx.new": {
        "admin": _VIEW, "doctor": _EDIT, "visiting_doctor": _EDIT,
    },
    "pharmacy": {
        "admin": _EDIT, "pharmacist": _EDIT, "inventory_manager": _VIEW,
    },
    "optical": {
        "admin": _EDIT, "optical_staff": _EDIT, "nurse": _EDIT,
    },
    "inventory": {
        "admin": _EDIT, "pharmacist": _VIEW, "inventory_manager": _EDIT,
    },
    "billing": {
        "admin": _EDIT, "cashier": _EDIT,
    },
    # General Billing — a dependent add-on of "billing" (see the
    # database_hole/2026-08-13_general_billing_module.sql module row), granted
    # to receptionist independently of full Billing access.
    "general_billing": {
        "admin": _EDIT, "cashier": _EDIT, "receptionist": _EDIT,
    },
    "system.subscription": {
        "admin": _EDIT,
    },
    "system.user_management": {
        "admin": _EDIT,
    },
    "system.settings": {
        "admin": _EDIT,
    },
}


# Display labels for the Roles & Permissions admin UI — kept here rather than
# duplicated on the frontend, since every key already lives in this file.
PERMISSION_KEY_LABELS: Dict[str, str] = {
    "general.dashboard": "Dashboard",
    "general.patients": "Patient Management",
    "general.staff_directory": "Staff Directory",
    "general.analytics": "Analytics",
    "appt.opd_assignment": "OPD Assignment",
    "appt.walkin_queue": "Walk-in Queue",
    "appt.queue_display": "Queue Display",
    "appt.doctor_schedule": "Doctor Schedule",
    "appt.manage": "Manage Appointments",
    "appt.waitlist": "Waitlist",
    "appt.reports": "Appointment Reports",
    "appt.settings": "Appointment Settings",
    "rx.all": "Prescriptions (All)",
    "rx.new": "New Prescription",
    "pharmacy": "Pharmacy",
    "optical": "Optical Store",
    "inventory": "Inventory",
    "billing": "Billing & Invoices",
    "general_billing": "General Billing",
    "system.subscription": "Subscription & Modules",
    "system.user_management": "Staff & Role Management",
    "system.settings": "Hospital Settings",
}

# A hospital admin editing their own permission matrix must never be able to
# lock every admin out of the very page that controls it. This key/role pair
# is always forced to at least "edit" regardless of what overrides say.
_PROTECTED_KEY = "system.user_management"
_PROTECTED_ROLE = "admin"

# The Dashboard must keep working exactly as it did before the Roles &
# Permissions feature existed, for every role, in every hospital — it's the
# landing page every login relies on, so it's excluded from the whole
# override system rather than merely defaulted. Not shown in the Roles &
# Permissions UI, and any override row saved for it (e.g. via a raw API
# call) is ignored by get_effective_matrix() below.
_LOCKED_KEYS = {"general.dashboard"}


def _roles_at(key: str, min_level: str) -> Tuple[str, ...]:
    entry = MODULE_ROLES[key]
    threshold = _LEVELS[min_level]
    roles = {role for role, level in entry.items() if _LEVELS[level] >= threshold}
    roles.add("super_admin")
    return tuple(roles)


def view_roles(key: str) -> Tuple[str, ...]:
    """Roles with at least view access to `key` (includes edit-level roles)."""
    return _roles_at(key, _VIEW)


def edit_roles(key: str) -> Tuple[str, ...]:
    """Roles with edit access to `key` (edit implies create/update/delete)."""
    return _roles_at(key, _EDIT)


# ══════════════════════════════════════════════════════════════════════════
# Per-hospital effective matrix — resolver, cache, FastAPI dependency
# ══════════════════════════════════════════════════════════════════════════

# hospital_id -> resolved {key: {role: level}}. A plain in-process dict is
# enough here: overrides are rare writes (an admin editing a settings page),
# so a cache that's invalidated exactly on write is simpler and cheaper than
# a TTL/Redis layer, and correct within a single worker process. If this ever
# runs behind multiple uvicorn workers, a stale-for-up-to-N-seconds fallback
# (not currently needed) would be the minimal addition — see note in
# get_effective_matrix().
_matrix_cache: Dict[str, Dict[str, Dict[str, str]]] = {}


def invalidate_hospital_matrix_cache(hospital_id) -> None:
    """Call after writing to hospital_permission_overrides for this hospital."""
    _matrix_cache.pop(str(hospital_id), None)


def get_effective_matrix(db: Session, hospital_id) -> Dict[str, Dict[str, str]]:
    """MODULE_ROLES, with this hospital's saved overrides applied on top.

    Overrides are sparse: an access_level of 'none' removes the role's entry
    for that key (falls back to "no access" rather than the default), any
    other level replaces/adds it. Cached per hospital_id until invalidated.
    """
    cache_key = str(hospital_id)
    cached = _matrix_cache.get(cache_key)
    if cached is not None:
        return cached

    from ..models.user import HospitalPermissionOverride  # local import avoids a cycle at module load

    effective: Dict[str, Dict[str, str]] = {
        key: dict(roles) for key, roles in MODULE_ROLES.items()
    }
    overrides = (
        db.query(HospitalPermissionOverride)
        .filter(HospitalPermissionOverride.hospital_id == hospital_id)
        .all()
    )
    for ov in overrides:
        if ov.permission_key in _LOCKED_KEYS:
            continue
        bucket = effective.setdefault(ov.permission_key, {})
        if ov.access_level == "none":
            bucket.pop(ov.role_name, None)
        else:
            bucket[ov.role_name] = ov.access_level

    _matrix_cache[cache_key] = effective
    return effective


def check_permission(db: Session, current_user, key: str, level: str = _VIEW) -> bool:
    """Hospital-aware permission check — the effective-matrix equivalent of
    `_has_role(user, *edit_roles(key))`. super_admin always passes."""
    user_roles = {str(r).strip().lower() for r in (current_user.roles or [])}
    if "super_admin" in user_roles:
        return True

    matrix = get_effective_matrix(db, current_user.hospital_id)
    entry = matrix.get(key, {})
    threshold = _LEVELS[level]
    for role in user_roles:
        role_level = entry.get(role)
        if role_level and _LEVELS[role_level] >= threshold:
            return True
    return False


def require_permission(key: str, level: str = _VIEW):
    """FastAPI dependency factory — hospital-aware drop-in replacement for
    `require_any_role(*edit_roles(key))` / `require_any_role(*view_roles(key))`.

    Usage: `Depends(require_permission("billing", "edit"))`.
    """
    from ..dependencies import get_current_active_user
    from ..database import get_db

    async def _dependency(
        current_user=Depends(get_current_active_user),
        db: Session = Depends(get_db),
    ):
        if not check_permission(db, current_user, key, level):
            logger.warning(
                "RBAC deny (permission matrix) user=%s roles=%s key=%s level=%s",
                getattr(current_user, "username", "unknown"),
                getattr(current_user, "roles", []),
                key, level,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions",
            )
        return current_user

    return _dependency
