"""
conftest.py — shared pytest fixtures for ALL test modules.

Strategy:
  - Use the real PostgreSQL database (hospital_management)
    with a SAVEPOINT-based rollback per test function so each
    test starts with a clean slate.
  - Override FastAPI's `get_db` dependency to inject the
    same per-test session, giving full integration coverage.
  - Provide ready-made auth headers for every role.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import get_db, Base
from app.config import settings

# ── Test engine (same DB as dev, isolated by savepoints) ─────────────────
TEST_DATABASE_URL = settings.DATABASE_URL

engine = create_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── Session fixture: each test runs inside a rolled-back transaction ──────
@pytest.fixture(scope="function")
def db_session():
    """
    Provide a DB session wrapped in a savepoint.
    Everything written during the test is rolled back on teardown.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    # Begin a nested savepoint so rollback only affects this test
    session.begin_nested()

    yield session

    session.rollback()
    session.close()
    transaction.rollback()
    connection.close()


# ── TestClient that injects the test session ─────────────────────────────
@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with DB dependency overridden."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# ── Auth-token helpers ────────────────────────────────────────────────────
def _get_token(client: TestClient, username: str, password: str) -> str:
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed for '{username}': {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="function")
def superadmin_token(client):
    return _get_token(client, "superadmin", "Super@123")


@pytest.fixture(scope="function")
def admin_token(client):
    return _get_token(client, "admin", "Admin@123")


@pytest.fixture(scope="function")
def doctor_token(client):
    return _get_token(client, "doctor1", "Admin@123")


@pytest.fixture(scope="function")
def nurse_token(client):
    return _get_token(client, "nurse1", "Admin@123")


# ── Helper: auth header dict ────────────────────────────────────────────
@pytest.fixture(scope="function")
def sa_headers(superadmin_token):
    return {"Authorization": f"Bearer {superadmin_token}"}


@pytest.fixture(scope="function")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="function")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


@pytest.fixture(scope="function")
def nurse_headers(nurse_token):
    return {"Authorization": f"Bearer {nurse_token}"}


# ── Reusable test patient payload ─────────────────────────────────────────
@pytest.fixture(scope="function")
def sample_patient_payload():
    """Minimal valid patient creation payload."""
    import time
    uid = str(int(time.time() * 1000))[-6:]   # 6-digit unique suffix
    return {
        "title": "Mr.",
        "first_name": "Test",
        "last_name": "User",
        "date_of_birth": "1990-05-15",
        "gender": "Male",
        "blood_group": "O+",
        "country_code": "+91",
        "mobile_number": f"900{uid}",         # unique each run
        "email": f"testuser{uid}@hms-test.com",
        "address_line1": "123 Test Street",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pin_code": "400001",
        "country": "India",
        "emergency_contact_name": "Test Emergency",
        "emergency_contact_country_code": "+91",
        "emergency_contact_mobile": f"800{uid}",
        "emergency_contact_relationship": "Father",
    }


# ── Reusable test user payload ────────────────────────────────────────────
@pytest.fixture(scope="function")
def sample_doctor_payload():
    import time
    uid = str(int(time.time() * 1000))[-6:]
    return {
        "username": f"drtest{uid}",
        "email": f"drtest{uid}@hms-test.com",
        "password": "TestDoctor@123",
        "first_name": "Test",
        "last_name": "Doctor",
        "full_name": f"Dr. Test Doctor {uid}",
        "role": "doctor",
        "department": "Cardiology",
        "phone_number": f"700{uid}",
    }
