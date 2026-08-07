"""
User service — works with new hms_db UUID/RBAC schema.
"""
import logging
import os
import shutil
import uuid
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from math import ceil
from typing import Optional
from datetime import datetime, timezone
from fastapi import UploadFile, HTTPException, status
from ..models.user import User, UserRole, Role, Hospital
from ..models.appointment import Doctor
from ..utils.security import get_password_hash
from ..services.patient_id_service import generate_staff_id
from ..services.auth_service import clear_lockout
from ..services import shift_management

logger = logging.getLogger(__name__)

# Upload directory configuration
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "photos")
# S2: .gif excluded — consistent with logo policy (GIFs served from the app's
# own origin can be used for tracking-pixel attacks; also no magic-byte spec).
# .svg excluded: can carry <script> tags (stored XSS via static file route).
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MAX_PHOTO_SIZE_MB = 2

# S1: Magic-byte signatures — extension alone is not enough; a renamed .html
# can pass an extension check while the browser renders it as HTML (stored XSS).
_PHOTO_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
}


def _has_valid_photo_signature(file: UploadFile, file_ext: str) -> bool:
    sigs = _PHOTO_SIGNATURES.get(file_ext)
    if not sigs:
        return True
    file.file.seek(0)
    header = file.file.read(16)
    file.file.seek(0)
    return any(header.startswith(sig) for sig in sigs)


def ensure_upload_directory():
    """Create upload directory if it doesn't exist"""
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)


def list_users(
    db: Session,
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    hospital_id: Optional[uuid.UUID] = None,
):
    """List users with pagination, search, and server-side filters"""
    query = (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
            joinedload(User.doctor_profile),
            joinedload(User.shift),
        )
        .filter(User.is_deleted == False)
    )

    if hospital_id is not None:
        query = query.filter(User.hospital_id == hospital_id)

    if search:
        search_term = search.strip()
        if search_term:
            search_filter = or_(
                User.username.ilike(f"%{search_term}%"),
                User.first_name.ilike(f"%{search_term}%"),
                User.last_name.ilike(f"%{search_term}%"),
                User.email.ilike(f"%{search_term}%"),
                User.reference_number.ilike(f"%{search_term}%"),
            )
            query = query.filter(search_filter)

    if role:
        from sqlalchemy import exists as sa_exists
        role_subq = (
            db.query(UserRole.user_id)
            .join(Role, UserRole.role_id == Role.id)
            .filter(Role.name == role)
            .subquery()
        )
        query = query.filter(User.id.in_(role_subq))

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    total = query.count()
    offset = (page - 1) * limit
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    total_pages = ceil(total / limit) if limit > 0 else 0

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "data": users,
    }


def get_user_by_id(
    db: Session,
    user_id: str | uuid.UUID,
    hospital_id: Optional[uuid.UUID] = None,
) -> Optional[User]:
    """Get user by UUID"""
    if isinstance(user_id, str):
        try:
            user_id = uuid.UUID(user_id)
        except ValueError:
            return None
    q = (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.hospital),
            joinedload(User.doctor_profile),
            joinedload(User.shift),
        )
        .filter(User.id == user_id, User.is_deleted == False)
    )
    if hospital_id is not None:
        q = q.filter(User.hospital_id == hospital_id)
    return q.first()


def suggest_username(
    db: Session, hospital_id: uuid.UUID, first_name: str, last_name: str
) -> str:
    """
    Standard username template (BUG-04):
        HospitalCode + First2OfFirstName + First2OfLastName + "_" + 3-digit number
    e.g. hospital code "BE", Dr. Sanjay Saravanakumar → "besasa_001".
    The numeric suffix is a per-hospital running sequence (next new user gets
    _002 regardless of their name), matching the spec's example. Stored
    lowercase because create_user lowercases every username anyway.
    """
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    code = (hospital.code if hospital and hospital.code else "").strip().lower()

    def first2(name: str) -> str:
        letters = "".join(ch for ch in (name or "") if ch.isalpha())
        return (letters[:2] or "xx").lower()

    prefix = f"{code}{first2(first_name)}{first2(last_name)}"

    # Per-hospital sequence: highest _NNN suffix among this hospital's
    # template-formatted usernames, +1.
    rows = (
        db.query(User.username)
        .filter(User.hospital_id == hospital_id, User.username.like(f"{code}%\\_%", escape="\\"))
        .all()
    )
    max_seq = 0
    for (uname,) in rows:
        tail = uname.rsplit("_", 1)[-1]
        if tail.isdigit() and len(tail) == 3:
            max_seq = max(max_seq, int(tail))

    # The sequence is hospital-wide, but usernames are globally unique — walk
    # forward past any collision (e.g. same number claimed by another hospital
    # with an identical code prefix).
    seq = max_seq + 1
    while True:
        candidate = f"{prefix}_{seq:03d}"
        exists = db.query(User.id).filter(User.username == candidate).first()
        if not exists:
            return candidate
        seq += 1


