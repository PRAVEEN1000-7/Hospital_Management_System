"""
Holiday service — CRUD for the hospital holiday calendar, plus the
date-range lookup helper Attendance/Leave/Payroll (Phases 2/3/5) use to
auto-populate a day's status as `holiday`.
"""
import uuid
import logging
from datetime import date, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from ..models.holiday import Holiday

logger = logging.getLogger(__name__)


def list_holidays(
    db: Session,
    hospital_id: uuid.UUID,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[Holiday]:
    query = db.query(Holiday).filter(Holiday.hospital_id == hospital_id)
    if date_from:
        query = query.filter(Holiday.date >= date_from)
    if date_to:
        query = query.filter(Holiday.date <= date_to)
    return query.order_by(Holiday.date).all()


def get_holiday_by_id(db: Session, holiday_id: str | uuid.UUID) -> Optional[Holiday]:
    if isinstance(holiday_id, str):
        try:
            holiday_id = uuid.UUID(holiday_id)
        except ValueError:
            return None
    return db.query(Holiday).filter(Holiday.id == holiday_id).first()


def holidays_in_range(
    db: Session, hospital_id: uuid.UUID, date_from: date, date_to: date
) -> dict[date, Holiday]:
    """Used by attendance_service (Phase 2) to auto-fill `holiday` status
    for a date range without one query per day."""
    rows = list_holidays(db, hospital_id, date_from, date_to)
    return {row.date: row for row in rows}


def create_holiday(db: Session, hospital_id: uuid.UUID, data: dict) -> Holiday:
    holiday = Holiday(hospital_id=hospital_id, **data)
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    logger.info(f"Holiday created: {holiday.name} ({holiday.date})")
    return holiday


def update_holiday(db: Session, holiday_id: str | uuid.UUID, data: dict) -> Optional[Holiday]:
    holiday = get_holiday_by_id(db, holiday_id)
    if not holiday:
        return None
    for key, value in data.items():
        if value is not None and hasattr(holiday, key):
            setattr(holiday, key, value)
    db.commit()
    db.refresh(holiday)
    return holiday


def delete_holiday(db: Session, holiday_id: str | uuid.UUID) -> bool:
    holiday = get_holiday_by_id(db, holiday_id)
    if not holiday:
        return False
    db.delete(holiday)
    db.commit()
    return True


def bulk_create_weekly_off(
    db: Session, hospital_id: uuid.UUID, year: int, weekday: int, name: str
) -> list[Holiday]:
    """Insert one row per occurrence of `weekday` (0=Monday..6=Sunday) in
    `year` — the recurring weekly-off bulk action. Skips dates that already
    have a holiday row for this hospital (ON CONFLICT-style, checked
    in-Python since this is a small, bounded loop of ~52 dates)."""
    existing = {h.date for h in list_holidays(db, hospital_id, date(year, 1, 1), date(year, 12, 31))}
    created: list[Holiday] = []
    day = date(year, 1, 1)
    day += timedelta(days=(weekday - day.weekday()) % 7)
    while day.year == year:
        if day not in existing:
            holiday = Holiday(hospital_id=hospital_id, date=day, name=name, type="weekly_off")
            db.add(holiday)
            created.append(holiday)
        day += timedelta(days=7)
    db.commit()
    for holiday in created:
        db.refresh(holiday)
    logger.info(f"Bulk weekly-off created: {len(created)} dates for year {year}")
    return created
