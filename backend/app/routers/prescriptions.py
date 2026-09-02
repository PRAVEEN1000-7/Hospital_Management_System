"""
Prescriptions router — CRUD for prescriptions, items, templates, medicines.
Follows the same patterns as appointments.py router.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, datetime, timezone
import uuid as uuid_mod

from ..database import get_db
from ..models.user import User, Hospital
from ..models.appointment import Doctor, Appointment, AppointmentQueue
from ..models.prescription import Medicine as MedicineModel, PrescriptionTemplate
from ..dependencies import get_current_active_user, require_any_role
from ..core.module_roles import require_permission, check_permission
from ..core.tenant_security import is_eye_hospital_feature_enabled
from ..core.hospital_time import hospital_today
from ..schemas.prescription import (
    PrescriptionCreate,
    PrescriptionUpdate,
    PrescriptionVitalsUpdate,
    PrescriptionResponse,
    PrescriptionListItem,
    PaginatedPrescriptionResponse,
    PrescriptionVersionResponse,
    MedicineCreate,
    MedicineUpdate,
    MedicineResponse,
    PaginatedMedicineResponse,
    FrequentMedicineResponse,
    FrequentMedicinesResponse,
    PrescriptionTemplateCreate,
    PrescriptionTemplateUpdate,
    PrescriptionTemplateResponse,
)
from ..services.prescription_service import (
    create_prescription,
    get_prescription,
    get_prescription_by_appointment,
    save_draft_vitals,
    list_prescriptions,
    update_prescription,
    finalize_prescription,
    delete_prescription,
    enrich_prescription,
    enrich_prescriptions,
    get_prescription_versions,
    create_medicine,
    list_medicines,
    list_frequent_medicines,
    update_medicine,
    create_template,
    list_templates,
    update_template,
    delete_template,
    increment_template_usage,
)
from ..services.invoice_service import get_or_create_consultation_invoice_for_appointment
from ..services.appointment_service import create_appointment

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/prescriptions", tags=["Prescriptions"])

# "All Prescription" (existing records) vs "New Prescription" (authoring) —
# per the confirmed decision, pharmacist gets real edit rights on rx.all
# (docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md).
rx_all_view_guard = require_permission("rx.all", "view")
rx_all_edit_guard = require_permission("rx.all", "edit")
rx_new_view_guard = require_permission("rx.new", "view")
rx_new_edit_guard = require_permission("rx.new", "edit")


def _rx_new_or_pharmacist_guard(level: str):
    """Narrow carve-out letting a pharmacist OR admin author a walk-in
    prescription directly (attributed to a doctor they explicitly pick from
    the roster — see PrescriptionCreate.doctor_id /
    prescription_service.create_prescription, which already requires an
    explicit doctor_id from any caller with no linked Doctor row) without
    granting either the full "rx.new" edit right.

    "rx.new" is deliberately NOT extended to pharmacist/admin in
    module_roles.py's MODULE_ROLES matrix (admin only has "view" there),
    because that same key also gates the medicine formulary CRUD
    (create_new_medicine/update_med below) and prescription template CRUD
    (templates_router below) — a plain matrix edit would hand them edit
    rights over both of those too, which was never asked for and isn't safe
    to add as a side effect here. Only the two endpoints a pharmacist/admin
    actually need (create a prescription; search the medicine list while
    building one) use this guard instead.

    Mirrors the `adjustment_create_roles` carve-out pattern already used in
    inventory.py for the same kind of narrowly-scoped role addition.
    """
    from ..dependencies import get_current_active_user
    from ..database import get_db

    async def _dependency(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db),
    ):
        roles = {str(r).strip().lower() for r in (current_user.roles or [])}
        if "pharmacist" in roles or "admin" in roles:
            return current_user
        if check_permission(db, current_user, "rx.new", level):
            return current_user
        logger.warning(
            "RBAC deny (rx.new/pharmacist/admin carve-out) user=%s roles=%s level=%s",
            getattr(current_user, "username", "unknown"), roles, level,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role permissions")

    return _dependency


rx_new_edit_or_pharmacist_guard = _rx_new_or_pharmacist_guard("edit")
rx_new_view_or_pharmacist_guard = _rx_new_or_pharmacist_guard("view")

# Narrow, vitals-only scope (see rx.vitals in module_roles.py / PrescriptionVitalsUpdate) —
# a nurse gets this and nothing else on the Prescription resource.
vitals_edit_guard = require_permission("rx.vitals", "edit")


# ═══════════════════════════════════════════════════════════════════════════
# Prescription Endpoints
# ═══════════════════════════════════════════════════════════════════════════

# Registered before the generic "/{prescription_id}" GET/PUT routes below —
# Starlette matches routes in registration order, and "/{prescription_id}"
# would otherwise swallow "PUT /prescriptions/draft-vitals" by treating
# "draft-vitals" as the id.
@router.put("/draft-vitals", response_model=PrescriptionResponse)
async def put_draft_vitals(
    data: PrescriptionVitalsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(vitals_edit_guard),
):
    """Record/update BP/Pulse/Temp/Weight/SpO2/Blood Sugar for a visit — the
    nurse-facing vitals-only write. Creates a draft prescription for this
    appointment if none exists yet, or updates just the vitals fields on an
    existing (not-yet-finalized) one. See prescription_service.save_draft_vitals."""
    try:
        rx = save_draft_vitals(db, current_user.hospital_id, data.model_dump(), current_user.id)
    except ValueError as ve:
        raise HTTPException(status_code=409, detail=str(ve))
    return enrich_prescription(db, rx)


@router.get("/by-appointment/{appointment_id}", response_model=PrescriptionResponse)
async def get_prescription_for_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_view_guard),
):
    """Looked up by the doctor's Prescription Builder when starting a
    consultation, to find (and redirect into editing) a nurse's draft-vitals
    prescription for this appointment instead of rendering a blank form."""
    rx = get_prescription_by_appointment(db, appointment_id, current_user.hospital_id)
    if not rx:
        raise HTTPException(status_code=404, detail="No prescription found for this appointment")
    return enrich_prescription(db, rx)


@router.post("", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_new_prescription(
    data: PrescriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_edit_or_pharmacist_guard),
):
    """Create a new prescription."""
    try:
        rx = create_prescription(db, data.model_dump(), current_user.id, current_user.hospital_id)
        return enrich_prescription(db, rx)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error creating prescription: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create prescription")


@router.get("", response_model=PaginatedPrescriptionResponse)
async def list_all_prescriptions(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    doctor_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    reason: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_view_guard),
):
    """List prescriptions with filtering and pagination."""
    total, pg, lim, tp, rows = list_prescriptions(
        db, page, limit,
        hospital_id=current_user.hospital_id,
        doctor_id=doctor_id, patient_id=patient_id,
        status=status_filter, date_from=date_from, date_to=date_to,
        search=search, reason=reason, sort_by=sort_by, sort_order=sort_order,
    )
    enriched = enrich_prescriptions(db, rows)
    return PaginatedPrescriptionResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[PrescriptionListItem(**rx) for rx in enriched],
    )


@router.get("/my-prescriptions", response_model=PaginatedPrescriptionResponse)
async def my_prescriptions(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    reason: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Doctor: prescriptions created by me."""
    doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
    if not doctor:
        return PaginatedPrescriptionResponse(
            total=0, page=page, limit=limit, total_pages=0, data=[],
        )
    total, pg, lim, tp, rows = list_prescriptions(
        db, page, limit, hospital_id=current_user.hospital_id,
        doctor_id=str(doctor.id), status=status_filter,
        date_from=date_from, date_to=date_to, search=search, reason=reason,
        sort_by=sort_by, sort_order=sort_order,
    )
    enriched = enrich_prescriptions(db, rows)
    return PaginatedPrescriptionResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[PrescriptionListItem(**rx) for rx in enriched],
    )


