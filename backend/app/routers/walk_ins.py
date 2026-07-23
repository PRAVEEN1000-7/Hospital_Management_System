"""
Walk-in registration router - handles walk-in patient flow.
"""
import logging
import uuid
from datetime import date, datetime, time, timedelta, timezone
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
from pydantic import BaseModel
from ..services.appointment_service import (
    generate_appointment_number,
    enrich_appointment,
    resolve_new_appointment_fee,
)
from ..services.schedule_service import get_available_slots, is_doctor_on_leave
from ..services.waitlist_service import (
    add_to_waitlist,
    enrich_waitlist_entry,
    check_already_on_waitlist,
)
from ..services.notification_service import notify_hospital_users
from ..core.hospital_time import hospital_today
from ..core.audit_logger import AuditLogger, AuditAction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/walk-ins", tags=["Walk-in Registration"])


class ConsultationNotesPayload(BaseModel):
    """Payload for saving consultation notes."""
    notes: Optional[str] = None
    diagnosis: Optional[str] = None
    prescription: Optional[str] = None
    vitals_bp: Optional[str] = None
    vitals_pulse: Optional[str] = None
    vitals_temp: Optional[str] = None
    vitals_weight: Optional[str] = None
    vitals_spo2: Optional[str] = None
    follow_up_date: Optional[str] = None


class ReferralPayload(BaseModel):
    """Payload for referring a patient to another doctor."""
    queue_id: str
    to_doctor_id: str
    referral_date: str  # YYYY-MM-DD
    referral_reason: Optional[str] = None


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
    """Raise unless the user is the assigned doctor or an admin OF THE SAME HOSPITAL.

    AppointmentQueue has no hospital_id column, so tenant isolation is enforced via
    the queue entry's doctor. Without this, a hospital admin could act on another
    hospital's queue entries by id.
    """
    # Tenant isolation for hospital-scoped users (admins + doctors). Platform
    # super admins have no hospital_id and are not constrained here.
    if getattr(user, "hospital_id", None):
        doctor = db.query(Doctor).filter(Doctor.id == qe.doctor_id).first()
        if not doctor or str(doctor.hospital_id) != str(user.hospital_id):
            raise HTTPException(status_code=404, detail="Queue entry not found")
    if _is_admin_or_super(user):
        return
    if _is_assigned_doctor(db, user, qe):
        return
    raise HTTPException(
        status_code=403,
        detail="Only the assigned doctor or an admin can perform this action",
    )


def _next_position(db: Session, doctor_id: uuid.UUID, queue_date: date) -> int:
    """Get next position in queue."""
    waiting = (
        db.query(func.count(AppointmentQueue.id))
        .filter(
            AppointmentQueue.doctor_id == doctor_id,
            AppointmentQueue.queue_date == queue_date,
            AppointmentQueue.status.in_(["waiting", "called", "sent_to_doctor"]),
        )
        .scalar()
    )
    return (waiting or 0) + 1

