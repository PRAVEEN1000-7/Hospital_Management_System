"""
test_04_auth.py — API integration tests for Authentication.
Covers TC-AUTH-001 through TC-AUTH-015.
"""
import pytest
from app.utils.security import decode_access_token


class TestLogin:
    """TC-AUTH-001 through TC-AUTH-006"""

    def test_superadmin_login_success(self, client):
        """TC-AUTH-001: valid superadmin credentials"""
        resp = client.post("/api/v1/auth/login", json={
            "username": "superadmin",
            "password": "Super@123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["username"] == "superadmin"

    def test_admin_login_success(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": "Admin@123"
        })
        assert resp.status_code == 200

    def test_doctor_login_success(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "username": "doctor1",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["role"] == "doctor"

    def test_wrong_password_returns_401(self, client):
        """TC-AUTH-002"""
        resp = client.post("/api/v1/auth/login", json={
            "username": "superadmin",
            "password": "WrongPassword!"
        })
        assert resp.status_code == 401
        assert "detail" in resp.json()

    def test_nonexistent_user_returns_401(self, client):
        """TC-AUTH-003"""
        resp = client.post("/api/v1/auth/login", json={
            "username": "nobody",
            "password": "SomePass@1"
        })
        assert resp.status_code == 401

    def test_empty_credentials_returns_422(self, client):
        """TC-AUTH-004"""
        resp = client.post("/api/v1/auth/login", json={
            "username": "",
            "password": ""
        })
        assert resp.status_code in (401, 422)

    def test_missing_password_field_returns_422(self, client):
        """TC-AUTH-005"""
        resp = client.post("/api/v1/auth/login", json={"username": "superadmin"})
        assert resp.status_code == 422

    def test_missing_username_field_returns_422(self, client):
        resp = client.post("/api/v1/auth/login", json={"password": "Admin@123"})
        assert resp.status_code == 422

    def test_token_payload_contains_expected_fields(self, client):
        """TC-AUTH-012: token payload has user_id, username, role"""
        resp = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        payload = decode_access_token(token)
        assert payload is not None
        assert "user_id" in payload
        assert "username" in payload
        assert "role" in payload
        assert payload["username"] == "admin"

    def test_login_returns_expires_in(self, client):
        """expires_in should be present and positive"""
        resp = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        assert resp.json()["expires_in"] > 0

    def test_login_updates_last_login(self, client, db_session):
        """TC-AUTH-011: last_login is updated after login"""
        from app.models.user import User as UserModel
        resp = client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        # Verify last_login is now set
        db_session.expire_all()
        user = db_session.query(UserModel).filter(UserModel.username == "admin").first()
        assert user.last_login is not None


class TestLogout:
    """TC-AUTH-007 through TC-AUTH-008"""

    def test_logout_with_valid_token(self, client, admin_headers):
        """TC-AUTH-007"""
        resp = client.post("/api/v1/auth/logout", headers=admin_headers)
        assert resp.status_code == 200
        assert "message" in resp.json()

    def test_logout_without_token_returns_403(self, client):
        """TC-AUTH-008"""
        resp = client.post("/api/v1/auth/logout")
        assert resp.status_code == 403


class TestRefreshToken:
    """TC-AUTH-009 through TC-AUTH-010"""

    def test_refresh_with_valid_token(self, client, admin_headers):
        """TC-AUTH-009"""
        resp = client.post("/api/v1/auth/refresh", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_refresh_without_token_returns_403(self, client):
        """TC-AUTH-010"""
        resp = client.post("/api/v1/auth/refresh")
        assert resp.status_code == 403


class TestProtectedRoutes:
    """TC-AUTH-013 through TC-AUTH-015"""

    def test_patient_list_without_auth_returns_403(self, client):
        """TC-AUTH-013"""
        resp = client.get("/api/v1/patients")
        assert resp.status_code == 403

    def test_patient_list_with_malformed_token(self, client):
        """TC-AUTH-014"""
        resp = client.get("/api/v1/patients", headers={"Authorization": "Bearer notAToken"})
        assert resp.status_code in (401, 403)

    def test_user_list_as_doctor_returns_403(self, client, doctor_headers):
        """TC-AUTH-015: doctor is not super_admin"""
        resp = client.get("/api/v1/users", headers=doctor_headers)
        assert resp.status_code == 403

    def test_user_list_as_nurse_returns_403(self, client, nurse_headers):
        resp = client.get("/api/v1/users", headers=nurse_headers)
        assert resp.status_code == 403

    def test_invalid_token_format(self, client):
        """Token with bad format"""
        resp = client.get("/api/v1/patients", headers={"Authorization": "Token abc123"})
        assert resp.status_code == 403
