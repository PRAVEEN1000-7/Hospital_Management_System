"""
Patient service — works with new hms_db UUID schema.
"""
import hashlib
import logging
import os
import secrets
import shutil
import uuid
from datetime import date, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from math import ceil
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from ..config import settings
from ..models.appointment import Appointment
from ..models.patient import Patient, PatientEmailVerificationToken
from ..models.user import Hospital
from ..schemas.patient import PatientCreate, PatientUpdate, PaginatedPatientResponse, PatientListItem
from ..services.patient_id_service import generate_patient_id
from ..core.hospital_time import hospital_today_by_id, hospital_local_date
from .user_service import (
    UPLOAD_DIR,
    ALLOWED_PHOTO_EXTENSIONS,
    MAX_PHOTO_SIZE_MB,
    ensure_upload_directory,
    _has_valid_photo_signature,
)

EMAIL_VERIFICATION_TOKEN_TTL_HOURS = 24
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60
EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS = 5

logger = logging.getLogger(__name__)


def generate_prn(db: Session, hospital_id: uuid.UUID, gender: str = "Unknown") -> str:
    return generate_patient_id(db, hospital_id, gender)


def create_patient(
    db: Session, patient_data: PatientCreate, user_id: uuid.UUID, hospital_id: uuid.UUID
) -> Patient:
    prn = generate_prn(db, hospital_id, gender=patient_data.gender)
    db_patient = Patient(
        hospital_id=hospital_id,
        patient_reference_number=prn,
        title=getattr(patient_data, 'title', None),
        first_name=patient_data.first_name,
        last_name=patient_data.last_name,
        date_of_birth=patient_data.date_of_birth,
        gender=patient_data.gender,
        blood_group=patient_data.blood_group,
        phone_country_code=patient_data.phone_country_code,
        phone_number=patient_data.phone_number,
        email=patient_data.email,
        address_line_1=patient_data.address_line_1,
        address_line_2=patient_data.address_line_2,
        city=patient_data.city,
        state_province=getattr(patient_data, 'state', None) or getattr(patient_data, 'state_province', None),
        postal_code=getattr(patient_data, 'pin_code', None) or getattr(patient_data, 'postal_code', None),
        country=patient_data.country,
        age_years=patient_data.age_years,
        age_months=patient_data.age_months,
        marital_status=patient_data.marital_status,
        emergency_contact_name=patient_data.emergency_contact_name,
        emergency_contact_phone=patient_data.emergency_contact_phone,
        emergency_contact_country_code=getattr(patient_data, 'emergency_contact_country_code', None) or '+91',
        emergency_contact_relation=patient_data.emergency_contact_relation,
        reason_for_visit=getattr(patient_data, 'reason_for_visit', None),
        symptoms=getattr(patient_data, 'symptoms', None),
        blood_sugar_value=getattr(patient_data, 'blood_sugar_value', None),
        blood_sugar_unit=getattr(patient_data, 'blood_sugar_unit', None),
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


def get_patient_by_id(
    db: Session,
    patient_id: str | uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
) -> Optional[Patient]:
    if isinstance(patient_id, str):
        try:
            patient_id = uuid.UUID(patient_id)
        except ValueError:
            return None
    q = db.query(Patient).filter(Patient.id == patient_id, Patient.is_deleted == False)
    if hospital_id is not None:
        q = q.filter(Patient.hospital_id == hospital_id)
    return q.first()


def get_patient_by_mobile(db: Session, phone_number: str, hospital_id=None) -> Optional[Patient]:
    """Find a patient by phone within a specific hospital (multi-tenant safe).

    hospital_id must always be provided in multi-tenant mode so the uniqueness
    check is scoped per-hospital. Omitting it would falsely block registrations
    across different hospitals that share the same phone number.
    """
    q = db.query(Patient).filter(
        Patient.phone_number == phone_number,
        Patient.is_deleted == False,
    )
    if hospital_id is not None:
        q = q.filter(Patient.hospital_id == hospital_id)
    return q.first()


def get_patient_by_email(db: Session, email: str, hospital_id=None) -> Optional[Patient]:
    """Find a patient by email within a specific hospital (multi-tenant safe).

    Case-insensitive, same rationale as get_patient_by_mobile — email is
    optional on a patient record, so callers must skip this check when blank.
    """
    q = db.query(Patient).filter(
        func.lower(Patient.email) == email.lower(),
        Patient.is_deleted == False,
    )
    if hospital_id is not None:
        q = q.filter(Patient.hospital_id == hospital_id)
    return q.first()


def get_patient_by_prn(db: Session, prn: str) -> Optional[Patient]:
    return db.query(Patient).filter(Patient.patient_reference_number == prn, Patient.is_deleted == False).first()


def list_patients(
    db: Session, page: int = 1, limit: int = 10,
    search: Optional[str] = None,
    hospital_id: Optional[uuid.UUID] = None,
    gender: Optional[str] = None,
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = 'desc',
) -> PaginatedPatientResponse:
    query = db.query(Patient).filter(Patient.is_active == True, Patient.is_deleted == False)
    if hospital_id:
        query = query.filter(Patient.hospital_id == hospital_id)
    if search:
        search = search.strip()
        # Full-name concat match (e.g. "Alex Johnson")
        full_name = func.concat(Patient.first_name, ' ', Patient.last_name)
        # Only include email in search when the term looks like an email (contains @)
        # This prevents domain-only searches like 'gmail' from matching unintended patients
        include_email = '@' in search
        base_conditions = [
            Patient.first_name.ilike(f"%{search}%"),
            Patient.last_name.ilike(f"%{search}%"),
            Patient.phone_number.ilike(f"%{search}%"),
            Patient.patient_reference_number.ilike(f"%{search}%"),
            full_name.ilike(f"%{search}%"),
        ]
        if include_email:
            base_conditions.append(Patient.email.ilike(f"%{search}%"))
        search_filter = or_(*base_conditions)
        # Multi-word: each word must match at least one field
        words = search.split()
        if len(words) > 1:
            per_word_filters = []
            for word in words:
                w = word.strip()
                if not w:
                    continue
                word_conditions = [
                    Patient.first_name.ilike(f"%{w}%"),
                    Patient.last_name.ilike(f"%{w}%"),
                    Patient.phone_number.ilike(f"%{w}%"),
                    Patient.patient_reference_number.ilike(f"%{w}%"),
                ]
                if '@' in w:
                    word_conditions.append(Patient.email.ilike(f"%{w}%"))
                per_word_filters.append(or_(*word_conditions))
            if per_word_filters:
                search_filter = or_(search_filter, and_(*per_word_filters))
        query = query.filter(search_filter)
    # Server-side filters (applied before pagination — fixes empty page bug)
    if gender:
        query = query.filter(Patient.gender.ilike(gender))
    if blood_group:
        query = query.filter(Patient.blood_group == blood_group)
    if city:
        query = query.filter(Patient.city.ilike(f"%{city}%"))
    if status:
        is_deleted = status == 'inactive'
        query = query.filter(Patient.is_deleted == is_deleted)
    total = query.count()
    offset = (page - 1) * limit
    # Build ORDER BY — only allow known safe column names to prevent injection
    _sortable = {
        'created_at': Patient.created_at,
        'updated_at': Patient.updated_at,
        'first_name': Patient.first_name,
        'patient_reference_number': Patient.patient_reference_number,
    }
    sort_col = _sortable.get(sort_by, Patient.created_at)
    order_clause = sort_col.asc() if sort_order == 'asc' else sort_col.desc()
    patients = query.order_by(order_clause).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if limit > 0 else 0
    return PaginatedPatientResponse(
        total=total, page=page, limit=limit, total_pages=total_pages,
        data=[PatientListItem.model_validate(p) for p in patients],
    )


def update_patient(
    db: Session, patient_id: str | uuid.UUID, patient_data: PatientUpdate, user_id: uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
) -> Optional[Patient]:
    db_patient = get_patient_by_id(db, patient_id, hospital_id=hospital_id)
    if not db_patient:
        return None
    update_fields = patient_data.model_dump(exclude_unset=True)
    # Editing a verified email/phone must clear its verified status — BRD_OP_1
    # §3.2.1/§3.2.2. Compare before the generic setattr loop overwrites the
    # old value.
    if "email" in update_fields and update_fields["email"] != db_patient.email and db_patient.is_email_verified:
        db_patient.is_email_verified = False
        db_patient.email_verified_at = None
    if (
        "phone_number" in update_fields
        and update_fields["phone_number"] != db_patient.phone_number
        and db_patient.is_phone_verified
    ):
        db_patient.is_phone_verified = False
        db_patient.phone_verified_at = None
    for field, value in update_fields.items():
        if hasattr(db_patient, field):
            setattr(db_patient, field, value)
    db_patient.updated_by = user_id
    db.commit()
    db.refresh(db_patient)
    return db_patient


def generate_email_verification_token(db: Session, patient: Patient, user_id: Optional[uuid.UUID] = None) -> tuple[str, str]:
    """Issue a single-use email verification token plus a 6-digit code,
    invalidating any unused ones already outstanding for this patient
    (mirrors auth.py's forgot_password token-issuance pattern). Both the
    token (emailed as a link) and the code (read back by the patient to
    the front desk) confirm the same record — BRD_OP_1 §3.2.1 allows
    either. Returns (raw_token, raw_code)."""
    db.query(PatientEmailVerificationToken).filter(
        PatientEmailVerificationToken.patient_id == patient.id,
        PatientEmailVerificationToken.used_at.is_(None),
    ).delete()

    raw_token = secrets.token_urlsafe(32)
    raw_code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(PatientEmailVerificationToken(
        patient_id=patient.id,
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        code_hash=hashlib.sha256(raw_code.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_TOKEN_TTL_HOURS),
        created_by=user_id,
    ))
    db.commit()
    return raw_token, raw_code


def can_resend_email_verification(db: Session, patient: Patient) -> bool:
    latest = (
        db.query(PatientEmailVerificationToken)
        .filter(PatientEmailVerificationToken.patient_id == patient.id)
        .order_by(PatientEmailVerificationToken.created_at.desc())
        .first()
    )
    if not latest or not latest.created_at:
        return True
    created_at = latest.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - created_at).total_seconds()
    return elapsed >= EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS


