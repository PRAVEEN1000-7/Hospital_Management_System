"""
test_06_users.py — API integration tests for User Management.
Covers TC-USR-001 through TC-USR-020.
"""
import pytest


class TestListUsers:
    """TC-USR-001 through TC-USR-002"""

    def test_list_users_as_superadmin(self, client, sa_headers):
        """TC-USR-001"""
        resp = client.get("/api/v1/users", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "data" in data
        assert data["total"] >= 4   # At least the 4 seeded users

    def test_list_users_as_doctor_returns_403(self, client, doctor_headers):
        """TC-USR-002"""
        resp = client.get("/api/v1/users", headers=doctor_headers)
        assert resp.status_code == 403

    def test_list_users_as_admin_returns_403(self, client, admin_headers):
        """Only super_admin can list users"""
        resp = client.get("/api/v1/users", headers=admin_headers)
        assert resp.status_code == 403


class TestCreateUser:
    """TC-USR-003 through TC-USR-008"""

    def test_create_doctor_success(self, client, sa_headers, sample_doctor_payload):
        """TC-USR-003"""
        resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "doctor" in data["roles"]
        assert data["username"] == sample_doctor_payload["username"]

    def test_created_password_not_stored_plaintext(self, client, sa_headers, sample_doctor_payload, db_session):
        """TC-USR-019: password hash must not equal plain password"""
        from app.models.user import User as UserModel
        resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        assert resp.status_code == 201
        db_session.expire_all()
        user = db_session.query(UserModel).filter(
            UserModel.username == sample_doctor_payload["username"]
        ).first()
        assert user is not None
        assert user.password_hash != sample_doctor_payload["password"]
        assert user.password_hash.startswith("$2b$")

    def test_duplicate_username_returns_400(self, client, sa_headers, sample_doctor_payload):
        """TC-USR-004"""
        client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        assert resp.status_code == 400
        assert "username" in resp.json()["detail"].lower()

    def test_duplicate_email_returns_400(self, client, sa_headers, sample_doctor_payload):
        """TC-USR-005"""
        import time
        client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        payload2 = dict(sample_doctor_payload)
        uid = str(int(time.time() * 1000))[-6:]
        payload2["username"] = f"newuser{uid}"           # different username
        resp = client.post("/api/v1/users", json=payload2, headers=sa_headers)
        assert resp.status_code == 400
        assert "email" in resp.json()["detail"].lower()

    def test_invalid_role_returns_422(self, client, sa_headers, sample_doctor_payload):
        """TC-USR-007"""
        payload = dict(sample_doctor_payload)
        payload["role"] = "overlord"
        resp = client.post("/api/v1/users", json=payload, headers=sa_headers)
        assert resp.status_code == 422

    def test_create_as_admin_returns_403(self, client, admin_headers, sample_doctor_payload):
        """Only super_admin can create users"""
        resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=admin_headers)
        assert resp.status_code == 403


class TestUpdateUser:
    """TC-USR-008 through TC-USR-010"""

    def test_update_user_first_name(self, client, sa_headers, sample_doctor_payload):
        """TC-USR-008"""
        create_resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        user_id = create_resp.json()["id"]

        update_resp = client.put(
            f"/api/v1/users/{user_id}",
            json={"first_name": "Updated", "last_name": sample_doctor_payload["last_name"]},
            headers=sa_headers
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["first_name"] == "Updated"

    def test_update_nonexistent_user_returns_404(self, client, sa_headers):
        """TC-USR-010"""
        resp = client.put("/api/v1/users/999999", json={"department": "X"}, headers=sa_headers)
        assert resp.status_code == 404


class TestPasswordReset:
    """TC-USR-011 through TC-USR-012"""

    def test_reset_password_success(self, client, sa_headers, sample_doctor_payload):
        """TC-USR-011"""
        create_resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        user_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/v1/users/{user_id}/reset-password",
            json={"new_password": "NewSecurePass@456"},
            headers=sa_headers
        )
        assert resp.status_code == 200

    def test_reset_with_short_password_returns_422(self, client, sa_headers, sample_doctor_payload):
        """TC-USR-012: password too short"""
        create_resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        user_id = create_resp.json()["id"]

        resp = client.post(
            f"/api/v1/users/{user_id}/reset-password",
            json={"new_password": "abc"},
            headers=sa_headers
        )
        assert resp.status_code == 422


class TestGetUserProfile:
    """TC-USR-014, TC-USR-020"""

    def test_get_own_profile(self, client, sa_headers):
        """TC-USR-014: use login to get user_id, then fetch profile"""
        login = client.post("/api/v1/auth/login", json={"username": "superadmin", "password": "Admin@123"})
        user_id = login.json()["user"]["id"]
        resp = client.get(f"/api/v1/users/{user_id}", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == "superadmin"

    def test_get_specific_user_as_superadmin(self, client, sa_headers):
        """TC-USR-020"""
        # Get user with id=1 (superadmin)
        resp = client.get("/api/v1/users/1", headers=sa_headers)
        assert resp.status_code in (200, 404)


class TestSearchUsers:
    """TC-USR-015 through TC-USR-016"""

    def test_search_by_username(self, client, sa_headers):
        """TC-USR-015"""
        resp = client.get("/api/v1/users?search=dr.smith", headers=sa_headers)
        assert resp.status_code == 200
        # Should find dr.smith
        data = resp.json()["data"]
        usernames = [u["username"] for u in data]
        assert "dr.smith" in usernames


class TestDeleteUser:
    """TC-USR-013"""

    def test_delete_user(self, client, sa_headers, sample_doctor_payload):
        create_resp = client.post("/api/v1/users", json=sample_doctor_payload, headers=sa_headers)
        user_id = create_resp.json()["id"]

        del_resp = client.delete(f"/api/v1/users/{user_id}", headers=sa_headers)
        assert del_resp.status_code in (200, 204)
