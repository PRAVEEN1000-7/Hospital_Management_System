"""
Roles & Permissions admin UI — read/write the effective per-hospital matrix.

The matrix is MODULE_ROLES (backend/app/core/module_roles.py) with this
hospital's saved hospital_permission_overrides layered on top. See
module_roles.get_effective_matrix() for the merge/caching logic reused here.
"""
import uuid
from typing import List

from sqlalchemy.orm import Session

from ..core.module_roles import (
    MODULE_ROLES,
    PERMISSION_KEY_LABELS,
    _LOCKED_KEYS,
    _PROTECTED_KEY,
    _PROTECTED_ROLE,
    get_effective_matrix,
    invalidate_hospital_matrix_cache,
)
from ..models.user import HospitalPermissionOverride, Role
from ..schemas.role_permission import (
    EffectiveMatrixResponse,
    MatrixUpdateResponse,
    PermissionCell,
    PermissionKeyRow,
    PermissionOverrideChange,
)


def _assignable_roles(db: Session, hospital_id: uuid.UUID) -> List[str]:
    """System-wide roles (hospital_id IS NULL) plus this hospital's own custom
    roles, excluding super_admin (it isn't a configurable row — always bypasses)."""
    from sqlalchemy import or_

    rows = (
        db.query(Role.name)
        .filter(
            or_(Role.hospital_id.is_(None), Role.hospital_id == hospital_id),
            Role.is_active == True,  # noqa: E712
            Role.name != "super_admin",
        )
        .order_by(Role.name)
        .all()
    )
    names = [r[0] for r in rows]
    # Fall back to whatever roles actually appear in the default matrix, in
    # case the `roles` table hasn't been seeded for this hospital yet — the
    # matrix should never render empty just because seed data is missing.
    if not names:
        seen = set()
        for entry in MODULE_ROLES.values():
            seen.update(entry.keys())
        names = sorted(seen)
    return names


def get_matrix(db: Session, hospital_id: uuid.UUID) -> EffectiveMatrixResponse:
    roles = _assignable_roles(db, hospital_id)
    effective = get_effective_matrix(db, hospital_id)

    rows: List[PermissionKeyRow] = []
    for key, default_entry in MODULE_ROLES.items():
        if key in _LOCKED_KEYS:
            continue
        effective_entry = effective.get(key, {})
        cells = {}
        for role in roles:
            level = effective_entry.get(role, "none")
            is_override = level != default_entry.get(role, "none")
            cells[role] = PermissionCell(access_level=level, is_override=is_override)
        rows.append(
            PermissionKeyRow(key=key, label=PERMISSION_KEY_LABELS.get(key, key), cells=cells)
        )

    return EffectiveMatrixResponse(roles=roles, rows=rows)


def update_matrix(
    db: Session,
    hospital_id: uuid.UUID,
    updated_by: uuid.UUID,
    changes: List[PermissionOverrideChange],
) -> MatrixUpdateResponse:
    applied = 0
    skipped: List[str] = []

    for change in changes:
        if change.key in _LOCKED_KEYS:
            skipped.append(f"{change.key}/{change.role}: locked (not configurable)")
            continue
        if (
            change.key == _PROTECTED_KEY
            and change.role == _PROTECTED_ROLE
            and change.access_level != "edit"
        ):
            skipped.append(f"{change.key}/{change.role}: locked (would remove admin's own access)")
            continue
        if change.key not in MODULE_ROLES:
            skipped.append(f"{change.key}/{change.role}: unknown permission key")
            continue

        existing = (
            db.query(HospitalPermissionOverride)
            .filter(
                HospitalPermissionOverride.hospital_id == hospital_id,
                HospitalPermissionOverride.permission_key == change.key,
                HospitalPermissionOverride.role_name == change.role,
            )
            .first()
        )
        default_level = MODULE_ROLES.get(change.key, {}).get(change.role, "none")

        if change.access_level == default_level:
            # Back to the default — drop the override row entirely rather
            # than storing a row that says nothing different from default.
            if existing:
                db.delete(existing)
                applied += 1
            continue

        if existing:
            existing.access_level = change.access_level
            existing.updated_by = updated_by
        else:
            db.add(HospitalPermissionOverride(
                hospital_id=hospital_id,
                permission_key=change.key,
                role_name=change.role,
                access_level=change.access_level,
                updated_by=updated_by,
            ))
        applied += 1

    db.commit()
    invalidate_hospital_matrix_cache(hospital_id)
    return MatrixUpdateResponse(applied=applied, skipped=skipped)


def reset_cell(db: Session, hospital_id: uuid.UUID, key: str, role: str) -> None:
    db.query(HospitalPermissionOverride).filter(
        HospitalPermissionOverride.hospital_id == hospital_id,
        HospitalPermissionOverride.permission_key == key,
        HospitalPermissionOverride.role_name == role,
    ).delete()
    db.commit()
    invalidate_hospital_matrix_cache(hospital_id)
