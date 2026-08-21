"""
Patients router — works with new hms_db UUID schema.
"""
import asyncio
import logging
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from math import ceil
from ..database import get_db
from ..schemas.patient import (
    PatientCreate,
    PatientUpdate,
    PatientResponse,
    PatientListItem,
    PaginatedPatientResponse,
    SendEmailVerificationResponse,
    VerifyEmailRequest,
    VerifyEmailCodeRequest,
    VerifyPhoneOtpRequest,
    PatientVerificationStatus,
    PatientLastVisitResponse,
    PatientTrendResponse,
    PatientMedicalConditionsUpdate,
)
from ..models.patient import Patient
from ..models.appointment import Doctor
from ..models.user import User, Hospital
from ..dependencies import get_current_active_user, require_any_role
from ..core.module_roles import require_permission, check_permission
from ..core.tenant_security import is_eye_hospital_feature_enabled
from ..core.audit_logger import AuditLogger, AuditAction
from ..config import settings
from ..services.patient_service import (
    create_patient,
    get_patient_by_id,
    get_patient_by_mobile,
    get_patient_by_email,
    update_patient,
    soft_delete_patient,
    save_patient_photo,
    list_patients as list_patients_service,
    generate_email_verification_token,
    can_resend_email_verification,
    verify_email_token,
    verify_email_code,
    get_patient_last_visit,
    get_new_vs_returning_trend,
    EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
)
from ..services.email_service import send_patient_verification_email, send_email_with_attachment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patients", tags=["Patients"])

# Role guards driven by the shared "general.patients" permission matrix
# (backend/app/core/module_roles.py — see docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md).
patient_create_role_guard = require_permission("general.patients", "edit")
patient_read_role_guard = require_permission("general.patients", "view")
patient_update_role_guard = require_permission("general.patients", "edit")
patient_delete_role_guard = require_permission("general.patients", "edit")
# Dashboard trend chart — Doctor + Admin only, deliberately narrower than the
# general.patients view permission (e.g. receptionist/nurse can view patient
# records but this chart isn't meant for their dashboards).
patient_trend_role_guard = require_any_role("doctor", "admin", "super_admin")


_PATIENT_SEARCH_CARVEOUT_ROLES = {"pharmacist", "optical_staff"}


def _patient_read_or_write_with_pharmacist(level: str):
    """Narrow carve-out letting a pharmacist or optical_staff user search
    for/view an existing patient, or register a new one, from their own
    walk-in flows (PrescriptionBuilder.tsx's patient search + "Register as
    new patient" round trip via Register.tsx for pharmacist;
    NewOpticalPrescription.tsx / NewOpticalSale.tsx's own patient search +
    the same Register.tsx round trip for optical_staff) — without granting
    the full "general.patients" edit right, which also gates updating and
    soft-deleting ANY patient's demographic record (patient_update_role_guard
    / patient_delete_role_guard below, deliberately left untouched by this
    carve-out). Only the three endpoints these roles actually need here
    (list/search, get one, create) use this guard instead.

    optical_staff has no entry at all in the "general.patients" matrix (see
    module_roles.py), so every patient search in the Optical module 403'd
    silently — NewOpticalPrescription.tsx's search effect swallows the error
    into an empty suggestion list, which read as "the patient number isn't
    suggesting anything" rather than an obvious permission error.

    Mirrors the rx_new_edit_or_pharmacist_guard carve-out pattern already
    used in prescriptions.py for the same kind of narrowly-scoped addition.
    """
    async def _dependency(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db),
    ):
        roles = {str(r).strip().lower() for r in (current_user.roles or [])}
        if roles & _PATIENT_SEARCH_CARVEOUT_ROLES:
            return current_user
        if check_permission(db, current_user, "general.patients", level):
            return current_user
        logger.warning(
            "RBAC deny (general.patients/pharmacist+optical_staff carve-out) user=%s roles=%s level=%s",
            getattr(current_user, "username", "unknown"), roles, level,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role permissions")

    return _dependency


patient_create_or_pharmacist_guard = _patient_read_or_write_with_pharmacist("edit")
patient_read_or_pharmacist_guard = _patient_read_or_write_with_pharmacist("view")


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_new_patient(
    patient: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_create_or_pharmacist_guard),
):
    """Create a new patient with auto-generated PRN"""
    try:
        # Enforce subscription patient quota (non-super-admins only)
        if "super_admin" not in current_user.roles:
            from ..services.user_capacity_service import UserCapacityValidator
            from ..core.tenant_security import TenantValidator
            tenant = TenantValidator.get_tenant_for_user(current_user, db)
            if tenant:
                UserCapacityValidator.validate_patient_creation(tenant.id, db)

        # Check phone uniqueness within this hospital only (multi-tenant: same
        # phone is valid across different hospitals)
        existing_patient = get_patient_by_mobile(
            db, patient.phone_number, hospital_id=current_user.hospital_id
        )
        if existing_patient:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A patient with this phone number already exists in this hospital",
            )

        # Check email uniqueness within this hospital only (email is optional,
        # so only enforce this when the patient actually provided one).
        if patient.email:
            existing_email_patient = get_patient_by_email(
                db, patient.email, hospital_id=current_user.hospital_id
            )
            if existing_email_patient:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A patient with this email address already exists in this hospital",
                )

        # Patient History block is part of the eye-hospital feature pack —
        # ignore it for hospitals not classified eye_hospital/multi_specialty.
        if not is_eye_hospital_feature_enabled(current_user.hospital):
            patient.reason_for_visit = None
            patient.symptoms = None
            patient.blood_sugar_value = None
            patient.blood_sugar_unit = None

        db_patient = create_patient(
            db,
            patient,
            user_id=current_user.id,
            hospital_id=current_user.hospital_id,
        )
        logger.info("Patient registered: %s (PRN=%s) by user %s",
                    f"{patient.first_name} {patient.last_name}",
                    db_patient.patient_reference_number, current_user.username)
        return PatientResponse.model_validate(db_patient)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating patient: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create patient. Please try again.",
        )


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_read_or_pharmacist_guard),
):
    """Get patient by ID"""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return PatientResponse.model_validate(patient)


