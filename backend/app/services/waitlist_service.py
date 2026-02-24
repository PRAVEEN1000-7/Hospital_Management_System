"""
Waitlist service – join, notify, confirm, auto-process.
"""
import logging
from datetime import date, datetime, timezone, timedelta
from math import ceil
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.appointment import Waitlist
from ..models.patient import Patient
from ..models.user import User

logger = logging.getLogger(__name__)


def add_to_waitlist(db: Session, data: dict) -> Waitlist:
    entry = Waitlist(**data)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_waitlist_entry(db: Session, entry_id: int) -> Waitlist | None:
    return db.query(Waitlist).filter(Waitlist.id == entry_id).first()


def list_waitlist(
    db: Session,
    page: int = 1,
    limit: int = 10,
    doctor_id: int | None = None,
    patient_id: int | None = None,
    status: str | None = None,
):
    q = db.query(Waitlist)
    if doctor_id:
        q = q.filter(Waitlist.doctor_id == doctor_id)
    if patient_id:
        q = q.filter(Waitlist.patient_id == patient_id)
    if status:
        q = q.filter(Waitlist.status == status)

    total = q.count()
    offset = (page - 1) * limit
    rows = q.order_by(Waitlist.priority.asc(), Waitlist.joined_at.asc()).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if total > 0 else 0
    return total, page, limit, total_pages, rows


def confirm_waitlist(db: Session, entry_id: int) -> Waitlist | None:
    entry = get_waitlist_entry(db, entry_id)
    if not entry:
        return None
    entry.status = "confirmed"
    entry.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(entry)
    return entry


def cancel_waitlist(db: Session, entry_id: int) -> bool:
    entry = get_waitlist_entry(db, entry_id)
    if not entry:
        return False
    entry.status = "cancelled"
    db.commit()
    return True


def enrich_waitlist(db: Session, entries: list[Waitlist]) -> list[dict]:
    """Add patient_name / doctor_name to waitlist entries."""
    if not entries:
        return []

    patient_ids = {e.patient_id for e in entries}
    doctor_ids = {e.doctor_id for e in entries}

    patients = {p.id: p for p in db.query(Patient).filter(Patient.id.in_(patient_ids)).all()}
    doctors = {u.id: u for u in db.query(User).filter(User.id.in_(doctor_ids)).all()}

    result = []
    for e in entries:
        d = {c.name: getattr(e, c.name) for c in e.__table__.columns}
        p = patients.get(e.patient_id)
        d["patient_name"] = p.full_name if p else None
        doc = doctors.get(e.doctor_id)
        d["doctor_name"] = doc.full_name if doc else None
        result.append(d)
    return result
