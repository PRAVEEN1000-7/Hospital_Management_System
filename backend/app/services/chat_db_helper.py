"""
HMS AI Chat — Database Query Helper
=====================================
Provides safe, read-only database queries for the AI chatbot.
The chatbot can answer questions like:
  - "How many patients are registered?"
  - "Who are the doctors?"
  - "Show me patient HMS-000001"
  - "What are the hospital details?"

PLUG-AND-PLAY: Delete this file to remove DB awareness from the AI.
"""

import logging
import re
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models.patient import Patient
from ..models.user import User
from ..models.hospital import HospitalDetails

logger = logging.getLogger(__name__)


def _get_db() -> Session:
    """Get a database session (non-generator for direct use)."""
    return SessionLocal()


def get_database_context(message: str) -> str:
    """
    Analyze the user's message and fetch relevant database data.
    Returns a formatted string to inject into the AI prompt.
    Returns empty string if the question isn't about data.
    """
    msg_lower = message.lower()
    context_parts = []

    try:
        db = _get_db()

        # ── Patient-related queries ──
        if _is_about_patients(msg_lower):
            context_parts.append(_get_patient_data(db, msg_lower))

        # ── User/Staff-related queries ──
        if _is_about_users_or_staff(msg_lower):
            context_parts.append(_get_user_data(db, msg_lower))

        # ── Hospital-related queries ──
        if _is_about_hospital(msg_lower):
            context_parts.append(_get_hospital_data(db))

        # ── General stats (dashboard-like) ──
        if _is_about_stats(msg_lower):
            context_parts.append(_get_stats(db))

        db.close()

    except Exception as e:
        logger.error(f"Database query error in chat: {e}")
        return ""

    result = "\n\n".join([p for p in context_parts if p])
    if result:
        return f"\n\n## Live Database Information (as of now)\n{result}"
    return ""


# ──────────────────────────────────────────────
# Detection helpers
# ──────────────────────────────────────────────

def _is_about_patients(msg: str) -> bool:
    keywords = [
        "patient", "patients", "prn", "hms-", "registered", "registration",
        "how many patient", "total patient", "patient count", "patient list",
        "find patient", "search patient", "look up patient", "patient name",
        "blood group", "male patient", "female patient",
        "tell me about patient", "details of patient", "info on patient",
        "information about patient", "show me patient", "get patient",
        "patient detail", "about patient", "which patient",
        "reference id", "reference number", "ref id", "ref no",
        "reference no", "ref number", "patient ref", "patient id",
    ]
    # Also trigger if message contains a PRN-like pattern (HMS-000001, PRN 123, etc.)
    if re.search(r'(?:hms[-\s]?\d+|prn[-\s:]*\d+|ref(?:erence)?[-\s]*(?:id|no|number|#)[-\s:]*\d+)', msg, re.IGNORECASE):
        return True
    return any(kw in msg for kw in keywords)


def _is_about_users_or_staff(msg: str) -> bool:
    keywords = [
        "user", "users", "staff", "doctor", "doctors", "nurse", "nurses",
        "receptionist", "pharmacist", "cashier", "admin", "admins",
        "how many user", "how many staff", "how many doctor", "how many nurse",
        "total user", "total staff", "employee", "employees", "team",
        "who is", "who are", "list user", "list staff", "list doctor"
    ]
    return any(kw in msg for kw in keywords)


def _is_about_hospital(msg: str) -> bool:
    keywords = [
        "hospital name", "hospital detail", "hospital info", "hospital address",
        "hospital phone", "hospital email", "hospital config", "hospital setup",
        "bed", "beds", "accreditation", "gst", "pan", "drug license",
        "working hours", "emergency hotline", "hospital code"
    ]
    return any(kw in msg for kw in keywords)


def _is_about_stats(msg: str) -> bool:
    keywords = [
        "how many", "total", "count", "statistics", "stats", "overview",
        "summary", "numbers", "data summary", "dashboard data"
    ]
    return any(kw in msg for kw in keywords)


# ──────────────────────────────────────────────
# Data fetchers
# ──────────────────────────────────────────────