@router.put("/{patient_id}/medical-conditions", response_model=PatientResponse)
async def update_medical_conditions(
    patient_id: str,
    data: PatientMedicalConditionsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Save the fixed "Condition / History" checklist (Prescription Builder,
    below Prescription History) — a narrow, dedicated endpoint rather than
    routing through the general PUT /{patient_id} (which requires the full
    PatientUpdate payload); this only ever touches medical_conditions."""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    patient.medical_conditions = [entry.model_dump() for entry in data.medical_conditions]
    db.commit()
    db.refresh(patient)
    return PatientResponse.model_validate(patient)


@router.get("", response_model=PaginatedPatientResponse)
async def list_patients(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    gender: Optional[str] = None,
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    sort_by: Optional[str] = None,
    sort_order: str = Query('desc', pattern='^(asc|desc)$'),
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_read_or_pharmacist_guard),
):
    """List all patients with pagination, search, filters and sorting"""
    try:
        result = list_patients_service(
            db, page, limit, search,
            hospital_id=current_user.hospital_id,
            gender=gender,
            blood_group=blood_group,
            city=city,
            status=status_filter,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        return result
    except Exception as e:
        logger.error(f"Error listing patients: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve patients.",
        )


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_existing_patient(
    patient_id: str,
    patient_data: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Update patient information"""
    try:
        db_patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
        if not db_patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        # Check phone uniqueness within this hospital only
        if patient_data.phone_number != db_patient.phone_number:
            existing = get_patient_by_mobile(
                db, patient_data.phone_number, hospital_id=current_user.hospital_id
            )
            if existing and str(existing.id) != patient_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phone number already exists in this hospital",
                )

        # Check email uniqueness within this hospital only (skip if unchanged/blank)
        if patient_data.email and patient_data.email != db_patient.email:
            existing_email = get_patient_by_email(
                db, patient_data.email, hospital_id=current_user.hospital_id
            )
            if existing_email and str(existing_email.id) != patient_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A patient with this email address already exists in this hospital",
                )

        if not is_eye_hospital_feature_enabled(current_user.hospital):
            patient_data.reason_for_visit = None
            patient_data.symptoms = None
            patient_data.blood_sugar_value = None
            patient_data.blood_sugar_unit = None

        updated = update_patient(db, patient_id, patient_data, current_user.id, hospital_id=current_user.hospital_id)
        return PatientResponse.model_validate(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating patient {patient_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update patient.",
        )


@router.post("/{patient_id}/email-id-card")
async def email_id_card(
    patient_id: str,
    pdf_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_read_role_guard),
):
    """Email the patient's ID card PDF (generated client-side in
    PatientIdCard.tsx) as an attachment. This endpoint never existed before
    — the frontend button called a route with no backend implementation."""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not patient.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Patient has no email address on file")

    pdf_bytes = await pdf_file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded PDF is empty")

    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    h_name = hospital.name if hospital else settings.HOSPITAL_NAME

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto;">
            <p style="font-size: 16px;">Dear <strong>{patient.full_name}</strong>,</p>
            <p>Please find your Patient ID Card attached to this email.</p>
            <p style="color: #6b7280; font-size: 12px;">
                This is a system-generated email from {h_name}. Please do not reply to this email.
            </p>
        </div>
    </body>
    </html>
    """
    sent = await asyncio.to_thread(
        send_email_with_attachment,
        patient.email,
        f"{h_name} - Patient ID Card",
        html_body,
        pdf_bytes,
        f"ID-Card-{patient.patient_reference_number}.pdf",
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send email — check SMTP configuration.",
        )

    AuditLogger.log(
        action=AuditAction.PATIENT_UPDATE,
        user=current_user,
        tenant=None,
        resource_type="patient",
        resource_id=patient.id,
        metadata={"action": "email_id_card", "email": patient.email},
    )
    return {"message": f"ID card sent to {patient.email}"}


@router.post("/{patient_id}/photo", response_model=PatientResponse)
async def upload_patient_photo(
    patient_id: str,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Upload/replace a patient's profile photo."""
    try:
        patient = save_patient_photo(db, patient_id, photo, hospital_id=current_user.hospital_id)
        return PatientResponse.model_validate(patient)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading photo for patient {patient_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload photo.",
        )


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_delete_role_guard),
):
    """Soft delete a patient"""
    try:
        patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found",
            )

        soft_delete_patient(db, patient_id, current_user.id, hospital_id=current_user.hospital_id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting patient {patient_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete patient.",
        )


@router.get("/{patient_id}/last-visit", response_model=PatientLastVisitResponse)
async def get_last_visit(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_read_role_guard),
):
    """Most recent visit date for the OPD assignment confirm dialog (BRD_OP_1 §3.3.2)."""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    last_visit = get_patient_last_visit(db, patient_id, hospital_id=current_user.hospital_id)
    return PatientLastVisitResponse(last_visit_date=last_visit)