@router.get("/patient/{patient_id}", response_model=PaginatedPrescriptionResponse)
async def patient_prescriptions(
    patient_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_view_guard),
):
    """Get all prescriptions for a patient."""
    total, pg, lim, tp, rows = list_prescriptions(
        db, page, limit, hospital_id=current_user.hospital_id,
        patient_id=patient_id,
    )
    enriched = enrich_prescriptions(db, rows)
    return PaginatedPrescriptionResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[PrescriptionListItem(**rx) for rx in enriched],
    )


@router.get("/languages")
async def get_prescription_languages(
    current_user: User = Depends(get_current_active_user),
):
    """Return supported languages for prescription printing."""
    from ..utils.prescription_translations import SUPPORTED_LANGUAGES
    return [{"code": code, "name": name} for code, name in SUPPORTED_LANGUAGES.items()]


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription_detail(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_view_guard),
):
    """Get full prescription detail including items."""
    rx = get_prescription(db, prescription_id, hospital_id=current_user.hospital_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return enrich_prescription(db, rx)


@router.put("/{prescription_id}", response_model=PrescriptionResponse)
async def update_rx(
    prescription_id: str,
    data: PrescriptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_edit_guard),
):
    """Update prescription — drafts freely, finalized ones too as long as
    nothing on them has been dispensed yet (see update_prescription)."""
    try:
        rx_check = get_prescription(db, prescription_id, hospital_id=current_user.hospital_id)
        if not rx_check:
            raise HTTPException(status_code=404, detail="Prescription not found")
        rx = update_prescription(
            db, prescription_id,
            data.model_dump(exclude_unset=True),
            current_user.id,
            hospital_id=current_user.hospital_id,
        )
        if not rx:
            raise HTTPException(status_code=404, detail="Prescription not found")
        return enrich_prescription(db, rx)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/{prescription_id}/finalize", response_model=PrescriptionResponse)
