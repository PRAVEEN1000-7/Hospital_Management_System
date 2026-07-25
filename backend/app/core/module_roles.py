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
"""
from typing import Dict, Tuple

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
        "admin": _EDIT, "optical_staff": _EDIT,
    },
    "inventory": {
        "admin": _EDIT, "pharmacist": _VIEW, "inventory_manager": _EDIT,
    },
    "billing": {
        "admin": _EDIT, "cashier": _EDIT,
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