@router.post("/{patient_id}/send-email-verification", response_model=SendEmailVerificationResponse)
async def send_email_verification(
    patient_id: str,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Send/resend the patient's email verification link (BRD_OP_1 §3.2.1)."""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not patient.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Patient has no email address on file")
    if patient.is_email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already verified")
    if not can_resend_email_verification(db, patient):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS} seconds before requesting another verification email",
        )

    raw_token, raw_code = generate_email_verification_token(db, patient, user_id=current_user.id)
    origin = request.headers.get("origin", "") if request else ""
    if not origin:
        origin = settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else "http://localhost:5173"
    verification_link = f"{origin}/verify-email?token={raw_token}"
    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    sent = await asyncio.to_thread(
        send_patient_verification_email,
        patient.email, patient.full_name, verification_link, raw_code,
        hospital_name=hospital.name if hospital else "",
    )

    AuditLogger.log(
        action=AuditAction.PATIENT_EMAIL_VERIFICATION_SENT,
        user=current_user,
        tenant=None,
        resource_type="patient",
        resource_id=patient.id,
        metadata={"email": patient.email, "sent": sent},
    )
    logger.info("Email verification sent for patient id=%s by user %s", patient_id, current_user.username)
    if sent:
        message = "Verification email sent"
    elif not settings.SMTP_HOST:
        # send_patient_verification_email() short-circuits to False without
        # attempting anything when SMTP isn't set up at all — distinct from
        # a real send failure below, which staff should actually act on.
        message = "Verification link generated (email delivery not configured)"
    else:
        message = "Verification link generated, but the email failed to send — check server logs or resend"
    return SendEmailVerificationResponse(
        cooldown_seconds=EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
        message=message,
    )


