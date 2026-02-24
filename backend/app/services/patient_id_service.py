"""
HMS 12-Digit Patient ID System
================================

Format: [HOSPITAL][GENDER][YY][MONTH][CHECK][SEQUENCE]
         2 chars + 1 char + 2 digits + 1 char + 1 char + 5 digits = 12 chars

Example: HCM262K00147
  HC  = Hospital Code (HMS Core)
  M   = Gender (Male)
  26  = Year (2026)
  2   = Month (February)
  K   = Checksum
  00147 = Sequence #147
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import date
from ..models.hospital import HospitalDetails


# ── Gender Mapping ──────────────────────────────────────────────────────────

GENDER_CODE_MAP = {
    "Male": "M",
    "Female": "F",
    "Other": "O",
    "Not Disclosed": "N",
    "Unknown": "U",
}


# ── Month Encoding (1-9, A-C) ──────────────────────────────────────────────

MONTH_ENCODE = {
    1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6",
    7: "7", 8: "8", 9: "9", 10: "A", 11: "B", 12: "C",
}

MONTH_DECODE = {v: k for k, v in MONTH_ENCODE.items()}


# ── Checksum Algorithm (from spec) ─────────────────────────────────────────

def calculate_checksum(id_without_check: str) -> str:
    """
    Calculate checksum for the first 6 characters (HHGYYM).
    Uses weighted sum modulo 36 → digit (0-9) or letter (A-Z).
    """
    total = 0
    for i, char in enumerate(id_without_check):
        if char.isdigit():
            value = int(char)
        else:
            value = ord(char.upper()) - 55  # A=10, B=11, ...
        total += value * (i + 1)  # Weighted sum (1-indexed)
    check_val = total % 36
    if check_val < 10:
        return str(check_val)
    else:
        return chr(55 + check_val)  # 10→A, 11→B, ...


def validate_checksum(patient_id: str) -> bool:
    """
    Validate a 12-digit patient ID's checksum.
    Returns True if the checksum character at position 7 is correct.
    """
    if len(patient_id) != 12:
        return False
    prefix = patient_id[:6]  # HHGYYM
    expected = calculate_checksum(prefix)
    return patient_id[6] == expected


# ── ID Generation ──────────────────────────────────────────────────────────

def get_hospital_code_2char(db: Session) -> str:
    """
    Get the 2-character hospital code from hospital_details.
    Falls back to 'HC' (HMS Core) if not configured.
    """
    hospital = db.query(HospitalDetails).first()
    if hospital and hospital.hospital_code:
        code = hospital.hospital_code.strip().upper()
        if len(code) >= 2:
            return code[:2]
        elif len(code) == 1:
            return code + "C"  # Pad single char
    return "HC"


def get_next_sequence(db: Session, hospital_code: str, year: int, month: int) -> int:
    """
    Get the next sequence number for a hospital+month combo.
    Uses the patient_id_sequences table with row-level locking.
    """
    from ..models.patient_id_sequence import PatientIdSequence

    year_month = f"{year % 100:02d}{month:02d}"

    # Try to get existing row with lock
    seq_row = db.query(PatientIdSequence).filter(
        and_(
            PatientIdSequence.hospital_code == hospital_code,
            PatientIdSequence.year_month == year_month,
        )
    ).with_for_update().first()

    if seq_row:
        seq_row.last_sequence += 1
        db.flush()
        return seq_row.last_sequence
    else:
        # Create new row for this hospital+month
        new_seq = PatientIdSequence(
            hospital_code=hospital_code,
            year_month=year_month,
            last_sequence=1,
        )
        db.add(new_seq)
        db.flush()
        return 1


def generate_patient_id(db: Session, gender: str) -> str:
    """
    Generate a 12-digit HMS Patient ID.

    Args:
        db: Database session
        gender: Patient gender string ("Male", "Female", "Other", etc.)

    Returns:
        12-character patient ID string (e.g. "HCM262K00147")
    """
    today = date.today()
    year = today.year
    month = today.month

    # Components
    hospital_code = get_hospital_code_2char(db)  # 2 chars
    gender_code = GENDER_CODE_MAP.get(gender, "U")  # 1 char
    year_code = f"{year % 100:02d}"  # 2 digits
    month_code = MONTH_ENCODE[month]  # 1 char

    # Build prefix (6 chars) for checksum
    prefix = f"{hospital_code}{gender_code}{year_code}{month_code}"

    # Calculate checksum (1 char)
    checksum = calculate_checksum(prefix)

    # Get next sequence (5 digits)
    seq_num = get_next_sequence(db, hospital_code, year, month)
    sequence = f"{seq_num:05d}"

    # Assemble: HHGYYMCSSSS (12 chars)
    patient_id = f"{prefix}{checksum}{sequence}"

    return patient_id


# ── ID Parsing Utility ─────────────────────────────────────────────────────

def parse_patient_id(patient_id: str) -> dict | None:
    """
    Parse a 12-digit patient ID into its components.
    Returns None if invalid format.
    """
    if len(patient_id) != 12:
        return None

    hospital_code = patient_id[0:2]
    gender_code = patient_id[2]
    year_code = patient_id[3:5]
    month_code = patient_id[5]
    checksum = patient_id[6]
    sequence = patient_id[7:12]

    # Validate checksum
    prefix = patient_id[:6]
    expected_check = calculate_checksum(prefix)
    is_valid = (checksum == expected_check)

    # Decode gender
    gender_map_reverse = {v: k for k, v in GENDER_CODE_MAP.items()}
    gender = gender_map_reverse.get(gender_code, "Unknown")

    # Decode month
    month_num = MONTH_DECODE.get(month_code)

    return {
        "hospital_code": hospital_code,
        "gender": gender,
        "gender_code": gender_code,
        "year": int(year_code) + 2000,
        "month": month_num,
        "month_code": month_code,
        "checksum": checksum,
        "checksum_valid": is_valid,
        "sequence": int(sequence),
        "formatted": f"{hospital_code}-{gender_code}-{year_code}-{month_code}-{checksum}-{sequence}",
    }