def _ensure_today_queue_action(qe: "AppointmentQueue", hospital_timezone: Optional[str] = None) -> None:
    if qe.queue_date != hospital_today(hospital_timezone):
        raise HTTPException(
            status_code=400,
            detail="Queue actions are allowed only for today's queue.",
        )

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
        today = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
        now = datetime.now(timezone.utc)

        # Validate patient exists
        try:
            patient_id = uuid.UUID(data.patient_id)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid patient_id format: {data.patient_id!r}",
            )
        patient = db.query(Patient).filter(
            Patient.id == patient_id,
            Patient.hospital_id == current_user.hospital_id,
        ).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Resolve doctor (required for walk-in registration)
        doctor_id = None
        raw_doctor = data.doctor_id
        if not raw_doctor or not raw_doctor.strip() or raw_doctor.strip().lower() == "undefined":
            raise HTTPException(status_code=400, detail="Doctor selection is required")

        try:
            doctor_id = uuid.UUID(raw_doctor.strip())
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid doctor_id format: {raw_doctor!r}",
            )
        doctor = db.query(Doctor).filter(
            Doctor.id == doctor_id,
            Doctor.hospital_id == current_user.hospital_id,
        ).first()
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        # ── Check if doctor is on leave ──
        if is_doctor_on_leave(db, doctor_id, today):
            raise HTTPException(
                status_code=400,
                detail="Doctor is on leave today and cannot accept walk-ins",
            )

        # ── Check doctor has a schedule for today ──
        slots = get_available_slots(db, doctor_id, today)
        if not slots:
            raise HTTPException(
                status_code=400,
                detail="This doctor has no schedule configured for today. Walk-in booking is not possible.",
            )

        # ── Check if ALL slots are full → auto-waitlist ──
        has_available = any(s["available"] for s in slots)
        if not has_available:
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
            start_time=now.astimezone().time().replace(second=0, microsecond=0),
            end_time=None,
            appointment_type="walk-in",
            visit_type="new",
            priority=data.priority or "normal",
            status="scheduled",
            chief_complaint=data.chief_complaint,
            consultation_fee=resolve_new_appointment_fee(doctor, data.consultation_fee),
            check_in_at=now,
            created_by=current_user.id,
            is_specialist_assignment=bool(data.is_specialist_assignment),
        )
        db.add(appt)
        db.flush()

        # Add to queue if doctor assigned
        queue_entry = None
        if doctor_id:
            from ..services.billing_queue_service import get_or_assign_visit_token

            q_num = get_or_assign_visit_token(db, current_user.hospital_id, appointment_id=appt.id)
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

        # OPD assignment audit trail (BRD_OP_1 §4 Auditability) — this was
        # the first data-mutation call in this router to use AuditLogger.
        AuditLogger.log(
            action=AuditAction.OPD_ASSIGNMENT,
            user=current_user,
            tenant=None,
            resource_type="appointment",
            resource_id=appt.id,
            new_values={
                "patient_id": str(patient_id),
                "doctor_id": str(doctor_id),
                "queue_number": queue_entry.queue_number if queue_entry else None,
            },
        )

        # Notify the assigned doctor a patient has been added to their queue
        # (Bug #41 — this was the main "OPD Assignment" flow that never told
        # the doctor anything at all, unlike reassignment via assign-doctor).
        if doctor_id and queue_entry:
            try:
                patient = db.query(Patient).filter(Patient.id == patient_id).first()
                patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "a patient"
                notify_hospital_users(
                    db=db,
                    hospital_id=current_user.hospital_id,
                    title="Patient Assigned to You",
                    message=f"{patient_name} has been assigned to your queue (Token #{queue_entry.queue_number}).",
                    notification_type="appointment",
                    priority="high",
                    reference_type="appointment",
                    reference_id=appt.id,
                    extra_user_ids=[doctor.user_id],
                )
            except Exception:
                logger.warning("Failed to send walk-in assignment notification", exc_info=True)

        enriched = enrich_appointment(db, appt)
        enriched["queue_number"] = queue_entry.queue_number if queue_entry else None
        enriched["queue_position"] = queue_entry.position if queue_entry else None
        return enriched

    except HTTPException:
        raise
    except Exception as e:
        # Log the full internals (SQL, params) server-side for debugging, but
        # never echo them to the client — a raw psycopg2/SQLAlchemy message
        # (table/column names, constraint names, query text) is an internal
        # detail leak, not something a receptionist can act on.
        logger.exception(f"Walk-in registration failed: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Walk-in registration failed. Please try again.",
        )