async def finalize_rx(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_edit_guard),
):
    """Finalize a prescription (lock it for dispensing)."""
    try:
        rx_check = get_prescription(db, prescription_id, hospital_id=current_user.hospital_id)
        if not rx_check:
            raise HTTPException(status_code=404, detail="Prescription not found")
        rx = finalize_prescription(db, prescription_id, current_user.id, hospital_id=current_user.hospital_id)
        if not rx:
            raise HTTPException(status_code=404, detail="Prescription not found")

        # If doctor provided a follow-up date, create a future follow-up appointment
        # so it appears in Upcoming queue views.
        if rx.follow_up_date and rx.follow_up_date > hospital_today(current_user.hospital.timezone if current_user.hospital else None) and rx.patient_id and rx.doctor_id:
            existing_follow_up = (
                db.query(Appointment)
                .filter(
                    Appointment.hospital_id == current_user.hospital_id,
                    Appointment.patient_id == rx.patient_id,
                    Appointment.doctor_id == rx.doctor_id,
                    Appointment.appointment_date == rx.follow_up_date,
                    Appointment.appointment_type.in_(["follow-up", "follow_up"]),
                    Appointment.parent_appointment_id == rx.appointment_id,
                    Appointment.is_deleted == False,
                )
                .first()
            )
            if not existing_follow_up:
                create_appointment(
                    db,
                    {
                        "patient_id": str(rx.patient_id),
                        "doctor_id": str(rx.doctor_id),
                        "appointment_type": "follow-up",
                        "visit_type": "follow_up",
                        "appointment_date": rx.follow_up_date,
                        "status": "scheduled",
                        "priority": "normal",
                        "chief_complaint": f"Follow-up for {rx.prescription_number}",
                        "parent_appointment_id": str(rx.appointment_id) if rx.appointment_id else None,
                    },
                    current_user.id,
                    current_user.hospital_id,
                )

        # Notification is sent inside finalize_prescription() itself — a
        # second call here duplicated the "Prescription Ready for Dispensing"
        # notification for every finalize.

        return enrich_prescription(db, rx)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/{prescription_id}/finalize-and-complete", response_model=PrescriptionResponse)
