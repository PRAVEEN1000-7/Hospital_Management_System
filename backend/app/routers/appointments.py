"""
Appointments router â€“ CRUD, reschedule, cancel, status updates.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, datetime

from ..database import get_db
from ..models.user import User
from ..models.appointment import Doctor
from ..dependencies import get_current_active_user
from ..schemas.appointment import (
    AppointmentCreate,
    AppointmentUpdate,
    AppointmentResponse,
    AppointmentListItem,
    PaginatedAppointmentResponse,
    AppointmentStatusUpdate,
    AppointmentReschedule,
    FollowUpCreate,
    ReferralCreate,
    DoctorLeaveWithWaitlist,
    WaitlistCreate,
)
from ..services.appointment_service import (
    create_appointment,
    get_appointment,
    list_appointments,
    update_appointment,
    update_status,
    cancel_appointment,
    reschedule_appointment,
    check_double_booking,
    enrich_appointment,
    enrich_appointments,
)
from ..services.schedule_service import is_doctor_on_leave, get_available_slots

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/appointments", tags=["Appointments"])


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    data: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Book a new scheduled appointment."""
    try:
        # Validate: date not blocked
        if data.doctor_id and is_doctor_on_leave(db, data.doctor_id, data.appointment_date):
            raise HTTPException(status_code=400, detail="Doctor is not available on this date")

        # Validate: slot available (for scheduled appointments)
        if data.appointment_type == "scheduled" and data.doctor_id and data.start_time:
            if check_double_booking(db, data.doctor_id, data.appointment_date, data.start_time):
                # Check max_patients_per_slot via available slots
                slots = get_available_slots(db, data.doctor_id, data.appointment_date)
                time_key = data.start_time.strftime("%H:%M")
                # slots[]["time"] is already a string ("HH:MM") from get_available_slots
                slot = next((s for s in slots if s["time"] == time_key), None)
                if not slot or not slot["available"]:
                    raise HTTPException(status_code=400, detail="Selected time slot is fully booked")

        appt = create_appointment(db, data.model_dump(), current_user.id, current_user.hospital_id)
        logger.info("Appointment booked: %s (type=%s, patient=%s) by %s",
                    appt.appointment_number, data.appointment_type,
                    str(data.patient_id), current_user.username)
        enriched = enrich_appointment(db, appt)

        # Send confirmation email (async-safe, best effort)
        try:
            from ..services.email_service import send_appointment_confirmation_email
            from ..models.patient import Patient
            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            if patient and getattr(patient, "email", None):
                send_appointment_confirmation_email(
                    to_email=patient.email,
                    patient_name=patient.full_name,
                    doctor_name=enriched.get("doctor_name", "TBA"),
                    appointment_date=str(appt.appointment_date),
                    appointment_time=str(appt.start_time or "TBD"),
                    appointment_number=appt.appointment_number,
                    consultation_type=appt.appointment_type,
                )
        except Exception as email_err:
            logger.warning(f"Failed to send confirmation email: {email_err}")

        return enriched
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error booking appointment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to book appointment")


@router.get("", response_model=PaginatedAppointmentResponse)
async def list_all_appointments(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    doctor_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    appointment_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    total, pg, lim, tp, rows = list_appointments(
        db, page, limit,
        doctor_id=doctor_id, patient_id=patient_id,
        status=status_filter, appointment_type=appointment_type,
        date_from=date_from, date_to=date_to, search=search,
    )
    enriched = enrich_appointments(db, rows)
    return PaginatedAppointmentResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[AppointmentListItem(**a) for a in enriched],
    )