def _format_patient_detail(patient) -> str:
    """Format a single patient's full details for the AI context."""
    address_parts = [patient.address_line1]
    if patient.address_line2:
        address_parts.append(patient.address_line2)
    address_parts.extend([p for p in [patient.city, patient.state, patient.pin_code, patient.country] if p])
    address = ", ".join(address_parts)

    lines = [
        f"\n**Patient {patient.prn}:**",
        f"- Name: {patient.title or ''} {patient.first_name} {patient.last_name}",
        f"- Date of Birth: {patient.date_of_birth}",
        f"- Gender: {patient.gender}",
        f"- Blood Group: {patient.blood_group or 'Not specified'}",
        f"- Phone: {patient.country_code or ''} {patient.mobile_number}",
        f"- Email: {patient.email or 'Not provided'}",
        f"- Address: {address}",
    ]
    if patient.emergency_contact_name:
        lines.append(f"- Emergency Contact: {patient.emergency_contact_name} ({patient.emergency_contact_relation or 'N/A'}) — {patient.emergency_contact_phone or 'N/A'}")
    lines.append(f"- Status: {'Active' if patient.is_active else 'Inactive'}")
    lines.append(f"- Registered: {patient.created_at.strftime('%Y-%m-%d %H:%M') if patient.created_at else 'Unknown'}")
    return "\n".join(lines)


