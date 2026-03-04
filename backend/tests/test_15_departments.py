"""
test_15_departments.py — Deep integration tests for the Departments API.
Covers: auto-code generation, duplicate handling, role-based access,
        full CRUD lifecycle, field validation, and edge cases.
Test IDs: TC-DEPT-013 through TC-DEPT-035
"""
import pytest
import time
import uuid


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts():
    """Return a short unique suffix based on current time in ms."""
    return str(int(time.time() * 1000))[-7:]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def dept_payload():
    """Minimal valid department payload (no code — auto-generated)."""
    ts = _ts()
    return {
        "name": f"AutoDept_{ts}",
        "description": "Automated deep-test department",
    }


@pytest.fixture(scope="function")
def dept_with_code_payload():
    """Department payload with an explicit code."""
    ts = _ts()
    return {
        "name": f"ExplicitDept_{ts}",
        "code": f"EX{ts[-4:]}",
        "description": "Explicit code dept",
    }


@pytest.fixture(scope="function")
def created_dept(client, sa_headers, dept_payload):
    """Create a dept, return response JSON. Cleans up after test."""
    resp = client.post("/api/v1/departments", json=dept_payload, headers=sa_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# TC-DEPT-013 – Auto-code generation
# ---------------------------------------------------------------------------

class TestDepartmentAutoCode:
    def test_create_without_code_succeeds(self, client, sa_headers, dept_payload):
        """TC-DEPT-013: omitting code does not cause 422."""
        resp = client.post("/api/v1/departments", json=dept_payload, headers=sa_headers)
        assert resp.status_code == 201

    def test_auto_generated_code_present_in_response(self, client, sa_headers, dept_payload):
        """TC-DEPT-014: auto-code is non-empty string in response."""
        resp = client.post("/api/v1/departments", json=dept_payload, headers=sa_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "code" in data
        assert isinstance(data["code"], str)
        assert len(data["code"]) >= 2

    def test_explicit_code_preserved(self, client, sa_headers, dept_with_code_payload):
        """TC-DEPT-015: explicitly provided code is stored as-is."""
        resp = client.post("/api/v1/departments", json=dept_with_code_payload, headers=sa_headers)
        assert resp.status_code == 201
        assert resp.json()["code"] == dept_with_code_payload["code"]


# ---------------------------------------------------------------------------
# TC-DEPT-016 – Role-based access control
# ---------------------------------------------------------------------------

class TestDepartmentRBAC:
    def test_doctor_cannot_create_department(self, client, doctor_headers):
        """TC-DEPT-016: doctor role is forbidden from creating departments."""
        ts = _ts()
        resp = client.post(
            "/api/v1/departments",
            json={"name": f"DrCreated_{ts}"},
            headers=doctor_headers,
        )
        assert resp.status_code in (403, 401)

    def test_receptionist_cannot_create_department(self, client, nurse_headers):
        """TC-DEPT-017: receptionist role is forbidden from creating departments."""
        ts = _ts()
        resp = client.post(
            "/api/v1/departments",
            json={"name": f"ReceptionCreated_{ts}"},
            headers=nurse_headers,
        )
        assert resp.status_code in (403, 401)

    def test_admin_can_create_department(self, client, admin_headers):
        """TC-DEPT-018: admin role can create departments."""
        ts = _ts()
        resp = client.post(
            "/api/v1/departments",
            json={"name": f"AdminDept_{ts}"},
            headers=admin_headers,
        )
        assert resp.status_code == 201

    def test_doctor_can_read_departments(self, client, doctor_headers):
        """TC-DEPT-019: doctors can list departments (read-only access)."""
        resp = client.get("/api/v1/departments", headers=doctor_headers)
        assert resp.status_code == 200

    def test_doctor_cannot_update_department(self, client, doctor_headers, created_dept):
        """TC-DEPT-020: doctors cannot update departments."""
        dept_id = created_dept["id"]
        resp = client.put(
            f"/api/v1/departments/{dept_id}",
            json={"name": "HackerDept"},
            headers=doctor_headers,
        )
        assert resp.status_code in (403, 401)

    def test_doctor_cannot_delete_department(self, client, doctor_headers, created_dept):
        """TC-DEPT-021: doctors cannot delete departments."""
        dept_id = created_dept["id"]
        resp = client.delete(
            f"/api/v1/departments/{dept_id}",
            headers=doctor_headers,
        )
        assert resp.status_code in (403, 401)


# ---------------------------------------------------------------------------
# TC-DEPT-022 – Full CRUD lifecycle
# ---------------------------------------------------------------------------

class TestDepartmentCRUDLifecycle:
    def test_create_read_update_delete(self, client, sa_headers):
        """TC-DEPT-022: full lifecycle — create → read → update → delete."""
        ts = _ts()
        # Create
        create_resp = client.post(
            "/api/v1/departments",
            json={"name": f"LifecycleDept_{ts}", "description": "Created"},
            headers=sa_headers,
        )
        assert create_resp.status_code == 201
        dept = create_resp.json()
        dept_id = dept["id"]

        # Read
        get_resp = client.get(f"/api/v1/departments/{dept_id}", headers=sa_headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == dept_id

        # Update
        upd_resp = client.put(
            f"/api/v1/departments/{dept_id}",
            json={"description": "Updated description", "display_order": 5},
            headers=sa_headers,
        )
        assert upd_resp.status_code == 200
        assert upd_resp.json()["description"] == "Updated description"

        # Deactivate (soft delete via is_active=False)
        deact_resp = client.put(
            f"/api/v1/departments/{dept_id}",
            json={"is_active": False},
            headers=sa_headers,
        )
        assert deact_resp.status_code == 200
        assert deact_resp.json()["is_active"] is False

    def test_created_department_appears_in_list(self, client, sa_headers):
        """TC-DEPT-023: newly created dept appears in list response."""
        ts = _ts()
        name = f"ListCheckDept_{ts}"
        client.post(
            "/api/v1/departments",
            json={"name": name},
            headers=sa_headers,
        )
        list_resp = client.get("/api/v1/departments?active_only=false", headers=sa_headers)
        assert list_resp.status_code == 200
        data = list_resp.json()
        items = data.get("data", data) if isinstance(data, dict) else data
        names = [d["name"] for d in items]
        assert name in names

    def test_response_contains_required_fields(self, client, sa_headers, created_dept):
        """TC-DEPT-024: response has all required fields."""
        for field in ("id", "name", "code", "hospital_id", "is_active", "created_at", "updated_at"):
            assert field in created_dept, f"Missing field: {field}"


# ---------------------------------------------------------------------------
# TC-DEPT-025 – Validation edge cases
# ---------------------------------------------------------------------------

class TestDepartmentValidation:
    def test_name_too_short_returns_422(self, client, sa_headers):
        """TC-DEPT-025: name shorter than min_length=2 is rejected."""
        resp = client.post(
            "/api/v1/departments",
            json={"name": "X"},
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_name_missing_returns_422(self, client, sa_headers):
        """TC-DEPT-026: missing name returns 422."""
        resp = client.post(
            "/api/v1/departments",
            json={"description": "No name"},
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_unauthenticated_list_returns_403(self, client):
        """TC-DEPT-027: unauthenticated list request is rejected."""
        resp = client.get("/api/v1/departments")
        assert resp.status_code == 403

    def test_get_nonexistent_returns_404(self, client, sa_headers):
        """TC-DEPT-028: fetching a random UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/api/v1/departments/{fake_id}", headers=sa_headers)
        assert resp.status_code == 404

    def test_update_nonexistent_returns_404(self, client, sa_headers):
        """TC-DEPT-029: updating a non-existent dept returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.put(
            f"/api/v1/departments/{fake_id}",
            json={"name": "Ghost"},
            headers=sa_headers,
        )
        assert resp.status_code == 404

    def test_delete_nonexistent_returns_404(self, client, sa_headers):
        """TC-DEPT-030: deleting a non-existent dept returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/api/v1/departments/{fake_id}", headers=sa_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TC-DEPT-031 – list filtering
# ---------------------------------------------------------------------------

class TestDepartmentListFilter:
    def test_active_only_default_excludes_inactive(self, client, sa_headers):
        """TC-DEPT-031: active_only=true (default) excludes deactivated depts."""
        ts = _ts()
        name = f"ToBeDeactivated_{ts}"
        # Create then deactivate
        create_resp = client.post(
            "/api/v1/departments",
            json={"name": name},
            headers=sa_headers,
        )
        assert create_resp.status_code == 201
        dept_id = create_resp.json()["id"]
        client.put(
            f"/api/v1/departments/{dept_id}",
            json={"is_active": False},
            headers=sa_headers,
        )

        # List with active_only=true
        list_resp = client.get("/api/v1/departments?active_only=true", headers=sa_headers)
        items = list_resp.json().get("data", [])
        ids = [d["id"] for d in items]
        assert dept_id not in ids

    def test_active_only_false_includes_inactive(self, client, sa_headers):
        """TC-DEPT-032: active_only=false includes deactivated depts."""
        ts = _ts()
        name = f"DeactivatedIncl_{ts}"
        create_resp = client.post(
            "/api/v1/departments",
            json={"name": name},
            headers=sa_headers,
        )
        assert create_resp.status_code == 201
        dept_id = create_resp.json()["id"]
        client.put(
            f"/api/v1/departments/{dept_id}",
            json={"is_active": False},
            headers=sa_headers,
        )

        list_resp = client.get("/api/v1/departments?active_only=false", headers=sa_headers)
        items = list_resp.json().get("data", [])
        ids = [d["id"] for d in items]
        assert dept_id in ids

    def test_list_response_has_total_and_data(self, client, sa_headers):
        """TC-DEPT-033: list response includes 'total' and 'data' keys."""
        resp = client.get("/api/v1/departments", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "data" in data
        assert isinstance(data["data"], list)

    def test_display_order_can_be_set(self, client, sa_headers):
        """TC-DEPT-034: display_order field can be set and updated."""
        ts = _ts()
        create_resp = client.post(
            "/api/v1/departments",
            json={"name": f"OrderDept_{ts}", "display_order": 99},
            headers=sa_headers,
        )
        assert create_resp.status_code == 201
        assert create_resp.json().get("display_order") == 99

    def test_update_display_order(self, client, sa_headers, created_dept):
        """TC-DEPT-035: updating display_order persists correctly."""
        dept_id = created_dept["id"]
        upd_resp = client.put(
            f"/api/v1/departments/{dept_id}",
            json={"display_order": 42},
            headers=sa_headers,
        )
        assert upd_resp.status_code == 200
        assert upd_resp.json()["display_order"] == 42