def verify_email_token(db: Session, raw_token: str) -> tuple[Optional[Patient], str]:
    """Validate a single-use email verification token and mark the owning
    patient's email verified. Returns (patient, reason) where reason is one
    of "ok" | "invalid" | "expired" — the caller distinguishes expired from
    invalid for the audit trail (BRD_OP_1 §4)."""
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    record = db.query(PatientEmailVerificationToken).filter(
        PatientEmailVerificationToken.token_hash == token_hash,
        PatientEmailVerificationToken.used_at.is_(None),
    ).first()
    if not record:
        return None, "invalid"

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        return None, "expired"

    patient = get_patient_by_id(db, record.patient_id)
    if not patient:
        return None, "invalid"

    now = datetime.now(timezone.utc)
    record.used_at = now
    patient.is_email_verified = True
    patient.email_verified_at = now
    db.commit()
    db.refresh(patient)
    return patient, "ok"


def verify_email_code(db: Session, patient_id: uuid.UUID, raw_code: str) -> tuple[Optional[Patient], str]:
    """Validate the 6-digit code counterpart to verify_email_token — lets
    staff confirm a patient's email is correct by having them read the code
    back, without depending on the patient's mail client rendering the link
    (BRD_OP_1 §3.2.1's "link or code"). Attempts are capped since a 6-digit
    code, unlike the link token, is guessable. Returns (patient, reason)
    where reason is "ok" | "invalid" | "expired"."""
    record = (
        db.query(PatientEmailVerificationToken)
        .filter(
            PatientEmailVerificationToken.patient_id == patient_id,
            PatientEmailVerificationToken.used_at.is_(None),
        )
        .order_by(PatientEmailVerificationToken.created_at.desc())
        .first()
    )
    if not record or not record.code_hash:
        return None, "invalid"

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        return None, "expired"

    if record.attempts_count >= record.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many incorrect attempts. Request a new verification email.",
        )

    if hashlib.sha256(raw_code.encode()).hexdigest() != record.code_hash:
        record.attempts_count += 1
        db.commit()
        return None, "invalid"

    patient = get_patient_by_id(db, patient_id)
    if not patient:
        return None, "invalid"

    now = datetime.now(timezone.utc)
    record.used_at = now
    patient.is_email_verified = True
    patient.email_verified_at = now
    db.commit()
    db.refresh(patient)
    return patient, "ok"


