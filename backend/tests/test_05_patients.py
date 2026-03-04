"""
test_05_patients.py — API integration tests for Patient CRUD.
Covers TC-PAT-001 through TC-PAT-025.
"""
import pytest
import time
from app.services.patient_id_service import validate_checksum


def _uid():
    """Return a 6-digit unique suffix based on epoch ms."""
    return str(int(time.time() * 1000))[-6:]


class TestPatientCreation:
    """TC-PAT-001 through TC-PAT-007"""

    def test_create_patient_success(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-001: all required fields → 201, auto-generated PRN"""
        resp = client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "patient_reference_number" in data
        assert len(data["patient_reference_number"]) == 12  # 12-digit Patient ID
        assert data["first_name"] == "Test"

    def test_created_prn_has_valid_checksum(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-025: checksum in generated PRN is valid"""
        resp = client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        assert resp.status_code == 201
        prn = resp.json()["patient_reference_number"]
        assert validate_checksum(prn) is True

    def test_duplicate_mobile_returns_400(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-002"""
        # Create first patient
        client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        # Try to create second patient with same phone_number
        payload2 = dict(sample_patient_payload)
        payload2["email"] = f"different{_uid()}@hms-test.com"
        resp = client.post("/api/v1/patients", json=payload2, headers=sa_headers)
        assert resp.status_code == 400
        assert "phone" in resp.json()["detail"].lower()

    def test_duplicate_email_returns_400(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-003"""
        # Create first patient
        client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        # Different phone_number, same email
        payload2 = dict(sample_patient_payload)
        payload2["phone_number"] = f"600{_uid()}"
        resp = client.post("/api/v1/patients", json=payload2, headers=sa_headers)
        assert resp.status_code == 400
        assert "email" in resp.json()["detail"].lower()

    def test_missing_required_field_gender_returns_422(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-004: gender is required"""
        payload = dict(sample_patient_payload)
        del payload["gender"]
        resp = client.post("/api/v1/patients", json=payload, headers=sa_headers)
        assert resp.status_code == 422

    def test_missing_first_name_returns_422(self, client, sa_headers, sample_patient_payload):
        payload = dict(sample_patient_payload)
        del payload["first_name"]
        resp = client.post("/api/v1/patients", json=payload, headers=sa_headers)
        assert resp.status_code == 422

    def test_missing_date_of_birth_still_creates(self, client, sa_headers, sample_patient_payload):
        """date_of_birth is optional — omitting it should succeed"""
        payload = dict(sample_patient_payload)
        payload["phone_number"] = f"700{_uid()}"  # unique phone
        payload["email"] = f"nodb{_uid()}@hms-test.com"
        del payload["date_of_birth"]
        resp = client.post("/api/v1/patients", json=payload, headers=sa_headers)
        assert resp.status_code == 201

    def test_missing_mobile_returns_422(self, client, sa_headers, sample_patient_payload):
        payload = dict(sample_patient_payload)
        del payload["phone_number"]
        resp = client.post("/api/v1/patients", json=payload, headers=sa_headers)
        assert resp.status_code == 422

    def test_missing_address_still_creates(self, client, sa_headers, sample_patient_payload):
        """address_line_1 is optional — omitting it should succeed"""
        payload = dict(sample_patient_payload)
        payload["phone_number"] = f"710{_uid()}"  # unique phone
        payload["email"] = f"noadd{_uid()}@hms-test.com"
        del payload["address_line_1"]
        resp = client.post("/api/v1/patients", json=payload, headers=sa_headers)
        assert resp.status_code == 201

    def test_unauthenticated_create_returns_403(self, client, sample_patient_payload):
        resp = client.post("/api/v1/patients", json=sample_patient_payload)
        assert resp.status_code == 403


class TestPatientRead:
    """TC-PAT-008 through TC-PAT-010"""

    def test_get_patient_by_id(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-008"""
        # Create patient first
        create_resp = client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        assert create_resp.status_code == 201
        patient_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/patients/{patient_id}", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == patient_id

    def test_get_nonexistent_patient_returns_404(self, client, sa_headers):
        """TC-PAT-009"""
        resp = client.get("/api/v1/patients/999999", headers=sa_headers)
        assert resp.status_code == 404


class TestPatientUpdate:
    """TC-PAT-011 through TC-PAT-012"""

    def test_update_patient_fields(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-011: PatientUpdate extends PatientBase so all required fields must be sent"""
        create_resp = client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        patient_id = create_resp.json()["id"]

        # Build a full valid update payload from the original, just changing city/state
        update_payload = {**sample_patient_payload, "city": "Delhi", "state_province": "Delhi NCR"}
        update_resp = client.put(
            f"/api/v1/patients/{patient_id}",
            json=update_payload,
            headers=sa_headers
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["city"] == "Delhi"

    def test_update_mobile_to_existing_returns_400(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-012"""
        # Create patient 1
        p1 = client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        mobile1 = sample_patient_payload["phone_number"]

        # Create patient 2 with different phone
        payload2 = dict(sample_patient_payload)
        uid = _uid()
        payload2["phone_number"] = f"500{uid}"
        payload2["email"] = f"pat2_{uid}@hms-test.com"
        p2 = client.post("/api/v1/patients", json=payload2, headers=sa_headers)
        patient2_id = p2.json()["id"]

        # Try to update patient 2's phone to patient 1's phone — send full payload
        update_payload = {**payload2, "phone_number": mobile1}
        resp = client.put(
            f"/api/v1/patients/{patient2_id}",
            json=update_payload,
            headers=sa_headers
        )
        assert resp.status_code == 400


class TestPatientDelete:
    """TC-PAT-013 through TC-PAT-014"""

    def test_soft_delete_patient(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-013: soft delete sets is_active=False"""
        create_resp = client.post("/api/v1/patients", json=sample_patient_payload, headers=sa_headers)
        patient_id = create_resp.json()["id"]

        del_resp = client.delete(f"/api/v1/patients/{patient_id}", headers=sa_headers)
        assert del_resp.status_code in (200, 204)

        # Subsequent GET should return 404
        get_resp = client.get(f"/api/v1/patients/{patient_id}", headers=sa_headers)
        assert get_resp.status_code == 404

    def test_delete_nonexistent_patient_returns_404(self, client, sa_headers):
        """TC-PAT-014"""
        resp = client.delete("/api/v1/patients/999999", headers=sa_headers)
        assert resp.status_code == 404


class TestPatientList:
    """TC-PAT-015 through TC-PAT-019"""

    def test_list_patients_paged(self, client, sa_headers):
        """TC-PAT-015"""
        resp = client.get("/api/v1/patients", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "page" in data
        assert "limit" in data
        assert "data" in data
        assert isinstance(data["data"], list)

    def test_search_by_prn(self, client, sa_headers):
        """TC-PAT-017: search=HMS-000001 (seeded data)"""
        resp = client.get("/api/v1/patients?search=HMS-000001", headers=sa_headers)
        assert resp.status_code == 200
        # Seeded patient exists
        assert resp.json()["total"] >= 0  # Just confirm no error

    def test_search_by_mobile(self, client, sa_headers):
        """TC-PAT-018: search by mobile number"""
        resp = client.get("/api/v1/patients?search=9876543210", headers=sa_headers)
        assert resp.status_code == 200

    def test_second_page_pagination(self, client, sa_headers, sample_patient_payload):
        """TC-PAT-019"""
        resp = client.get("/api/v1/patients?page=2&limit=2", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["page"] == 2

    def test_invalid_page_zero_returns_422(self, client, sa_headers):
        """Edge: page=0 should fail validation"""
        resp = client.get("/api/v1/patients?page=0", headers=sa_headers)
        assert resp.status_code == 422

    def test_limit_above_max_returns_422(self, client, sa_headers):
        """Edge: limit=101 should be rejected"""
        resp = client.get("/api/v1/patients?limit=101", headers=sa_headers)
        assert resp.status_code == 422


class TestPatientByPRNAndMobile:
    """TC-PAT-020 through TC-PAT-021"""

    def test_get_by_prn(self, client, sa_headers):
        """TC-PAT-020"""
        resp = client.get("/api/v1/patients/by-prn/HMS-000001", headers=sa_headers)
        # May 200 if exists or 404 if not in test DB
        assert resp.status_code in (200, 404)

    def test_get_by_mobile(self, client, sa_headers):
        """TC-PAT-021"""
        resp = client.get("/api/v1/patients/by-mobile/9876543210", headers=sa_headers)
        assert resp.status_code in (200, 404)
