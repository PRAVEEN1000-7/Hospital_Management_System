"""
test_17_service_layer.py
Service-layer integration tests — calls service functions directly with the
real DB session (savepoint-isolated), then queries the DB to verify the actual
persisted state.  No HTTP involved.

Test cases: TC-SVC-001 to TC-SVC-030
"""
import time
import uuid
import pytest
from sqlalchemy.orm import Session

from app.models.patient import Patient
from app.models.user import User, Hospital
from app.services import patient_service, auth_service, user_service
from app.schemas.patient import PatientCreate, PatientUpdate
from app.schemas.user import UserCreate


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _uid():
    """6-digit suffix unique within the test run."""
    return str(int(time.time() * 1000))[-6:]


def _get_hospital(db: Session) -> Hospital:
    hospital = db.query(Hospital).filter(Hospital.is_active == True).first()
    assert hospital is not None, "No active hospital in DB — run seed data first"
    return hospital


def _get_superadmin(db: Session) -> User:
    user = db.query(User).filter(User.username == "superadmin").first()
    assert user is not None, "superadmin user not found — run seed data first"
    return user


def _make_patient_data(uid: str, hospital_id: uuid.UUID = None) -> PatientCreate:
    return PatientCreate(
        first_name="ServiceTest",
        last_name=f"User{uid}",
        date_of_birth="1992-03-10",
        gender="Male",
        blood_group="A+",
        phone_country_code="+91",
        phone_number=f"910{uid}",
        email=f"svc{uid}@test.com",
        address_line_1="99 Service Lane",
        city="Chennai",
        state_province="Tamil Nadu",
        postal_code="600001",
        country="IND",
    )


# ─── create_patient ────────────────────────────────────────────────────────────

class TestCreatePatientService:

    def test_TC_SVC_001_patient_persisted_to_db(self, db_session):
        """TC-SVC-001: create_patient() must write row to patients table."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        row = db_session.query(Patient).filter_by(id=result.id).first()
        assert row is not None, "Patient row not found in DB after create"

    def test_TC_SVC_002_first_name_correct_in_db(self, db_session):
        """TC-SVC-002: first_name persisted exactly as supplied."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        row = db_session.query(Patient).filter_by(id=result.id).first()
        assert row.first_name == "ServiceTest"

    def test_TC_SVC_003_prn_auto_generated(self, db_session):
        """TC-SVC-003: patient_reference_number must be 12 chars and not None."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        assert result.patient_reference_number is not None
        assert len(result.patient_reference_number) == 12

    def test_TC_SVC_004_prn_encodes_gender(self, db_session):
        """TC-SVC-004: PRN gender char must match supplied gender."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid, hospital.id)
        data.gender = "Female"

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        # Gender char is at position 2 of the PRN
        assert result.patient_reference_number[2] == "F"

    def test_TC_SVC_005_hospital_id_set_correctly(self, db_session):
        """TC-SVC-005: Patient.hospital_id must equal the supplied hospital ID."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        assert result.hospital_id == hospital.id

    def test_TC_SVC_006_created_by_set_to_user_id(self, db_session):
        """TC-SVC-006: created_by must equal the user_id argument."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        assert result.created_by == admin.id

    def test_TC_SVC_007_email_stored_correctly(self, db_session):
        """TC-SVC-007: email stored exactly as supplied."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid, hospital.id)
        data.email = f"exact{uid}@email.com"

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        assert result.email == f"exact{uid}@email.com"

    def test_TC_SVC_008_is_active_defaults_true(self, db_session):
        """TC-SVC-008: newly created patient must be active."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        assert result.is_active is True

    def test_TC_SVC_009_is_deleted_defaults_false(self, db_session):
        """TC-SVC-009: newly created patient must not be deleted."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)

        result = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        assert result.is_deleted is False


# ─── get_patient_by_id ─────────────────────────────────────────────────────────

class TestGetPatientById:

    def test_TC_SVC_010_returns_patient_for_valid_id(self, db_session):
        """TC-SVC-010: get_patient_by_id returns the exact patient."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        fetched = patient_service.get_patient_by_id(db_session, created.id)

        assert fetched is not None
        assert fetched.id == created.id
        assert fetched.first_name == "ServiceTest"

    def test_TC_SVC_011_returns_none_for_unknown_uuid(self, db_session):
        """TC-SVC-011: get_patient_by_id returns None for non-existent UUID."""
        result = patient_service.get_patient_by_id(db_session, uuid.uuid4())
        assert result is None

    def test_TC_SVC_012_returns_none_for_invalid_string(self, db_session):
        """TC-SVC-012: get_patient_by_id returns None for clearly invalid string."""
        result = patient_service.get_patient_by_id(db_session, "not-a-uuid")
        assert result is None

    def test_TC_SVC_013_does_not_return_deleted_patient(self, db_session):
        """TC-SVC-013: get_patient_by_id respects soft-delete flag."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        patient_service.soft_delete_patient(db_session, created.id, admin.id)

        fetched = patient_service.get_patient_by_id(db_session, created.id)
        assert fetched is None


# ─── get_patient_by_email ──────────────────────────────────────────────────────

class TestGetPatientByEmail:

    def test_TC_SVC_014_finds_existing_email(self, db_session):
        """TC-SVC-014: get_patient_by_email returns patient for known email."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid, hospital.id)
        email = f"findme{uid}@svc.com"
        data.email = email
        patient_service.create_patient(db_session, data, admin.id, hospital.id)

        found = patient_service.get_patient_by_email(db_session, email)
        assert found is not None
        assert found.email == email

    def test_TC_SVC_015_returns_none_for_unknown_email(self, db_session):
        """TC-SVC-015: get_patient_by_email returns None for email not in DB."""
        result = patient_service.get_patient_by_email(db_session, "nobody@nowhere.com")
        assert result is None


