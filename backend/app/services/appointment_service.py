"""
Appointment service – core CRUD, numbering, double-booking prevention,
reschedule / cancel logic, and audit logging.
"""
import logging
from datetime import date, datetime, timezone
from math import ceil
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_

from ..models.appointment import (
    Appointment, AppointmentAuditLog, appointment_seq, walk_in_seq,
)
from ..models.patient import Patient
from ..models.user import User

logger = logging.getLogger(__name__)


# ── Number generation ──────────────────────────────────────────────────────

def generate_appointment_number(db: Session, appointment_type: str = "scheduled") -> str:
    today = date.today().strftime("%Y%m%d")
    if appointment_type == "walk-in":
        num = db.execute(walk_in_seq.next_value()).scalar()
        return f"WLK-{today}-{num:04d}"
    num = db.execute(appointment_seq.next_value()).scalar()
    return f"APT-{today}-{num:04d}"


# ── Create ─────────────────────────────────────────────────────────────────

def create_appointment(db: Session, data: dict, booked_by: int) -> Appointment:
    appt_number = generate_appointment_number(db, data.get("appointment_type", "scheduled"))
    
    # Auto-confirm if settings say so
    from .settings_service import get_setting_value
    auto_confirm = get_setting_value(db, "auto_confirm_appointments") == "true"
    status = "confirmed" if auto_confirm else "pending"

    appt = Appointment(
        appointment_number=appt_number,
        status=status,
        booked_by=booked_by,
        **data,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)

    # Audit
    _log_action(db, appt.id, "created", booked_by, new_values={"status": status})
    return appt


# ── Read ───────────────────────────────────────────────────────────────────

def get_appointment(db: Session, appointment_id: int) -> Appointment | None:
    return db.query(Appointment).filter(Appointment.id == appointment_id).first()


def list_appointments(
    db: Session,
    page: int = 1,
    limit: int = 10,
    doctor_id: int | None = None,
    patient_id: int | None = None,
    status: str | None = None,
    appointment_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
):
    q = db.query(Appointment)

    if doctor_id:
        q = q.filter(Appointment.doctor_id == doctor_id)
    if patient_id:
        q = q.filter(Appointment.patient_id == patient_id)
    if status:
        q = q.filter(Appointment.status == status)
    if appointment_type:
        q = q.filter(Appointment.appointment_type == appointment_type)
    if date_from:
        q = q.filter(Appointment.appointment_date >= date_from)
    if date_to:
        q = q.filter(Appointment.appointment_date <= date_to)
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Appointment.appointment_number.ilike(term),
                Appointment.reason_for_visit.ilike(term),
            )
        )

    total = q.count()
    offset = (page - 1) * limit
    rows = q.order_by(
        Appointment.appointment_date.desc(),
        Appointment.appointment_time.asc(),
    ).offset(offset).limit(limit).all()

    total_pages = ceil(total / limit) if total > 0 else 0
    return total, page, limit, total_pages, rows


# ── Update ─────────────────────────────────────────────────────────────────

def update_appointment(db: Session, appointment_id: int, data: dict, performed_by: int) -> Appointment | None:
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None

    old_values = {}
    new_values = {}
    for k, v in data.items():
        if v is not None:
            old_values[k] = str(getattr(appt, k, None))
            setattr(appt, k, v)
            new_values[k] = str(v)

    db.commit()
    db.refresh(appt)
    _log_action(db, appt.id, "updated", performed_by, old_values, new_values)
    return appt


def update_status(db: Session, appointment_id: int, new_status: str, performed_by: int) -> Appointment | None:
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None

    old_status = appt.status
    appt.status = new_status

    if new_status == "cancelled":
        appt.cancelled_by = performed_by
        appt.cancelled_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(appt)
    _log_action(db, appt.id, new_status, performed_by,
                old_values={"status": old_status},
                new_values={"status": new_status})
    return appt


# ── Cancel ─────────────────────────────────────────────────────────────────

def cancel_appointment(
    db: Session, appointment_id: int, cancelled_by: int, reason: str | None = None,
) -> Appointment | None:
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None

    old_status = appt.status
    appt.status = "cancelled"
    appt.cancelled_by = cancelled_by
    appt.cancellation_reason = reason
    appt.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(appt)

    _log_action(db, appt.id, "cancelled", cancelled_by,
                old_values={"status": old_status},
                new_values={"status": "cancelled", "reason": reason})
    return appt


# ── Reschedule ─────────────────────────────────────────────────────────────

def reschedule_appointment(
    db: Session, appointment_id: int, new_date, new_time, performed_by: int, reason: str | None = None,
) -> Appointment | None:
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None

    old_values = {
        "date": str(appt.appointment_date),
        "time": str(appt.appointment_time),
        "status": appt.status,
    }

    appt.appointment_date = new_date
    appt.appointment_time = new_time
    appt.status = "rescheduled"
    db.commit()
    db.refresh(appt)

    _log_action(db, appt.id, "rescheduled", performed_by,
                old_values=old_values,
                new_values={
                    "date": str(new_date),
                    "time": str(new_time),
                    "status": "rescheduled",
                    "reason": reason,
                })
    return appt


