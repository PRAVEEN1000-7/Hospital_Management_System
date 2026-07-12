"""
Appointments router â€“ CRUD, reschedule, cancel, status updates.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, datetime

from ..database import get_db
from ..models.user import User, Hospital
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
    get_doctor_today_summary,
)
from ..services.schedule_service import is_doctor_on_leave_at, get_available_slots
from ..services.notification_service import notify_hospital_users
from ..core.hospital_time import hospital_today

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
        # Validate: not a past date
        today = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
        if data.appointment_date < today:
            raise HTTPException(status_code=400, detail="Cannot book an appointment for a past date")

        # Validate: date/time not blocked by leave. A morning/afternoon leave
        # only blocks bookings whose start_time falls in that half of the day;
        # a booking with no start_time (or a full-day leave) keeps the
        # conservative whole-day block.
        if data.doctor_id and is_doctor_on_leave_at(db, data.doctor_id, data.appointment_date, data.start_time):
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
            hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
            if patient and getattr(patient, "email", None):
                send_appointment_confirmation_email(
                    to_email=patient.email,
                    patient_name=patient.full_name,
                    doctor_name=enriched.get("doctor_name", "TBA"),
                    appointment_date=str(appt.appointment_date),
                    appointment_time=str(appt.start_time or "TBD"),
                    appointment_number=appt.appointment_number,
                    consultation_type=appt.appointment_type,
                    hospital_name=hospital.name if hospital else "",
                    hospital_address=hospital.address_line_1 if hospital else "",
                    hospital_city=hospital.city if hospital else "",
                    hospital_phone=hospital.phone if hospital else "",
                    hospital_email=hospital.email if hospital else "",
                )
        except Exception as email_err:
            logger.warning(f"Failed to send confirmation email: {email_err}")

        # Notify the assigned doctor + admin (fire-and-forget)
        try:
            patient_name = enriched.get("patient_name", "A patient")
            extra_ids = []
            if appt.doctor_id:
                doc = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
                if doc:
                    extra_ids = [doc.user_id]
            notify_hospital_users(
                db=db,
                hospital_id=current_user.hospital_id,
                title="New Appointment Booked",
                message=f"{patient_name} — {appt.appointment_number} on {appt.appointment_date}.",
                notification_type="appointment",
                priority="normal",
                reference_type="appointment",
                reference_id=appt.id,
                role_names=["admin", "receptionist"],
                extra_user_ids=extra_ids,
                exclude_user_ids=[current_user.id],
            )
        except Exception:
            pass

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
        hospital_id=current_user.hospital_id,
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
        db, page, limit, hospital_id=current_user.hospital_id,
        doctor_id=str(doctor.id), status=status_filter,
    )
    enriched = enrich_appointments(db, rows)
    return PaginatedAppointmentResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[AppointmentListItem(**a) for a in enriched],
    )


@router.get("/doctor/{doctor_id}/today")
async def doctor_today(
    doctor_id: str,
    query_date: Optional[date] = Query(None, description="Date to fetch appointments for (YYYY-MM-DD). Defaults to server's today."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    target_date = query_date or hospital_today(current_user.hospital.timezone if current_user.hospital else None)
    # Resolve: try as Doctor.id first, then fall back to Doctor.user_id
    # so the frontend can pass either the doctor UUID or the logged-in user UUID
    resolved_doctor_id = doctor_id
    try:
        import uuid as _uuid
        parsed = _uuid.UUID(doctor_id)
        doctor = (
            db.query(Doctor)
            .filter(
                Doctor.id == parsed,
                Doctor.hospital_id == current_user.hospital_id,
            )
            .first()
        )
        if not doctor:
            doctor = (
                db.query(Doctor)
                .filter(
                    Doctor.user_id == parsed,
                    Doctor.hospital_id == current_user.hospital_id,
                )
                .first()
            )
        if doctor:
            resolved_doctor_id = str(doctor.id)
        else:
            # No doctor found for this user/doctor ID — return empty list
            logger.warning("doctor_today: no doctor found for id=%s hospital=%s", doctor_id, current_user.hospital_id)
            return []
    except (ValueError, AttributeError):
        pass
    _, _, _, _, rows = list_appointments(
        db, 1, 200, hospital_id=current_user.hospital_id,
        doctor_id=resolved_doctor_id, date_from=target_date, date_to=target_date,
    )
    return enrich_appointments(db, rows)


@router.get("/doctor/{doctor_id}/today-summary")
async def doctor_today_summary(
    doctor_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Today's patients handled + consultation fee collected total for one
    doctor. A doctor may only view their own summary; admin/super_admin/
    receptionist can view any doctor in their hospital (front-desk needs to
    see collections)."""
    import uuid as _uuid
    try:
        parsed = _uuid.UUID(doctor_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid doctor_id")

    doctor = (
        db.query(Doctor)
        .filter(Doctor.id == parsed, Doctor.hospital_id == current_user.hospital_id)
        .first()
    )
    if not doctor:
        doctor = (
            db.query(Doctor)
            .filter(Doctor.user_id == parsed, Doctor.hospital_id == current_user.hospital_id)
            .first()
        )
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    is_self = doctor.user_id == current_user.id
    is_front_office = bool(
        current_user.roles and set(current_user.roles) & {"admin", "super_admin", "receptionist"}
    )
    if not is_self and not is_front_office:
        raise HTTPException(status_code=403, detail="Not authorized to view this doctor's summary")

    return get_doctor_today_summary(db, doctor.id, current_user.hospital_id)


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment_detail(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    appt = get_appointment(db, appointment_id, hospital_id=current_user.hospital_id)
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
    existing = get_appointment(db, appointment_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment not found")
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
        existing = get_appointment(db, appointment_id, hospital_id=current_user.hospital_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Appointment not found")
        appt = cancel_appointment(db, appointment_id, current_user.id, reason)
        if not appt:
            raise HTTPException(status_code=404, detail="Appointment not found")

        # Send cancellation email (best effort)
        try:
            from ..services.email_service import send_appointment_cancellation_email
            from ..models.patient import Patient
            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
            if patient and getattr(patient, "email", None):
                send_appointment_cancellation_email(
                    to_email=patient.email,
                    patient_name=patient.full_name,
                    appointment_number=appt.appointment_number,
                    appointment_date=str(appt.appointment_date),
                    reason=reason or "",
                    hospital_name=hospital.name if hospital else "",
                    hospital_address=hospital.address_line_1 if hospital else "",
                    hospital_city=hospital.city if hospital else "",
                    hospital_phone=hospital.phone if hospital else "",
                    hospital_email=hospital.email if hospital else "",
                )
        except Exception as email_err:
            logger.warning(f"Failed to send cancellation email: {email_err}")

        # Notify doctor + admin of cancellation (fire-and-forget)
        try:
            extra_ids = []
            if appt.doctor_id:
                doc = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
                if doc:
                    extra_ids = [doc.user_id]
            notify_hospital_users(
                db=db,
                hospital_id=current_user.hospital_id,
                title="Appointment Cancelled",
                message=f"Appointment {appt.appointment_number} has been cancelled.",
                notification_type="appointment",
                priority="normal",
                reference_type="appointment",
                reference_id=appt.id,
                role_names=["admin", "receptionist"],
                extra_user_ids=extra_ids,
                exclude_user_ids=[current_user.id],
            )
        except Exception:
            pass
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appt(
    appointment_id: str,
    data: AppointmentReschedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    existing = get_appointment(db, appointment_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment not found")

    today = hospital_today(current_user.hospital.timezone if current_user.hospital else None)
    if data.new_date < today:
        raise HTTPException(status_code=400, detail="Cannot reschedule an appointment to a past date")

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
        hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
        if patient and getattr(patient, "email", None):
            send_appointment_reschedule_email(
                to_email=patient.email,
                patient_name=patient.full_name,
                doctor_name=enriched.get("doctor_name", "TBA"),
                appointment_number=appt.appointment_number,
                new_date=str(data.new_date),
                new_time=str(data.new_time or "TBD"),
                hospital_name=hospital.name if hospital else "",
                hospital_address=hospital.address_line_1 if hospital else "",
                hospital_city=hospital.city if hospital else "",
                hospital_phone=hospital.phone if hospital else "",
                hospital_email=hospital.email if hospital else "",
            )
    except Exception as email_err:
        logger.warning(f"Failed to send reschedule email: {email_err}")

    # Notify doctor + admin of reschedule (fire-and-forget)
    try:
        extra_ids = []
        if appt.doctor_id:
            doc = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
            if doc:
                extra_ids = [doc.user_id]
        notify_hospital_users(
            db=db,
            hospital_id=current_user.hospital_id,
            title="Appointment Rescheduled",
            message=f"Appointment {appt.appointment_number} rescheduled to {data.new_date}.",
            notification_type="appointment",
            priority="normal",
            reference_type="appointment",
            reference_id=appt.id,
            role_names=["admin", "receptionist"],
            extra_user_ids=extra_ids,
            exclude_user_ids=[current_user.id],
        )
    except Exception:
        pass

    return enriched


@router.patch("/{appointment_id}/status", response_model=AppointmentResponse)
async def change_status(
    appointment_id: str,
    data: AppointmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    existing = get_appointment(db, appointment_id, hospital_id=current_user.hospital_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment not found")
    appt = update_status(db, appointment_id, data.status, current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return enrich_appointment(db, appt)


@router.get("/{appointment_id}/pdf")
async def get_appointment_pdf(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate and return appointment details as a downloadable HTML document (printable as PDF)."""
    from ..models.patient import Patient

    appt = get_appointment(db, appointment_id, hospital_id=current_user.hospital_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    enriched = enrich_appointment(db, appt)
    patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()

    # This HTML is rendered client-side via document.write() with no further
    # sanitization (SECURITY_AUDIT.md M2) — every value derived from user
    # input must be escaped before interpolation.
    import html as _html_mod

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc(hospital.address_line_1 if hospital else "")
    hosp_city = _esc(hospital.city if hospital else "")
    hosp_state = _esc(hospital.state_province if hospital else "")
    hosp_phone = _esc(hospital.phone if hospital else "")
    hosp_email = _esc(hospital.email if hospital else "")

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
    <h1>{hosp_name}</h1>
    <p>{hosp_address}, {hosp_city}, {hosp_state}</p>
    <p>Phone: {hosp_phone} | Email: {hosp_email}</p>
</div>
<div class="appt-number">Appointment #{appt.appointment_number}</div>
<p class="section-title">Appointment Details</p>
<table>
    <tr><th>Status</th><td><span class="status status-{appt.status}">{appt.status}</span></td></tr>
    <tr><th>Type</th><td style="text-transform: capitalize;">{appt.appointment_type}</td></tr>
    <tr><th>Date</th><td>{fmt_date(appt.appointment_date)}</td></tr>
    <tr><th>Time</th><td>{fmt_time(appt.start_time)}</td></tr>
    <tr><th>Doctor</th><td>Dr. {_esc(enriched.get('doctor_name', 'TBA'))}</td></tr>
</table>
<p class="section-title">Patient Information</p>
<table>
    <tr><th>Name</th><td>{_esc(enriched.get('patient_name', '—')) or '—'}</td></tr>
    <tr><th>PRN</th><td>{_esc(patient.patient_reference_number) if patient else '—'}</td></tr>
</table>
{f'''<p class="section-title">Clinical Notes</p>
<table>
    {"<tr><th>Chief Complaint</th><td>" + _esc(appt.chief_complaint) + "</td></tr>" if appt.chief_complaint else ""}
</table>''' if appt.chief_complaint else ""}
<div class="footer">
    <p>Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")} | {hosp_name}</p>
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

