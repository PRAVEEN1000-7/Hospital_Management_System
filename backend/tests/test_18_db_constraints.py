"""
test_18_db_constraints.py
Database constraint tests — exercises SQLAlchemy models directly to confirm
that the underlying PostgreSQL schema enforces:
  - NOT NULL constraints
  - UNIQUE constraints
  - Foreign-key referential integrity
  - Default values

Each test that deliberately triggers an IntegrityError wraps the failing
operation in db_session.begin_nested() so the outer transaction (savepoint)
remains valid for subsequent tests.

NOTE: patients.country column is varchar(3) in the actual DB — always pass
country="IND" (3-char ISO code) in direct Patient inserts.

Test cases: TC-DB-001 to TC-DB-030
"""
import uuid
import time
import pytest
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.orm import Session

from app.models.patient import Patient
from app.models.user import User, Hospital
from app.models.appointment import Doctor


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _uid():
    return str(int(time.time() * 1000))[-6:]


def _get_hospital(db: Session) -> Hospital:
    h = db.query(Hospital).filter(Hospital.is_active == True).first()
    assert h is not None
    return h


def _get_superadmin(db: Session) -> User:
    u = db.query(User).filter(User.username == "superadmin").first()
    assert u is not None
    return u


def _minimal_patient(uid: str, hospital_id: uuid.UUID, user_id: uuid.UUID) -> Patient:
    """Minimal valid patient. country='IND' (DB column is varchar(3))."""
    return Patient(
        hospital_id=hospital_id,
        patient_reference_number=f"HC{uid[:10]}",
        first_name="DBTest",
        last_name=f"User{uid}",
        gender="Male",
        phone_country_code="+91",
        phone_number=f"920{uid}",
        country="IND",
        created_by=user_id,
        updated_by=user_id,
    )


def _assert_raises_db_error(db, add_fn):
    """
    Execute add_fn inside a nested savepoint and assert it raises
    IntegrityError or DataError.  The nested savepoint is rolled back on
    failure so the outer session remains valid.
    """
    caught = None
    try:
        with db.begin_nested():
            add_fn()
            db.flush()
    except (IntegrityError, DataError) as exc:
        caught = exc
    assert caught is not None, "Expected IntegrityError/DataError was not raised"


# ─── Patient NOT NULL constraints ─────────────────────────────────────────────

class TestPatientNotNullConstraints:

    def test_TC_DB_001_patient_requires_hospital_id(self, db_session):
        """TC-DB-001: hospital_id NOT NULL must be enforced."""
        uid = _uid()
        admin = _get_superadmin(db_session)

        def make():
            p = Patient(
                hospital_id=None,
                patient_reference_number=f"NOHOSP{uid}",
                first_name="NoHosp", last_name="Test",
                gender="Male", phone_country_code="+91",
                phone_number=f"931{uid}", country="IND",
                created_by=admin.id, updated_by=admin.id,
            )
            db_session.add(p)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_002_patient_requires_first_name(self, db_session):
        """TC-DB-002: first_name NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()

        def make():
            p = Patient(
                hospital_id=hospital.id,
                patient_reference_number=f"NOFN{uid[:8]}",
                first_name=None, last_name="Test",
                gender="Male", phone_country_code="+91",
                phone_number=f"932{uid}", country="IND",
                created_by=admin.id, updated_by=admin.id,
            )
            db_session.add(p)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_003_patient_requires_last_name(self, db_session):
        """TC-DB-003: last_name NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()

        def make():
            p = Patient(
                hospital_id=hospital.id,
                patient_reference_number=f"NOLN{uid[:8]}",
                first_name="Test", last_name=None,
                gender="Male", phone_country_code="+91",
                phone_number=f"933{uid}", country="IND",
                created_by=admin.id, updated_by=admin.id,
            )
            db_session.add(p)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_004_patient_requires_phone_number(self, db_session):
        """TC-DB-004: phone_number NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()

        def make():
            p = Patient(
                hospital_id=hospital.id,
                patient_reference_number=f"NOPH{uid[:8]}",
                first_name="Test", last_name="NoPhone",
                gender="Male", phone_country_code="+91",
                phone_number=None, country="IND",
                created_by=admin.id, updated_by=admin.id,
            )
            db_session.add(p)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_005_patient_requires_patient_reference_number(self, db_session):
        """TC-DB-005: patient_reference_number NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()

        def make():
            p = Patient(
                hospital_id=hospital.id,
                patient_reference_number=None,
                first_name="Test", last_name="NoPRN",
                gender="Male", phone_country_code="+91",
                phone_number=f"934{uid}", country="IND",
                created_by=admin.id, updated_by=admin.id,
            )
            db_session.add(p)

        _assert_raises_db_error(db_session, make)


# ─── Patient UNIQUE constraint ─────────────────────────────────────────────────

