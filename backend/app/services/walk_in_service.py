"""
Walk-in service – queue management, wait-time estimation, doctor assignment.
"""
import logging
from datetime import date, datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.appointment import Appointment
from .appointment_service import generate_appointment_number, enrich_appointments, _log_action

logger = logging.getLogger(__name__)


def register_walk_in(
    db: Session,
    patient_id: int,
    doctor_id: int | None,
    reason: str | None,
    urgency: str,
    fees: float | None,
    registered_by: int,
) -> Appointment:
    """Register a walk-in patient and add to queue."""
    today = date.today()

    # Generate queue number for today (Q001, Q002, …)
    count = db.query(func.count(Appointment.id)).filter(
        Appointment.appointment_type == "walk-in",
        Appointment.appointment_date == today,
    ).scalar() or 0
    queue_number = f"Q{count + 1:03d}"

    # Queue position = number of people currently waiting or in-progress
    waiting = db.query(func.count(Appointment.id)).filter(
        Appointment.appointment_type == "walk-in",
        Appointment.appointment_date == today,
        Appointment.status.in_(["pending", "confirmed"]),
    ).scalar() or 0
    queue_position = waiting + 1

    # Estimate wait (simple: position * average slot duration)
    avg_duration = 20  # minutes per walk-in consultation
    estimated_wait = queue_position * avg_duration

    appt_number = generate_appointment_number(db, "walk-in")

    appt = Appointment(
        appointment_number=appt_number,
        patient_id=patient_id,
        doctor_id=doctor_id,
        appointment_type="walk-in",
        consultation_type="offline",
        appointment_date=today,
        status="confirmed",
        queue_number=queue_number,
        queue_position=queue_position,
        estimated_wait_time=estimated_wait,
        walk_in_registered_at=datetime.now(timezone.utc),
        urgency_level=urgency,
        reason_for_visit=reason,
        fees=fees,
        booked_by=registered_by,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)

    _log_action(db, appt.id, "created", registered_by,
                new_values={"queue_number": queue_number, "type": "walk-in"})
    return appt


def get_queue_status(db: Session, doctor_id: int | None = None) -> dict:
    """Real-time queue overview for today."""
    today = date.today()
    q = db.query(Appointment).filter(
        Appointment.appointment_type == "walk-in",
        Appointment.appointment_date == today,
    )
    if doctor_id:
        q = q.filter(Appointment.doctor_id == doctor_id)

    all_today = q.all()

    waiting = [a for a in all_today if a.status in ("pending", "confirmed")]
    in_progress = [a for a in all_today if a.status == "in-progress"]
    completed = [a for a in all_today if a.status == "completed"]

    wait_times = [a.estimated_wait_time for a in waiting if a.estimated_wait_time]
    avg_wait = int(sum(wait_times) / len(wait_times)) if wait_times else 0

    # Enrich queue items
    enriched = enrich_appointments(db, sorted(waiting, key=lambda a: a.queue_position or 999))

    return {
        "total_waiting": len(waiting),
        "total_in_progress": len(in_progress),
        "total_completed_today": len(completed),
        "average_wait_time": avg_wait,
        "queue": enriched,
    }


def assign_doctor(db: Session, appointment_id: int, doctor_id: int, performed_by: int) -> Appointment | None:
    appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appt:
        return None
    old_doc = appt.doctor_id
    appt.doctor_id = doctor_id
    db.commit()
    db.refresh(appt)

    _log_action(db, appt.id, "assigned_doctor", performed_by,
                old_values={"doctor_id": str(old_doc)},
                new_values={"doctor_id": str(doctor_id)})
    return appt


def get_today_walk_ins(db: Session, doctor_id: int | None = None):
    today = date.today()
    q = db.query(Appointment).filter(
        Appointment.appointment_type == "walk-in",
        Appointment.appointment_date == today,
    )
    if doctor_id:
        q = q.filter(Appointment.doctor_id == doctor_id)
    return q.order_by(Appointment.queue_position.asc()).all()
