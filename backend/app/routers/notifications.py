"""Notifications API routes."""
import uuid
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from ..database import get_db
from ..dependencies import get_current_active_user
from ..models.user import User
from ..models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _serialize(notification: Notification) -> dict:
    return {
        "id": str(notification.id),
        "title": notification.title,
        "message": notification.message,
        "type": notification.type,
        "priority": notification.priority,
        "reference_type": notification.reference_type,
        "reference_id": str(notification.reference_id) if notification.reference_id else None,
        "is_read": notification.is_read,
        "read_at": notification.read_at,
        "created_at": notification.created_at,
    }


@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    q = db.query(Notification).filter(
        Notification.hospital_id == current_user.hospital_id,
        Notification.user_id == current_user.id,
    )
    if unread_only:
        q = q.filter(Notification.is_read == False)

    total = q.count()
    unread_count = db.query(func.count(Notification.id)).filter(
        Notification.hospital_id == current_user.hospital_id,
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).scalar() or 0

    rows = (
        q.order_by(Notification.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "data": [_serialize(n) for n in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, ceil(total / limit)),
        "unread_count": unread_count,
    }


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.hospital_id == current_user.hospital_id,
        Notification.user_id == current_user.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")

    if not n.is_read:
        n.is_read = True
        n.read_at = datetime.utcnow()
        db.commit()
        db.refresh(n)

    return _serialize(n)


@router.put("/read-all")
async def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    now = datetime.utcnow()
    (
        db.query(Notification)
        .filter(
            Notification.hospital_id == current_user.hospital_id,
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
        .update({"is_read": True, "read_at": now}, synchronize_session=False)
    )
    db.commit()
    return {"success": True}