async def finalize_and_complete_queue(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_edit_guard),
):
    """Finalize a prescription AND complete the linked queue entry + appointment in one call.
    Used by the consultation flow: Save & Complete button."""
    try:
        rx_check = get_prescription(db, prescription_id, hospital_id=current_user.hospital_id)
        if not rx_check:
            raise HTTPException(status_code=404, detail="Prescription not found")
        # 1. Finalize the prescription
        rx = finalize_prescription(db, prescription_id, current_user.id, hospital_id=current_user.hospital_id)
        if not rx:
            raise HTTPException(status_code=404, detail="Prescription not found")

        # If doctor provided a follow-up date, create a future follow-up appointment
        # so it appears in Upcoming queue views.
        if rx.follow_up_date and rx.follow_up_date > hospital_today(current_user.hospital.timezone if current_user.hospital else None) and rx.patient_id and rx.doctor_id:
            existing_follow_up = (
                db.query(Appointment)
                .filter(
                    Appointment.hospital_id == current_user.hospital_id,
                    Appointment.patient_id == rx.patient_id,
                    Appointment.doctor_id == rx.doctor_id,
                    Appointment.appointment_date == rx.follow_up_date,
                    Appointment.appointment_type.in_(["follow-up", "follow_up"]),
                    Appointment.parent_appointment_id == rx.appointment_id,
                    Appointment.is_deleted == False,
                )
                .first()
            )
            if not existing_follow_up:
                create_appointment(
                    db,
                    {
                        "patient_id": str(rx.patient_id),
                        "doctor_id": str(rx.doctor_id),
                        "appointment_type": "follow-up",
                        "visit_type": "follow_up",
                        "appointment_date": rx.follow_up_date,
                        "status": "scheduled",
                        "priority": "normal",
                        "chief_complaint": f"Follow-up for {rx.prescription_number}",
                        "parent_appointment_id": str(rx.appointment_id) if rx.appointment_id else None,
                    },
                    current_user.id,
                    current_user.hospital_id,
                )

        # 2. Complete the linked queue entry (if any)
        queue_appointment_id = None
        if rx.queue_id:
            qe = db.query(AppointmentQueue).filter(AppointmentQueue.id == rx.queue_id).first()
            if qe and qe.status in ("called", "in_consultation", "sent_to_doctor"):
                qe.status = "completed"
                queue_appointment_id = qe.appointment_id
                # Also complete the linked appointment
                if qe.appointment_id:
                    appt = db.query(Appointment).filter(Appointment.id == qe.appointment_id).first()
                    if appt:
                        appt.status = "completed"
                        appt.consultation_end_at = datetime.now(timezone.utc)
                db.commit()

        # 3. Auto-create (or reuse) consultation invoice when fee is configured.
        consultation_invoice = None
        consultation_appointment_id = rx.appointment_id or queue_appointment_id
        if consultation_appointment_id:
            consultation_invoice = get_or_create_consultation_invoice_for_appointment(
                db,
                hospital_id=current_user.hospital_id,
                user_id=current_user.id,
                appointment_id=consultation_appointment_id,
                patient_id=rx.patient_id,
            )

        enriched = enrich_prescription(db, rx)
        enriched["consultation_invoice_id"] = str(consultation_invoice.id) if consultation_invoice else None
        enriched["consultation_invoice_number"] = consultation_invoice.invoice_number if consultation_invoice else None
        enriched["consultation_invoice_status"] = consultation_invoice.status if consultation_invoice else None

        # Notification is sent inside finalize_prescription() itself — a
        # second call here duplicated the "Prescription Ready for Dispensing"
        # notification for every finalize.

        return enriched
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.delete("/{prescription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rx(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_edit_guard),
):
    """Soft-delete a prescription (only drafts)."""
    try:
        rx_check = get_prescription(db, prescription_id, hospital_id=current_user.hospital_id)
        if not rx_check:
            raise HTTPException(status_code=404, detail="Prescription not found")
        rx = delete_prescription(db, prescription_id, current_user.id, hospital_id=current_user.hospital_id)
        if not rx:
            raise HTTPException(status_code=404, detail="Prescription not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.get("/{prescription_id}/versions", response_model=list[PrescriptionVersionResponse])
async def get_rx_versions(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_view_guard),
):
    """Get version history for a prescription."""
    rx_check = get_prescription(db, prescription_id, hospital_id=current_user.hospital_id)
    if not rx_check:
        raise HTTPException(status_code=404, detail="Prescription not found")
    versions = get_prescription_versions(db, prescription_id)
    return versions