# ─── update_patient ────────────────────────────────────────────────────────────

class TestUpdatePatientService:

    def test_TC_SVC_016_update_persists_new_first_name(self, db_session):
        """TC-SVC-016: update_patient() writes changed first_name to DB."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        # PatientUpdate shares PatientBase (all required fields must be supplied)
        update = PatientUpdate(
            first_name="UpdatedName",
            last_name=data.last_name,
            gender=data.gender,
            phone_country_code=data.phone_country_code,
            phone_number=data.phone_number,
            country="IND",
        )
        updated = patient_service.update_patient(db_session, created.id, update, admin.id)

        assert updated is not None
        row = db_session.query(Patient).filter_by(id=created.id).first()
        assert row.first_name == "UpdatedName"

    def test_TC_SVC_017_update_leaves_other_fields_unchanged(self, db_session):
        """TC-SVC-017: partial update must not corrupt unchanged fields."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)
        original_prn = created.patient_reference_number

        update = PatientUpdate(
            first_name="PartialUpdate",
            last_name=data.last_name,
            gender=data.gender,
            phone_country_code=data.phone_country_code,
            phone_number=data.phone_number,
            country="IND",
        )
        patient_service.update_patient(db_session, created.id, update, admin.id)

        row = db_session.query(Patient).filter_by(id=created.id).first()
        assert row.patient_reference_number == original_prn
        assert row.last_name == created.last_name

    def test_TC_SVC_018_update_returns_none_for_missing_patient(self, db_session):
        """TC-SVC-018: update_patient() returns None for non-existent patient."""
        update = PatientUpdate(
            first_name="Ghost",
            last_name="Patient",
            gender="Male",
            phone_country_code="+91",
            phone_number="9999999999",
            country="IND",
        )
        result = patient_service.update_patient(db_session, uuid.uuid4(), update, uuid.uuid4())
        assert result is None


# ─── soft_delete_patient ──────────────────────────────────────────────────────

class TestSoftDeletePatient:

    def test_TC_SVC_019_sets_is_deleted_true_in_db(self, db_session):
        """TC-SVC-019: soft_delete_patient() sets is_deleted=True in DB."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        patient_service.soft_delete_patient(db_session, created.id, admin.id)

        # Bypass service filter to confirm raw DB state
        row = db_session.query(Patient).filter(Patient.id == created.id).first()
        assert row.is_deleted is True

    def test_TC_SVC_020_patient_invisible_to_get_after_delete(self, db_session):
        """TC-SVC-020: deleted patient not returned by get_patient_by_id."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        data = _make_patient_data(_uid(), hospital.id)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        patient_service.soft_delete_patient(db_session, created.id, admin.id)
        found = patient_service.get_patient_by_id(db_session, created.id)

        assert found is None