def get_patient_last_visit(db: Session, patient_id: str | uuid.UUID, hospital_id: Optional[uuid.UUID] = None):
    """Most recent visit date for a patient, for the OPD assignment confirm
    dialog (BRD_OP_1 §3.3.2) — no "last visit" concept exists elsewhere in
    the schema, so this is derived from Appointment.appointment_date."""
    if isinstance(patient_id, str):
        try:
            patient_id = uuid.UUID(patient_id)
        except ValueError:
            return None
    query = db.query(func.max(Appointment.appointment_date)).filter(Appointment.patient_id == patient_id)
    if hospital_id is not None:
        query = query.filter(Appointment.hospital_id == hospital_id)
    return query.scalar()


def soft_delete_patient(
    db: Session, patient_id: str | uuid.UUID, user_id: uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
) -> Optional[Patient]:
    patient = get_patient_by_id(db, patient_id, hospital_id=hospital_id)
    if not patient:
        return None
    patient.is_deleted = True
    patient.updated_by = user_id
    db.commit()
    return patient


def save_patient_photo(
    db: Session, patient_id: str | uuid.UUID, file: UploadFile, hospital_id: Optional[uuid.UUID] = None
) -> Patient:
    """Save a patient's profile photo — mirrors user_service.save_user_photo's
    validation (extension + magic-byte signature + size) and shares the same
    upload directory, distinguished by a "patient_" filename prefix.
    """
    ensure_upload_directory()

    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(sorted(ALLOWED_PHOTO_EXTENSIONS))}",
        )

    if file_ext == '.jpeg':
        file_ext = '.jpg'

    if not _has_valid_photo_signature(file, file_ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match its extension.",
        )

    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)

    file_size_mb = file_size_bytes / (1024 * 1024)
    if file_size_mb > MAX_PHOTO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_PHOTO_SIZE_MB}MB",
        )

    patient = get_patient_by_id(db, patient_id, hospital_id=hospital_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    if patient.photo_url:
        old_photo_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), patient.photo_url.lstrip('/')
        )
        if os.path.exists(old_photo_path):
            try:
                os.remove(old_photo_path)
            except Exception:
                pass

    filename = f"patient_{patient.id}_{int(datetime.now().timestamp())}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error("Failed to write photo file for patient %s: %s", patient_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save photo. Please try again.",
        )

    patient.photo_url = f"/uploads/photos/{filename}"
    db.commit()
    db.refresh(patient)
    return patient


