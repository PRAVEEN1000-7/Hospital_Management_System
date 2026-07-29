"""
Queue Display Screens router (BRD-005) — admin-only CRUD for multi-screen
queue-display configuration. The public-facing read side lives in
public_queue.py (unauthenticated, scoped by hospital_code + slug).
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_active_user, require_any_role
from ..core.module_roles import require_permission
from ..models.user import User
from ..schemas.queue_screen import (
    QueueDisplayScreenCreate, QueueDisplayScreenUpdate, QueueDisplayScreenResponse,
)
from ..services.queue_screen_service import (
    list_screens, get_screen, create_screen, update_screen, deactivate_screen,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/queue-screens", tags=["Queue Display Screens"])

# BRD-005 configuration lives under System > Settings in the shared permission matrix.
queue_screens_view_guard = require_permission("system.settings", "view")
queue_screens_edit_guard = require_permission("system.settings", "edit")

_UUID_FIELDS = ("department_id", "doctor_id", "doctor2_id")


def _coerce_uuids(data: dict) -> dict:
    """Convert recognized *_id string fields to uuid.UUID for the FK columns;
    drop invalid ones rather than 500ing on a stray non-UUID value."""
    for field in _UUID_FIELDS:
        if field in data and data[field]:
            try:
                data[field] = uuid.UUID(data[field])
            except (ValueError, TypeError):
                data[field] = None
    return data


@router.get("", response_model=list[QueueDisplayScreenResponse])
async def list_queue_screens(
    db: Session = Depends(get_db),
    current_user: User = Depends(queue_screens_view_guard),
):
    screens = list_screens(db, current_user.hospital_id)
    return [QueueDisplayScreenResponse.model_validate(s) for s in screens]


@router.post("", response_model=QueueDisplayScreenResponse, status_code=status.HTTP_201_CREATED)
async def create_queue_screen(
    data: QueueDisplayScreenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(queue_screens_edit_guard),
):
    try:
        payload = _coerce_uuids(data.model_dump())
        screen = create_screen(db, current_user.hospital_id, payload)
        return QueueDisplayScreenResponse.model_validate(screen)
    except Exception as e:
        db.rollback()
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=400, detail=f"A screen with slug '{data.slug}' already exists for this hospital")
        logger.error(f"Error creating queue display screen: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create queue display screen")


@router.put("/{screen_id}", response_model=QueueDisplayScreenResponse)
async def update_queue_screen(
    screen_id: str,
    data: QueueDisplayScreenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(queue_screens_edit_guard),
):
    screen = get_screen(db, screen_id, current_user.hospital_id)
    if not screen:
        raise HTTPException(status_code=404, detail="Queue display screen not found")
    try:
        payload = _coerce_uuids(data.model_dump(exclude_unset=True))
        screen = update_screen(db, screen, payload)
        return QueueDisplayScreenResponse.model_validate(screen)
    except Exception as e:
        db.rollback()
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=400, detail="A screen with this slug already exists for this hospital")
        logger.error(f"Error updating queue display screen: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update queue display screen")


@router.delete("/{screen_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_queue_screen(
    screen_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(queue_screens_edit_guard),
):
    """Deactivates (is_active=false) rather than hard-deleting — matches the
    payment_modes.is_active convention elsewhere in this codebase."""
    screen = get_screen(db, screen_id, current_user.hospital_id)
    if not screen:
        raise HTTPException(status_code=404, detail="Queue display screen not found")
    deactivate_screen(db, screen)