def _extract_patient_name(msg: str) -> str | None:
    """
    Extract a patient name from natural language.
    Handles many phrasings:
      - "tell me about patient John"
      - "details of patient Raj Kumar"
      - "info on John Doe"
      - "who is patient Smith"
      - "get me details of Ananya"
      - "patient John's details"
      - "about John"
      - "find Raj Kumar"
    """
    # Words to never treat as patient names
    STOP_WORDS = {
        "patient", "patients", "a", "an", "the", "all", "any", "some", "this",
        "that", "for", "up", "me", "my", "our", "his", "her", "their", "its",
        "please", "details", "detail", "information", "info", "data", "record",
        "records", "about", "currently", "current", "right", "now", "today",
        "registered", "active", "inactive", "list", "show", "tell", "give",
        "get", "fetch", "find", "search", "look", "check", "see", "view",
        "display", "print", "what", "who", "which", "how", "where", "when",
        "is", "are", "was", "were", "do", "does", "did", "can", "could",
        "will", "would", "should", "have", "has", "had", "of", "on", "in",
        "at", "to", "from", "with", "by", "and", "or", "but", "not", "no",
        "yes", "male", "female", "hospital", "system", "hms", "named", "called",
        "name", "names", "many", "total", "count", "number", "no",
    }

    # Pattern priority: most specific first
    name_patterns = [
        # "patient named/called John Doe"
        r"patient\s+(?:named?|called?)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)",
        # "details/info of/about/on patient John Doe"
        r"(?:details?|info(?:rmation)?|record|data)\s+(?:of|about|on|for)\s+(?:patient\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)",
        # "tell me about patient John Doe" / "tell me about John"
        r"(?:tell|show|give|get|fetch)\s+(?:me\s+)?(?:about|details?\s+(?:of|about|on))?\s*(?:patient\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*$",
        # "patient John Doe" / "patient John's"
        r"patient\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)(?:'s)?(?:\s+detail|\s+info|\s+record|\s+data)?",
        # "who is patient John" / "who is John"
        r"who\s+is\s+(?:patient\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)",
        # "find/search/look up John Doe"
        r"(?:find|search|look\s*up)\s+(?:patient\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)",
        # "about patient John" / "about John"
        r"about\s+(?:patient\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*$",
    ]

    for pattern in name_patterns:
        match = re.search(pattern, msg, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            # Remove trailing stop words
            words = candidate.split()
            cleaned = [w for w in words if w.lower() not in STOP_WORDS]
            if cleaned:
                name = " ".join(cleaned)
                # Final sanity check: at least 2 chars, not all stop words
                if len(name) >= 2:
                    return name
    return None


def _get_patient_data(db: Session, msg: str) -> str:
    """Fetch patient-related data based on the question."""
    parts = []

    # Total counts
    total = db.query(func.count(Patient.id)).filter(Patient.is_active == True).scalar()
    inactive = db.query(func.count(Patient.id)).filter(Patient.is_active == False).scalar()
    parts.append(f"**Total active patients:** {total}")
    if inactive > 0:
        parts.append(f"**Inactive/deleted patients:** {inactive}")

    # Gender breakdown
    gender_counts = (
        db.query(Patient.gender, func.count(Patient.id))
        .filter(Patient.is_active == True)
        .group_by(Patient.gender)
        .all()
    )
    if gender_counts:
        gender_str = ", ".join([f"{g}: {c}" for g, c in gender_counts])
        parts.append(f"**By gender:** {gender_str}")

    # List all patients (when asking for names/list/all)
    if any(kw in msg for kw in ["all patient", "patient name", "patients name", "list patient",
                                  "list all", "show patient", "show all", "every patient",
                                  "all the patient", "patient details", "all names"]):
        all_patients = (
            db.query(Patient)
            .filter(Patient.is_active == True)
            .order_by(Patient.created_at.desc())
            .limit(50)
            .all()
        )
        if all_patients:
            parts.append(f"\n**All active patients ({len(all_patients)}{'+' if len(all_patients) == 50 else ''}):**")
            for p in all_patients:
                date_str = p.created_at.strftime('%Y-%m-%d') if p.created_at else 'Unknown'
                parts.append(
                    f"- {p.prn}: {p.title or ''} {p.first_name} {p.last_name} | "
                    f"{p.gender} | {p.mobile_number} | Registered: {date_str}"
                )
        else:
            parts.append("**No active patients found in the system.**")

    # Blood group breakdown
    if "blood" in msg:
        blood_counts = (
            db.query(Patient.blood_group, func.count(Patient.id))
            .filter(Patient.is_active == True, Patient.blood_group.isnot(None))
            .group_by(Patient.blood_group)
            .all()
        )
        if blood_counts:
            blood_str = ", ".join([f"{b}: {c}" for b, c in blood_counts])
            parts.append(f"**By blood group:** {blood_str}")

    # Search for specific patient by PRN (HMS-000001, HMS 000001, etc.)
    prn_match = re.search(r'(hms[-\s]?\d+)', msg, re.IGNORECASE)
    if prn_match:
        prn_search = prn_match.group(1).upper().replace(" ", "-")
        if "-" not in prn_search:
            prn_search = prn_search[:3] + "-" + prn_search[3:]
        patient = db.query(Patient).filter(Patient.prn == prn_search).first()
        if patient:
            parts.append(_format_patient_detail(patient))
        else:
            parts.append(f"**No patient found with PRN {prn_search}**")

    # Search by PRN number only (e.g., "PRN 000001", "prn:000001", "reference id 000001", "ref id 000001")
    if not prn_match:
        ref_match = re.search(
            r'(?:prn|reference\s*(?:id|no\.?|number|#)|ref\s*(?:id|no\.?|number|#)|patient\s*(?:ref|reference)\s*(?:id|no\.?|number|#)?)[-\s:]*?(\d{1,6})',
            msg, re.IGNORECASE
        )
        if ref_match:
            num = ref_match.group(1).zfill(6)  # Pad to 6 digits
            prn_search = f"HMS-{num}"
            patient = db.query(Patient).filter(Patient.prn == prn_search).first()
            if patient:
                parts.append(_format_patient_detail(patient))
                prn_match = ref_match  # Prevent further searches
            else:
                # Also try matching the raw number as DB id
                patient = db.query(Patient).filter(Patient.id == int(ref_match.group(1))).first()
                if patient:
                    parts.append(_format_patient_detail(patient))
                    prn_match = ref_match
                else:
                    parts.append(f"**No patient found with reference {prn_search} or ID #{ref_match.group(1)}**")
                    prn_match = ref_match

    # Search by patient number/ID (e.g., "patient #3", "patient number 5", "patient id 12")
    if not prn_match:
        id_match = re.search(r'patient\s*(?:#|number|no\.?|id)\s*(\d+)', msg, re.IGNORECASE)
        if id_match:
            patient_id = int(id_match.group(1))
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            if patient:
                parts.append(_format_patient_detail(patient))
            else:
                parts.append(f"**No patient found with ID #{patient_id}**")

    # Smart name search — catches many natural phrasings
    if not prn_match:
        extracted_name = _extract_patient_name(msg)
        if extracted_name:
            # Search both first and last name, also try splitting multi-word input
            name_parts = extracted_name.split()
            if len(name_parts) >= 2:
                # Multi-word: search first AND last name
                patients = (
                    db.query(Patient)
                    .filter(
                        Patient.is_active == True,
                        or_(
                            # first + last match
                            (Patient.first_name.ilike(f"%{name_parts[0]}%")) & (Patient.last_name.ilike(f"%{name_parts[-1]}%")),
                            # any part matches
                            *[or_(Patient.first_name.ilike(f"%{p}%"), Patient.last_name.ilike(f"%{p}%")) for p in name_parts]
                        )
                    )
                    .limit(10)
                    .all()
                )
            else:
                # Single word: search in both first and last name
                patients = (
                    db.query(Patient)
                    .filter(
                        Patient.is_active == True,
                        or_(
                            Patient.first_name.ilike(f"%{extracted_name}%"),
                            Patient.last_name.ilike(f"%{extracted_name}%")
                        )
                    )
                    .limit(10)
                    .all()
                )

            if patients:
                if len(patients) == 1:
                    # Single match — show full details
                    parts.append(_format_patient_detail(patients[0]))
                else:
                    # Multiple matches — show summary + first one's full details
                    parts.append(f"\n**{len(patients)} patients matching '{extracted_name}':**")
                    for p in patients:
                        parts.append(
                            f"- {p.prn}: {p.title or ''} {p.first_name} {p.last_name} | "
                            f"{p.gender} | {p.mobile_number}"
                        )
                    # Show full details of first match
                    parts.append(f"\n**Full details of closest match:**")
                    parts.append(_format_patient_detail(patients[0]))
            else:
                parts.append(f"**No patient found matching '{extracted_name}'**")

    # Recent patients (last 5)
    if any(kw in msg for kw in ["recent", "latest", "last", "newest"]):
        recent = (
            db.query(Patient)
            .filter(Patient.is_active == True)
            .order_by(Patient.created_at.desc())
            .limit(5)
            .all()
        )
        if recent:
            parts.append("\n**Last 5 registered patients:**")
            for p in recent:
                date_str = p.created_at.strftime('%Y-%m-%d') if p.created_at else 'Unknown'
                parts.append(f"- {p.prn}: {p.title} {p.first_name} {p.last_name} (registered {date_str})")

    return "\n".join(parts) if parts else ""


def _get_user_data(db: Session, msg: str) -> str:
    """Fetch user/staff-related data."""
    parts = []

    # Total counts
    total = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    inactive = db.query(func.count(User.id)).filter(User.is_active == False).scalar()
    parts.append(f"**Total active users/staff:** {total}")
    if inactive > 0:
        parts.append(f"**Inactive users:** {inactive}")

    # Role breakdown
    role_counts = (
        db.query(User.role, func.count(User.id))
        .filter(User.is_active == True)
        .group_by(User.role)
        .order_by(func.count(User.id).desc())
        .all()
    )
    if role_counts:
        parts.append("**By role:**")
        for role, count in role_counts:
            label = role.replace("_", " ").title()
            parts.append(f"- {label}: {count}")

    # List specific role
    role_map = {
        "doctor": "doctor", "doctors": "doctor",
        "nurse": "nurse", "nurses": "nurse",
        "admin": "admin", "admins": "admin",
        "super admin": "super_admin", "superadmin": "super_admin",
        "receptionist": "receptionist", "receptionists": "receptionist",
        "pharmacist": "pharmacist", "pharmacists": "pharmacist",
        "cashier": "cashier", "cashiers": "cashier",
        "inventory manager": "inventory_manager",
        "staff": "staff",
    }

    for keyword, role_value in role_map.items():
        if keyword in msg:
            users_of_role = (
                db.query(User)
                .filter(User.is_active == True, User.role == role_value)
                .order_by(User.full_name)
                .all()
            )
            if users_of_role:
                label = role_value.replace("_", " ").title()
                parts.append(f"\n**All active {label}s ({len(users_of_role)}):**")
                for u in users_of_role:
                    dept = f" — {u.department}" if u.department else ""
                    emp_id = f" ({u.employee_id})" if u.employee_id else ""
                    parts.append(f"- {u.full_name}{emp_id}{dept} — {u.username}")
            break

    # Search specific user
    name_patterns = [
        r"who is (\w+)",
        r"user (?:named?|called?) (\w+)",
        r"find (?:user |staff )?(\w+)",
    ]
    for pattern in name_patterns:
        match = re.search(pattern, msg, re.IGNORECASE)
        if match:
            name = match.group(1)
            if name.lower() in ["user", "users", "staff", "the", "a", "an", "all", "doctor", "doctors", "nurse", "nurses", "admin", "admins"]:
                continue
            users = (
                db.query(User)
                .filter(
                    User.is_active == True,
                    (User.full_name.ilike(f"%{name}%")) | (User.username.ilike(f"%{name}%"))
                )
                .limit(5)
                .all()
            )
            if users:
                parts.append(f"\n**Users matching '{name}':**")
                for u in users:
                    role_label = u.role.replace("_", " ").title()
                    parts.append(f"- {u.full_name} ({u.username}) — {role_label}, {u.department or 'No dept'}")
            break

    return "\n".join(parts) if parts else ""


def _get_hospital_data(db: Session) -> str:
    """Fetch hospital configuration."""
    hospital = db.query(HospitalDetails).filter(HospitalDetails.is_active == True).first()
    if not hospital:
        return "**Hospital details not configured yet.** A Super Admin or Admin needs to set them up via Hospital Setup."

    parts = [
        f"**Hospital Name:** {hospital.hospital_name}",
        f"**Code:** {hospital.hospital_code or 'Not set'}",
        f"**Type:** {hospital.hospital_type or 'General'}",
        f"**Registration #:** {hospital.registration_number or 'Not set'}",
        f"**Established:** {hospital.established_date or 'Not set'}",
        f"**Phone:** {hospital.primary_phone_country_code} {hospital.primary_phone}",
        f"**Email:** {hospital.email}",
        f"**Website:** {hospital.website or 'Not set'}",
        f"**Address:** {hospital.address_line1}, {hospital.city}, {hospital.state} {hospital.pin_code}, {hospital.country}",
    ]

    if hospital.number_of_beds:
        parts.append(f"**Beds:** {hospital.number_of_beds}")
    if hospital.staff_strength:
        parts.append(f"**Staff Strength:** {hospital.staff_strength}")
    if hospital.nabh_accreditation:
        parts.append(f"**NABH Accreditation:** {hospital.nabh_accreditation}")
    if hospital.specialisation:
        parts.append(f"**Specialisation:** {hospital.specialisation}")
    if hospital.gst_number:
        parts.append(f"**GST:** {hospital.gst_number}")
    if hospital.pan_number:
        parts.append(f"**PAN:** {hospital.pan_number}")
    if hospital.emergency_24_7:
        parts.append("**Emergency:** 24/7 available")
    if hospital.working_hours_start and hospital.working_hours_end:
        parts.append(f"**Working Hours:** {hospital.working_hours_start.strftime('%H:%M')} — {hospital.working_hours_end.strftime('%H:%M')}")

    return "\n".join(parts)


def _get_stats(db: Session) -> str:
    """Get overall system statistics."""
    parts = []

    patient_count = db.query(func.count(Patient.id)).filter(Patient.is_active == True).scalar()
    user_count = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    hospital = db.query(HospitalDetails).filter(HospitalDetails.is_active == True).first()

    parts.append("**System Statistics:**")
    parts.append(f"- Total active patients: {patient_count}")
    parts.append(f"- Total active users/staff: {user_count}")
    parts.append(f"- Hospital configured: {'Yes' if hospital and hospital.is_configured else 'No'}")

    # Role breakdown
    role_counts = (
        db.query(User.role, func.count(User.id))
        .filter(User.is_active == True)
        .group_by(User.role)
        .all()
    )
    if role_counts:
        for role, count in role_counts:
            parts.append(f"- {role.replace('_', ' ').title()}: {count}")

    # Patient gender breakdown
    gender_counts = (
        db.query(Patient.gender, func.count(Patient.id))
        .filter(Patient.is_active == True)
        .group_by(Patient.gender)
        .all()
    )
    if gender_counts:
        parts.append("- Patient gender:")
        for g, c in gender_counts:
            parts.append(f"  - {g}: {c}")

    # Recent activity
    latest_patient = db.query(Patient).filter(Patient.is_active == True).order_by(Patient.created_at.desc()).first()
    if latest_patient and latest_patient.created_at:
        parts.append(f"- Last patient registered: {latest_patient.prn} ({latest_patient.first_name} {latest_patient.last_name}) on {latest_patient.created_at.strftime('%Y-%m-%d %H:%M')}")

    return "\n".join(parts)
