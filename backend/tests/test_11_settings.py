"""
test_11_settings.py - API integration tests for Hospital Settings.
Updated for hms_db: endpoint is now /api/v1/hospital-settings (GET+PUT).
Old /api/v1/appointment-settings endpoint no longer exists.
Covers TC-SET-001 through TC-SET-010.
"""
import pytest


class TestGetSettings:
    def test_get_settings_any_auth(self, client, sa_headers):
        """TC-SET-001: any authenticated user can read settings"""
        resp = client.get("/api/v1/hospital-settings", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)

    def test_get_settings_as_doctor(self, client, doctor_headers):
        """TC-SET-002"""
        resp = client.get("/api/v1/hospital-settings", headers=doctor_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    def test_get_settings_unauthenticated_returns_403(self, client):
        """TC-SET-003"""
        resp = client.get("/api/v1/hospital-settings")
        assert resp.status_code == 403

    def test_settings_contain_expected_keys(self, client, sa_headers):
        """TC-SET-004: response has core settings fields"""
        resp = client.get("/api/v1/hospital-settings", headers=sa_headers)
        data = resp.json()
        assert "appointment_slot_duration_minutes" in data
        assert "allow_walk_in" in data


class TestUpdateSettings:
    def test_superadmin_can_update_setting(self, client, sa_headers):
        """TC-SET-005"""
        current = client.get("/api/v1/hospital-settings", headers=sa_headers).json()
        current_duration = current.get("appointment_slot_duration_minutes", 30)

        resp = client.put(
            "/api/v1/hospital-settings",
            json={"appointment_slot_duration": current_duration},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["appointment_slot_duration_minutes"] == current_duration

    def test_admin_can_update_setting(self, client, admin_headers):
        """TC-SET-006"""
        resp = client.put(
            "/api/v1/hospital-settings",
            json={"appointment_buffer_minutes": 10},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["appointment_buffer_minutes"] == 10

    def test_doctor_cannot_update_setting(self, client, doctor_headers):
        """TC-SET-007"""
        resp = client.put(
            "/api/v1/hospital-settings",
            json={"appointment_slot_duration": 20},
            headers=doctor_headers,
        )
        assert resp.status_code == 403

    def test_nurse_cannot_update_setting(self, client, nurse_headers):
        """TC-SET-008"""
        resp = client.put(
            "/api/v1/hospital-settings",
            json={"enable_sms_notifications": True},
            headers=nurse_headers,
        )
        assert resp.status_code == 403

    def test_partial_update_only_changes_specified_fields(self, client, sa_headers):
        """TC-SET-009: PUT is partial"""
        before = client.get("/api/v1/hospital-settings", headers=sa_headers).json()
        resp = client.put(
            "/api/v1/hospital-settings",
            json={"enable_email_notifications": True},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        after = resp.json()
        assert after.get("appointment_slot_duration_minutes") == before.get("appointment_slot_duration_minutes")

    def test_setting_response_has_expected_fields(self, client, sa_headers):
        """TC-SET-010"""
        resp = client.get("/api/v1/hospital-settings", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "hospital_id" in data
        assert "appointment_slot_duration_minutes" in data
        assert "allow_walk_in" in data
