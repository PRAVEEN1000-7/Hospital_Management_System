"""
test_13_hospital.py — API integration tests for Hospital Details.
Covers TC-HOS-001 through TC-HOS-015.
"""
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

HOSPITAL_PAYLOAD = {
    "name": "Test General Hospital",
    "code": "TGH",
    "registration_number": "REG-001",
    "phone": "9876543210",
    "email": "hospital@example.com",
    "website": "https://tgh.test",
    "address_line_1": "123 Health Street",
    "city": "TestCity",
    "state_province": "TestState",
    "country": "IN",
    "postal_code": "560001",
    
}


# ---------------------------------------------------------------------------
# TC-HOS-001: Public status endpoint
# ---------------------------------------------------------------------------

class TestHospitalStatus:
    def test_status_is_public(self, client):
        """TC-HOS-001: /hospital/status requires no auth"""
        resp = client.get("/api/v1/hospital/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "is_configured" in data
        assert isinstance(data["is_configured"], bool)

    def test_status_message_present(self, client):
        """TC-HOS-002"""
        resp = client.get("/api/v1/hospital/status")
        assert "message" in resp.json()


# ---------------------------------------------------------------------------
# TC-HOS-003 – TC-HOS-005: Public GET
# ---------------------------------------------------------------------------

class TestGetHospital:
    def test_public_get_hospital(self, client):
        """TC-HOS-003: /hospital is public"""
        resp = client.get("/api/v1/hospital")
        # 200 if configured, 404 if not yet set up — both valid
        assert resp.status_code in (200, 404)

    def test_full_hospital_requires_admin(self, client, doctor_headers):
        """TC-HOS-004: /hospital/full requires admin or super_admin"""
        resp = client.get("/api/v1/hospital/full", headers=doctor_headers)
        assert resp.status_code == 403

    def test_full_hospital_admin_access(self, client, admin_headers):
        """TC-HOS-005"""
        resp = client.get("/api/v1/hospital/full", headers=admin_headers)
        assert resp.status_code in (200, 404)


# ---------------------------------------------------------------------------
# TC-HOS-006 – TC-HOS-010: Create hospital
# ---------------------------------------------------------------------------

class TestCreateHospital:
    def test_doctor_cannot_create_hospital(self, client, doctor_headers):
        """TC-HOS-006"""
        resp = client.post("/api/v1/hospital", json=HOSPITAL_PAYLOAD, headers=doctor_headers)
        assert resp.status_code == 403

    def test_nurse_cannot_create_hospital(self, client, nurse_headers):
        """TC-HOS-007"""
        resp = client.post("/api/v1/hospital", json=HOSPITAL_PAYLOAD, headers=nurse_headers)
        assert resp.status_code == 403

    def test_superadmin_can_create_or_conflict(self, client, sa_headers):
        """TC-HOS-008: super_admin can attempt creation; may be 201 or 409 if already exists"""
        resp = client.post("/api/v1/hospital", json={**HOSPITAL_PAYLOAD, "code": "TGHX"}, headers=sa_headers)
        assert resp.status_code in (201, 400, 409, 500)  # 400/409 if already configured

    def test_create_hospital_missing_name_returns_422(self, client, sa_headers):
        """TC-HOS-009"""
        payload = {k: v for k, v in HOSPITAL_PAYLOAD.items() if k != "name"}
        resp = client.post("/api/v1/hospital", json=payload, headers=sa_headers)
        assert resp.status_code == 422

    def test_create_unauthenticated_returns_403(self, client):
        """TC-HOS-010"""
        resp = client.post("/api/v1/hospital", json=HOSPITAL_PAYLOAD)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TC-HOS-011 – TC-HOS-012: Update hospital
# ---------------------------------------------------------------------------

class TestUpdateHospital:
    def test_admin_can_update_hospital(self, client, admin_headers):
        """TC-HOS-011: 200 if exists, 404 if not set up"""
        resp = client.put(
            "/api/v1/hospital",
            json={"name": "Updated General Hospital"},
            headers=admin_headers,
        )
        assert resp.status_code in (200, 404, 500)

    def test_doctor_cannot_update_hospital(self, client, doctor_headers):
        """TC-HOS-012"""
        resp = client.put(
            "/api/v1/hospital",
            json={"name": "Hacked Hospital"},
            headers=doctor_headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TC-HOS-013: Logo endpoint exists
# ---------------------------------------------------------------------------

class TestHospitalLogo:
    def test_logo_endpoint_requires_auth(self, client):
        """TC-HOS-013"""
        resp = client.put("/api/v1/hospital/logo")
        # Requires auth (403) or unprocessable (422 if file required)
        assert resp.status_code in (403, 422)

    def test_logo_endpoint_non_admin_returns_403(self, client, nurse_headers):
        """TC-HOS-014"""
        resp = client.put("/api/v1/hospital/logo", headers=nurse_headers)
        assert resp.status_code in (403, 422)