# ── New-vs-returning patient trend (Doctor + Admin Dashboard chart) ────────

# "day"/"week" are single-period snapshots (today only / this week only, not
# a multi-period trend) — periods=1 against _generate_trend_buckets' existing
# start-from-today math naturally collapses to exactly that one bucket.
# "month" stays a genuine multi-period trend (6 months).
_TREND_PERIODS = {"day": 1, "week": 1, "month": 6}
_CUSTOM_RANGE_MAX_DAYS = 92  # ~3 months — keeps the chart readable and the query bounded


def _month_bucket_end(bucket_start: date) -> date:
    if bucket_start.month == 12:
        next_month_start = bucket_start.replace(year=bucket_start.year + 1, month=1)
    else:
        next_month_start = bucket_start.replace(month=bucket_start.month + 1)
    return next_month_start - timedelta(days=1)


def _shift_months(bucket_start: date, n: int) -> date:
    total = bucket_start.year * 12 + (bucket_start.month - 1) + n
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


def _generate_trend_buckets(granularity: str, periods: int, today: date) -> list[tuple[date, date]]:
    """Full chronological list of (bucket_start, bucket_end) pairs ending
    with the bucket containing `today` — generated up front (not derived
    from query results) so a period with zero visits still shows as a
    genuine 0 on the chart instead of silently disappearing from the axis."""
    if granularity == "day":
        start = today - timedelta(days=periods - 1)
        return [(start + timedelta(days=i), start + timedelta(days=i)) for i in range(periods)]
    if granularity == "week":
        this_week_start = today - timedelta(days=today.weekday())  # Monday
        start = this_week_start - timedelta(weeks=periods - 1)
        return [
            (start + timedelta(weeks=i), start + timedelta(weeks=i) + timedelta(days=6))
            for i in range(periods)
        ]
    # month
    this_month_start = today.replace(day=1)
    start = _shift_months(this_month_start, -(periods - 1))
    return [
        (_shift_months(start, i), _month_bucket_end(_shift_months(start, i)))
        for i in range(periods)
    ]


