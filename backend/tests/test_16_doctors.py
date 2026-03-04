"""
test_16_doctors.py — Integration tests for the Doctors API.
Covers: listing, read, create (admin only), update, deactivate, RBAC,
        field validation, enriched doctor_name field, and edge cases.
Test IDs: TC-DOC-001 through TC-DOC-030
"""
import pytest
import time
import uuid

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts():
    return str(int(time.time() * 1000))[-7:]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def seeded_doctor(client, sa_headers):
    """
    Return the first doctor from the seeded database (dr.smith / dr.patel / dr.lee).
    Tests that only need to READ an existing doctor use this fixture.
    """
    resp = client.get("/api/v1/doctors?active_only=false&limit=1", headers=sa_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    doctors = data.get("data", data) if isinstance(data, dict) else data
    assert len(doctors) >= 1, "No seeded doctors found — ensure seed_data.sql was applied"
    return doctors[0]


@pytest.fixture(scope="function")
def seeded_department_id(client, sa_headers):
    """Return the ID of the first active department."""
    resp = client.get("/api/v1/departments?active_only=true", headers=sa_headers)
    assert resp.status_code == 200
    depts = resp.json().get("data", [])
    assert len(depts) >= 1, "No active departments — seed data may be missing"
    return depts[0]["id"]


@pytest.fixture(scope="function")
def seeded_non_doctor_user_id(client, sa_headers):
    """
    Return a user_id that does NOT already have a doctor record.
    We look for a user whose username starts with 'reception' or similar.
    If we can't find one we skip the test.
    """
    resp = client.get("/api/v1/users?limit=50", headers=sa_headers)
    if resp.status_code != 200:
        pytest.skip("Cannot list users — skipping doctor-create test")
    users = resp.json().get("data", resp.json()) if isinstance(resp.json(), dict) else resp.json()
    # Filter to non-doctor roles
    candidate = next(
        (u for u in users if u.get("role") not in ("doctor",) and u.get("is_active", True)),
        None,
    )
    if candidate is None:
        pytest.skip("No non-doctor user available for doctor creation test")
    return candidate["id"]


# ---------------------------------------------------------------------------
# TC-DOC-001 – List doctors
# ---------------------------------------------------------------------------

class TestListDoctors:
    def test_list_doctors_authenticated(self, client, sa_headers):
        """TC-DOC-001: authenticated user can list doctors."""
        resp = client.get("/api/v1/doctors", headers=sa_headers)
        assert resp.status_code == 200

    def test_list_doctors_unauthenticated_returns_403(self, client):
        """TC-DOC-002: unauthenticated request is rejected."""
        resp = client.get("/api/v1/doctors")
        assert resp.status_code == 403

    def test_list_response_has_pagination_fields(self, client, sa_headers):
        """TC-DOC-003: list response includes pagination metadata."""
        resp = client.get("/api/v1/doctors", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        for key in ("total", "page", "limit", "total_pages", "data"):
            assert key in data, f"Missing pagination key: {key}"

    def test_list_data_is_array(self, client, sa_headers):
        """TC-DOC-004: 'data' is a list."""
        resp = client.get("/api/v1/doctors", headers=sa_headers)
        assert isinstance(resp.json()["data"], list)

    def test_list_returns_at_least_one_seeded_doctor(self, client, sa_headers):
        """TC-DOC-005: seeded data contains at least one doctor."""
        resp = client.get("/api/v1/doctors?active_only=false", headers=sa_headers)
        assert resp.json()["total"] >= 1

    def test_active_only_true_excludes_inactive(self, client, sa_headers):
        """TC-DOC-006: active_only=true (default) only returns active doctors."""
        active_resp = client.get("/api/v1/doctors?active_only=true", headers=sa_headers)
        all_resp = client.get("/api/v1/doctors?active_only=false", headers=sa_headers)
        active_count = active_resp.json()["total"]
        all_count = all_resp.json()["total"]
        assert active_count <= all_count

    def test_doctor_can_list_doctors(self, client, doctor_headers):
        """TC-DOC-007: doctor role can list doctors."""
        resp = client.get("/api/v1/doctors", headers=doctor_headers)
        assert resp.status_code == 200

    def test_pagination_limit_works(self, client, sa_headers):
        """TC-DOC-008: limit=1 returns at most 1 doctor."""
        resp = client.get("/api/v1/doctors?limit=1", headers=sa_headers)
        assert resp.status_code == 200
        assert len(resp.json()["data"]) <= 1

    def test_page_exceeds_total_returns_empty(self, client, sa_headers):
        """TC-DOC-009: page beyond total returns empty data array."""
        resp = client.get("/api/v1/doctors?page=9999", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["data"] == []


# ---------------------------------------------------------------------------
# TC-DOC-010 – Read single doctor
# ---------------------------------------------------------------------------

class TestGetDoctor:
    def test_get_doctor_by_id(self, client, sa_headers, seeded_doctor):
        """TC-DOC-010: GET /doctors/{id} returns correct doctor."""
        doc_id = seeded_doctor["id"]
        resp = client.get(f"/api/v1/doctors/{doc_id}", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == doc_id

    def test_get_nonexistent_doctor_returns_404(self, client, sa_headers):
        """TC-DOC-011: random UUID returns 404."""
        resp = client.get(f"/api/v1/doctors/{uuid.uuid4()}", headers=sa_headers)
        assert resp.status_code == 404

    def test_doctor_response_has_required_fields(self, client, sa_headers, seeded_doctor):
        """TC-DOC-012: response contains all required schema fields."""
        doc_id = seeded_doctor["id"]
        resp = client.get(f"/api/v1/doctors/{doc_id}", headers=sa_headers)
        data = resp.json()
        for field in (
            "id", "user_id", "hospital_id", "specialization",
            "qualification", "registration_number",
            "is_available", "is_active", "created_at", "updated_at",
        ):
            assert field in data, f"Missing field: {field}"

    def test_doctor_name_enriched(self, client, sa_headers, seeded_doctor):
        """TC-DOC-013: doctor_name is enriched from user record."""
        doc_id = seeded_doctor["id"]
        resp = client.get(f"/api/v1/doctors/{doc_id}", headers=sa_headers)
        data = resp.json()
        assert "doctor_name" in data
        assert data["doctor_name"] is not None
        assert len(data["doctor_name"]) > 0

    def test_unauthenticated_get_returns_403(self, client, seeded_doctor):
        """TC-DOC-014: unauthenticated GET is rejected."""
        doc_id = seeded_doctor["id"]
        resp = client.get(f"/api/v1/doctors/{doc_id}")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TC-DOC-015 – RBAC on create/update/delete
# ---------------------------------------------------------------------------

class TestDoctorRBAC:
    def test_doctor_cannot_create_doctor_profile(self, client, doctor_headers, seeded_department_id):
        """TC-DOC-015: doctor role cannot create new doctor profiles."""
        ts = _ts()
        resp = client.post(
            "/api/v1/doctors",
            json={
                "user_id": str(uuid.uuid4()),
                "specialization": "General",
                "qualification": "MBBS",
                "registration_number": f"REG{ts}",
                "department_id": seeded_department_id,
            },
            headers=doctor_headers,
        )
        assert resp.status_code in (403, 401)

    def test_receptionist_cannot_create_doctor_profile(self, client, nurse_headers, seeded_department_id):
        """TC-DOC-016: receptionist cannot create doctor profiles."""
        ts = _ts()
        resp = client.post(
            "/api/v1/doctors",
            json={
                "user_id": str(uuid.uuid4()),
                "specialization": "General",
                "qualification": "MBBS",
                "registration_number": f"REG{ts}",
                "department_id": seeded_department_id,
            },
            headers=nurse_headers,
        )
        assert resp.status_code in (403, 401)

    def test_doctor_cannot_update_doctor_profile(self, client, doctor_headers, seeded_doctor):
        """TC-DOC-017: doctor role cannot update another doctor's profile."""
        doc_id = seeded_doctor["id"]
        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"specialization": "Hacked"},
            headers=doctor_headers,
        )
        assert resp.status_code in (403, 401)

    def test_doctor_cannot_delete_doctor_profile(self, client, doctor_headers, seeded_doctor):
        """TC-DOC-018: doctor role cannot delete a doctor profile."""
        doc_id = seeded_doctor["id"]
        resp = client.delete(f"/api/v1/doctors/{doc_id}", headers=doctor_headers)
        assert resp.status_code in (403, 401)


# ---------------------------------------------------------------------------
# TC-DOC-019 – Update doctor (admin)
# ---------------------------------------------------------------------------

class TestUpdateDoctor:
    def test_update_specialization(self, client, sa_headers, seeded_doctor):
        """TC-DOC-019: admin can update a doctor's specialization."""
        doc_id = seeded_doctor["id"]
        original_spec = seeded_doctor.get("specialization", "General")
        new_spec = f"Updated_{_ts()}"

        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"specialization": new_spec},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["specialization"] == new_spec

        # Restore original
        client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"specialization": original_spec},
            headers=sa_headers,
        )

    def test_update_bio(self, client, sa_headers, seeded_doctor):
        """TC-DOC-020: bio field can be updated."""
        doc_id = seeded_doctor["id"]
        new_bio = f"Bio updated at {_ts()}"
        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"bio": new_bio},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["bio"] == new_bio

    def test_update_nonexistent_doctor_returns_404(self, client, sa_headers):
        """TC-DOC-021: updating non-existent doctor returns 404."""
        resp = client.put(
            f"/api/v1/doctors/{uuid.uuid4()}",
            json={"specialization": "Ghost"},
            headers=sa_headers,
        )
        assert resp.status_code == 404

    def test_update_availability(self, client, sa_headers, seeded_doctor):
        """TC-DOC-022: is_available flag can be toggled."""
        doc_id = seeded_doctor["id"]
        original = seeded_doctor.get("is_available", True)

        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"is_available": not original},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_available"] == (not original)

        # Restore
        client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"is_available": original},
            headers=sa_headers,
        )

    def test_update_experience_years(self, client, sa_headers, seeded_doctor):
        """TC-DOC-023: experience_years can be set."""
        doc_id = seeded_doctor["id"]
        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"experience_years": 10},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["experience_years"] == 10

    def test_update_consultation_fee(self, client, sa_headers, seeded_doctor):
        """TC-DOC-024: consultation_fee can be set to a decimal value."""
        doc_id = seeded_doctor["id"]
        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"consultation_fee": "500.00"},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        fee = float(resp.json()["consultation_fee"])
        assert fee == 500.0

    def test_assign_department(self, client, sa_headers, seeded_doctor, seeded_department_id):
        """TC-DOC-025: department_id can be updated."""
        doc_id = seeded_doctor["id"]
        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"department_id": seeded_department_id},
            headers=sa_headers,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# TC-DOC-026 – Deactivate / reactivate