@router.post("/verify-email", response_model=PatientVerificationStatus)
async def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
):
    """Confirm a patient's email via the link they clicked. Unauthenticated —
    patients have no login in this system, so token possession alone is the
    proof of identity (single-use, 24h expiry — see patient_service.verify_email_token)."""
    patient, reason = verify_email_token(db, payload.token)
    if not patient:
        expired = reason == "expired"
        AuditLogger.log(
            action=AuditAction.PATIENT_EMAIL_VERIFICATION_EXPIRED if expired
            else AuditAction.PATIENT_EMAIL_VERIFICATION_FAILED,
            user=None,
            tenant=None,
            resource_type="patient",
            error="Expired token" if expired else "Invalid or used token",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link has expired — please request a new one" if expired
            else "Invalid or already-used verification link",
        )

    AuditLogger.log(
        action=AuditAction.PATIENT_EMAIL_VERIFIED,
        user=None,
        tenant=None,
        resource_type="patient",
        resource_id=patient.id,
    )
    logger.info("Email verified for patient id=%s", patient.id)
    return PatientVerificationStatus(
        is_email_verified=patient.is_email_verified,
        is_phone_verified=patient.is_phone_verified,
        is_verified=patient.is_email_verified and patient.is_phone_verified,
    )


@router.post("/{patient_id}/verify-email-code", response_model=PatientVerificationStatus)
async def verify_email_code_endpoint(
    patient_id: str,
    payload: VerifyEmailCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Staff-entered alternative to clicking the emailed link — the desk
    reads the 6-digit code back from the patient and types it in, confirming
    the email address is correct without depending on the patient's mail
    client rendering the link (BRD_OP_1 §3.2.1 allows "link or code")."""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    verified_patient, reason = verify_email_code(db, patient.id, payload.code)
    if not verified_patient:
        expired = reason == "expired"
        AuditLogger.log(
            action=AuditAction.PATIENT_EMAIL_VERIFICATION_EXPIRED if expired
            else AuditAction.PATIENT_EMAIL_VERIFICATION_FAILED,
            user=current_user,
            tenant=None,
            resource_type="patient",
            resource_id=patient.id,
            error="Expired code" if expired else "Incorrect or used code",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired — please resend" if expired else "Incorrect code",
        )

    AuditLogger.log(
        action=AuditAction.PATIENT_EMAIL_VERIFIED,
        user=current_user,
        tenant=None,
        resource_type="patient",
        resource_id=verified_patient.id,
        metadata={"method": "code"},
    )
    logger.info("Email verified via code for patient id=%s by user %s", patient_id, current_user.username)
    return PatientVerificationStatus(
        is_email_verified=verified_patient.is_email_verified,
        is_phone_verified=verified_patient.is_phone_verified,
        is_verified=verified_patient.is_email_verified and verified_patient.is_phone_verified,
    )


@router.post("/{patient_id}/send-phone-otp")
async def send_phone_otp_stub(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Phone/SMS OTP verification is not yet implemented — no SMS gateway is
    integrated (BRD_OP_1_Development_Plan.md Phase 3d, deferred). This stub
    exists so the frontend "Send OTP" button calls a real endpoint rather
    than faking success client-side."""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="SMS verification is not yet available",
    )


@router.get("/stats/new-vs-returning", response_model=PatientTrendResponse)
async def get_new_vs_returning_patient_trend(
    granularity: str = Query("day", pattern="^(day|week|month|custom)$"),
    date_from: Optional[date] = Query(None, description="Required when granularity=custom"),
    date_to: Optional[date] = Query(None, description="Required when granularity=custom"),
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_trend_role_guard),
):
    """Dashboard chart data (Doctor + Admin only). A doctor sees only their
    own patients; admin/super_admin see the whole hospital — resolved from
    the caller's role, never a client-supplied doctor_id, so a doctor can't
    query another doctor's numbers.

    granularity=day/week are single-period snapshots (today only / this week
    only); month is a 6-month trend; custom requires date_from/date_to and
    buckets by day across that explicit range."""
    doctor_id = None
    is_admin = any(r in ("admin", "super_admin") for r in (current_user.roles or []))
    if not is_admin and "doctor" in (current_user.roles or []):
        doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
        if not doctor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor profile not found")
        doctor_id = doctor.id

    try:
        return get_new_vs_returning_trend(
            db, current_user.hospital_id, granularity=granularity, doctor_id=doctor_id,
            date_from=date_from, date_to=date_to,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{patient_id}/verify-phone-otp")
async def verify_phone_otp_stub(
    patient_id: str,
    payload: VerifyPhoneOtpRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(patient_update_role_guard),
):
    """Stub matching send-phone-otp above — real OTP verification is not
    wired up yet. Kept symmetric so the frontend's OTP-entry flow gets a
    consistent 501 instead of a raw 404 until this is implemented."""
    patient = get_patient_by_id(db, patient_id, hospital_id=current_user.hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="SMS verification is not yet available",
    )

