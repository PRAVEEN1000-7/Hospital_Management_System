"""
Queue Display Screen service (BRD-005 — multi-screen queue display config).
"""
import uuid
from typing import Optional, List

from sqlalchemy.orm import Session, joinedload

from ..models.hospital_settings import QueueDisplayScreen


def list_screens(db: Session, hospital_id: uuid.UUID) -> List[QueueDisplayScreen]:
    return (
        db.query(QueueDisplayScreen)
        .options(
            joinedload(QueueDisplayScreen.department),
            joinedload(QueueDisplayScreen.doctor),
            joinedload(QueueDisplayScreen.doctor2),
        )
        .filter(QueueDisplayScreen.hospital_id == hospital_id)
        .order_by(QueueDisplayScreen.created_at.asc())
        .all()
    )


def get_screen(db: Session, screen_id: str, hospital_id: uuid.UUID) -> Optional[QueueDisplayScreen]:
    try:
        sid = uuid.UUID(screen_id)
    except ValueError:
        return None
    return (
        db.query(QueueDisplayScreen)
        .options(
            joinedload(QueueDisplayScreen.department),
            joinedload(QueueDisplayScreen.doctor),
            joinedload(QueueDisplayScreen.doctor2),
        )
        .filter(QueueDisplayScreen.id == sid, QueueDisplayScreen.hospital_id == hospital_id)
        .first()
    )


def get_screen_by_slug(db: Session, hospital_id: uuid.UUID, slug: str) -> Optional[QueueDisplayScreen]:
    return (
        db.query(QueueDisplayScreen)
        .filter(
            QueueDisplayScreen.hospital_id == hospital_id,
            QueueDisplayScreen.slug == slug,
            QueueDisplayScreen.is_active == True,
        )
        .first()
    )


def create_screen(db: Session, hospital_id: uuid.UUID, data: dict) -> QueueDisplayScreen:
    screen = QueueDisplayScreen(hospital_id=hospital_id, **data)
    db.add(screen)
    db.commit()
    db.refresh(screen)
    return screen


def update_screen(db: Session, screen: QueueDisplayScreen, data: dict) -> QueueDisplayScreen:
    for key, value in data.items():
        setattr(screen, key, value)
    db.commit()
    db.refresh(screen)
    return screen


def deactivate_screen(db: Session, screen: QueueDisplayScreen) -> QueueDisplayScreen:
    screen.is_active = False
    db.commit()
    db.refresh(screen)
    return screen
