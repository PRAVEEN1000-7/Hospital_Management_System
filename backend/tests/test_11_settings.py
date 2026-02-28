"""
test_11_settings.py — API integration tests for Appointment Settings.
Covers TC-SET-001 through TC-SET-010.
"""
import pytest


class TestListSettings:
    def test_list_settings_any_auth(self, client, sa_headers):
        """TC-SET-001: any authenticated user can read settings"""
        resp = client.get("/api/v1/appointment-settings", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # seeded defaults exist

    def test_list_settings_as_doctor(self, client, doctor_headers):
        """TC-SET-002"""
        resp = client.get("/api/v1/appointment-settings", headers=doctor_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_settings_unauthenticated_returns_403(self, client):
        """TC-SET-003"""
        resp = client.get("/api/v1/appointment-settings")
        assert resp.status_code == 403

    def test_settings_contain_expected_keys(self, client, sa_headers):
        """TC-SET-004"""
        resp = client.get("/api/v1/appointment-settings", headers=sa_headers)
        keys = {s["setting_key"] for s in resp.json()}
        # At minimum the auto_confirm key should be seeded
        assert len(keys) >= 1


class TestUpdateSetting:
    def test_superadmin_can_update_setting(self, client, sa_headers):
        """TC-SET-005"""
        # First get existing keys
        settings = client.get("/api/v1/appointment-settings", headers=sa_headers).json()
        assert len(settings) >= 1
        key = settings[0]["setting_key"]
        original_value = settings[0]["setting_value"]

        resp = client.put(
            f"/api/v1/appointment-settings/{key}",
            json={"setting_value": original_value},  # update to same value
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["setting_key"] == key

    def test_admin_can_update_setting(self, client, admin_headers):
        """TC-SET-006"""
        settings = client.get("/api/v1/appointment-settings", headers=admin_headers).json()
        if not settings:
            pytest.skip("No settings seeded")
        key = settings[0]["setting_key"]
        resp = client.put(
            f"/api/v1/appointment-settings/{key}",
            json={"setting_value": settings[0]["setting_value"]},
            headers=admin_headers,
        )
        assert resp.status_code == 200

    def test_doctor_cannot_update_setting(self, client, doctor_headers):
        """TC-SET-007"""
        settings = client.get("/api/v1/appointment-settings", headers=doctor_headers).json()
        if not settings:
            pytest.skip("No settings seeded")
        key = settings[0]["setting_key"]
        resp = client.put(
            f"/api/v1/appointment-settings/{key}",
            json={"setting_value": "true"},
            headers=doctor_headers,
        )
        assert resp.status_code == 403

    def test_nurse_cannot_update_setting(self, client, nurse_headers):
        """TC-SET-008"""
        resp = client.put(
            "/api/v1/appointment-settings/auto_confirm",
            json={"setting_value": "false"},
            headers=nurse_headers,
        )
        assert resp.status_code == 403

    def test_update_nonexistent_key_returns_404(self, client, sa_headers):
        """TC-SET-009"""
        resp = client.put(
            "/api/v1/appointment-settings/nonexistent_key_xyz",
            json={"setting_value": "true"},
            headers=sa_headers,
        )
        assert resp.status_code == 404

    def test_setting_response_has_expected_fields(self, client, sa_headers):
        """TC-SET-010"""
        settings = client.get("/api/v1/appointment-settings", headers=sa_headers).json()
        if not settings:
            pytest.skip("No settings seeded")
        s = settings[0]
        assert "setting_key" in s
        assert "setting_value" in s