class TestPatientUniqueConstraints:

    def test_TC_DB_006_duplicate_prn_in_same_hospital_raises_error(self, db_session):
        """TC-DB-006: uq_patient_prn_hospital prevents duplicate PRN per hospital."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        duplicate_prn = f"HC{uid[:10]}"

        # Insert first patient successfully
        p1 = _minimal_patient(uid, hospital.id, admin.id)
        p1.patient_reference_number = duplicate_prn
        db_session.add(p1)
        db_session.flush()

        # Second patient must fail with duplicate PRN
        def make():
            p2 = Patient(
                hospital_id=hospital.id,
                patient_reference_number=duplicate_prn,
                first_name="Dup", last_name="PRN",
                gender="Female", phone_country_code="+91",
                phone_number=f"921{uid}", country="IND",
                created_by=admin.id, updated_by=admin.id,
            )
            db_session.add(p2)

        _assert_raises_db_error(db_session, make)


# ─── Patient default values ────────────────────────────────────────────────────

class TestPatientDefaults:

    def test_TC_DB_007_is_active_defaults_true(self, db_session):
        """TC-DB-007: Patient.is_active defaults to True without explicit setting."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        p = _minimal_patient(uid, hospital.id, admin.id)
        db_session.add(p)
        db_session.flush()
        db_session.refresh(p)
        assert p.is_active is True

    def test_TC_DB_008_is_deleted_defaults_false(self, db_session):
        """TC-DB-008: Patient.is_deleted defaults to False without explicit setting."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        p = _minimal_patient(uid, hospital.id, admin.id)
        db_session.add(p)
        db_session.flush()
        db_session.refresh(p)
        assert p.is_deleted is False

    def test_TC_DB_009_country_stored_as_supplied_iso_code(self, db_session):
        """TC-DB-009: country is stored exactly as supplied (3-char ISO code)."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        p = _minimal_patient(uid, hospital.id, admin.id)  # sets country="IND"
        db_session.add(p)
        db_session.flush()
        db_session.refresh(p)
        assert p.country == "IND"

    def test_TC_DB_010_uuid_primary_key_auto_assigned(self, db_session):
        """TC-DB-010: Patient UUID primary key is auto-assigned if not supplied."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        p = _minimal_patient(uid, hospital.id, admin.id)
        db_session.add(p)
        db_session.flush()
        db_session.refresh(p)
        assert p.id is not None
        assert isinstance(p.id, uuid.UUID)


# ─── User NOT NULL constraints ────────────────────────────────────────────────

class TestUserNotNullConstraints:

    def _make_user(self, hospital_id, uid):
        from app.utils.security import get_password_hash
        return User(
            hospital_id=hospital_id,
            username=f"user{uid}",
            email=f"user{uid}@test.com",
            password_hash=get_password_hash("Test@123"),
            reference_number=f"EMP{uid}00000"[:12],
            first_name="Test",
            last_name="User",
        )

    def test_TC_DB_011_user_requires_username(self, db_session):
        """TC-DB-011: User.username NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        uid = _uid()

        def make():
            u = self._make_user(hospital.id, uid)
            u.username = None
            db_session.add(u)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_012_user_requires_email(self, db_session):
        """TC-DB-012: User.email NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        uid = _uid()

        def make():
            u = self._make_user(hospital.id, uid)
            u.email = None
            db_session.add(u)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_013_user_requires_hospital_id(self, db_session):
        """TC-DB-013: User.hospital_id NOT NULL must be enforced."""
        uid = _uid()

        def make():
            u = self._make_user(None, uid)
            db_session.add(u)

        _assert_raises_db_error(db_session, make)


# ─── User UNIQUE constraints ──────────────────────────────────────────────────

class TestUserUniqueConstraints:

    def test_TC_DB_014_duplicate_username_raises_integrity_error(self, db_session):
        """TC-DB-014: username UNIQUE constraint must reject duplicates."""
        hospital = _get_hospital(db_session)
        from app.utils.security import get_password_hash
        uid = _uid()
        common_username = f"dupuser{uid}"

        u1 = User(
            hospital_id=hospital.id, username=common_username,
            email=f"dup1_{uid}@test.com",
            password_hash=get_password_hash("Test@123"),
            reference_number=f"EMP{uid}00000"[:12],
            first_name="Dup1", last_name="User",
        )
        db_session.add(u1)
        db_session.flush()

        def make():
            u2 = User(
                hospital_id=hospital.id, username=common_username,
                email=f"dup2_{uid}@test.com",
                password_hash=get_password_hash("Test@123"),
                reference_number=f"EMP{uid}11111"[:12],
                first_name="Dup2", last_name="User",
            )
            db_session.add(u2)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_015_duplicate_email_raises_integrity_error(self, db_session):
        """TC-DB-015: email UNIQUE constraint must reject duplicates."""
        hospital = _get_hospital(db_session)
        from app.utils.security import get_password_hash
        uid = _uid()
        common_email = f"dupemail{uid}@test.com"

        u1 = User(
            hospital_id=hospital.id, username=f"emaildup1_{uid}",
            email=common_email,
            password_hash=get_password_hash("Test@123"),
            reference_number=f"EMP{uid}00000"[:12],
            first_name="E1", last_name="User",
        )
        db_session.add(u1)
        db_session.flush()

        def make():
            u2 = User(
                hospital_id=hospital.id, username=f"emaildup2_{uid}",
                email=common_email,
                password_hash=get_password_hash("Test@123"),
                reference_number=f"EMP{uid}22222"[:12],
                first_name="E2", last_name="User",
            )
            db_session.add(u2)

        _assert_raises_db_error(db_session, make)


# ─── Hospital model constraints ────────────────────────────────────────────────

class TestHospitalConstraints:

    def test_TC_DB_016_hospital_requires_name(self, db_session):
        """TC-DB-016: Hospital.name NOT NULL must be enforced."""
        uid = _uid()

        def make():
            h = Hospital(name=None, code=f"NONAM{uid[:5]}")
            db_session.add(h)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_017_hospital_requires_code(self, db_session):
        """TC-DB-017: Hospital.code NOT NULL must be enforced."""
        uid = _uid()

        def make():
            h = Hospital(name=f"NoCode Hospital {uid}", code=None)
            db_session.add(h)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_018_hospital_code_must_be_unique(self, db_session):
        """TC-DB-018: Hospital.code UNIQUE constraint must reject duplicates."""
        uid = _uid()
        code = f"HC{uid[:4]}"
        h1 = Hospital(name=f"Hospital A {uid}", code=code, country="IND")
        db_session.add(h1)
        db_session.flush()

        def make():
            h2 = Hospital(name=f"Hospital B {uid}", code=code, country="IND")
            db_session.add(h2)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_019_hospital_is_active_defaults_true(self, db_session):
        """TC-DB-019: Hospital.is_active defaults to True."""
        uid = _uid()
        h = Hospital(name=f"Default Active {uid}", code=f"AC{uid[:4]}", country="IND")
        db_session.add(h)
        db_session.flush()
        db_session.refresh(h)
        assert h.is_active is True


# ─── Doctor model constraints ──────────────────────────────────────────────────

class TestDoctorConstraints:

    def _make_user_for_doctor(self, db_session, suffix: str) -> User:
        """Helper to create and flush a fresh User for Doctor FK tests."""
        from app.utils.security import get_password_hash
        hospital = _get_hospital(db_session)
        # reference_number is NOT NULL in the actual DB (varchar(12))
        ref = f"DOC{suffix}"[:12].ljust(12, "0")
        u = User(
            hospital_id=hospital.id,
            username=f"doctest{suffix}"[:50],
            email=f"d{suffix[:8]}@t.com",
            password_hash=get_password_hash("Test@123"),
            reference_number=ref,
            first_name="Doc", last_name="Test",
        )
        db_session.add(u)
        db_session.flush()
        return u

    def test_TC_DB_020_doctor_requires_user_id(self, db_session):
        """TC-DB-020: Doctor.user_id NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)

        def make():
            d = Doctor(
                user_id=None, hospital_id=hospital.id,
                specialization="Cardiology", qualification="MBBS",
                registration_number="REG001",
            )
            db_session.add(d)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_021_doctor_requires_specialization(self, db_session):
        """TC-DB-021: Doctor.specialization NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        user = self._make_user_for_doctor(db_session, _uid() + "s")

        def make():
            d = Doctor(
                user_id=user.id, hospital_id=hospital.id,
                specialization=None, qualification="MBBS",
                registration_number="REG002",
            )
            db_session.add(d)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_022_doctor_requires_qualification(self, db_session):
        """TC-DB-022: Doctor.qualification NOT NULL must be enforced."""
        hospital = _get_hospital(db_session)
        user = self._make_user_for_doctor(db_session, _uid() + "q")

        def make():
            d = Doctor(
                user_id=user.id, hospital_id=hospital.id,
                specialization="Neurology", qualification=None,
                registration_number="REG003",
            )
            db_session.add(d)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_023_doctor_defaults_is_available_true(self, db_session):
        """TC-DB-023: Doctor.is_available defaults to True."""
        hospital = _get_hospital(db_session)
        user = self._make_user_for_doctor(db_session, _uid() + "av")

        d = Doctor(
            user_id=user.id, hospital_id=hospital.id,
            specialization="Dermatology", qualification="MD",
            registration_number=f"REGDA{_uid()}",
        )
        db_session.add(d)
        db_session.flush()
        db_session.refresh(d)
        assert d.is_available is True

    def test_TC_DB_024_doctor_defaults_is_active_true(self, db_session):
        """TC-DB-024: Doctor.is_active defaults to True."""
        hospital = _get_hospital(db_session)
        user = self._make_user_for_doctor(db_session, _uid() + "ac")

        d = Doctor(
            user_id=user.id, hospital_id=hospital.id,
            specialization="Orthopedics", qualification="MS",
            registration_number=f"REGAC{_uid()}",
        )
        db_session.add(d)
        db_session.flush()
        db_session.refresh(d)
        assert d.is_active is True


# ─── Foreign Key constraints ──────────────────────────────────────────────────

class TestForeignKeyConstraints:

    def test_TC_DB_025_patient_fk_hospital_must_exist(self, db_session):
        """TC-DB-025: Patient.hospital_id FK must reference a real hospital."""
        admin = _get_superadmin(db_session)
        uid = _uid()
        bogus_hospital_id = uuid.uuid4()

        def make():
            p = Patient(
                hospital_id=bogus_hospital_id,
                patient_reference_number=f"FKTEST{uid[:6]}",
                first_name="FK", last_name="Test",
                gender="Male", phone_country_code="+91",
                phone_number=f"940{uid}", country="IND",
                created_by=admin.id, updated_by=admin.id,
            )
            db_session.add(p)

        _assert_raises_db_error(db_session, make)

    def test_TC_DB_026_user_fk_hospital_must_exist(self, db_session):
        """TC-DB-026: User.hospital_id FK must reference a real hospital."""
        from app.utils.security import get_password_hash
        uid = _uid()
        bogus_hospital_id = uuid.uuid4()

        def make():
            u = User(
                hospital_id=bogus_hospital_id,
                username=f"bogushosp{uid}",
                email=f"bogushosp{uid}@test.com",
                password_hash=get_password_hash("Test@123"),
                reference_number=f"EMP{uid}00000"[:12],
                first_name="Bogus", last_name="HospUser",
            )
            db_session.add(u)

        _assert_raises_db_error(db_session, make)


# ─── Direct DB read-back verification ─────────────────────────────────────────

class TestDataIntegrity:

    def test_TC_DB_027_written_data_matches_read_back(self, db_session):
        """TC-DB-027: All fields written must be identical when read back."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        p = Patient(
            hospital_id=hospital.id,
            patient_reference_number=f"VF{uid[:10]}",
            first_name="Verify",
            last_name=f"Field{uid}",
            gender="Female",
            blood_group="B-",
            phone_country_code="+91",
            phone_number=f"950{uid}",
            email=f"verify{uid}@test.com",
            address_line_1="10 Integrity Road",
            city="Bangalore",
            country="IND",
            created_by=admin.id,
            updated_by=admin.id,
        )
        db_session.add(p)
        db_session.flush()
        db_session.refresh(p)

        row = db_session.query(Patient).filter(Patient.id == p.id).one()
        assert row.first_name == "Verify"
        assert row.last_name == f"Field{uid}"
        assert row.gender == "Female"
        assert row.blood_group == "B-"
        assert row.email == f"verify{uid}@test.com"
        assert row.city == "Bangalore"

    def test_TC_DB_028_patient_count_increases_by_one(self, db_session):
        """TC-DB-028: DB patient count must increase by exactly 1 after create."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)

        before = db_session.query(Patient).filter(
            Patient.hospital_id == hospital.id,
            Patient.is_deleted == False
        ).count()

        uid = _uid()
        p = _minimal_patient(uid, hospital.id, admin.id)
        db_session.add(p)
        db_session.flush()

        after = db_session.query(Patient).filter(
            Patient.hospital_id == hospital.id,
            Patient.is_deleted == False
        ).count()
        assert after == before + 1

    def test_TC_DB_029_soft_deleted_row_remains_in_table(self, db_session):
        """TC-DB-029: soft-delete sets flag but row stays in DB (not hard-deleted)."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        p = _minimal_patient(uid, hospital.id, admin.id)
        db_session.add(p)
        db_session.flush()
        pid = p.id

        p.is_deleted = True
        db_session.flush()

        row = db_session.query(Patient).filter(Patient.id == pid).first()
        assert row is not None
        assert row.is_deleted is True

    def test_TC_DB_030_updated_field_reflected_in_immediate_query(self, db_session):
        """TC-DB-030: field update is immediately visible via a fresh query."""
        hospital = _get_hospital(db_session)
        admin = _get_superadmin(db_session)
        uid = _uid()
        p = _minimal_patient(uid, hospital.id, admin.id)
        db_session.add(p)
        db_session.flush()

        p.city = "Updated City"
        db_session.flush()

        row = db_session.query(Patient).filter(Patient.id == p.id).one()
        assert row.city == "Updated City"
