"""
Waitlist router — CRUD + promote-to-appointment for the patient waitlist.
"""
import logging
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.patient import Patient
from ..models.appointment import Doctor, Appointment, AppointmentQueue, Waitlist
from ..dependencies import get_current_active_user
from ..schemas.appointment import (
    WaitlistCreate,
    WaitlistUpdate,
    WaitlistResponse,
    PaginatedWaitlistResponse,
)
from ..services.waitlist_service import (
    add_to_waitlist,
    get_waitlist,
    get_waitlist_entry,
    update_waitlist_entry,
    cancel_waitlist_entry,
    promote_waitlist_to_appointment,
    enrich_waitlist_entry,
    check_already_on_waitlist,
    get_waitlist_count_for_doctor,
)
from ..services.appointment_service import generate_appointment_number, enrich_appointment

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/waitlist", tags=["Waitlist"])


def _user_roles(user: User) -> list:
    return user.roles if hasattr(user, "roles") and user.roles else []


def _is_admin_or_super(user: User) -> bool:
    roles = _user_roles(user)
    return "admin" in roles or "super_admin" in roles


# ── List waitlist entries ─────────────────────────────────────────────────

@router.get("", response_model=PaginatedWaitlistResponse)
async def list_waitlist(
    doctor_id: Optional[str] = Query(None),
    target_date: Optional[date] = Query(None, alias="date"),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List waitlist entries. Admin/receptionist see all; doctors see their own."""
    roles = _user_roles(current_user)

    # Doctors can only see their own waitlist
    effective_doctor_id = doctor_id
    if "doctor" in roles and not _is_admin_or_super(current_user):
        doc = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
        if not doc:
            return PaginatedWaitlistResponse(total=0, page=page, limit=limit, data=[])
        effective_doctor_id = str(doc.id)

    items, total = get_waitlist(
        db,
        hospital_id=current_user.hospital_id,
        doctor_id=effective_doctor_id,
        target_date=target_date,
        status_filter=status_filter,
        page=page,
        limit=limit,
    )

    enriched = [enrich_waitlist_entry(db, item) for item in items]
    return PaginatedWaitlistResponse(total=total, page=page, limit=limit, data=enriched)


# ── Add to waitlist ───────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_waitlist_entry(
    data: WaitlistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Manually add a patient to the waitlist."""
    try:
        # Validate patient
        try:
            patient_id = uuid.UUID(data.patient_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid patient_id")
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Validate doctor
        try:
            doctor_id = uuid.UUID(data.doctor_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid doctor_id")
        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        # Check duplicate
        if check_already_on_waitlist(db, data.patient_id, data.doctor_id, data.preferred_date):
            raise HTTPException(
                status_code=409,
                detail="Patient is already on the waitlist for this doctor on this date",
            )

        entry = add_to_waitlist(
            db,
            data=data.model_dump(),
            hospital_id=current_user.hospital_id,
            created_by=current_user.id,
        )
        db.commit()
        db.refresh(entry)

        enriched = enrich_waitlist_entry(db, entry)
        return enriched

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to add to waitlist: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to add to waitlist: {str(e)}")


# ── Get single waitlist entry ─────────────────────────────────────────────

@router.get("/{entry_id}")
async def get_single_waitlist_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a single waitlist entry by ID."""
    entry = get_waitlist_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    return enrich_waitlist_entry(db, entry)


# ── Update waitlist entry ─────────────────────────────────────────────────

@router.patch("/{entry_id}")
async def update_entry(
    entry_id: str,
    data: WaitlistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a waitlist entry (status, priority, date, etc.)."""
    entry = get_waitlist_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    updated = update_waitlist_entry(db, entry_id, data.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(updated)
    return enrich_waitlist_entry(db, updated)


# ── Cancel waitlist entry ─────────────────────────────────────────────────

@router.delete("/{entry_id}")
async def cancel_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Cancel (soft-delete) a waitlist entry."""
    entry = get_waitlist_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    if entry.status == "booked":
        raise HTTPException(status_code=400, detail="Cannot cancel a waitlist entry that is already booked")

    cancelled = cancel_waitlist_entry(db, entry_id)
    db.commit()
    return {"detail": "Waitlist entry cancelled", "id": str(cancelled.id)}


# ── Promote to appointment (book from waitlist) ──────────────────────────

@router.post("/{entry_id}/book")
async def book_from_waitlist(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Promote a waitlist entry to a real walk-in appointment + queue entry.
    This is used when a slot opens up (e.g., cancellation or new day).
    """
    try:
        entry = get_waitlist_entry(db, entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Waitlist entry not found")

        if entry.status != "waiting":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot book: entry status is '{entry.status}', expected 'waiting'",
            )

        today = date.today()
        from datetime import timezone as tz
        now = __import__("datetime").datetime.now(tz.utc)

        # Create a walk-in appointment from the waitlist entry
        appt_number = generate_appointment_number("walk_in")
        appt = Appointment(
            hospital_id=entry.hospital_id,
            appointment_number=appt_number,
            patient_id=entry.patient_id,
            doctor_id=entry.doctor_id,
            department_id=entry.department_id,
            appointment_date=today,
            start_time=None,
            end_time=None,
            appointment_type="walk-in",
            visit_type="new",
            priority=entry.priority or "normal",
            status="scheduled",
            chief_complaint=entry.chief_complaint,
            check_in_at=now,
            created_by=current_user.id,
            notes=f"Promoted from waitlist (#{entry.position})",
        )
        db.add(appt)
        db.flush()

        # Add to queue
        from sqlalchemy import func as sqlfunc
        max_num = (
            db.query(sqlfunc.max(AppointmentQueue.queue_number))
            .filter(
                AppointmentQueue.doctor_id == entry.doctor_id,
                AppointmentQueue.queue_date == today,
            )
            .scalar()
        )
        q_num = (max_num or 0) + 1

        waiting_count = (
            db.query(sqlfunc.count(AppointmentQueue.id))
            .filter(
                AppointmentQueue.doctor_id == entry.doctor_id,
                AppointmentQueue.queue_date == today,
                AppointmentQueue.status.in_(["waiting", "called"]),
            )
            .scalar()
        )
        q_pos = (waiting_count or 0) + 1

        queue_entry = AppointmentQueue(
            appointment_id=appt.id,
            doctor_id=entry.doctor_id,
            queue_date=today,
            queue_number=q_num,
            position=q_pos,
            status="waiting",
        )
        db.add(queue_entry)
        db.flush()

        # Mark waitlist entry as booked
        promote_waitlist_to_appointment(db, entry_id, appt.id)

        db.commit()
        db.refresh(appt)

        enriched = enrich_appointment(db, appt)
        enriched["queue_number"] = queue_entry.queue_number
        enriched["queue_position"] = queue_entry.position
        enriched["waitlist_id"] = str(entry.id)
        return enriched

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to book from waitlist: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to book from waitlist: {str(e)}")


# ── Waitlist stats ────────────────────────────────────────────────────────

@router.get("/stats/summary")
async def waitlist_stats(
    doctor_id: Optional[str] = Query(None),
    target_date: Optional[date] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get waitlist summary stats."""
    from sqlalchemy import func as sqlfunc

    q = db.query(Waitlist).filter(
        Waitlist.hospital_id == current_user.hospital_id,
        Waitlist.is_deleted == False,
    )

    if doctor_id:
        q = q.filter(Waitlist.doctor_id == uuid.UUID(doctor_id))

    if target_date:
        q = q.filter(Waitlist.preferred_date == target_date)
    else:
        q = q.filter(Waitlist.preferred_date >= date.today())

    total_waiting = q.filter(Waitlist.status == "waiting").count()
    total_booked = q.filter(Waitlist.status == "booked").count()
    total_cancelled = q.filter(Waitlist.status == "cancelled").count()
    total_expired = q.filter(Waitlist.status == "expired").count()

    return {
        "total_waiting": total_waiting,
        "total_booked": total_booked,
        "total_cancelled": total_cancelled,
        "total_expired": total_expired,
        "total": total_waiting + total_booked + total_cancelled + total_expired,
    }
