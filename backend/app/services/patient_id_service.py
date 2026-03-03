'''
HMS 12-Digit ID System
=========================

Format: [HOSPITAL][CODE][YY][MONTH][CHECK][SEQUENCE]
         2 chars + 1 char + 2 digits + 1 char + 1 char + 5 digits = 12 chars

Patient Example: HCM262K00147
  HC  = Hospital Code (first 2 chars)
  M   = Gender (Male)
  26  = Year (2026)
  2   = Month (February)
  K   = Checksum
  00147 = Sequence #147

Staff Example: HCD261X00003
  HC  = Hospital Code
  D   = Role Code (Doctor)
  26  = Year (2026)
  1   = Month (January)
  X   = Checksum
  00003 = Sequence #3
'''
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import date
from ..models.user import Hospital


# -- Gender Mapping (for patients) --
GENDER_CODE_MAP = {
    'Male': 'M', 'male': 'M',
    'Female': 'F', 'female': 'F',
    'Other': 'O', 'other': 'O',
    'Not Disclosed': 'N', 'prefer_not_to_say': 'N',
    'Unknown': 'U',
}

# -- Role Code Mapping (for staff) --
ROLE_CODE_MAP = {
    'super_admin': 'S',
    'admin': 'A',
    'doctor': 'D',
    'receptionist': 'R',
    'pharmacist': 'P',
    'nurse': 'N',
    'optical_staff': 'O',
    'cashier': 'C',
    'inventory_manager': 'I',
    'report_viewer': 'V',
    'lab_technician': 'T',
}

# -- Month Encoding (1-9, A-C) --
MONTH_ENCODE = {
    1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
    7: '7', 8: '8', 9: '9', 10: 'A', 11: 'B', 12: 'C',
}
MONTH_DECODE = {v: k for k, v in MONTH_ENCODE.items()}


def calculate_checksum(id_without_check: str) -> str:
    '''Calculate checksum for the first 6 characters (HHGYYM).'''
    total = 0
    for i, char in enumerate(id_without_check):
        if char.isdigit():
            value = int(char)
        else:
            value = ord(char.upper()) - 55
        total += value * (i + 1)
    check_val = total % 36
    return str(check_val) if check_val < 10 else chr(55 + check_val)


def validate_checksum(patient_id: str) -> bool:
    '''Validate a 12-digit patient ID checksum (char at position 7).'''
    if len(patient_id) != 12:
        return False
    return patient_id[6] == calculate_checksum(patient_id[:6])


def get_hospital_code_2char(db: Session, hospital_id: uuid.UUID = None) -> str:
    '''Get 2-char hospital code from hospitals table. Falls back to "HC".'''
    if hospital_id:
        hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    else:
        hospital = db.query(Hospital).first()
    if hospital and hospital.code:
        code = hospital.code.strip().upper()
        if len(code) >= 2:
            return code[:2]
        elif len(code) == 1:
            return code + 'C'
    return 'HC'


def get_next_sequence(db: Session, hospital_id: uuid.UUID, hospital_code: str,
                      gender_code: str, year_code: str, month_code: str) -> int:
    '''
    Get the next sequence number for patients (backward-compatible wrapper).
    '''
    return _get_next_sequence(
        db, hospital_id, hospital_code,
        entity_type='patient',
        code=gender_code,
        year_code=year_code,
        month_code=month_code,
    )


def generate_patient_id(db: Session, hospital_id: uuid.UUID, gender: str) -> str:
    '''Generate a 12-digit HMS Patient ID.'''
    today = date.today()
    year = today.year
    month = today.month

    hospital_code = get_hospital_code_2char(db, hospital_id)
    gender_code = GENDER_CODE_MAP.get(gender, 'U')
    year_code = f'{year % 100:02d}'
    month_code = MONTH_ENCODE[month]

    prefix = f'{hospital_code}{gender_code}{year_code}{month_code}'
    checksum = calculate_checksum(prefix)

    seq_num = get_next_sequence(db, hospital_id, hospital_code,
                                gender_code, year_code, month_code)
    sequence = f'{seq_num:05d}'

    return f'{prefix}{checksum}{sequence}'


def generate_staff_id(db: Session, hospital_id: uuid.UUID, role_name: str) -> str:
    '''Generate a 12-digit HMS Staff Reference Number.

    Same format as patient IDs but uses role code instead of gender code,
    and entity_type="staff" in the id_sequences table.
    '''
    today = date.today()
    year = today.year
    month = today.month

    hospital_code = get_hospital_code_2char(db, hospital_id)
    role_code = ROLE_CODE_MAP.get(role_name.lower(), 'X')  # X = unknown role
    year_code = f'{year % 100:02d}'
    month_code = MONTH_ENCODE[month]

    prefix = f'{hospital_code}{role_code}{year_code}{month_code}'
    checksum = calculate_checksum(prefix)

    seq_num = _get_next_sequence(
        db, hospital_id, hospital_code,
        entity_type='staff',
        code=role_code,
        year_code=year_code,
        month_code=month_code,
    )
    sequence = f'{seq_num:05d}'

    return f'{prefix}{checksum}{sequence}'


def _get_next_sequence(
    db: Session, hospital_id: uuid.UUID, hospital_code: str,
    entity_type: str, code: str, year_code: str, month_code: str,
) -> int:
    '''
    Generic next-sequence helper used by both patient and staff ID generation.
    Uses the id_sequences table with row-level locking.
    '''
    from ..models.patient_id_sequence import IdSequence

    seq_row = db.query(IdSequence).filter(
        and_(
            IdSequence.hospital_id == hospital_id,
            IdSequence.entity_type == entity_type,
            IdSequence.role_gender_code == code,
            IdSequence.year_code == year_code,
            IdSequence.month_code == month_code,
        )
    ).with_for_update().first()

    if seq_row:
        seq_row.last_sequence += 1
        db.flush()
        return seq_row.last_sequence
    else:
        new_seq = IdSequence(
            hospital_id=hospital_id,
            hospital_code=hospital_code,
            entity_type=entity_type,
            role_gender_code=code,
            year_code=year_code,
            month_code=month_code,
            last_sequence=1,
        )
        db.add(new_seq)
        db.flush()
        return 1


def parse_patient_id(patient_id: str) -> dict | None:
    '''Parse a 12-digit patient ID into its components.'''
    if len(patient_id) != 12:
        return None
    hospital_code = patient_id[0:2]
    gender_code = patient_id[2]
    year_code = patient_id[3:5]
    month_code = patient_id[5]
    checksum = patient_id[6]
    sequence = patient_id[7:12]
    prefix = patient_id[:6]
    is_valid = (checksum == calculate_checksum(prefix))
    gender_map_reverse = {v: k for k, v in GENDER_CODE_MAP.items()}
    return {
        'hospital_code': hospital_code,
        'gender': gender_map_reverse.get(gender_code, 'Unknown'),
        'gender_code': gender_code,
        'year': int(year_code) + 2000,
        'month': MONTH_DECODE.get(month_code),
        'month_code': month_code,
        'checksum': checksum,
        'checksum_valid': is_valid,
        'sequence': int(sequence),
    }
