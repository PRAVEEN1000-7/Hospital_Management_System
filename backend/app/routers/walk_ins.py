"""
Walk-in registration router - handles walk-in patient flow.
"""
import logging
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, func, case
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.patient import Patient
from ..models.appointment import Appointment, AppointmentQueue, Doctor
from ..dependencies import get_current_active_user
from ..schemas.appointment import WalkInRegister, WalkInAssignDoctor
from ..services.appointment_service import (
    generate_appointment_number,
    enrich_appointment,
)
from ..services.schedule_service import get_available_slots, is_doctor_on_leave
from ..services.waitlist_service import (
    add_to_waitlist,
    enrich_waitlist_entry,
    check_already_on_waitlist,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/walk-ins", tags=["Walk-in Registration"])


def _user_roles(user: User) -> list:
    """Extract roles list from user."""
    return user.roles if hasattr(user, "roles") and user.roles else []


def _is_admin_or_super(user: User) -> bool:
    roles = _user_roles(user)
    return "admin" in roles or "super_admin" in roles


def _is_receptionist(user: User) -> bool:
    return "receptionist" in _user_roles(user)


def _is_assigned_doctor(db: Session, user: User, queue_entry: "AppointmentQueue") -> bool:
    """Check if the current user is the doctor assigned to this queue entry."""
    if "doctor" not in _user_roles(user):
        return False
    doc = db.query(Doctor).filter(Doctor.user_id == user.id).first()
    return doc is not None and doc.id == queue_entry.doctor_id


def _require_queue_actor(db: Session, user: User, qe: "AppointmentQueue"):
    """Raise 403 unless the user is the assigned doctor or an admin."""
    if _is_admin_or_super(user):
        return
    if _is_assigned_doctor(db, user, qe):
        return
    raise HTTPException(
        status_code=403,
        detail="Only the assigned doctor or an admin can perform this action",
    )


def _next_queue_number(db: Session, doctor_id: uuid.UUID, queue_date: date) -> int:
    """Get next queue number for a doctor on a given date."""
    max_num = (
        db.query(func.max(AppointmentQueue.queue_number))
        .filter(
            AppointmentQueue.doctor_id == doctor_id,
            AppointmentQueue.queue_date == queue_date,
        )
        .scalar()
    )
    return (max_num or 0) + 1


def _next_position(db: Session, doctor_id: uuid.UUID, queue_date: date) -> int:
    """Get next position in queue."""
    waiting = (
        db.query(func.count(AppointmentQueue.id))
        .filter(
            AppointmentQueue.doctor_id == doctor_id,
            AppointmentQueue.queue_date == queue_date,
            AppointmentQueue.status.in_(["waiting", "called"]),
        )
        .scalar()
    )
    return (waiting or 0) + 1


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_walk_in(
    data: WalkInRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Register a walk-in patient: create appointment + add to queue."""
    logger.info(
        f"WALK-IN REGISTER: patient_id={data.patient_id!r}, "
        f"doctor_id={data.doctor_id!r}, priority={data.priority!r}"
    )

    try:
        today = date.today()
        now = datetime.now(timezone.utc)

        # Validate patient exists
        try:
            patient_id = uuid.UUID(data.patient_id)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid patient_id format: {data.patient_id!r}",
            )
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Resolve doctor – treat empty string / "undefined" as None
        doctor_id = None
        raw_doctor = data.doctor_id
        if raw_doctor and raw_doctor.strip() and raw_doctor.strip().lower() != "undefined":
            try:
                doctor_id = uuid.UUID(raw_doctor.strip())
            except (ValueError, AttributeError):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid doctor_id format: {raw_doctor!r}",
                )
            doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
            if not doctor:
                raise HTTPException(status_code=404, detail="Doctor not found")

            # ── Check if doctor is on leave ──
            if is_doctor_on_leave(db, doctor_id, today):
                raise HTTPException(
                    status_code=400,
                    detail="Doctor is on leave today and cannot accept walk-ins",
                )

            # ── Check if ALL slots are full → auto-waitlist ──
            slots = get_available_slots(db, doctor_id, today)
            has_available = any(s["available"] for s in slots) if slots else True  # no schedule = allow
            if slots and not has_available:
                logger.info(
                    f"All slots full for doctor {doctor_id} on {today}. "
                    f"Auto-adding patient {patient_id} to waitlist."
                )
                # Check if already on waitlist
                if check_already_on_waitlist(db, patient_id, doctor_id, today):
                    raise HTTPException(
                        status_code=409,
                        detail="Patient is already on the waitlist for this doctor today",
                    )

                entry = add_to_waitlist(
                    db,
                    data={
                        "patient_id": str(patient_id),
                        "doctor_id": str(doctor_id),
                        "preferred_date": today,
                        "appointment_type": "walk-in",
                        "priority": data.priority or "normal",
                        "chief_complaint": data.chief_complaint,
                        "reason": "Auto-added: all doctor slots full at walk-in registration",
                    },
                    hospital_id=current_user.hospital_id,
                    created_by=current_user.id,
                )
                db.commit()
                db.refresh(entry)

                enriched = enrich_waitlist_entry(db, entry)
                return {
                    "waitlisted": True,
                    "message": f"All slots for this doctor are full today. Patient has been added to the waitlist at position #{entry.position}.",
                    "waitlist_entry": enriched,
                }

        # Create walk-in appointment
        appt_number = generate_appointment_number("walk_in")
        appt = Appointment(
            hospital_id=current_user.hospital_id,
            appointment_number=appt_number,
            patient_id=patient_id,
            doctor_id=doctor_id,
            appointment_date=today,
            start_time=None,
            end_time=None,
            appointment_type="walk-in",
            visit_type="new",
            priority=data.priority or "normal",
            status="scheduled",
            chief_complaint=data.chief_complaint,
            consultation_fee=data.consultation_fee,
            check_in_at=now,
            created_by=current_user.id,
        )
        db.add(appt)
        db.flush()

        # Add to queue if doctor assigned
        queue_entry = None
        if doctor_id:
            q_num = _next_queue_number(db, doctor_id, today)
            q_pos = _next_position(db, doctor_id, today)
            queue_entry = AppointmentQueue(
                appointment_id=appt.id,
                doctor_id=doctor_id,
                queue_date=today,
                queue_number=q_num,
                position=q_pos,
                status="waiting",
            )
            db.add(queue_entry)
            db.flush()

        db.commit()
        db.refresh(appt)

        enriched = enrich_appointment(db, appt)
        enriched["queue_number"] = queue_entry.queue_number if queue_entry else None
        enriched["queue_position"] = queue_entry.position if queue_entry else None
        return enriched

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Walk-in registration failed: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Walk-in registration failed: {str(e)}",
        )


@router.get("/queue")
async def get_queue_status(
    doctor_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get the current walk-in queue.
    - Receptionist / admin: sees all doctors, can filter by doctor_id.
    - Doctor: auto-filtered to their own queue.
    Display order: urgency priority (emergency > urgent > normal), then queue_number.
    Queue number remains the original sequential token number.
    """
    today = date.today()

    # Auto-detect doctor role → filter to own queue
    resolved_doctor_id: Optional[uuid.UUID] = None
    is_doctor_role = any(
        r in (current_user.roles if hasattr(current_user, "roles") else [])
        for r in ("doctor",)
    )
    if is_doctor_role:
        doc = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
        if doc:
            resolved_doctor_id = doc.id
    elif doctor_id:
        try:
            resolved_doctor_id = uuid.UUID(doctor_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid doctor_id")

    # Query queue entries for today
    query = (
        db.query(AppointmentQueue)
        .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
        .filter(AppointmentQueue.queue_date == today)
    )
    if resolved_doctor_id:
        query = query.filter(AppointmentQueue.doctor_id == resolved_doctor_id)

    # Order by urgency (emergency=0, urgent=1, normal=2) then queue_number
    priority_order = case(
        (Appointment.priority == "emergency", 0),
        (Appointment.priority == "urgent", 1),
        else_=2,
    )
    queue_entries = query.order_by(priority_order, AppointmentQueue.queue_number.asc()).all()

    # Build rich items with patient names, doctor names, priority, etc.
    items = []
    for qe in queue_entries:
        appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
        patient_name = None
        doctor_name = None
        priority = "normal"
        chief_complaint = None
        check_in_time = None
        doctor_id_str = None

        patient_id_str = None
        patient_reference_number = None
        patient_phone = None
        patient_gender = None
        patient_date_of_birth = None
        patient_age = None
        patient_blood_group = None

        if appt:
            priority = appt.priority or "normal"
            chief_complaint = appt.chief_complaint
            check_in_time = appt.check_in_at.isoformat() if appt.check_in_at else None

            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            if patient:
                patient_name = patient.full_name
                patient_id_str = str(patient.id)
                patient_reference_number = patient.patient_reference_number
                patient_phone = patient.phone_number
                patient_gender = patient.gender
                patient_date_of_birth = patient.date_of_birth.isoformat() if patient.date_of_birth else None
                patient_blood_group = patient.blood_group
                # Compute age from date_of_birth or stored age_years
                if patient.date_of_birth:
                    age_delta = today - patient.date_of_birth
                    patient_age = age_delta.days // 365
                elif patient.age_years is not None:
                    patient_age = patient.age_years

            if appt.doctor_id:
                doctor_id_str = str(appt.doctor_id)
                doc = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
                if doc and doc.user:
                    doctor_name = doc.user.full_name

        items.append({
            "queue_id": str(qe.id),
            "appointment_id": str(qe.appointment_id),
            "queue_number": qe.queue_number,
            "position": qe.position,
            "status": qe.status,
            "priority": priority,
            "patient_name": patient_name,
            "patient_id": patient_id_str,
            "patient_reference_number": patient_reference_number,
            "patient_phone": patient_phone,
            "patient_gender": patient_gender,
            "patient_date_of_birth": patient_date_of_birth,
            "patient_age": patient_age,
            "patient_blood_group": patient_blood_group,
            "doctor_id": doctor_id_str,
            "doctor_name": doctor_name,
            "chief_complaint": chief_complaint,
            "check_in_at": check_in_time,
            "called_at": qe.called_at.isoformat() if qe.called_at else None,
            "consultation_start_at": appt.consultation_start_at.isoformat() if appt and appt.consultation_start_at else None,
            "consultation_end_at": appt.consultation_end_at.isoformat() if appt and appt.consultation_end_at else None,
        })

    total_waiting = sum(1 for i in items if i["status"] in ("waiting", "called"))
    total_in_progress = sum(1 for i in items if i["status"] == "in_consultation")
    total_completed = sum(1 for i in items if i["status"] == "completed")

    return {
        "doctor_id": str(resolved_doctor_id) if resolved_doctor_id else None,
        "queue_date": today.isoformat(),
        "total_waiting": total_waiting,
        "total_in_progress": total_in_progress,
        "total_completed": total_completed,
        "items": items,
    }


@router.patch("/queue/{queue_id}/call")
async def call_patient(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Call the next patient — sets queue status to 'called'. Appointment stays 'scheduled'."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    _require_queue_actor(db, current_user, qe)

    if qe.status != "waiting":
        raise HTTPException(status_code=400, detail="Only 'waiting' patients can be called")

    qe.status = "called"
    qe.called_at = datetime.now(timezone.utc)

    # Appointment status stays as-is (scheduled) until consultation actually starts
    db.commit()
    return {"ok": True, "queue_id": str(qe.id), "status": "called"}


@router.patch("/queue/{queue_id}/start-consultation")
async def start_consultation(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Start consultation — moves queue from 'called' to 'in_consultation'."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    _require_queue_actor(db, current_user, qe)

    if qe.status != "called":
        raise HTTPException(status_code=400, detail="Patient must be in 'called' status to start consultation")

    qe.status = "in_consultation"

    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
    if appt:
        appt.status = "in-progress"
        appt.consultation_start_at = datetime.now(timezone.utc)

    db.commit()
    return {"ok": True, "queue_id": str(qe.id), "status": "in_consultation"}


@router.patch("/queue/{queue_id}/complete")
async def complete_patient(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Complete consultation — sets queue status to 'completed' and appointment to 'completed'."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    _require_queue_actor(db, current_user, qe)

    if qe.status not in ("called", "in_consultation"):
        raise HTTPException(status_code=400, detail="Patient must be in 'called' or 'in_consultation' status to complete")

    qe.status = "completed"

    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
    if appt:
        appt.status = "completed"
        appt.consultation_end_at = datetime.now(timezone.utc)

    db.commit()
    return {"ok": True, "queue_id": str(qe.id), "status": "completed"}


@router.patch("/queue/{queue_id}/skip")
async def skip_patient(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Skip a patient in the queue (no-show)."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    _require_queue_actor(db, current_user, qe)

    qe.status = "skipped"

    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
    if appt:
        appt.status = "no-show"

    db.commit()
    return {"ok": True, "queue_id": str(qe.id), "status": "skipped"}


@router.post("/{appointment_id}/assign-doctor")
async def assign_doctor_to_walkin(
    appointment_id: str,
    data: WalkInAssignDoctor,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Assign or re-assign a doctor to a walk-in appointment."""
    if not (_is_receptionist(current_user) or _is_admin_or_super(current_user)):
        raise HTTPException(
            status_code=403,
            detail="Only receptionists or admins can assign doctors",
        )

    appt_uuid = uuid.UUID(appointment_id)
    appt = db.query(Appointment).filter(Appointment.id == appt_uuid).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    doctor_uuid = uuid.UUID(data.doctor_id)
    doctor = db.query(Doctor).filter(Doctor.id == doctor_uuid).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    appt.doctor_id = doctor_uuid
    db.flush()

    today = date.today()
    # Remove old queue entry if reassigning
    db.query(AppointmentQueue).filter(
        AppointmentQueue.appointment_id == appt_uuid,
    ).delete()

    q_num = _next_queue_number(db, doctor_uuid, today)
    q_pos = _next_position(db, doctor_uuid, today)
    queue_entry = AppointmentQueue(
        appointment_id=appt.id,
        doctor_id=doctor_uuid,
        queue_date=today,
        queue_number=q_num,
        position=q_pos,
        status="waiting",
    )
    db.add(queue_entry)
    db.commit()
    db.refresh(appt)

    enriched = enrich_appointment(db, appt)
    enriched["queue_number"] = queue_entry.queue_number
    enriched["queue_position"] = queue_entry.position
    return enriched


@router.get("/today")
async def get_today_walkins(
    doctor_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List today's walk-in appointments."""
    today = date.today()
    query = db.query(Appointment).filter(
        Appointment.appointment_date == today,
        Appointment.appointment_type.in_(["walk-in", "walk_in"]),
        Appointment.is_deleted == False,
    )
    if doctor_id:
        doc_uuid = uuid.UUID(doctor_id)
        query = query.filter(Appointment.doctor_id == doc_uuid)

    appointments = query.order_by(Appointment.created_at.asc()).all()

    result = []
    for appt in appointments:
        enriched = enrich_appointment(db, appt)
        result.append(enriched)

    return result


@router.get("/unassigned")
async def get_unassigned_walkins(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    List today's walk-in appointments that have no doctor assigned.
    These patients were registered but not yet routed to any doctor's queue.
    """
    today = date.today()
    appointments = (
        db.query(Appointment)
        .filter(
            Appointment.appointment_date == today,
            Appointment.appointment_type.in_(["walk-in", "walk_in"]),
            Appointment.is_deleted == False,
            Appointment.doctor_id == None,
            Appointment.status.notin_(["cancelled", "no-show"]),
        )
        .order_by(Appointment.created_at.asc())
        .all()
    )

    items = []
    for appt in appointments:
        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        patient_name = patient.full_name if patient else None
        patient_reference_number = patient.patient_reference_number if patient else None
        patient_phone = patient.phone_number if patient else None
        patient_gender = patient.gender if patient else None
        patient_age = None
        if patient and patient.date_of_birth:
            patient_age = (today - patient.date_of_birth).days // 365
        elif patient and patient.age_years is not None:
            patient_age = patient.age_years

        items.append({
            "appointment_id": str(appt.id),
            "appointment_number": appt.appointment_number,
            "patient_id": str(appt.patient_id) if appt.patient_id else None,
            "patient_name": patient_name,
            "patient_reference_number": patient_reference_number,
            "patient_phone": patient_phone,
            "patient_gender": patient_gender,
            "patient_age": patient_age,
            "priority": appt.priority or "normal",
            "chief_complaint": appt.chief_complaint,
            "check_in_at": appt.check_in_at.isoformat() if appt.check_in_at else None,
            "created_at": appt.created_at.isoformat() if appt.created_at else None,
        })

    return {"count": len(items), "items": items}


@router.get("/queue/doctor-loads")
async def get_doctor_queue_loads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return today's queue load per doctor (waiting count) for the Send-to-Doctor modal."""
    today = date.today()
    loads = (
        db.query(
            AppointmentQueue.doctor_id,
            func.count(AppointmentQueue.id).label("waiting_count"),
        )
        .filter(
            AppointmentQueue.queue_date == today,
            AppointmentQueue.status.in_(["waiting", "called"]),
        )
        .group_by(AppointmentQueue.doctor_id)
        .all()
    )
    load_map = {str(row.doctor_id): row.waiting_count for row in loads}
    return load_map