def _generate_custom_range_buckets(date_from: date, date_to: date) -> list[tuple[date, date]]:
    """One bucket per calendar day across an explicit [date_from, date_to]
    range — backs the dashboard chart's custom date-range picker."""
    if date_from > date_to:
        raise ValueError("date_from must not be after date_to")
    span_days = (date_to - date_from).days + 1
    if span_days > _CUSTOM_RANGE_MAX_DAYS:
        raise ValueError(f"Custom date range cannot exceed {_CUSTOM_RANGE_MAX_DAYS} days")
    return [(date_from + timedelta(days=i), date_from + timedelta(days=i)) for i in range(span_days)]


def _trend_bucket_label(granularity: str, start: date, end: date) -> str:
    if granularity in ("day", "custom"):
        return start.strftime("%d %b")
    if granularity == "week":
        return f"{start.strftime('%d %b')} - {end.strftime('%d %b')}"
    return start.strftime("%b %Y")


def get_new_vs_returning_trend(
    db: Session,
    hospital_id: uuid.UUID,
    granularity: str = "day",
    doctor_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict:
    """
    New-vs-returning patient trend for the Dashboard chart (Doctor + Admin
    only — see routers/patients.py's role guard).

    Anchored on actual visits, not raw sign-ups: for every non-cancelled,
    non-rescheduled appointment in the window, the patient counts as "new"
    if their registration (Patient.created_at, read in the hospital's own
    configured timezone — never the server's) falls in the SAME bucket as
    that appointment, or "returning" if they'd already registered before the
    bucket started. A patient who registers but never books a visit isn't
    counted in either series — this tracks footfall, not raw registrations.

    doctor_id scopes both series to one doctor's own patients (the Doctor
    Dashboard's view); omit it for the hospital-wide Admin Dashboard view.

    granularity="day"/"week" are single-period snapshots (today only / this
    week only). "month" is a genuine 6-month trend. granularity="custom"
    requires date_from/date_to and buckets by day across that explicit range
    (capped at _CUSTOM_RANGE_MAX_DAYS) — backs the dashboard's date-range
    picker.
    """
    today = hospital_today_by_id(db, hospital_id)

    if granularity == "custom":
        if not date_from or not date_to:
            raise ValueError("date_from and date_to are required for granularity=custom")
        buckets = _generate_custom_range_buckets(date_from, date_to)
    else:
        granularity = granularity if granularity in _TREND_PERIODS else "day"
        periods = _TREND_PERIODS[granularity]
        buckets = _generate_trend_buckets(granularity, periods, today)

    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    tz_name = hospital.timezone if hospital else None

    range_start, range_end = buckets[0][0], buckets[-1][1]

    query = (
        db.query(Appointment.patient_id, Appointment.appointment_date, Patient.created_at)
        .join(Patient, Patient.id == Appointment.patient_id)
        .filter(
            Appointment.hospital_id == hospital_id,
            Appointment.appointment_date >= range_start,
            Appointment.appointment_date <= range_end,
            Appointment.status.notin_(["cancelled", "rescheduled"]),
        )
    )
    if doctor_id:
        query = query.filter(Appointment.doctor_id == doctor_id)

    new_sets: dict[date, set] = {b[0]: set() for b in buckets}
    returning_sets: dict[date, set] = {b[0]: set() for b in buckets}

    for patient_id, appt_date, created_at in query.all():
        bucket = next((b for b in buckets if b[0] <= appt_date <= b[1]), None)
        if not bucket:
            continue
        bucket_start, bucket_end = bucket
        reg_date = hospital_local_date(created_at, tz_name)
        if reg_date is not None and bucket_start <= reg_date <= bucket_end:
            new_sets[bucket_start].add(patient_id)
        else:
            returning_sets[bucket_start].add(patient_id)

    return {
        "granularity": granularity,
        "scope": "doctor" if doctor_id else "hospital",
        "buckets": [
            {
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "label": _trend_bucket_label(granularity, start, end),
                "new_patients": len(new_sets[start]),
                "returning_patients": len(returning_sets[start]),
            }
            for start, end in buckets
        ],
    }