@router.get("/{prescription_id}/pdf")
async def get_prescription_pdf(
    prescription_id: str,
    lang: str = Query("en", description="Language code for print labels"),
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_all_view_guard),
):
    """Generate prescription as printable HTML with multi-language support."""
    from ..models.patient import Patient
    from ..models.user import Hospital
    from ..utils.prescription_translations import get_labels, SUPPORTED_LANGUAGES

    if lang not in SUPPORTED_LANGUAGES:
        lang = "en"

    t = get_labels(lang)

    rx = get_prescription(db, prescription_id, hospital_id=current_user.hospital_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")

    enriched = enrich_prescription(db, rx)
    patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    # Eye Hospital Drug Prescription format (S.No | Medicine | Eye Side | Dosage)
    # replaces the generic Dosage/Frequency/Duration/Qty/Route table for eye
    # hospitals — distinct from both the general format and the separate
    # Optical (lens spec) prescription.
    eye_format = is_eye_hospital_feature_enabled(hospital) and any(
        item.get("eye_side") for item in enriched.get("items", [])
    )

    # This HTML is rendered client-side via document.write() with no further
    # sanitization (SECURITY_AUDIT.md M2), so every value that ultimately
    # came from user input — diagnosis, notes, advice, names, medicine
    # fields, free-typed symptoms — MUST be escaped before interpolation.
    # Escaping at the point of derivation (here) rather than at every f-string
    # usage site means nothing downstream can accidentally skip it.
    import html as _html_mod

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    # Support dual-letterhead via institution_id
    institution = None
    if rx.institution_id:
        institution = db.query(Hospital).filter(Hospital.id == rx.institution_id).first()

    hosp_name = _esc((institution.name if institution else hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc((institution.address_line_1 if institution else hospital.address_line_1 if hospital else "") or "")
    hosp_city = _esc((institution.city if institution else hospital.city if hospital else "") or "")
    hosp_phone = _esc((institution.phone if institution else hospital.phone if hospital else "") or "")
    hosp_email = _esc((institution.email if institution else hospital.email if hospital else "") or "")

    # Hospital logo → embed as a base64 data URI so it renders in BOTH the print
    # window and the html2canvas PDF download (relative /uploads paths and external
    # URLs don't resolve reliably in those contexts). Used as a faint full-page
    # watermark plus a small header logo for branding.
    def _logo_data_uri(logo_url: str) -> str:
        if not logo_url:
            return ""
        if logo_url.startswith("http://") or logo_url.startswith("https://"):
            return logo_url
        import os as _os, base64 as _b64, mimetypes as _mt
        backend_root = _os.path.dirname(_os.path.dirname(_os.path.dirname(__file__)))
        fpath = _os.path.join(backend_root, logo_url.lstrip("/").replace("/", _os.sep))
        if not _os.path.exists(fpath):
            return ""
        mime = _mt.guess_type(fpath)[0] or "image/png"
        try:
            with open(fpath, "rb") as fh:
                data = _b64.b64encode(fh.read()).decode("ascii")
            return f"data:{mime};base64,{data}"
        except Exception:
            return ""
    logo_uri = _logo_data_uri(institution.logo_url if institution else hospital.logo_url if hospital else "")

    doctor = db.query(Doctor).filter(Doctor.id == rx.doctor_id).first() if rx.doctor_id else None
    doctor_name = _esc(doctor.user.full_name if doctor and doctor.user else "")
    doctor_spec = _esc((doctor.specialization if doctor else "") or "")
    doctor_reg = _esc((doctor.registration_number if doctor else "") or "")
    doctor_qual = _esc((doctor.qualification if doctor else "") or "")
    # Doctor name with qualifications appended (e.g. "Dr. Hari Ram, MBBS, MD").
    # No doctor attached (walk-in record created without one) — show a plain
    # "No doctor assigned" instead of a bare "Dr." with nothing after it.
    doctor_display = (
        f"Dr. {doctor_name}" + (f", {doctor_qual}" if doctor_qual else "")
        if doctor_name else "No doctor assigned"
    )

    # Patient age — prefer the stored value, otherwise derive it from the DOB.
    def _compute_age(p):
        if not p:
            return "—"
        if getattr(p, "age_years", None):
            return f"{p.age_years} yrs"
        dob = getattr(p, "date_of_birth", None)
        if dob:
            today = date.today()
            yrs = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if yrs >= 0:
                return f"{yrs} yrs"
        return "—"
    patient_age = _compute_age(patient)
    patient_weight = _esc((rx.vitals_weight or "").strip() if rx.vitals_weight else "")
    weight_label = t.get("weight", "Weight")

    # Build clean header lines so empty fields never render as "None" or stray commas
    # (hosp_address/hosp_city/hosp_phone/hosp_email are already escaped above)
    addr_line = ", ".join(p for p in (hosp_address, hosp_city) if p)
    contact_bits = []
    if hosp_phone:
        contact_bits.append(f"{t['phone']}: {hosp_phone}")
    if hosp_email:
        contact_bits.append(f"{t['email']}: {hosp_email}")
    contact_line = " | ".join(contact_bits)

    def fmt_date(d):
        if not d:
            return "—"
        if hasattr(d, "strftime"):
            return d.strftime("%B %d, %Y")
        return str(d)

    items_html = ""
    for idx, item in enumerate(enriched.get("items", []), 1):
        if eye_format:
            eye_side = (item.get("eye_side") or "").strip()
            tick = "&#10003;"  # ✓
            re_mark = tick if eye_side in ("RE", "Both") else "—"
            le_mark = tick if eye_side in ("LE", "Both") else "—"
            items_html += f"""
        <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{idx}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
                <strong>{_esc(item['medicine_name'])}</strong>
                {f'<br/><span style="color:#64748b;font-size:12px;">{_esc(item.get("generic_name",""))}</span>' if item.get('generic_name') else ''}
            </td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{re_mark}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{le_mark}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">{_esc(item.get('dosage','')) or '—'}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">{_esc(item.get('frequency','')) or '—'}</td>
        </tr>"""
        else:
            items_html += f"""
        <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{idx}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
                <strong>{_esc(item['medicine_name'])}</strong>
                {f'<br/><span style="color:#64748b;font-size:12px;">{_esc(item.get("generic_name",""))}</span>' if item.get('generic_name') else ''}
            </td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{_esc(item['dosage'])}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{_esc(item['frequency'])}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">
                {f"{item['duration_value']} {_esc(item.get('duration_unit',''))}" if item.get('duration_value') else '—'}
            </td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{item.get('quantity','') or '—'}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{_esc(item.get('route','')) or '—'}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">{_esc(item.get('instructions','')) or '—'}</td>
        </tr>"""

    from fastapi.responses import HTMLResponse
    html = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light only">
<title>{t['prescription']} - {rx.prescription_number}</title>
<style>
/* Force light rendering regardless of OS/browser dark mode — this document is
   meant to look identical to its printed form, never auto-darkened. */
:root {{ color-scheme: light only; }}
html {{ background:#ffffff; }}
body {{ font-family: 'Noto Sans', Arial, sans-serif; margin:0; padding:28px; color:#1e293b; background:#ffffff; position:relative; }}
.watermark {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:55%; max-width:420px; opacity:0.06; z-index:0; pointer-events:none; }}
.content {{ position:relative; z-index:1; }}
.header {{ text-align:center; margin-bottom:18px; padding-bottom:14px; border-bottom:3px solid #137fec; }}
.header-logo {{ height:60px; max-width:220px; object-fit:contain; margin-bottom:6px; }}
.header h1 {{ margin:0; color:#137fec; font-size:24px; }}
.header p {{ margin:4px 0; color:#64748b; font-size:13px; }}
.rx-info {{ display:flex; justify-content:space-between; margin-bottom:14px; }}
.rx-info div {{ font-size:13px; }}
.patient-box {{ background:#f1f5f9; padding:14px 16px; border-radius:8px; margin-bottom:14px; }}
.patient-box p {{ margin:4px 0; font-size:13px; }}
table {{ width:100%; border-collapse:collapse; margin-bottom:14px; }}
th {{ background:#f1f5f9; padding:10px 8px; text-align:left; font-size:13px; font-weight:600; border-bottom:2px solid #e2e8f0; }}
td {{ font-size:13px; }}
.diagnosis {{ background:#eff6ff; padding:14px 16px; border-radius:8px; margin-bottom:14px; }}
.advice {{ background:#f0fdf4; padding:14px 16px; border-radius:8px; margin-bottom:14px; }}
.footer {{ margin-top:24px; display:flex; justify-content:flex-end; page-break-inside:avoid; }}
.signature {{ text-align:right; }}
.signature p {{ margin:4px 0; font-size:13px; }}
.generated-note {{ text-align:center; margin-top:24px; font-size:11px; color:#94a3b8; }}
@page {{ size: A4; margin: 12mm; }}
@media print {{
  html, body {{ margin:0; padding:0; height:auto; background:#ffffff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  .footer {{ margin-top:20px; }}
  table, tr, td, th {{ page-break-inside:avoid; }}
  .patient-box, .diagnosis, .advice {{ page-break-inside:avoid; }}
}}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&family=Noto+Sans+Malayalam:wght@400;600;700&family=Noto+Sans+Tamil:wght@400;600;700&family=Noto+Sans+Telugu:wght@400;600;700&display=swap">
</head>
<body>
{f'<img class="watermark" src="{logo_uri}" alt="" />' if logo_uri else ''}
<div class="content">
<div class="header">
    {f'<img class="header-logo" src="{logo_uri}" alt="{hosp_name}" />' if logo_uri else ''}
    <h1>{hosp_name}</h1>
    {f'<p>{addr_line}</p>' if addr_line else ''}
    {f'<p style="white-space:nowrap;">{contact_line}</p>' if contact_line else ''}
</div>

<div class="rx-info">
    <div>
        <strong>{t['prn']}:</strong> {_esc(patient.patient_reference_number) if patient else '—'}<br/>
        <strong>{t['date']}:</strong> {fmt_date(rx.created_at)}
    </div>
    <div style="text-align:right;">
        <strong>{t['status']}:</strong> {_esc({"finalized": "Prescribed", "dispensed": "Dispensed", "draft": "Draft"}.get(rx.status, rx.status.title()))}
    </div>
</div>

<div class="patient-box">
    <p><strong>{t['patient']}:</strong> {_esc(patient.full_name) if patient else '—'}</p>
    <p><strong>{t['prn']}:</strong> {_esc(patient.patient_reference_number) if patient else '—'} |
       <strong>{t['age']}:</strong> {patient_age} |
       <strong>{t['gender']}:</strong> {_esc(patient.gender) if patient else '—'} |
       <strong>{t['blood_group']}:</strong> {_esc(patient.blood_group) if patient and patient.blood_group else '—'}
       {f" | <strong>{weight_label}:</strong> {patient_weight} kg" if patient_weight else ""}</p>
    {f'<p><strong>{t["allergies"]}:</strong> <span style="color:#dc2626;">{_esc(patient.known_allergies)}</span></p>' if patient and patient.known_allergies else ''}
</div>

{f'<div class="diagnosis"><strong>Patient History:</strong> {"Blood Sugar: " + _esc(rx.vitals_blood_sugar) if rx.vitals_blood_sugar else ""}{" | Symptoms: " + _esc(", ".join(patient.symptoms)) if patient and patient.symptoms else ""}</div>' if rx.vitals_blood_sugar or (patient and patient.symptoms) else ''}

{f'<div class="diagnosis"><strong>{t["clinical_notes"]}:</strong> {_esc(rx.clinical_notes)}</div>' if rx.clinical_notes else ''}
{f'<div class="diagnosis"><strong>{t["diagnosis"]}:</strong> {_esc(rx.diagnosis)}</div>' if rx.diagnosis else ''}

{f'''<div class="diagnosis" style="background:#fef3c7;position:relative;padding-right:100px;">
    <strong>Ophthalmology Examination:</strong><br/>{_esc(rx.opthal_notes)}
    <svg width="80" height="54" viewBox="0 0 90 60" style="position:absolute;top:8px;right:8px;">
        <ellipse cx="45" cy="30" rx="42" ry="22" fill="none" stroke="#1e293b" stroke-width="2" />
        <circle cx="45" cy="30" r="13" fill="none" stroke="#1e293b" stroke-width="2" />
        <circle cx="45" cy="30" r="6" fill="#1e293b" />
        <path d="M3 30 Q45 8 87 30" fill="none" stroke="#1e293b" stroke-width="1.5" />
        <path d="M3 30 Q45 52 87 30" fill="none" stroke="#1e293b" stroke-width="1.5" />
    </svg>
</div>''' if rx.is_opthal and rx.opthal_notes else ''}

<table>
<thead>
{'''<tr>
    <th style="width:5%;">''' + t['sl_no'] + '''</th>
    <th style="width:35%;">''' + t['medicine'] + '''</th>
    <th style="width:10%;text-align:center;">RE</th>
    <th style="width:10%;text-align:center;">LE</th>
    <th style="width:20%;">Dosage</th>
    <th style="width:20%;">''' + t['frequency'] + '''</th>
</tr>''' if eye_format else '''<tr>
    <th style="width:4%;">''' + t['sl_no'] + '''</th>
    <th style="width:22%;">''' + t['medicine'] + '''</th>
    <th style="width:10%;text-align:center;">''' + t['dosage'] + '''</th>
    <th style="width:10%;text-align:center;">''' + t['frequency'] + '''</th>
    <th style="width:12%;text-align:center;">''' + t['duration'] + '''</th>
    <th style="width:8%;text-align:center;">Qty</th>
    <th style="width:10%;text-align:center;">Route</th>
    <th style="width:24%;">''' + t['instructions'] + '''</th>
</tr>'''}
</thead>
<tbody>{items_html}</tbody>
</table>

{f'<div class="advice"><strong>{t["advice"]}:</strong> {_esc(rx.advice)}</div>' if rx.advice else ''}

<div class="footer">
    <div class="signature">
        <p style="margin-bottom:28px;"><strong>{t['prescribing_doctor']}</strong></p>
        <p><strong>{doctor_display}</strong></p>
        {f'<p style="color:#64748b;">{doctor_spec}</p>' if doctor_spec else ''}
        {f'<p style="color:#64748b;">{t["reg_no"]} {doctor_reg}</p>' if doctor_reg else ''}
    </div>
</div>

<div class="generated-note">{t['computer_generated']}</div>
</div>
</body>
</html>"""

    return HTMLResponse(content=html)


# ═══════════════════════════════════════════════════════════════════════════
# Medicine Endpoints
# ═══════════════════════════════════════════════════════════════════════════

medicines_router = APIRouter(prefix="/medicines", tags=["Medicines"])


@medicines_router.post("", response_model=MedicineResponse, status_code=status.HTTP_201_CREATED)
async def create_new_medicine(
    data: MedicineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_edit_guard),
):
    """Add a new medicine to the formulary."""
    try:
        med = create_medicine(db, data.model_dump(), current_user.hospital_id)
        return med
    except Exception as e:
        logger.error(f"Error creating medicine: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create medicine")


@medicines_router.get("", response_model=PaginatedMedicineResponse)
async def list_all_medicines(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=1000),
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_view_or_pharmacist_guard),
):
    """List medicines with search and filtering."""
    total, pg, lim, tp, rows, stock_map = list_medicines(
        db, page, limit,
        hospital_id=current_user.hospital_id,
        search=search, category=category,
    )
    response_rows = []
    for med in rows:
        model = MedicineResponse.model_validate(med)
        model.total_stock = stock_map.get(med.id, 0)
        response_rows.append(model)
    return PaginatedMedicineResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=response_rows,
    )


@medicines_router.get("/frequent", response_model=FrequentMedicinesResponse)
async def get_frequent_medicines(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_view_or_pharmacist_guard),
):
    """Top medicines by prescribing frequency at this hospital — feeds the
    'Frequently Prescribed' quick-pick panel on the New Prescription form."""
    rows = list_frequent_medicines(db, hospital_id=current_user.hospital_id, limit=limit)
    response_rows = []
    for med, count in rows:
        model = MedicineResponse.model_validate(med)
        combined = model.model_dump()
        combined["times_prescribed"] = count
        response_rows.append(FrequentMedicineResponse(**combined))
    return FrequentMedicinesResponse(data=response_rows)


@medicines_router.put("/{medicine_id}", response_model=MedicineResponse)
async def update_med(
    medicine_id: str,
    data: MedicineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_edit_guard),
):
    """Update a medicine."""
    try:
        med_uuid = uuid_mod.UUID(medicine_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Medicine not found")
    med_check = db.query(MedicineModel).filter(
        MedicineModel.id == med_uuid,
        MedicineModel.hospital_id == current_user.hospital_id,
    ).first()
    if not med_check:
        raise HTTPException(status_code=404, detail="Medicine not found")
    med = update_medicine(db, medicine_id, data.model_dump(exclude_unset=True))
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return med


# ═══════════════════════════════════════════════════════════════════════════
# Template Endpoints
# ═══════════════════════════════════════════════════════════════════════════

templates_router = APIRouter(prefix="/prescription-templates", tags=["Prescription Templates"])


@templates_router.post("", response_model=PrescriptionTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_new_template(
    data: PrescriptionTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_edit_guard),
):
    """Create a reusable prescription template."""
    doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
    if not doctor:
        raise HTTPException(status_code=403, detail="Only doctors can create templates")
    try:
        tmpl = create_template(db, data.model_dump(), doctor.id)
        return tmpl
    except Exception as e:
        logger.error(f"Error creating template: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create template")


@templates_router.get("", response_model=list[PrescriptionTemplateResponse])
async def list_my_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_view_guard),
):
    """List prescription templates for the current doctor."""
    doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
    if not doctor:
        return []
    return list_templates(db, doctor.id)


@templates_router.put("/{template_id}", response_model=PrescriptionTemplateResponse)
async def update_tmpl(
    template_id: str,
    data: PrescriptionTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_edit_guard),
):
    """Update a template."""
    try:
        tmpl_uuid = uuid_mod.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Template not found")
    tmpl_check = (
        db.query(PrescriptionTemplate)
        .join(Doctor, PrescriptionTemplate.doctor_id == Doctor.id)
        .filter(PrescriptionTemplate.id == tmpl_uuid, Doctor.hospital_id == current_user.hospital_id)
        .first()
    )
    if not tmpl_check:
        raise HTTPException(status_code=404, detail="Template not found")
    tmpl = update_template(db, template_id, data.model_dump(exclude_unset=True))
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@templates_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tmpl(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_edit_guard),
):
    """Delete a template."""
    try:
        tmpl_uuid = uuid_mod.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Template not found")
    tmpl_check = (
        db.query(PrescriptionTemplate)
        .join(Doctor, PrescriptionTemplate.doctor_id == Doctor.id)
        .filter(PrescriptionTemplate.id == tmpl_uuid, Doctor.hospital_id == current_user.hospital_id)
        .first()
    )
    if not tmpl_check:
        raise HTTPException(status_code=404, detail="Template not found")
    if not delete_template(db, template_id):
        raise HTTPException(status_code=404, detail="Template not found")


@templates_router.post("/{template_id}/use", status_code=status.HTTP_200_OK)
async def use_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(rx_new_edit_guard),
):
    """Increment usage counter when template is used."""
    try:
        tmpl_uuid = uuid_mod.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Template not found")
    tmpl_check = (
        db.query(PrescriptionTemplate)
        .join(Doctor, PrescriptionTemplate.doctor_id == Doctor.id)
        .filter(PrescriptionTemplate.id == tmpl_uuid, Doctor.hospital_id == current_user.hospital_id)
        .first()
    )
    if not tmpl_check:
        raise HTTPException(status_code=404, detail="Template not found")
    increment_template_usage(db, template_id)
    return {"message": "Template usage recorded"}