def create_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role_name: str,
    hospital_id: str | uuid.UUID,
    phone: Optional[str] = None,
    # Doctor-specific fields
    specialization: Optional[str] = None,
    qualification: Optional[str] = None,
    registration_number: Optional[str] = None,
    registration_authority: Optional[str] = None,
    experience_years: Optional[int] = None,
    consultation_fee: Optional[float] = None,
    follow_up_fee: Optional[float] = None,
    bio: Optional[str] = None,
    department_id: Optional[str] = None,
    analytics_enabled: Optional[bool] = True,
    created_by_id: Optional[uuid.UUID] = None,
    # Employee / HR fields — apply to every role, stored directly on `users`.
    designation: Optional[str] = None,
    date_of_joining=None,
    date_of_leaving=None,
    employment_type: Optional[str] = None,
    bank_account_holder_name: Optional[str] = None,
    bank_account_number: Optional[str] = None,
    bank_ifsc: Optional[str] = None,
    bank_branch: Optional[str] = None,
    pf_number: Optional[str] = None,
    pan_number: Optional[str] = None,
    paid_leave_entitlement: Optional[int] = None,
    include_in_payroll: Optional[bool] = True,
    base_salary: Optional[float] = None,
) -> User:
    """Create a new user with role assignment. Auto-creates Doctor record for doctor role."""
    password_hash = get_password_hash(password)

    if isinstance(hospital_id, str):
        hospital_id = uuid.UUID(hospital_id)

    # Generate 12-char HMS reference number: [HH][RoleCode][YY][M][Checksum][#####]
    reference_number = generate_staff_id(db, hospital_id, role_name)

    # Doctor's clinical department (doctors.department_id) — not stored on
    # User at all; the `departments` table is scoped to clinical specialties,
    # not a general HR field applicable to every role.
    dept_uuid = None
    if department_id:
        try:
            dept_uuid = uuid.UUID(department_id)
        except ValueError:
            dept_uuid = None

    user = User(
        hospital_id=hospital_id,
        username=username.lower(),
        email=email,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        reference_number=reference_number,
        designation=designation,
        date_of_joining=date_of_joining,
        date_of_leaving=date_of_leaving,
        employment_type=employment_type,
        bank_account_holder_name=bank_account_holder_name,
        bank_account_number=bank_account_number,
        bank_ifsc=bank_ifsc,
        bank_branch=bank_branch,
        pf_number=pf_number,
        pan_number=pan_number,
        paid_leave_entitlement=paid_leave_entitlement,
        include_in_payroll=include_in_payroll if include_in_payroll is not None else True,
        base_salary=base_salary,
    )
    db.add(user)
    db.flush()  # Get the user.id

    # Assign the role. A miss here must be loud, not silent — a role name
    # accepted by the schema (VALID_ROLES) but missing from this table would
    # otherwise create a user with zero roles: login still succeeds (auth
    # doesn't check roles) but every hasRole()/allowedRoles() check across the
    # app fails, which looks indistinguishable from "login is broken" to
    # whoever ends up with the account. See database_hole/11_lab_technician_role.sql
    # for the real incident this caught (lab_technician was never seeded).
    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role '{role_name}' is not configured on this server (missing from the roles table). Contact support.",
        )
    user_role = UserRole(user_id=user.id, role_id=role.id)
    db.add(user_role)

    # Auto-create doctor record when the role is 'doctor'
    if role_name == "doctor" and specialization:
        doctor = Doctor(
            user_id=user.id,
            hospital_id=hospital_id,
            department_id=dept_uuid,
            specialization=specialization,
            qualification=qualification or "",
            registration_number=registration_number or "",
            registration_authority=registration_authority,
            experience_years=experience_years,
            consultation_fee=consultation_fee or 0,
            follow_up_fee=follow_up_fee or 0,
            bio=bio,
            is_available=True,
            is_active=True,
            analytics_enabled=analytics_enabled if analytics_enabled is not None else True,
            created_by=created_by_id or user.id,
        )
        db.add(doctor)
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"Created user: {username}")
    return user


