"""
Holiday allocation service — one row per hospital per month, storing which
day-of-month numbers are marked as holidays.
"""
import uuid
from sqlalchemy.orm import Session
from ..models.attendance import Holidays


def get_month(db: Session, hospital_id: uuid.UUID, year: int, month: int) -> Holidays | None:
    return (
        db.query(Holidays)
        .filter(Holidays.hospital_id == hospital_id, Holidays.year == year, Holidays.month == month)
        .first()
    )


def get_year(db: Session, hospital_id: uuid.UUID, year: int) -> list[Holidays]:
    return (
        db.query(Holidays)
        .filter(Holidays.hospital_id == hospital_id, Holidays.year == year)
        .order_by(Holidays.month)
        .all()
    )


def upsert_month(
    db: Session, hospital_id: uuid.UUID, year: int, month: int,
    holiday_days: list[int], festival_days: list[int], updated_by: uuid.UUID,
) -> Holidays:
    row = get_month(db, hospital_id, year, month)
    if row:
        row.holiday_days = holiday_days
        row.festival_days = festival_days
    else:
        row = Holidays(
            hospital_id=hospital_id, year=year, month=month,
            holiday_days=holiday_days, festival_days=festival_days, created_by=updated_by,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
