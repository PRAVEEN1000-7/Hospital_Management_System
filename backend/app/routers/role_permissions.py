"""
Roles & Permissions admin UI — view/edit the effective per-hospital RBAC
matrix (backend/app/core/module_roles.py + hospital_permission_overrides).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..core.module_roles import require_permission
from ..schemas.role_permission import (
    EffectiveMatrixResponse,
    MatrixUpdateRequest,
    MatrixUpdateResponse,
    ResetCellRequest,
)
from ..services.role_permission_service import get_matrix, update_matrix, reset_cell

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/roles-permissions", tags=["Roles & Permissions"])

# Editing is gated by the "system.user_management" permission key — the same
# key this page edits. The self-lockout guard in
# role_permission_service.update_matrix keeps this from ever becoming a dead
# end for a hospital's admins.
_edit_guard = require_permission("system.user_management", "edit")


@router.get("/matrix", response_model=EffectiveMatrixResponse)
async def get_permission_matrix(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """The effective role x permission-key matrix for the caller's hospital.

    Intentionally open to ANY authenticated user, not just admins: this is
    what every client needs fetched (AuthContext, mirrored into
    modulePermissions.ts) so hasAccess()/allowedRoles() reflect this
    hospital's overrides for whichever role is actually logged in — the data
    itself isn't sensitive (the static default matrix already ships fully
    visible in the JS bundle to every role). Only *editing* the matrix is
    admin-gated, via _edit_guard below.
    """
    return get_matrix(db, current_user.hospital_id)


@router.put("/matrix", response_model=MatrixUpdateResponse)
async def update_permission_matrix(
    payload: MatrixUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_edit_guard),
):
    """Batch-save cell changes for the caller's hospital only."""
    if not payload.changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    result = update_matrix(db, current_user.hospital_id, current_user.id, payload.changes)
    logger.info(
        "Roles & Permissions updated by user=%s hospital=%s applied=%d skipped=%d",
        current_user.username, current_user.hospital_id, result.applied, len(result.skipped),
    )
    return result


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_permission_cell(
    payload: ResetCellRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_edit_guard),
):
    """Drop a single (key, role) override, reverting that cell to the default."""
    reset_cell(db, current_user.hospital_id, payload.key, payload.role)