def update_user(
    db: Session, user_id: str | uuid.UUID, changed_by: Optional[uuid.UUID] = None, **kwargs
) -> Optional[User]:
    """Update user fields"""
    user = get_user_by_id(db, user_id)
    if not user:
        logger.warning("update_user: user %s not found", user_id)
        return None

    # shift_id changing here (StaffModals edit form) needs the same history
    # bookkeeping as the bulk Shift Management assign path — see
    # shift_management._record_shift_change (schema: 01_full_schema.sql §8.5).
    # Mirrors the `value is not None` guard below: this updater never clears
    # a field to NULL, only ever sets a new value, so only that case needs
    # a history entry here.
    if kwargs.get("shift_id") is not None and kwargs["shift_id"] != str(user.shift_id or ""):
        shift_management._record_shift_change(
            db, user.hospital_id, user.id, uuid.UUID(kwargs["shift_id"]), changed_by
        )

    # Offboarding: a new/changed date_of_leaving must retroactively cap any
    # shift_assignments row scheduling this employee past their last day —
    # otherwise Shift Management keeps showing shifts for dates they're no
    # longer employed on. See shift_management.cancel_shifts_after_leaving.
    new_leaving_date = kwargs.get("date_of_leaving")
    if new_leaving_date is not None and new_leaving_date != user.date_of_leaving:
        shift_management.cancel_shifts_after_leaving(db, user.id, new_leaving_date)

    for key, value in kwargs.items():
        if hasattr(user, key) and value is not None:
            setattr(user, key, value)

    db.commit()
    db.refresh(user)
    logger.info("Updated user: %s (fields: %s)", user.username, list(kwargs.keys()))
    return user


def reset_password(db: Session, user_id: str | uuid.UUID, new_password: str) -> Optional[User]:
    """Reset user password"""
    user = get_user_by_id(db, user_id)
    if not user:
        logger.warning("reset_password: user %s not found", user_id)
        return None
    user.password_hash = get_password_hash(new_password)
    # An admin resetting the password is also proving identity/authority
    # outside the normal login flow — lift any lockout too, otherwise the
    # user still can't log in with the new password until the timer expires.
    clear_lockout(user)
    db.commit()
    db.refresh(user)
    logger.info("Password reset for user: %s", user.username)
    return user


def delete_user(db: Session, user_id: str | uuid.UUID) -> Optional[User]:
    """Soft delete a user"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    user.is_deleted = True
    user.deleted_at = datetime.now(timezone.utc)
    db.commit()
    
    logger.info(f"Soft deleted user: {user.username}")
    return user


def save_user_photo(db: Session, user_id: str | uuid.UUID, file: UploadFile) -> dict:
    """Save user photo file and update database"""
    ensure_upload_directory()

    # Validate file extension
    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(sorted(ALLOWED_PHOTO_EXTENSIONS))}"
        )

    # Normalize extension: .jpeg -> .jpg for consistency
    if file_ext == '.jpeg':
        file_ext = '.jpg'

    # S1: Verify the file's actual content matches its claimed extension.
    # Extension check alone is not sufficient — a renamed .html passes it.
    if not _has_valid_photo_signature(file, file_ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match its extension.",
        )

    # Check file size
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)

    file_size_mb = file_size_bytes / (1024 * 1024)
    if file_size_mb > MAX_PHOTO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_PHOTO_SIZE_MB}MB"
        )

    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Delete old photo if exists
    if user.avatar_url:
        old_photo_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), user.avatar_url.lstrip('/'))
        if os.path.exists(old_photo_path):
            try:
                os.remove(old_photo_path)
            except Exception:
                pass

    # Generate unique filename with normalized extension
    filename = f"user_{user.id}_{int(datetime.now().timestamp())}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        # S8: log the real error server-side; never expose internal paths to the client.
        logger.error("Failed to write photo file for user %s: %s", user_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save photo. Please try again.",
        )

    user.avatar_url = f"/uploads/photos/{filename}"
    db.commit()
    db.refresh(user)

    logger.info(f"Saved photo for user {user.id}: {filename}")

    return {
        "message": "Photo uploaded successfully",
        "avatar_url": user.avatar_url,
        "filename": filename
    }

