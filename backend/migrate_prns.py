"""
Migration script: Re-generate all existing patient PRNs to 12-digit format.

Old format: HC2026000001, GH2026000008 (variable length, no gender/checksum)
New format: HCM262D00001 (exactly 12 chars, encodes gender + month + checksum)

Run from the backend directory:
    python migrate_prns.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime
from app.database import SessionLocal
from app.models.patient import Patient
from app.models.patient_id_sequence import PatientIdSequence
from sqlalchemy import and_

# ── Copy of checksum + encode logic (no circular imports) ─────────────────

GENDER_CODE_MAP = {
    "Male": "M", "Female": "F", "Other": "O",
    "Not Disclosed": "N", "Unknown": "U",
}

MONTH_ENCODE = {
    1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6",
    7: "7", 8: "8", 9: "9", 10: "A", 11: "B", 12: "C",
}


def calculate_checksum(prefix: str) -> str:
    total = 0
    for i, char in enumerate(prefix):
        value = int(char) if char.isdigit() else ord(char.upper()) - 55
        total += value * (i + 1)
    check_val = total % 36
    return str(check_val) if check_val < 10 else chr(55 + check_val)


def get_hospital_code(db) -> str:
    from app.models.hospital import HospitalDetails
    hospital = db.query(HospitalDetails).first()
    if hospital and hospital.hospital_code:
        code = hospital.hospital_code.strip().upper()
        return code[:2] if len(code) >= 2 else (code + "C")
    return "HC"


def get_next_sequence(db, hospital_code: str, year: int, month: int) -> int:
    year_month = f"{year % 100:02d}{month:02d}"
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
        new_seq = PatientIdSequence(
            hospital_code=hospital_code,
            year_month=year_month,
            last_sequence=1,
        )
        db.add(new_seq)
        db.flush()
        return 1


def generate_new_prn(db, gender: str, reg_date: datetime) -> str:
    hospital_code = get_hospital_code(db)
    gender_code = GENDER_CODE_MAP.get(gender, "U")
    year = reg_date.year
    month = reg_date.month
    year_code = f"{year % 100:02d}"
    month_code = MONTH_ENCODE[month]
    prefix = f"{hospital_code}{gender_code}{year_code}{month_code}"
    checksum = calculate_checksum(prefix)
    seq_num = get_next_sequence(db, hospital_code, year, month)
    return f"{prefix}{checksum}{seq_num:05d}"


def is_old_format(prn: str) -> bool:
    """
    Old PRNs: variable length, digits at positions 2-5 are the year (e.g. 2026).
    New PRNs: exactly 12 chars, position 2 is a gender letter (M/F/O/N/U).
    """
    if len(prn) != 12:
        return True
    # In the new format, char at index 2 is always a gender code letter
    if prn[2] not in "MFONU":
        return True
    # In the new format, chars 3-4 are 2-digit year (e.g. "26"), char 5 is month code
    if not prn[3:5].isdigit():
        return True
    if prn[5] not in "123456789ABC":
        return True
    return False


# ── Main migration ─────────────────────────────────────────────────────────

def run():
    db = SessionLocal()
    try:
        patients = db.query(Patient).order_by(Patient.created_at.asc()).all()
        old_patients = [p for p in patients if is_old_format(p.prn)]

        if not old_patients:
            print("✅ All patients already have the new 12-digit PRN format.")
            return

        print(f"Found {len(old_patients)} patient(s) with old PRN format. Migrating...\n")

        updated = []
        for patient in old_patients:
            old_prn = patient.prn
            reg_date = patient.created_at or datetime.now()
            new_prn = generate_new_prn(db, patient.gender, reg_date)
            patient.prn = new_prn
            updated.append((patient.id, patient.full_name, old_prn, new_prn))
            print(f"  Patient #{patient.id} {patient.full_name}: {old_prn} → {new_prn}")

        db.commit()
        print(f"\n✅ Successfully migrated {len(updated)} patient PRN(s).")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    run()
