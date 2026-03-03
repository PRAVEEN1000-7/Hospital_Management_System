"""
Appointment service — works with new hms_db UUID schema.
Handles CRUD, double-booking prevention, reschedule/cancel, and stats.
"""
import uuid
import logging
from datetime import date, datetime, timezone, time
from math import ceil
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_

from ..models.appointment import Appointment, AppointmentStatusLog, Doctor
from ..models.patient import Patient
from ..models.user import User

logger = logging.getLogger(__name__)


# ── Number generation ──────────────────────────────────────────────────────

def generate_appointment_number(appointment_type: str = "scheduled") -> str:
    """Generate unique appointment number."""
    today = date.today().strftime("%Y%m%d")
    unique_part = uuid.uuid4().hex[:6].upper()
    if appointment_type == "walk_in" or appointment_type == "walk-in":
        return f"WLK-{today}-{unique_part}"
    return f"APT-{today}-{unique_part}"


# ── Create ─────────────────────────────────────────────────────────────────

def create_appointment(
    db: Session,
    data: dict,
    created_by: uuid.UUID,
    hospital_id: uuid.UUID,
) -> Appointment:
    """Create a new appointment."""
    appt_number = generate_appointment_number(data.get("appointment_type", "scheduled"))
    
    # Convert string UUIDs to UUID objects
    patient_id = data.get("patient_id")
    if isinstance(patient_id, str):
        patient_id = uuid.UUID(patient_id)
    
    doctor_id = data.get("doctor_id")
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    
    department_id = data.get("department_id")
    if isinstance(department_id, str):
        department_id = uuid.UUID(department_id)

    appt = Appointment(
        hospital_id=hospital_id,
        appointment_number=appt_number,
        patient_id=patient_id,
        doctor_id=doctor_id,
        department_id=department_id,
        appointment_date=data.get("appointment_date"),
        start_time=data.get("start_time"),
        end_time=data.get("end_time"),
        appointment_type=data.get("appointment_type", "scheduled"),
        visit_type=data.get("visit_type", "new"),
        priority=data.get("priority", "normal"),
        status=data.get("status", "scheduled"),
        chief_complaint=data.get("chief_complaint"),
        consultation_fee=data.get("consultation_fee"),
        notes=data.get("notes"),
        created_by=created_by,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    _log_status_change(db, appt.id, None, "scheduled", created_by)
    return appt


# ── Read ───────────────────────────────────────────────────────────────────

def get_appointment(db: Session, appointment_id: str | uuid.UUID) -> Optional[Appointment]:
    """Get appointment by ID."""
    if isinstance(appointment_id, str):
        try:
            appointment_id = uuid.UUID(appointment_id)
        except ValueError:
            return None
    return db.query(Appointment).filter(
        Appointment.id == appointment_id,
        Appointment.is_deleted == False
    ).first()


def get_appointment_by_number(db: Session, appt_number: str) -> Optional[Appointment]:
    """Get appointment by appointment number."""
    return db.query(Appointment).filter(
        Appointment.appointment_number == appt_number,
        Appointment.is_deleted == False
    ).first()


def list_appointments(
    db: Session,
    page: int = 1,
    limit: int = 10,
    hospital_id: Optional[uuid.UUID] = None,
    doctor_id: Optional[str | uuid.UUID] = None,
    patient_id: Optional[str | uuid.UUID] = None,
    status: Optional[str] = None,
    appointment_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
):
    """List appointments with filters and pagination."""
    q = db.query(Appointment).filter(Appointment.is_deleted == False)
    
    if hospital_id:
        q = q.filter(Appointment.hospital_id == hospital_id)
    
    if doctor_id:
        if isinstance(doctor_id, str):
            doctor_id = uuid.UUID(doctor_id)
        q = q.filter(Appointment.doctor_id == doctor_id)
    
    if patient_id:
        if isinstance(patient_id, str):
            patient_id = uuid.UUID(patient_id)
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
        q = q.outerjoin(Patient, Appointment.patient_id == Patient.id).filter(
            or_(
                Appointment.appointment_number.ilike(term),
                Appointment.chief_complaint.ilike(term),
                Patient.first_name.ilike(term),
                Patient.last_name.ilike(term),
                func.concat(Patient.first_name, ' ', Patient.last_name).ilike(term),
            )
        )
    
    total = q.count()
    offset = (page - 1) * limit
    rows = (
        q.order_by(Appointment.appointment_date.desc(), Appointment.start_time.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total_pages = ceil(total / limit) if total > 0 else 0
    return total, page, limit, total_pages, rows


# ── Update ─────────────────────────────────────────────────────────────────

def update_appointment(
    db: Session,
    appointment_id: str | uuid.UUID,
    data: dict,
    performed_by: uuid.UUID,
) -> Optional[Appointment]:
    """Update appointment fields."""
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None
    
    old_status = appt.status
    for k, v in data.items():
        if v is not None and hasattr(appt, k):
            setattr(appt, k, v)
    
    # Log status change if changed
    if "status" in data and data["status"] != old_status:
        _log_status_change(db, appt.id, old_status, data["status"], performed_by)
    
    db.commit()
    db.refresh(appt)
    return appt


def update_status(
    db: Session,
    appointment_id: str | uuid.UUID,
    new_status: str,
    performed_by: uuid.UUID,
    notes: Optional[str] = None,
) -> Optional[Appointment]:
    """Update appointment status."""
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None
    
    old_status = appt.status
    appt.status = new_status
    
    # Track timestamps
    if new_status == "confirmed":
        pass  # No special timestamp
    elif new_status == "in-progress":
        appt.check_in_at = appt.check_in_at or datetime.now(timezone.utc)
    db.commit()
    db.refresh(appt)
    _log_status_change(db, appt.id, old_status, new_status, performed_by, notes)
    return appt


# ── Cancel ─────────────────────────────────────────────────────────────────

def cancel_appointment(
    db: Session,
    appointment_id: str | uuid.UUID,
    cancelled_by: uuid.UUID,
    reason: Optional[str] = None,
) -> Optional[Appointment]:
    """Cancel an appointment."""
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None
    
    old_status = appt.status
    appt.status = "cancelled"
    appt.cancel_reason = reason
    
    db.commit()
    db.refresh(appt)
    _log_status_change(db, appt.id, old_status, "cancelled", cancelled_by, reason)
    return appt


# ── Reschedule ─────────────────────────────────────────────────────────────

def reschedule_appointment(
    db: Session,
    appointment_id: str | uuid.UUID,
    new_date: date,
    new_time: time,
    performed_by: uuid.UUID,
    reason: Optional[str] = None,
) -> Optional[Appointment]:
    """Reschedule an appointment."""
    appt = get_appointment(db, appointment_id)
    if not appt:
        return None
    
    old_status = appt.status
    appt.appointment_date = new_date
    appt.start_time = new_time
    appt.status = "rescheduled"
    appt.reschedule_count = (appt.reschedule_count or 0) + 1
    appt.reschedule_reason = reason
    
    db.commit()
    db.refresh(appt)
    _log_status_change(db, appt.id, old_status, "rescheduled", performed_by, reason)
    return appt


# ── Double-booking check ──────────────────────────────────────────────────

def check_double_booking(
    db: Session,
    doctor_id: str | uuid.UUID,
    appt_date: date,
    appt_time: time,
    exclude_id: Optional[str | uuid.UUID] = None,
) -> bool:
    """Check if a doctor has a conflicting appointment."""
    if isinstance(doctor_id, str):
        doctor_id = uuid.UUID(doctor_id)
    
    q = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == appt_date,
        Appointment.start_time == appt_time,
        Appointment.status.notin_(["cancelled", "rescheduled"]),
        Appointment.is_deleted == False,
    )
    
    if exclude_id:
        if isinstance(exclude_id, str):
            exclude_id = uuid.UUID(exclude_id)
        q = q.filter(Appointment.id != exclude_id)
    
    return q.first() is not None


# ── Helpers (join patient/doctor names) ────────────────────────────────────

def enrich_appointment(db: Session, appt: Appointment) -> dict:
    """Add patient and doctor names to appointment data."""
    d = {c.name: getattr(appt, c.name) for c in appt.__table__.columns}
    d["id"] = str(appt.id)
    d["hospital_id"] = str(appt.hospital_id) if appt.hospital_id else None
    d["patient_id"] = str(appt.patient_id) if appt.patient_id else None
    d["doctor_id"] = str(appt.doctor_id) if appt.doctor_id else None
    d["department_id"] = str(appt.department_id) if appt.department_id else None
    d["created_by"] = str(appt.created_by) if appt.created_by else None
    d["parent_appointment_id"] = str(appt.parent_appointment_id) if appt.parent_appointment_id else None
    
    # Get patient name
    patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
    d["patient_name"] = patient.full_name if patient else None
    
    # Get doctor name via Doctor -> User
    if appt.doctor_id:
        doctor = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
        if doctor and doctor.user:
            d["doctor_name"] = doctor.user.full_name
        else:
            d["doctor_name"] = None
    else:
        d["doctor_name"] = None
    
    return d


def enrich_appointments(db: Session, appointments: list[Appointment]) -> list[dict]:
    """Add patient and doctor names to multiple appointments."""
    if not appointments:
        return []
    
    # Batch load patients
    patient_ids = {a.patient_id for a in appointments}
    patients = {p.id: p for p in db.query(Patient).filter(Patient.id.in_(patient_ids)).all()}
    
    # Batch load doctors with their users
    doctor_ids = {a.doctor_id for a in appointments if a.doctor_id}
    doctors = {}
    if doctor_ids:
        doctor_records = db.query(Doctor).filter(Doctor.id.in_(doctor_ids)).all()
        for doc in doctor_records:
            if doc.user:
                doctors[doc.id] = doc.user.full_name
    
    result = []
    for a in appointments:
        d = {c.name: getattr(a, c.name) for c in a.__table__.columns}
        d["id"] = str(a.id)
        d["hospital_id"] = str(a.hospital_id) if a.hospital_id else None
        d["patient_id"] = str(a.patient_id) if a.patient_id else None
        d["doctor_id"] = str(a.doctor_id) if a.doctor_id else None
        d["department_id"] = str(a.department_id) if a.department_id else None
        
        p = patients.get(a.patient_id)
        d["patient_name"] = p.full_name if p else None
        d["doctor_name"] = doctors.get(a.doctor_id)
        result.append(d)
    
    return result


# ── Stats ──────────────────────────────────────────────────────────────────

def get_appointment_stats(
    db: Session,
    hospital_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    doctor_id: Optional[str | uuid.UUID] = None,
) -> dict:
    """Get appointment statistics."""
    q = db.query(Appointment).filter(Appointment.is_deleted == False)
    
    if hospital_id:
        q = q.filter(Appointment.hospital_id == hospital_id)
    if date_from:
        q = q.filter(Appointment.appointment_date >= date_from)
    if date_to:
        q = q.filter(Appointment.appointment_date <= date_to)
    if doctor_id:
        if isinstance(doctor_id, str):
            doctor_id = uuid.UUID(doctor_id)
        q = q.filter(Appointment.doctor_id == doctor_id)
    
    appointments = q.all()
    total = len(appointments)
    
    if total == 0:
        return {
            "total_appointments": 0,
            "total_scheduled": 0,
            "total_walk_ins": 0,
            "total_completed": 0,
            "total_cancelled": 0,
            "total_no_shows": 0,
            "total_pending": 0,
            "completion_rate": 0,
            "cancellation_rate": 0,
            "no_show_rate": 0,
        }
    
    completed = sum(1 for a in appointments if a.status == "completed")
    cancelled = sum(1 for a in appointments if a.status == "cancelled")
    no_shows = sum(1 for a in appointments if a.status == "no_show")
    pending = sum(1 for a in appointments if a.status in ("scheduled", "confirmed"))
    scheduled = sum(1 for a in appointments if a.appointment_type == "scheduled")
    walk_ins = sum(1 for a in appointments if a.appointment_type == "walk_in")
    
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
    }


# ── Status log ─────────────────────────────────────────────────────────────

def _log_status_change(
    db: Session,
    appointment_id: uuid.UUID,
    from_status: Optional[str],
    to_status: str,
    changed_by: uuid.UUID,
    notes: Optional[str] = None,
):
    """Log appointment status change."""
    try:
        log = AppointmentStatusLog(
            appointment_id=appointment_id,
            from_status=from_status,
            to_status=to_status,
            changed_by=changed_by,
            notes=notes,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log status change: {e}")


def get_enhanced_stats(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict:
    """Get comprehensive appointment analytics."""
    from sqlalchemy import func as sqlfunc, extract

    query = db.query(Appointment).filter(Appointment.is_deleted == False)
    if date_from:
        query = query.filter(Appointment.appointment_date >= date_from)
    if date_to:
        query = query.filter(Appointment.appointment_date <= date_to)

    appointments = query.all()

    # Base stats
    total = len(appointments)
    completed = sum(1 for a in appointments if a.status == "completed")
    cancelled = sum(1 for a in appointments if a.status == "cancelled")
    no_shows = sum(1 for a in appointments if a.status == "no-show")
    pending = sum(1 for a in appointments if a.status in ("pending", "confirmed", "scheduled"))
    scheduled_type = sum(1 for a in appointments if a.appointment_type == "scheduled")
    walk_in_type = sum(1 for a in appointments if a.appointment_type == "walk-in")

    # Doctor stats
    doctor_map = {}
    for a in appointments:
        did = str(a.doctor_id) if a.doctor_id else "unassigned"
        if did not in doctor_map:
            doctor_map[did] = {"doctor_id": did, "total": 0, "completed": 0, "cancelled": 0}
        doctor_map[did]["total"] += 1
        if a.status == "completed":
            doctor_map[did]["completed"] += 1
        elif a.status == "cancelled":
            doctor_map[did]["cancelled"] += 1

    # Department stats
    dept_map = {}
    for a in appointments:
        did = str(a.department_id) if a.department_id else "unassigned"
        if did not in dept_map:
            dept_map[did] = {"department_id": did, "total": 0, "completed": 0}
        dept_map[did]["total"] += 1
        if a.status == "completed":
            dept_map[did]["completed"] += 1

    # Daily trends
    daily_map = {}
    for a in appointments:
        d = str(a.appointment_date)
        if d not in daily_map:
            daily_map[d] = {"date": d, "total": 0, "completed": 0, "cancelled": 0}
        daily_map[d]["total"] += 1
        if a.status == "completed":
            daily_map[d]["completed"] += 1
        elif a.status == "cancelled":
            daily_map[d]["cancelled"] += 1

    # Peak hours
    hour_map = {}
    for a in appointments:
        if a.start_time:
            h = a.start_time.hour
            if h not in hour_map:
                hour_map[h] = {"hour": h, "count": 0}
            hour_map[h]["count"] += 1

    # Cancellation reasons
    reason_map = {}
    for a in appointments:
        if a.status == "cancelled" and a.cancel_reason:
            r = a.cancel_reason
            if r not in reason_map:
                reason_map[r] = {"reason": r, "count": 0}
            reason_map[r]["count"] += 1

    return {
        "total_appointments": total,
        "total_scheduled": scheduled_type,
        "total_walk_ins": walk_in_type,
        "total_completed": completed,
        "total_cancelled": cancelled,
        "total_no_shows": no_shows,
        "total_pending": pending,
        "completion_rate": round(completed / total * 100, 1) if total else 0.0,
        "cancellation_rate": round(cancelled / total * 100, 1) if total else 0.0,
        "no_show_rate": round(no_shows / total * 100, 1) if total else 0.0,
        "average_wait_time": 0.0,
        "doctor_stats": list(doctor_map.values()),
        "department_stats": list(dept_map.values()),
        "daily_trends": sorted(daily_map.values(), key=lambda x: x["date"]),
        "peak_hours": sorted(hour_map.values(), key=lambda x: x["hour"]),
        "cancellation_reasons": list(reason_map.values()),
    }
