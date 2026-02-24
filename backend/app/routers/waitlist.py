"""
Waitlist router – join, confirm, cancel, list.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..schemas.appointment import (
    WaitlistCreate,
    WaitlistResponse,
    PaginatedWaitlistResponse,
)
from ..services.waitlist_service import (
    add_to_waitlist,
    list_waitlist,
    confirm_waitlist,
    cancel_waitlist,
    enrich_waitlist,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/waitlist", tags=["Waitlist"])


@router.post("", response_model=WaitlistResponse, status_code=status.HTTP_201_CREATED)
async def join_waitlist(
    data: WaitlistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    entry = add_to_waitlist(db, data.model_dump())
    enriched = enrich_waitlist(db, [entry])
    return enriched[0] if enriched else entry


@router.get("", response_model=PaginatedWaitlistResponse)
async def get_waitlist(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    doctor_id: Optional[int] = None,
    patient_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    total, pg, lim, tp, rows = list_waitlist(db, page, limit, doctor_id, patient_id, status_filter)
    enriched = enrich_waitlist(db, rows)
    return PaginatedWaitlistResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[WaitlistResponse(**e) for e in enriched],
    )


@router.get("/my-waitlist", response_model=PaginatedWaitlistResponse)
async def my_waitlist(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Current user's waitlist entries (by checking patient association or doctor)."""
    total, pg, lim, tp, rows = list_waitlist(db, page, limit, doctor_id=current_user.id)
    enriched = enrich_waitlist(db, rows)
    return PaginatedWaitlistResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[WaitlistResponse(**e) for e in enriched],
    )


@router.post("/{entry_id}/confirm", response_model=WaitlistResponse)
async def confirm(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    entry = confirm_waitlist(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    enriched = enrich_waitlist(db, [entry])
    return enriched[0]


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not cancel_waitlist(db, entry_id):
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
