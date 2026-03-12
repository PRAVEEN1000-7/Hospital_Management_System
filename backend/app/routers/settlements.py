"""
Daily Settlements router — /api/v1/settlements
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_active_user
from ..models.user import User
from ..schemas.settlement import (
    SettlementCreate, SettlementResponse, PaginatedSettlementResponse
)
from ..services.settlement_service import (
    create_settlement, get_settlement_by_id, list_settlements,
    close_settlement, verify_settlement, _to_response,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settlements", tags=["Billing — Daily Settlements"])

BILLING_ADMIN_ROLES  = {"super_admin", "admin"}
BILLING_STAFF_ROLES  = {"super_admin", "admin", "cashier", "pharmacist"}


def _require_billing_staff(current_user: User) -> None:
    role = current_user.roles[0] if current_user.roles else ""
    if role not in BILLING_STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Billing staff access required")


def _require_billing_admin(current_user: User) -> None:
    role = current_user.roles[0] if current_user.roles else ""
    if role not in BILLING_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin or Super Admin role required")


@router.post("", response_model=SettlementResponse, status_code=status.HTTP_201_CREATED)
async def create_daily_settlement(
    data: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a day-end settlement — aggregates all payments for the date."""
    _require_billing_staff(current_user)
    try:
        record = create_settlement(db, data, current_user.id, current_user.hospital_id)
        return _to_response(db, record)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating settlement: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create settlement")


@router.get("", response_model=PaginatedSettlementResponse)
async def list_all_settlements(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List settlements with pagination."""
    _require_billing_staff(current_user)
    try:
        return list_settlements(db, current_user.hospital_id, page, limit, status=status)
    except Exception as e:
        logger.error(f"Error listing settlements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve settlements")


@router.get("/{settlement_id}", response_model=SettlementResponse)
async def get_settlement(
    settlement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get settlement details."""
    _require_billing_staff(current_user)
    record = get_settlement_by_id(db, settlement_id)
    if not record or str(record.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Settlement not found")
    return _to_response(db, record)


@router.patch("/{settlement_id}/close", response_model=SettlementResponse)
async def close_settlement_endpoint(
    settlement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Close an open settlement (cashier action)."""
    _require_billing_staff(current_user)
    record = get_settlement_by_id(db, settlement_id)
    if not record or str(record.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Settlement not found")
    try:
        record = close_settlement(db, record)
        return _to_response(db, record)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error closing settlement {settlement_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to close settlement")


@router.patch("/{settlement_id}/verify", response_model=SettlementResponse)
async def verify_settlement_endpoint(
    settlement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Verify a closed settlement (admin action)."""
    _require_billing_admin(current_user)
    record = get_settlement_by_id(db, settlement_id)
    if not record or str(record.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Settlement not found")
    try:
        record = verify_settlement(db, record, current_user.id)
        return _to_response(db, record)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error verifying settlement {settlement_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to verify settlement")