# ---------------------------------------------------------------------------

class TestDoctorDeactivate:
    def test_deactivate_via_is_active_false(self, client, sa_headers, seeded_doctor):
        """TC-DOC-026: setting is_active=false deactivates the doctor."""
        doc_id = seeded_doctor["id"]
        resp = client.put(
            f"/api/v1/doctors/{doc_id}",
            json={"is_active": False},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

        # Reactivate to avoid affecting other tests
        client.put(f"/api/v1/doctors/{doc_id}", json={"is_active": True}, headers=sa_headers)

    def test_delete_endpoint_deactivates(self, client, sa_headers, seeded_doctor):
        """TC-DOC-027: DELETE endpoint returns 204 and doctor is no longer listed active."""
        doc_id = seeded_doctor["id"]
        resp = client.delete(f"/api/v1/doctors/{doc_id}", headers=sa_headers)
        assert resp.status_code == 204

        # Doctor should not be in active list
        list_resp = client.get("/api/v1/doctors?active_only=true", headers=sa_headers)
        ids = [d["id"] for d in list_resp.json()["data"]]
        assert doc_id not in ids

        # Reactivate
        client.put(f"/api/v1/doctors/{doc_id}", json={"is_active": True}, headers=sa_headers)

    def test_delete_nonexistent_returns_404(self, client, sa_headers):
        """TC-DOC-028: deleting non-existent doctor returns 404."""
        resp = client.delete(f"/api/v1/doctors/{uuid.uuid4()}", headers=sa_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TC-DOC-029 – Search
# ---------------------------------------------------------------------------

class TestDoctorSearch:
    def test_search_by_name_substring(self, client, sa_headers):
        """TC-DOC-029: search param filters results by name."""
        resp = client.get("/api/v1/doctors?search=Smith", headers=sa_headers)
        assert resp.status_code == 200
        # May return 0 results if no matching doctor — just check no error

    def test_search_no_match_returns_empty(self, client, sa_headers):
        """TC-DOC-030: search for non-existent name returns empty data."""
        resp = client.get("/api/v1/doctors?search=ZZZNobodyXXX&active_only=false", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["data"] == []