# ─── list_patients ────────────────────────────────────────────────────────────

class TestListPatients:

    def test_TC_SVC_021_list_returns_paginated_response(self, db_session):
        """TC-SVC-021: list_patients() returns a PaginatedPatientResponse."""
        hospital = _get_hospital(db_session)
        result = patient_service.list_patients(db_session, page=1, limit=5, hospital_id=hospital.id)
        assert hasattr(result, 'total')
        assert hasattr(result, 'data')
        assert isinstance(result.data, list)

    def test_TC_SVC_022_newly_created_patient_appears_in_list(self, db_session):
        """TC-SVC-022: freshly created patient appears in list_patients()."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid, hospital.id)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)

        result = patient_service.list_patients(
            db_session, page=1, limit=100,
            search=f"910{uid}",  # search by phone
            hospital_id=hospital.id,
        )

        ids = [str(p.id) for p in result.data]
        assert str(created.id) in ids

    def test_TC_SVC_023_deleted_patient_excluded_from_list(self, db_session):
        """TC-SVC-023: soft-deleted patient not present in list_patients()."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid, hospital.id)
        created = patient_service.create_patient(db_session, data, admin.id, hospital.id)
        patient_service.soft_delete_patient(db_session, created.id, admin.id)

        result = patient_service.list_patients(
            db_session, page=1, limit=100,
            search=f"910{uid}",
            hospital_id=hospital.id,
        )

        ids = [str(p.id) for p in result.data]
        assert str(created.id) not in ids

    def test_TC_SVC_024_total_count_increases_after_creation(self, db_session):
        """TC-SVC-024: total in list_patients() increments after new patient."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)

        before = patient_service.list_patients(db_session, hospital_id=hospital.id).total

        data = _make_patient_data(_uid(), hospital.id)
        patient_service.create_patient(db_session, data, admin.id, hospital.id)

        after = patient_service.list_patients(db_session, hospital_id=hospital.id).total
        assert after == before + 1


# ─── get_patient_by_mobile ────────────────────────────────────────────────────

class TestGetPatientByMobile:

    def test_TC_SVC_025_finds_by_exact_phone(self, db_session):
        """TC-SVC-025: get_patient_by_mobile returns patient for known phone."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        data = _make_patient_data(uid, hospital.id)
        data.phone_number = f"910{uid}"
        patient_service.create_patient(db_session, data, admin.id, hospital.id)

        found = patient_service.get_patient_by_mobile(db_session, f"910{uid}")
        assert found is not None
        assert found.phone_number == f"910{uid}"

    def test_TC_SVC_026_returns_none_for_unknown_phone(self, db_session):
        """TC-SVC-026: get_patient_by_mobile returns None for unknown number."""
        result = patient_service.get_patient_by_mobile(db_session, "0000000000")
        assert result is None


# ─── auth_service / password hashing ─────────────────────────────────────────

class TestAuthServiceHashing:

    def test_TC_SVC_027_password_hash_differs_from_plaintext(self, db_session):
        """TC-SVC-027: hashed password must not equal the plaintext."""
        from app.utils.security import get_password_hash
        plain = "Admin@123"
        hashed = get_password_hash(plain)
        assert hashed != plain
        assert len(hashed) > 20  # BCrypt outputs 60-char strings

    def test_TC_SVC_028_verify_correct_password_returns_true(self, db_session):
        """TC-SVC-028: verify_password returns True for correct password."""
        from app.utils.security import get_password_hash, verify_password
        plain = "Admin@123"
        hashed = get_password_hash(plain)
        assert verify_password(plain, hashed) is True

    def test_TC_SVC_029_verify_wrong_password_returns_false(self, db_session):
        """TC-SVC-029: verify_password returns False for wrong password."""
        from app.utils.security import get_password_hash, verify_password
        hashed = get_password_hash("Admin@123")
        assert verify_password("WrongPassword", hashed) is False

    def test_TC_SVC_030_two_hashes_of_same_password_differ(self, db_session):
        """TC-SVC-030: BCrypt salt ensures two hashes are never identical."""
        from app.utils.security import get_password_hash
        h1 = get_password_hash("Admin@123")
        h2 = get_password_hash("Admin@123")
        assert h1 != h2  # different salts each time
