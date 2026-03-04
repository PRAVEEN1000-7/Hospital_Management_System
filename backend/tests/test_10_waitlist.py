"""
test_10_departments.py — API integration tests for Departments.
The waitlist router was removed in the hms_db schema refresh.
This file now covers Department CRUD (TC-DEPT-001 through TC-DEPT-012).
"""
import pytest
import time


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def new_department(client, sa_headers):
    """Create a fresh department and return the response JSON."""
    ts = str(int(time.time() * 1000))[-6:]
    resp = client.post(
        "/api/v1/departments",
        json={
            "name": f"TestDept_{ts}",
            "description": "Automated test department",
            "code": f"TD{ts[-4:]}",
        },
        headers=sa_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# TC-DEPT-001 – TC-DEPT-004: List departments
# ---------------------------------------------------------------------------

class TestListDepartments:
    def test_list_departments_authenticated(self, client, sa_headers):
        """TC-DEPT-001: any authenticated user can list departments"""
        resp = client.get("/api/v1/departments", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Accepts paginated or plain list response
        items = data.get("data", data) if isinstance(data, dict) else data
        assert isinstance(items, list)

    def test_list_departments_unauthenticated_returns_403(self, client):
        """TC-DEPT-002: unauthenticated request is rejected"""
        resp = client.get("/api/v1/departments")
        assert resp.status_code == 403

    def test_list_departments_doctor_can_access(self, client, doctor_headers):
        """TC-DEPT-003: doctors can view departments"""
        resp = client.get("/api/v1/departments", headers=doctor_headers)
        assert resp.status_code == 200

    def test_list_departments_contains_seeded(self, client, sa_headers):
        """TC-DEPT-004: at least the seeded departments are present"""
        resp = client.get("/api/v1/departments", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        items = data.get("data", data) if isinstance(data, dict) else data
        assert len(items) >= 1


# ---------------------------------------------------------------------------
# TC-DEPT-005 – TC-DEPT-007: Get by ID
# ---------------------------------------------------------------------------

class TestGetDepartment:
    def test_get_department_by_id(self, client, sa_headers, new_department):
        """TC-DEPT-005"""
        dept_id = new_department["id"]
        resp = client.get(f"/api/v1/departments/{dept_id}", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == dept_id

    def test_get_nonexistent_department_returns_404(self, client, sa_headers):
        """TC-DEPT-006"""
        resp = client.get(
            "/api/v1/departments/00000000-0000-0000-0000-000000000000",
            headers=sa_headers,
        )
        assert resp.status_code == 404

    def test_get_department_response_has_name(self, client, sa_headers, new_department):
        """TC-DEPT-007: response always has a name field"""
        dept_id = new_department["id"]
        resp = client.get(f"/api/v1/departments/{dept_id}", headers=sa_headers)
        assert "name" in resp.json()


# ---------------------------------------------------------------------------
# TC-DEPT-008 – TC-DEPT-010: Create department
# ---------------------------------------------------------------------------

class TestCreateDepartment:
    def test_create_department_success(self, client, sa_headers):
        """TC-DEPT-008"""
        ts = str(int(time.time() * 1000))[-6:]
        resp = client.post(
            "/api/v1/departments",
            json={"name": f"NewDept_{ts}", "description": "New test dept"},
            headers=sa_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert "NewDept_" in data["name"]

    def test_create_department_missing_name_returns_422(self, client, sa_headers):
        """TC-DEPT-009"""
        resp = client.post(
            "/api/v1/departments",
            json={"description": "No name given"},
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_receptionist_cannot_create_department(self, client, nurse_headers):
        """TC-DEPT-010: non-admin roles cannot create departments"""
        resp = client.post(
            "/api/v1/departments",
            json={"name": "UnauthorizedDept"},
            headers=nurse_headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TC-DEPT-011 – TC-DEPT-012: Update & deactivate
# ---------------------------------------------------------------------------

class TestUpdateDepartment:
    def test_update_department_name(self, client, sa_headers, new_department):
        """TC-DEPT-011"""
        dept_id = new_department["id"]
        ts = str(int(time.time() * 1000))[-5:]
        resp = client.put(
            f"/api/v1/departments/{dept_id}",
            json={"name": f"UpdatedDept_{ts}"},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert f"UpdatedDept_{ts}" == resp.json()["name"]

    def test_deactivate_department(self, client, sa_headers, new_department):
        """TC-DEPT-012: DELETE deactivates (soft-delete) the department"""
        dept_id = new_department["id"]
        resp = client.delete(f"/api/v1/departments/{dept_id}", headers=sa_headers)
        assert resp.status_code == 204
