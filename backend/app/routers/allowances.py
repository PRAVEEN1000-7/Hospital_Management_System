"""
Allowances router — /api/v1/allowances, gated by the `attendance` module
(same submodule area as Shift Management, Attendance Report, Payroll).
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.allowance import Allowance
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.allowance import AllowanceCreate, AllowanceResponse
from ..services import allowance_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/allowances", tags=["Allowances"])


def _to_response(a: Allowance) -> AllowanceResponse:
    return AllowanceResponse(
        id=str(a.id),
        user_id=str(a.user_id),
        reference_number=a.user.reference_number if a.user else None,
        first_name=a.user.first_name if a.user else "",
        last_name=a.user.last_name if a.user else "",
        year=a.year,
        month=a.month,
        amount=float(a.amount),
        reason=a.reason,
        allowance_type=a.allowance_type,
        created_at=a.created_at,
    )


@router.get("", response_model=list[AllowanceResponse])
async def list_allowances(
    year: int,
    month: int,
    user_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Every allowance logged for the given month — optionally scoped to
    one employee (used by the Allowance tab's per-employee popup)."""
    rows = allowance_service.list_allowances(
        db, current_user.hospital_id, year, month,
        user_id=uuid.UUID(user_id) if user_id else None,
    )
    return [_to_response(r) for r in rows]


@router.post("", response_model=AllowanceResponse, status_code=status.HTTP_201_CREATED)
async def create_allowance(
    body: AllowanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    row = allowance_service.create_allowance(
        db, current_user.hospital_id, uuid.UUID(body.user_id), body.year, body.month,
        body.amount, body.reason, body.allowance_type, current_user.id,
    )
    return _to_response(row)


@router.delete("/{allowance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_allowance(
    allowance_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    ok = allowance_service.delete_allowance(db, current_user.hospital_id, uuid.UUID(allowance_id))
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found")
