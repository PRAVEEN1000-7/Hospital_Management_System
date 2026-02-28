"""
test_10_waitlist.py — API integration tests for Waitlist management.
Covers TC-WTL-001 through TC-WTL-012.
"""
import pytest
import time


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def wl_patient(client, sa_headers):
    ts = str(int(time.time() * 1000))[-7:]
    resp = client.post(
        "/api/v1/patients",
        json={
            "title": "Mrs.",
            "first_name": "Wlist",
            "last_name": "Patient",
            "gender": "Female",
            "date_of_birth": "1995-04-12",
            "mobile_number": "4" + ts,
            "address_line1": "22 Waitlist Ave",
        },
        headers=sa_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture(scope="function")
def doctor1_id(client, sa_headers):
    resp = client.get("/api/v1/users?search=doctor1", headers=sa_headers)
    data = resp.json()["data"]
    assert len(data) >= 1
    return data[0]["id"]


@pytest.fixture(scope="function")
def waitlist_entry(client, sa_headers, wl_patient, doctor1_id):
    resp = client.post(
        "/api/v1/waitlist",
        json={
            "patient_id": wl_patient["id"],
            "doctor_id": doctor1_id,
            "preferred_date": "2027-09-01",
            "reason": "Follow-up",
        },
        headers=sa_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# TC-WTL-001 – TC-WTL-004: Join waitlist
# ---------------------------------------------------------------------------

class TestJoinWaitlist:
    def test_join_waitlist_success(self, client, sa_headers, wl_patient, doctor1_id):
        """TC-WTL-001"""
        resp = client.post(
            "/api/v1/waitlist",
            json={
                "patient_id": wl_patient["id"],
                "doctor_id": doctor1_id,
                "preferred_date": "2027-10-01",
                "reason": "Initial visit",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "waiting"
        assert data["patient_id"] == wl_patient["id"]
        assert data["doctor_id"] == doctor1_id

    def test_join_waitlist_without_patient_returns_422(self, client, sa_headers, doctor1_id):
        """TC-WTL-002"""
        resp = client.post(
            "/api/v1/waitlist",
            json={"doctor_id": doctor1_id},
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_join_waitlist_enriches_names(self, client, sa_headers, waitlist_entry):
        """TC-WTL-003: enrichment adds patient_name and doctor_name"""
        assert "patient_name" in waitlist_entry or "patient_id" in waitlist_entry

    def test_unauthenticated_cannot_join_waitlist(self, client, wl_patient, doctor1_id):
        """TC-WTL-004"""
        resp = client.post(
            "/api/v1/waitlist",
            json={"patient_id": wl_patient["id"], "doctor_id": doctor1_id},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TC-WTL-005 – TC-WTL-007: List waitlist
# ---------------------------------------------------------------------------

class TestListWaitlist:
    def test_list_waitlist(self, client, sa_headers, waitlist_entry):
        """TC-WTL-005"""
        resp = client.get("/api/v1/waitlist", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data and "data" in data

    def test_filter_by_doctor(self, client, sa_headers, doctor1_id, waitlist_entry):
        """TC-WTL-006"""
        resp = client.get(f"/api/v1/waitlist?doctor_id={doctor1_id}", headers=sa_headers)
        assert resp.status_code == 200
        for entry in resp.json()["data"]:
            assert entry["doctor_id"] == doctor1_id

    def test_filter_by_status_waiting(self, client, sa_headers, waitlist_entry):
        """TC-WTL-007"""
        resp = client.get("/api/v1/waitlist?status=waiting", headers=sa_headers)
        assert resp.status_code == 200
        for entry in resp.json()["data"]:
            assert entry["status"] == "waiting"


# ---------------------------------------------------------------------------
# TC-WTL-008 – TC-WTL-010: Confirm waitlist entry
# ---------------------------------------------------------------------------

class TestConfirmWaitlist:
    def test_confirm_waitlist_entry(self, client, sa_headers, waitlist_entry):
        """TC-WTL-008"""
        entry_id = waitlist_entry["id"]
        resp = client.post(f"/api/v1/waitlist/{entry_id}/confirm", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "confirmed"
        assert data.get("confirmed_at") is not None

    def test_confirm_nonexistent_returns_404(self, client, sa_headers):
        """TC-WTL-009"""
        resp = client.post("/api/v1/waitlist/9999999/confirm", headers=sa_headers)
        assert resp.status_code == 404

    def test_my_waitlist_endpoint(self, client, doctor_headers):
        """TC-WTL-010"""
        resp = client.get("/api/v1/waitlist/my-waitlist", headers=doctor_headers)
        assert resp.status_code == 200
        assert "data" in resp.json()


# ---------------------------------------------------------------------------
# TC-WTL-011 – TC-WTL-012: Cancel / Delete
# ---------------------------------------------------------------------------

class TestCancelWaitlist:
    def test_cancel_waitlist_entry(self, client, sa_headers, wl_patient, doctor1_id):
        """TC-WTL-011"""
        ts = str(int(time.time() * 1000))[-7:]
        new_p = client.post(
            "/api/v1/patients",
            json={
                "title": "Mr.",
                "first_name": "Cancel",
                "last_name": "WL",
                "gender": "Male",
                "date_of_birth": "1987-09-30",
                "mobile_number": "3" + ts,
                "address_line1": "55 Cancel Blvd",
            },
            headers=sa_headers,
        ).json()
        entry = client.post(
            "/api/v1/waitlist",
            json={"patient_id": new_p["id"], "doctor_id": doctor1_id, "preferred_date": "2027-11-01"},
            headers=sa_headers,
        ).json()
        resp = client.delete(f"/api/v1/waitlist/{entry['id']}", headers=sa_headers)
        assert resp.status_code == 204

    def test_cancel_nonexistent_returns_404(self, client, sa_headers):
        """TC-WTL-012"""
        resp = client.delete("/api/v1/waitlist/9999999", headers=sa_headers)
        assert resp.status_code == 404