# ── Double-booking check ──────────────────────────────────────────────────

def check_double_booking(
    db: Session, doctor_id: int, appt_date: date, appt_time, exclude_id: int | None = None,
) -> bool:
    """Return True if a conflicting active booking exists."""
    q = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == appt_date,
        Appointment.appointment_time == appt_time,
        Appointment.status.notin_(["cancelled", "rescheduled"]),
    )
    if exclude_id:
        q = q.filter(Appointment.id != exclude_id)
    return q.first() is not None


# ── Helpers (join patient/doctor names) ────────────────────────────────────

def enrich_appointment(db: Session, appt: Appointment) -> dict:
    """Return appointment dict with patient_name and doctor_name joined."""
    d = {c.name: getattr(appt, c.name) for c in appt.__table__.columns}

    patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
    d["patient_name"] = patient.full_name if patient else None

    if appt.doctor_id:
        doctor = db.query(User).filter(User.id == appt.doctor_id).first()
        d["doctor_name"] = doctor.full_name if doctor else None
    else:
        d["doctor_name"] = None

    return d


def enrich_appointments(db: Session, appointments: list[Appointment]) -> list[dict]:
    """Enrich a list of appointments with names – batch-fetches for efficiency."""
    if not appointments:
        return []

    patient_ids = {a.patient_id for a in appointments}
    doctor_ids = {a.doctor_id for a in appointments if a.doctor_id}

    patients = {p.id: p for p in db.query(Patient).filter(Patient.id.in_(patient_ids)).all()}
    doctors = {u.id: u for u in db.query(User).filter(User.id.in_(doctor_ids)).all()} if doctor_ids else {}

    result = []
    for a in appointments:
        d = {c.name: getattr(a, c.name) for c in a.__table__.columns}
        p = patients.get(a.patient_id)
        d["patient_name"] = p.full_name if p else None
        doc = doctors.get(a.doctor_id)
        d["doctor_name"] = doc.full_name if doc else None
        result.append(d)
    return result


# ── Stats ──────────────────────────────────────────────────────────────────

def get_appointment_stats(
    db: Session,
    date_from: date | None = None,
    date_to: date | None = None,
    doctor_id: int | None = None,
) -> dict:
    q = db.query(Appointment)
    if date_from:
        q = q.filter(Appointment.appointment_date >= date_from)
    if date_to:
        q = q.filter(Appointment.appointment_date <= date_to)
    if doctor_id:
        q = q.filter(Appointment.doctor_id == doctor_id)

    appointments = q.all()
    total = len(appointments)
    if total == 0:
        return {
            "total_appointments": 0, "total_scheduled": 0, "total_walk_ins": 0,
            "total_completed": 0, "total_cancelled": 0, "total_no_shows": 0,
            "total_pending": 0, "completion_rate": 0, "cancellation_rate": 0,
            "no_show_rate": 0, "average_wait_time": 0,
        }

    completed = sum(1 for a in appointments if a.status == "completed")
    cancelled = sum(1 for a in appointments if a.status == "cancelled")
    no_shows = sum(1 for a in appointments if a.status == "no-show")
    pending = sum(1 for a in appointments if a.status in ("pending", "confirmed"))
    scheduled = sum(1 for a in appointments if a.appointment_type == "scheduled")
    walk_ins = sum(1 for a in appointments if a.appointment_type == "walk-in")

    wait_times = [a.estimated_wait_time for a in appointments if a.estimated_wait_time]
    avg_wait = sum(wait_times) / len(wait_times) if wait_times else 0

    return {
        "total_appointments": total,
        "total_scheduled": scheduled,
        "total_walk_ins": walk_ins,
        "total_completed": completed,
        "total_cancelled": cancelled,
        "total_no_shows": no_shows,
        "total_pending": pending,
        "completion_rate": round(completed / total * 100, 1) if total else 0,
        "cancellation_rate": round(cancelled / total * 100, 1) if total else 0,
        "no_show_rate": round(no_shows / total * 100, 1) if total else 0,
        "average_wait_time": round(avg_wait, 1),
    }


# ── Audit log ──────────────────────────────────────────────────────────────

def _log_action(
    db: Session,
    appointment_id: int,
    action: str,
    performed_by: int,
    old_values: dict | None = None,
    new_values: dict | None = None,
):
    try:
        log = AppointmentAuditLog(
            appointment_id=appointment_id,
            action=action,
            performed_by=performed_by,
            old_values=old_values,
            new_values=new_values,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log audit action: {e}")