@router.get("/queue")
async def get_queue_status(
    doctor_id: Optional[str] = Query(None),
    queue_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format. Defaults to today."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get the walk-in queue for a specific date.
    - Receptionist / admin: sees all doctors, can filter by doctor_id.
    - Doctor: auto-filtered to their own queue.
    Display order: urgency priority (emergency > urgent > normal), then queue_number.
    Queue number remains the original sequential token number.
    """
    # Parse queue_date or default to today
    hospital_tz = current_user.hospital.timezone if current_user.hospital else None
    target_date = hospital_today(hospital_tz)
    if queue_date:
        try:
            target_date = datetime.strptime(queue_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid queue_date format. Use YYYY-MM-DD")

    today = hospital_today(hospital_tz)

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

    # Query queue entries for the target date
    query = (
        db.query(AppointmentQueue)
        .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
        .filter(
            AppointmentQueue.queue_date == target_date,
            Appointment.appointment_date == target_date,
        )
    )
    # Tenant isolation: without this, omitting doctor_id (e.g. the receptionist
    # "all doctors" view, or any caller that doesn't pass one) returned every
    # hospital's walk-in queue mixed together — AppointmentQueue has no
    # hospital_id column of its own, so it must be scoped via Appointment.
    # Platform super admins (no hospital_id) intentionally see everything.
    if getattr(current_user, "hospital_id", None):
        query = query.filter(Appointment.hospital_id == current_user.hospital_id)
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
        is_specialist_assignment = False

        patient_id_str = None
        patient_reference_number = None
        patient_phone = None
        patient_gender = None
        patient_date_of_birth = None
        patient_age = None
        patient_blood_group = None
        patient_email = None
        patient_known_allergies = None
        patient_chronic_conditions = None
        patient_is_email_verified = False
        patient_is_phone_verified = False
        patient_emergency_contact_name = None
        patient_emergency_contact_phone = None
        patient_emergency_contact_relation = None

        if appt:
            priority = appt.priority or "normal"
            chief_complaint = appt.chief_complaint
            check_in_time = appt.check_in_at.isoformat() if appt.check_in_at else None
            is_specialist_assignment = bool(appt.is_specialist_assignment)

            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            if patient:
                patient_name = patient.full_name
                patient_id_str = str(patient.id)
                patient_reference_number = patient.patient_reference_number
                patient_phone = patient.phone_number
                patient_gender = patient.gender
                patient_date_of_birth = patient.date_of_birth.isoformat() if patient.date_of_birth else None
                patient_blood_group = patient.blood_group
                patient_email = patient.email
                patient_known_allergies = patient.known_allergies
                patient_chronic_conditions = patient.chronic_conditions
                patient_is_email_verified = bool(patient.is_email_verified)
                patient_is_phone_verified = bool(patient.is_phone_verified)
                patient_emergency_contact_name = patient.emergency_contact_name
                patient_emergency_contact_phone = patient.emergency_contact_phone
                patient_emergency_contact_relation = patient.emergency_contact_relation
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
                    doctor_name = f"Dr. {doc.user.full_name}"

        # Resolve referring doctor name if this is a referral — mirrors the
        # same lookup in get_upcoming_queue, but was missing here, so a
        # referred-in patient showed no indication of who referred them (or
        # why — see `notes`) in the doctor's actual TODAY queue.
        appointment_type = appt.appointment_type if appt else None
        referring_doctor_name = None
        referral_notes = None
        if appt and appt.parent_appointment_id:
            parent = db.query(Appointment).filter(Appointment.id == appt.parent_appointment_id).first()
            if parent and parent.doctor_id:
                ref_doc = db.query(Doctor).filter(Doctor.id == parent.doctor_id).first()
                if ref_doc and ref_doc.user:
                    referring_doctor_name = f"Dr. {ref_doc.user.full_name}"
            referral_notes = appt.notes

        items.append({
            "queue_id": str(qe.id),
            "appointment_id": str(qe.appointment_id),
            "queue_number": qe.queue_number,
            "position": qe.position,
            "status": qe.status,
            "appointment_type": appointment_type,
            "referring_doctor_name": referring_doctor_name,
            "referral_notes": referral_notes,
            "priority": priority,
            "patient_name": patient_name,
            "patient_id": patient_id_str,
            "patient_reference_number": patient_reference_number,
            "patient_phone": patient_phone,
            "patient_gender": patient_gender,
            "patient_date_of_birth": patient_date_of_birth,
            "patient_age": patient_age,
            "patient_blood_group": patient_blood_group,
            "patient_email": patient_email,
            "patient_known_allergies": patient_known_allergies,
            "patient_chronic_conditions": patient_chronic_conditions,
            "is_email_verified": patient_is_email_verified,
            "is_phone_verified": patient_is_phone_verified,
            "patient_emergency_contact_name": patient_emergency_contact_name,
            "patient_emergency_contact_phone": patient_emergency_contact_phone,
            "patient_emergency_contact_relation": patient_emergency_contact_relation,
            "doctor_id": doctor_id_str,
            "doctor_name": doctor_name,
            "is_specialist_assignment": is_specialist_assignment,
            "chief_complaint": chief_complaint,
            # Booked slot time for pre-booked/scheduled visits — the queue detail
            # panel had no way to show what time the appointment was booked for.
            "start_time": str(appt.start_time) if appt and appt.start_time else None,
            "check_in_at": check_in_time,
            "called_at": qe.called_at.isoformat() if qe.called_at else None,
            "consultation_start_at": appt.consultation_start_at.isoformat() if appt and appt.consultation_start_at else None,
            "consultation_end_at": appt.consultation_end_at.isoformat() if appt and appt.consultation_end_at else None,
        })

    total_waiting = sum(1 for i in items if i["status"] in ("waiting", "called", "sent_to_doctor"))
    total_in_progress = sum(1 for i in items if i["status"] == "in_consultation")
    total_completed = sum(1 for i in items if i["status"] == "completed")

    return {
        "doctor_id": str(resolved_doctor_id) if resolved_doctor_id else None,
        "queue_date": target_date.isoformat(),
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
    _ensure_today_queue_action(qe, current_user.hospital.timezone if current_user.hospital else None)

    qe.status = "called"
    qe.called_at = datetime.now(timezone.utc)

    # Appointment status stays as-is (scheduled) until consultation actually starts
    db.commit()
    return {"ok": True, "queue_id": str(qe.id), "status": "called"}


@router.patch("/queue/{queue_id}/send-to-doctor")
async def send_to_doctor_queue(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Receptionist confirms sending a patient to the doctor.
    Changes queue status from 'waiting' or 'called' to 'sent_to_doctor'.
    Only then will the patient appear in the doctor's NEXT UP section.
    """
    if not (_is_receptionist(current_user) or _is_admin_or_super(current_user)):
        raise HTTPException(
            status_code=403,
            detail="Only receptionists or admins can send patients to doctor",
        )

    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    if qe.status not in ("waiting", "called"):
        raise HTTPException(
            status_code=400,
            detail="Only 'waiting' or 'called' patients can be sent to doctor",
        )
    _ensure_today_queue_action(qe, current_user.hospital.timezone if current_user.hospital else None)

    qe.status = "sent_to_doctor"
    db.commit()
    return {"ok": True, "queue_id": str(qe.id), "status": "sent_to_doctor"}


@router.patch("/queue/{queue_id}/start-consultation")
async def start_consultation(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Start consultation — moves queue from 'waiting'/'called' to 'in_consultation'."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    _require_queue_actor(db, current_user, qe)

    if qe.status not in ("waiting", "called", "sent_to_doctor"):
        raise HTTPException(status_code=400, detail="Patient must be in 'waiting', 'called', or 'sent_to_doctor' status to start consultation")
    _ensure_today_queue_action(qe, current_user.hospital.timezone if current_user.hospital else None)

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
    _ensure_today_queue_action(qe, current_user.hospital.timezone if current_user.hospital else None)

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
    _ensure_today_queue_action(qe, current_user.hospital.timezone if current_user.hospital else None)

    qe.status = "skipped"

    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
    if appt:
        appt.status = "no-show"

    db.commit()
    return {"ok": True, "queue_id": str(qe.id), "status": "skipped"}


@router.patch("/queue/{queue_id}/save-notes")
async def save_consultation_notes(
    queue_id: str,
    payload: ConsultationNotesPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Save consultation notes, vitals, diagnosis, and prescription for a queue entry."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    _require_queue_actor(db, current_user, qe)

    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    # Build structured notes as JSON-like text stored in the notes column
    import json
    existing_notes = {}
    if appt.notes:
        try:
            existing_notes = json.loads(appt.notes)
        except (json.JSONDecodeError, TypeError):
            existing_notes = {"_legacy": appt.notes}

    if payload.notes is not None:
        existing_notes["clinical_notes"] = payload.notes
    if payload.diagnosis is not None:
        existing_notes["diagnosis"] = payload.diagnosis
    if payload.prescription is not None:
        existing_notes["prescription"] = payload.prescription
    if payload.follow_up_date is not None:
        existing_notes["follow_up_date"] = payload.follow_up_date

    # Vitals
    vitals = existing_notes.get("vitals", {})
    if payload.vitals_bp is not None:
        vitals["bp"] = payload.vitals_bp
    if payload.vitals_pulse is not None:
        vitals["pulse"] = payload.vitals_pulse
    if payload.vitals_temp is not None:
        vitals["temp"] = payload.vitals_temp
    if payload.vitals_weight is not None:
        vitals["weight"] = payload.vitals_weight
    if payload.vitals_spo2 is not None:
        vitals["spo2"] = payload.vitals_spo2
    if vitals:
        existing_notes["vitals"] = vitals

    appt.notes = json.dumps(existing_notes)
    db.commit()

    return {"ok": True, "queue_id": str(qe.id), "notes_saved": True}


@router.get("/queue/{queue_id}/notes")
async def get_consultation_notes(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Retrieve consultation notes for a queue entry."""
    try:
        q_uuid = uuid.UUID(queue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid queue_id")

    qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
    if not qe:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    # Without this, any authenticated user (any hospital) could read another
    # hospital's clinical notes/diagnosis/vitals by guessing a queue_id —
    # the PATCH save-notes endpoint above already enforces this.
    _require_queue_actor(db, current_user, qe)

    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    import json
    notes_data = {}
    if appt.notes:
        try:
            notes_data = json.loads(appt.notes)
        except (json.JSONDecodeError, TypeError):
            notes_data = {"clinical_notes": appt.notes}

    return {"queue_id": str(qe.id), "appointment_id": str(appt.id), **notes_data}


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
    # Without this, a receptionist/admin in Hospital A could reassign Hospital
    # B's appointment to one of Hospital A's doctors by guessing an
    # appointment_id (cross-tenant IDOR + data corruption).
    if getattr(current_user, "hospital_id", None) and str(appt.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Appointment not found")

    doctor_uuid = uuid.UUID(data.doctor_id)
    doctor = db.query(Doctor).filter(Doctor.id == doctor_uuid).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if getattr(current_user, "hospital_id", None) and str(doctor.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Doctor not found")

    # Specialist Assignment lock — this patient was registered as
    # consult-this-doctor-only, so reassigning to anyone else is rejected.
    if appt.is_specialist_assignment and appt.doctor_id and appt.doctor_id != doctor_uuid:
        raise HTTPException(
            status_code=400,
            detail="This patient is locked to a specific doctor (Specialist Assignment) and cannot be reassigned to a different doctor.",
        )

    appt.doctor_id = doctor_uuid
    db.flush()

    # Remove old queue entry if reassigning
    db.query(AppointmentQueue).filter(
        AppointmentQueue.appointment_id == appt_uuid,
    ).delete()

    from ..services.billing_queue_service import get_or_assign_visit_token

    # Reuses appt's existing visit_token (set when the walk-in was first
    # registered) rather than minting a new one — reassigning to a
    # different doctor must not change the patient's token.
    q_num = get_or_assign_visit_token(db, appt.hospital_id, appointment_id=appt.id)
    # Queue by the appointment's own date, not "today" — a future-dated
    # follow-up/referral assigned through this endpoint must not show up in
    # today's waiting count (see get_doctor_queue_loads below, and the
    # already-correct pattern in refer_patient_to_doctor's queue_date=referral_date).
    q_pos = _next_position(db, doctor_uuid, appt.appointment_date)
    queue_entry = AppointmentQueue(
        appointment_id=appt.id,
        doctor_id=doctor_uuid,
        queue_date=appt.appointment_date,
        queue_number=q_num,
        position=q_pos,
        status="waiting",
    )
    db.add(queue_entry)
    db.commit()
    db.refresh(appt)

    # Notify the assigned doctor that a patient has been assigned to them.
    try:
        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "a patient"
        notify_hospital_users(
            db=db,
            hospital_id=appt.hospital_id,
            title="Patient Assigned to You",
            message=f"{patient_name} has been assigned to your queue (Token #{queue_entry.queue_number}).",
            notification_type="appointment",
            priority="high",
            reference_type="appointment",
            reference_id=appt.id,
            extra_user_ids=[doctor.user_id],
        )
    except Exception:
        logger.warning("Failed to send doctor assignment notification", exc_info=True)

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
    today = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
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
    today = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
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
    target_date: Optional[str] = Query(None, alias="date", description="Date in YYYY-MM-DD. Defaults to today."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return queue load per doctor (count of patients still WAITING, not yet
    seen) for the Send-to-Doctor / referral modal — lets a receptionist see
    which doctor is free before assigning a new patient."""
    load_date = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
    if target_date:
        try:
            load_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    loads_query = (
        db.query(
            AppointmentQueue.doctor_id,
            func.count(AppointmentQueue.id).label("patient_count"),
        )
        .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
        .filter(
            AppointmentQueue.queue_date == load_date,
            # A queue row's own date can still drift from the appointment it
            # belongs to for older data — matching /walk-ins/queue's stricter
            # pattern here too so a future-dated follow-up is never counted
            # as part of today's waiting load (Bug #42).
            Appointment.appointment_date == load_date,
            # "Waiting" means not yet seen — matches the same status set used
            # for total_waiting in GET /walk-ins/today below. Previously this
            # only excluded "skipped", so patients already in consultation or
            # fully "completed" still inflated the badge (Bug: waiting count
            # includes completed patients).
            AppointmentQueue.status.in_(["waiting", "called", "sent_to_doctor"]),
        )
    )
    # Without this, doctor workload counts were computed across every
    # hospital on the platform, not just the caller's own.
    if getattr(current_user, "hospital_id", None):
        loads_query = loads_query.filter(Appointment.hospital_id == current_user.hospital_id)
    loads = loads_query.group_by(AppointmentQueue.doctor_id).all()
    load_map = {str(row.doctor_id): row.patient_count for row in loads}
    return load_map


@router.get("/queue/upcoming")
async def get_upcoming_queue(
    days: int = Query(7, ge=1, le=30, description="Number of days ahead to look"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get upcoming queue entries for the logged-in doctor, grouped by date.
    Returns the next N days (excluding today) with patient details.
    """
    # Resolve doctor
    is_doctor_role = "doctor" in _user_roles(current_user)
    resolved_doctor_id: Optional[uuid.UUID] = None
    if is_doctor_role:
        doc = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
        if doc:
            resolved_doctor_id = doc.id

    today = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
    end_date = today + timedelta(days=days)

    query = (
        db.query(AppointmentQueue)
        .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
        .filter(
            AppointmentQueue.queue_date > today,
            AppointmentQueue.queue_date <= end_date,
            AppointmentQueue.status.notin_(["completed", "skipped"]),
        )
    )
    # Same tenant-isolation gap as GET /walk-ins/queue: without this, a
    # receptionist/admin viewing "all doctors" (no resolved_doctor_id) saw
    # every hospital's upcoming appointments mixed together.
    if getattr(current_user, "hospital_id", None):
        query = query.filter(Appointment.hospital_id == current_user.hospital_id)
    if resolved_doctor_id:
        query = query.filter(AppointmentQueue.doctor_id == resolved_doctor_id)

    queue_entries = query.order_by(
        AppointmentQueue.queue_date.asc(),
        AppointmentQueue.queue_number.asc(),
    ).all()

    # Group by date and enrich with patient/appointment info
    from collections import defaultdict
    grouped: dict = defaultdict(list)

    for qe in queue_entries:
        appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
        if not appt:
            continue

        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        patient_age = None
        if patient and patient.date_of_birth:
            patient_age = (today - patient.date_of_birth).days // 365
        elif patient and patient.age_years is not None:
            patient_age = patient.age_years

        # Resolve referring doctor name if this is a referral
        referring_doctor_name = None
        if appt.parent_appointment_id:
            parent = db.query(Appointment).filter(Appointment.id == appt.parent_appointment_id).first()
            if parent and parent.doctor_id:
                ref_doc = db.query(Doctor).filter(Doctor.id == parent.doctor_id).first()
                if ref_doc and ref_doc.user:
                    referring_doctor_name = f"Dr. {ref_doc.user.full_name}"

        doctor_name = None
        if appt.doctor_id:
            doc = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
            if doc and doc.user:
                doctor_name = f"Dr. {doc.user.full_name}"

        date_key = qe.queue_date.isoformat()
        grouped[date_key].append({
            "queue_id": str(qe.id),
            "appointment_id": str(qe.appointment_id),
            "queue_number": qe.queue_number,
            "status": qe.status,
            "appointment_type": appt.appointment_type,
            "start_time": str(appt.start_time) if appt.start_time else None,
            "priority": appt.priority or "normal",
            "patient_name": patient.full_name if patient else None,
            "patient_id": str(patient.id) if patient else None,
            "patient_reference_number": patient.patient_reference_number if patient else None,
            "patient_gender": patient.gender if patient else None,
            "patient_age": patient_age,
            "chief_complaint": appt.chief_complaint,
            "doctor_id": str(appt.doctor_id) if appt.doctor_id else None,
            "doctor_name": doctor_name,
            "referring_doctor_name": referring_doctor_name,
        })

    # Build sorted list of date groups
    date_groups = []
    for d in sorted(grouped.keys()):
        date_groups.append({
            "date": d,
            "count": len(grouped[d]),
            "items": grouped[d],
        })

    return {
        "doctor_id": str(resolved_doctor_id) if resolved_doctor_id else None,
        "days": days,
        "date_groups": date_groups,
        "total_upcoming": sum(len(g["items"]) for g in date_groups),
    }


@router.post("/refer", status_code=status.HTTP_201_CREATED)
async def refer_patient_to_doctor(
    data: ReferralPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Refer a patient to another doctor/specialist.
    Creates a new 'referral' appointment and adds to the target doctor's queue
    for the specified date.
    """
    try:
        # ── Validate queue entry ──
        try:
            q_uuid = uuid.UUID(data.queue_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid queue_id")

        qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == q_uuid).first()
        if not qe:
            raise HTTPException(status_code=404, detail="Queue entry not found")

        # Only the assigned doctor (or admin) can refer
        _require_queue_actor(db, current_user, qe)

        original_appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
        if not original_appt:
            raise HTTPException(status_code=404, detail="Original appointment not found")

        # Specialist Assignment lock — this patient was registered as
        # consult-this-doctor-only, so referring them onward is rejected.
        if original_appt.is_specialist_assignment:
            raise HTTPException(
                status_code=400,
                detail="This patient is locked to a specific doctor (Specialist Assignment) and cannot be referred to another doctor.",
            )

        # ── Validate target doctor ──
        try:
            to_doctor_uuid = uuid.UUID(data.to_doctor_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_doctor_id")

        to_doctor = db.query(Doctor).filter(Doctor.id == to_doctor_uuid).first()
        if not to_doctor:
            raise HTTPException(status_code=404, detail="Target doctor not found")
        # Without this, a referral could target a doctor from a different
        # hospital — the resulting Appointment.hospital_id (the referring
        # hospital) would then disagree with the assigned doctor's actual
        # hospital, and that doctor's queue would show a cross-tenant patient.
        if str(to_doctor.hospital_id) != str(original_appt.hospital_id):
            raise HTTPException(status_code=404, detail="Target doctor not found")

        # Prevent self-referral
        if qe.doctor_id == to_doctor_uuid:
            raise HTTPException(
                status_code=400,
                detail="Cannot refer patient to the same doctor",
            )

        # ── Validate referral date ──
        try:
            referral_date = datetime.strptime(data.referral_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        today = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
        if referral_date < today:
            raise HTTPException(status_code=400, detail="Referral date cannot be in the past")

        # Check if target doctor is on leave on the referral date
        if is_doctor_on_leave(db, to_doctor_uuid, referral_date):
            raise HTTPException(
                status_code=400,
                detail="Target doctor is on leave on the selected date",
            )

        # Ensure the target doctor has at least one available slot on that date.
        # If full (or no active schedule), referral should not be confirmed so the
        # referring doctor can select another date.
        slots = get_available_slots(db, to_doctor_uuid, referral_date)
        has_available_slot = any(slot.get("available") for slot in slots) if slots else False
        if not has_available_slot:
            raise HTTPException(
                status_code=400,
                detail="No slot available for the selected doctor on this date. Please choose another date.",
            )

        # ── Check duplicate: patient not already in target doctor's queue for that date ──
        existing_queue = (
            db.query(AppointmentQueue)
            .join(Appointment, Appointment.id == AppointmentQueue.appointment_id)
            .filter(
                AppointmentQueue.doctor_id == to_doctor_uuid,
                AppointmentQueue.queue_date == referral_date,
                AppointmentQueue.status.notin_(["completed", "skipped"]),
                Appointment.patient_id == original_appt.patient_id,
            )
            .first()
        )
        if existing_queue:
            raise HTTPException(
                status_code=409,
                detail="Patient is already in the target doctor's queue for this date",
            )

        now = datetime.now(timezone.utc)

        # The referring doctor is whoever the patient's queue was actually
        # under (qe.doctor_id) — not necessarily current_user, since an admin
        # can also submit a referral on a doctor's behalf. Resolving it here
        # (rather than leaving the note as the literal, unfilled placeholder
        # "Referral from Dr. queue") is what actually lets Doctor B see who
        # referred the patient and why.
        referring_doctor = db.query(Doctor).filter(Doctor.id == qe.doctor_id).first()
        referring_doctor_name = (
            f"Dr. {referring_doctor.user.full_name}"
            if referring_doctor and referring_doctor.user else "the referring doctor"
        )
        reason_text = (data.referral_reason or "").strip() or "Specialist consultation"

        # ── Create referral appointment ──
        appt_number = generate_appointment_number("referral")
        referral_appt = Appointment(
            hospital_id=original_appt.hospital_id,
            appointment_number=appt_number,
            patient_id=original_appt.patient_id,
            doctor_id=to_doctor_uuid,
            appointment_date=referral_date,
            start_time=time(9, 0),
            end_time=time(9, 15),
            appointment_type="referral",
            visit_type="referral",
            priority=original_appt.priority or "normal",
            status="scheduled",
            chief_complaint=original_appt.chief_complaint,
            consultation_fee=to_doctor.consultation_fee,
            parent_appointment_id=original_appt.id,
            # Previously this was dropped to NULL entirely whenever the
            # referring doctor left the reason blank (the ternary's inner
            # "or" fallback was unreachable dead code) — Doctor B's screen
            # would then have nothing to show at all for that referral.
            notes=f"Referred by {referring_doctor_name}. Reason: {reason_text}",
            check_in_at=now if referral_date == today else None,
            created_by=current_user.id,
        )
        db.add(referral_appt)
        db.flush()

        from ..services.billing_queue_service import get_or_assign_visit_token

        # Inherit the original appointment's visit token so the patient keeps
        # the same number with the new doctor instead of getting a fresh one.
        if original_appt.visit_token:
            referral_appt.visit_token = original_appt.visit_token

        # ── Add to target doctor's queue for the referral date ──
        q_num = get_or_assign_visit_token(db, original_appt.hospital_id, appointment_id=referral_appt.id)
        q_pos = _next_position(db, to_doctor_uuid, referral_date)
        new_queue = AppointmentQueue(
            appointment_id=referral_appt.id,
            doctor_id=to_doctor_uuid,
            queue_date=referral_date,
            queue_number=q_num,
            position=q_pos,
            status="waiting",
        )
        db.add(new_queue)

        # ── Mark current consultation as completed ──
        if qe.status == "in_consultation":
            qe.status = "completed"
            original_appt.status = "completed"
            original_appt.consultation_end_at = now

        db.commit()
        db.refresh(referral_appt)

        # Build response
        to_doctor_name = f"Dr. {to_doctor.user.full_name}" if to_doctor.user else "Doctor"
        patient = db.query(Patient).filter(Patient.id == original_appt.patient_id).first()

        # Notify the receiving doctor — referrals never told them a patient
        # was on the way (Bug #41).
        try:
            notify_hospital_users(
                db=db,
                hospital_id=original_appt.hospital_id,
                title="New Patient Referral",
                message=f"{patient.full_name if patient else 'A patient'} was referred to you for {referral_date.isoformat()} (Token #{new_queue.queue_number}).",
                notification_type="appointment",
                priority="high",
                reference_type="appointment",
                reference_id=referral_appt.id,
                extra_user_ids=[to_doctor.user_id],
            )
        except Exception:
            logger.warning("Failed to send referral notification", exc_info=True)

        return {
            "ok": True,
            "referral_appointment_id": str(referral_appt.id),
            "referral_appointment_number": referral_appt.appointment_number,
            "to_doctor_name": to_doctor_name,
            "to_doctor_specialization": to_doctor.specialization,
            "referral_date": referral_date.isoformat(),
            "queue_number": new_queue.queue_number,
            "queue_position": new_queue.position,
            "patient_name": patient.full_name if patient else None,
            "message": f"Patient referred to {to_doctor_name} for {referral_date.isoformat()} (Token #{new_queue.queue_number})",
        }

    except HTTPException:
        raise
    except Exception as e:
        # Same reasoning as register_walk_in above — log internals, never echo them.
        logger.exception(f"Referral failed: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Referral failed. Please try again.",
        )
