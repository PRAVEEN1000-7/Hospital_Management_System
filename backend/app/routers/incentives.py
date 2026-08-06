"""
Incentives router — /api/v1/incentives, gated by the `attendance` module
(same submodule area as Allowance, Payroll).
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.incentive import Incentive
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.incentive import IncentiveCreate, IncentiveResponse
from ..services import incentive_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/incentives", tags=["Incentives"])


def _to_response(i: Incentive) -> IncentiveResponse:
    return IncentiveResponse(
        id=str(i.id),
        user_id=str(i.user_id),
        reference_number=i.user.reference_number if i.user else None,
        first_name=i.user.first_name if i.user else "",
        last_name=i.user.last_name if i.user else "",
        year=i.year,
        month=i.month,
        sales_amount=float(i.sales_amount),
        incentive_percent=float(i.incentive_percent),
        incentive_amount=float(i.incentive_amount),
        created_at=i.created_at,
    )


@router.get("", response_model=list[IncentiveResponse])
async def list_incentives(
    year: int,
    month: int,
    user_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rows = incentive_service.list_incentives(
        db, current_user.hospital_id, year, month,
        user_id=uuid.UUID(user_id) if user_id else None,
    )
    return [_to_response(r) for r in rows]


@router.post("", response_model=IncentiveResponse, status_code=status.HTTP_201_CREATED)
async def create_incentive(
    body: IncentiveCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    row = incentive_service.create_incentive(
        db, current_user.hospital_id, uuid.UUID(body.user_id), body.year, body.month,
        body.sales_amount, body.incentive_percent, current_user.id,
    )
    return _to_response(row)


@router.delete("/{incentive_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incentive(
    incentive_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    ok = incentive_service.delete_incentive(db, current_user.hospital_id, uuid.UUID(incentive_id))
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incentive not found")