@router.get("/my-appointments", response_model=PaginatedAppointmentResponse)
async def my_appointments(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Doctor: appointments assigned to me."""
    # Lookup the Doctor record by user_id (user.id != doctor.id)
    doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
    if not doctor:
        return PaginatedAppointmentResponse(
            total=0, page=page, limit=limit, total_pages=0, data=[],
        )
    total, pg, lim, tp, rows = list_appointments(
        db, page, limit, doctor_id=str(doctor.id), status=status_filter,
    )
    enriched = enrich_appointments(db, rows)
    return PaginatedAppointmentResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[AppointmentListItem(**a) for a in enriched],
    )


@router.get("/doctor/{doctor_id}/today")
async def doctor_today(
    doctor_id: str,
    target_date: Optional[date] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query_date = target_date or date.today()
    _, _, _, _, rows = list_appointments(
        db, 1, 200, doctor_id=doctor_id, date_from=query_date, date_to=query_date,
    )
    return enrich_appointments(db, rows)


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment_detail(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appt(
    appointment_id: str,
    data: AppointmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = update_appointment(db, appointment_id, data.model_dump(exclude_unset=True), current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_appt(
    appointment_id: str,
    reason: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        appt = cancel_appointment(db, appointment_id, current_user.id, reason)
        if not appt:
            raise HTTPException(status_code=404, detail="Appointment not found")

        # Send cancellation email (best effort)
        try:
            from ..services.email_service import send_appointment_cancellation_email
            from ..models.patient import Patient
            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            if patient and getattr(patient, "email", None):
                send_appointment_cancellation_email(
                    to_email=patient.email,
                    patient_name=patient.full_name,
                    appointment_number=appt.appointment_number,
                    appointment_date=str(appt.appointment_date),
                    reason=reason or "",
                )
        except Exception as email_err:
            logger.warning(f"Failed to send cancellation email: {email_err}")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appt(
    appointment_id: str,
    data: AppointmentReschedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = reschedule_appointment(
        db, appointment_id, data.new_date, data.new_time, current_user.id, data.reason,
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    enriched = enrich_appointment(db, appt)

    # Send reschedule email (best effort)
    try:
        from ..services.email_service import send_appointment_reschedule_email
        from ..models.patient import Patient
        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        if patient and getattr(patient, "email", None):
            send_appointment_reschedule_email(
                to_email=patient.email,
                patient_name=patient.full_name,
                doctor_name=enriched.get("doctor_name", "TBA"),
                appointment_number=appt.appointment_number,
                new_date=str(data.new_date),
                new_time=str(data.new_time or "TBD"),
            )
    except Exception as email_err:
        logger.warning(f"Failed to send reschedule email: {email_err}")

    return enriched


@router.patch("/{appointment_id}/status", response_model=AppointmentResponse)
async def change_status(
    appointment_id: str,
    data: AppointmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = update_status(db, appointment_id, data.status, current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


# ── Follow-up booking ─────────────────────────────────────────────────────────

@router.post("/{appointment_id}/follow-up", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def book_follow_up(
    appointment_id: str,
    data: FollowUpCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Doctor creates a follow-up appointment for the same patient on a future date.
    The new appointment is linked via parent_appointment_id and appears in the
    doctor's schedule on the specified date.
    """
    parent = get_appointment(db, appointment_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Appointment not found")

    from ..services.appointment_service import generate_appointment_number
    from ..models.appointment import Appointment as ApptModel

    appt_number = generate_appointment_number("follow_up")
    new_appt = ApptModel(
        hospital_id=parent.hospital_id,
        appointment_number=appt_number,
        patient_id=parent.patient_id,
        doctor_id=parent.doctor_id,
        department_id=parent.department_id,
        appointment_date=data.follow_up_date,
        start_time=data.start_time,
        appointment_type="scheduled",
        visit_type="follow_up",
        priority="normal",
        status="scheduled",
        chief_complaint=data.chief_complaint or parent.chief_complaint,
        notes=data.notes,
        parent_appointment_id=parent.id,
        created_by=current_user.id,
    )
    db.add(new_appt)
    db.commit()
    db.refresh(new_appt)
    logger.info("Follow-up booked: %s → %s on %s", appointment_id, appt_number, data.follow_up_date)
    return enrich_appointment(db, new_appt)


# ── Patient referral ──────────────────────────────────────────────────────────

@router.post("/{appointment_id}/refer", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def refer_patient(
    appointment_id: str,
    data: ReferralCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Doctor refers a patient to another doctor on a preferred date.
    Creates a new scheduled appointment linked to the original via parent_appointment_id.
    The target doctor sees it in their schedule on that date.
    """
    source = get_appointment(db, appointment_id)
    if not source:
        raise HTTPException(status_code=404, detail="Appointment not found")

    import uuid as _uuid
    try:
        to_doc_id = _uuid.UUID(data.to_doctor_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid to_doctor_id")

    target_doctor = db.query(Doctor).filter(Doctor.id == to_doc_id, Doctor.is_active == True).first()
    if not target_doctor:
        raise HTTPException(status_code=404, detail="Target doctor not found")

    from ..services.appointment_service import generate_appointment_number
    from ..models.appointment import Appointment as ApptModel

    appt_number = generate_appointment_number("referral")
    new_appt = ApptModel(
        hospital_id=source.hospital_id,
        appointment_number=appt_number,
        patient_id=source.patient_id,
        doctor_id=to_doc_id,
        department_id=target_doctor.department_id,
        appointment_date=data.preferred_date,
        start_time=data.preferred_time,
        appointment_type="scheduled",
        visit_type="referral",
        priority="normal",
        status="scheduled",
        chief_complaint=data.chief_complaint or source.chief_complaint,
        notes=f"Referred from {source.appointment_number}. Reason: {data.reason or ''}",
        parent_appointment_id=source.id,
        created_by=current_user.id,
    )
    db.add(new_appt)
    db.commit()
    db.refresh(new_appt)
    logger.info("Referral created: %s → %s (doctor %s) on %s", appointment_id, appt_number, data.to_doctor_id, data.preferred_date)
    return enrich_appointment(db, new_appt)


# ── Doctor leave + auto-move appointments to waitlist ─────────────────────────

@router.post("/doctor-leave-with-waitlist")
async def mark_leave_move_to_waitlist(
    data: DoctorLeaveWithWaitlist,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Mark doctor as on leave for a date AND automatically move all their
    scheduled appointments on that day to the waitlist.
    Returns a summary of appointments moved.
    """
    from ..services.schedule_service import create_doctor_leave, is_doctor_on_leave
    from ..models.appointment import Appointment as ApptModel, Waitlist
    import uuid as _uuid

    # Resolve doctor id
    try:
        doc_uuid = _uuid.UUID(data.doctor_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid doctor_id")

    doctor = db.query(Doctor).filter(Doctor.id == doc_uuid).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    # Create leave record (idempotent — skip if already on leave)
    if not is_doctor_on_leave(db, doc_uuid, data.leave_date):
        create_doctor_leave(db, {
            "doctor_id": data.doctor_id,
            "leave_date": data.leave_date,
            "leave_type": data.leave_type,
            "reason": data.reason,
            "status": "approved",
        }, approved_by=current_user.id)

    # Find all non-cancelled appointments for that doctor on that date
    affected_appts = db.query(ApptModel).filter(
        ApptModel.doctor_id == doc_uuid,
        ApptModel.appointment_date == data.leave_date,
        ApptModel.status.notin_(["cancelled", "completed", "no-show"]),
        ApptModel.is_deleted == False,
    ).all()

    moved = []
    for appt in affected_appts:
        # Update appointment status to cancelled (doctor leave)
        appt.status = "cancelled"
        appt.cancel_reason = f"Doctor on leave: {data.reason or 'scheduled leave'}"

        # Check duplicate on waitlist
        existing_wl = db.query(Waitlist).filter(
            Waitlist.patient_id == appt.patient_id,
            Waitlist.doctor_id == appt.doctor_id,
            Waitlist.preferred_date == data.leave_date,
            Waitlist.is_deleted == False,
        ).first()
        if existing_wl:
            moved.append({"appointment_id": str(appt.id), "waitlist_id": str(existing_wl.id), "skipped_duplicate": True})
            continue

        from sqlalchemy import func as sqlfunc
        max_pos = db.query(sqlfunc.max(Waitlist.position)).filter(
            Waitlist.doctor_id == doc_uuid,
            Waitlist.preferred_date == data.leave_date,
            Waitlist.is_deleted == False,
        ).scalar() or 0

        wl_entry = Waitlist(
            hospital_id=appt.hospital_id,
            patient_id=appt.patient_id,
            doctor_id=appt.doctor_id,
            department_id=appt.department_id,
            preferred_date=data.leave_date,
            preferred_time=appt.start_time,
            appointment_type=appt.appointment_type,
            priority=appt.priority or "normal",
            chief_complaint=appt.chief_complaint,
            reason=f"Auto-moved from appointment {appt.appointment_number} — doctor on leave",
            status="waiting",
            position=max_pos + 1,
            created_by=current_user.id,
        )
        db.add(wl_entry)
        db.flush()
        moved.append({"appointment_id": str(appt.id), "waitlist_id": str(wl_entry.id), "skipped_duplicate": False})

    db.commit()
    return {
        "leave_created": True,
        "doctor_id": data.doctor_id,
        "leave_date": str(data.leave_date),
        "appointments_moved": len(moved),
        "details": moved,
    }


async def get_appointment_pdf(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate and return appointment details as a downloadable HTML document (printable as PDF)."""
    from ..config import settings as app_settings
    from ..models.patient import Patient

    appt = get_appointment(db, appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    enriched = enrich_appointment(db, appt)
    patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()

    def fmt_time(t):
        if not t:
            return "â€”"
        h, m = t.hour, t.minute
        ampm = "PM" if h >= 12 else "AM"
        h = h % 12 or 12
        return f"{h}:{m:02d} {ampm}"

    def fmt_date(d):
        if not d:
            return "â€”"
        return d.strftime("%B %d, %Y")

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Appointment - {appt.appointment_number}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; }}
.header {{ text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #0284c7; }}
.header h1 {{ margin: 0; color: #0284c7; font-size: 28px; }}
.header p {{ margin: 4px 0 0; color: #64748b; font-size: 14px; }}
.appt-number {{ font-size: 20px; font-weight: bold; color: #0284c7; text-align: center; margin: 20px 0; padding: 12px; background: #f0f9ff; border-radius: 8px; }}
table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
th, td {{ text-align: left; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; }}
th {{ color: #64748b; font-weight: 600; font-size: 13px; width: 180px; }}
td {{ font-size: 14px; }}
.section-title {{ font-size: 16px; font-weight: bold; color: #0284c7; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }}
.status {{ display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }}
.status-confirmed {{ background: #dcfce7; color: #166534; }}
.status-pending {{ background: #fef3c7; color: #92400e; }}
.status-completed {{ background: #dbeafe; color: #1e40af; }}
.status-cancelled {{ background: #fee2e2; color: #991b1b; }}
.footer {{ margin-top: 40px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
@media print {{ body {{ padding: 20px; }} }}
</style>
</head>
<body>
<div class="header">
    <h1>{app_settings.HOSPITAL_NAME}</h1>
    <p>{app_settings.HOSPITAL_ADDRESS}, {app_settings.HOSPITAL_CITY}, {app_settings.HOSPITAL_STATE}</p>
    <p>Phone: {app_settings.HOSPITAL_PHONE} | Email: {app_settings.HOSPITAL_EMAIL}</p>
</div>
<div class="appt-number">Appointment #{appt.appointment_number}</div>
<p class="section-title">Appointment Details</p>
<table>
    <tr><th>Status</th><td><span class="status status-{appt.status}">{appt.status}</span></td></tr>
    <tr><th>Type</th><td style="text-transform: capitalize;">{appt.appointment_type}</td></tr>
    <tr><th>Date</th><td>{fmt_date(appt.appointment_date)}</td></tr>
    <tr><th>Time</th><td>{fmt_time(appt.start_time)}</td></tr>
    <tr><th>Doctor</th><td>Dr. {enriched.get('doctor_name', 'TBA')}</td></tr>
</table>
<p class="section-title">Patient Information</p>
<table>
    <tr><th>Name</th><td>{enriched.get('patient_name', 'â€”')}</td></tr>
    <tr><th>PRN</th><td>{patient.patient_reference_number if patient else 'â€”'}</td></tr>
</table>
{f'''<p class="section-title">Clinical Notes</p>
<table>
    {"<tr><th>Chief Complaint</th><td>" + appt.chief_complaint + "</td></tr>" if appt.chief_complaint else ""}
</table>''' if appt.chief_complaint else ""}
<div class="footer">
    <p>Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")} | {app_settings.HOSPITAL_NAME}</p>
    <p>This is a computer-generated document. No signature required.</p>
</div>
</body>
</html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="appointment_{appt.appointment_number}.html"'},
    )

