"""
test_07_schedules.py — API integration tests for Doctor Schedules.
Updated for hms_db schema: day_of_week (0=Sunday, 1=Monday …),
slot_duration_minutes, max_patients, effective_from (required).
Covers TC-SCH-001 through TC-SCH-020.
"""
import pytest
from datetime import date, timedelta


def _next_monday():
    """Return next Monday's date as ISO string.
    Python weekday(): Mon=0.  hms_db day_of_week: Mon=1.
    """
    today = date.today()
    days_ahead = 0 - today.weekday()   # Monday=0 in Python
    if days_ahead <= 0:
        days_ahead += 7
    return (today + timedelta(days=days_ahead)).isoformat()


@pytest.fixture(scope="function")
def doctor1_id(client, sa_headers):
    """Return the doctors.id for the first seeded doctor (dr.smith)."""
    resp = client.get("/api/v1/doctors?limit=100", headers=sa_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1, "No doctors found in DB"
    return data[0]["id"]


@pytest.fixture(scope="function")
def monday_schedule(client, sa_headers, doctor1_id):
    """Create a Monday schedule for doctor1 and return the response JSON."""
    resp = client.post(
        f"/api/v1/schedules/doctors/{doctor1_id}",
        json={
            "day_of_week": 1,                          # 1 = Monday in hms_db
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "slot_duration_minutes": 30,
            "max_patients": 1,
            "is_active": True,
            "effective_from": date.today().isoformat(),
        },
        headers=sa_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestListDoctors:
    """TC-SCH-001"""

    def test_list_doctors(self, client, sa_headers):
        resp = client.get("/api/v1/schedules/doctors", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # dr.smith is seeded


class TestCreateSchedule:
    """TC-SCH-002 through TC-SCH-008"""

    def test_create_schedule_success(self, client, sa_headers, doctor1_id):
        """TC-SCH-002"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "day_of_week": 1,                          # 1 = Monday
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_duration_minutes": 30,
                "max_patients": 1,
                "is_active": True,
                "effective_from": date.today().isoformat(),
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["day_of_week"] == 1
        assert data["doctor_id"] == doctor1_id

    def test_end_time_before_start_time_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-003"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "day_of_week": 2,
                "start_time": "17:00:00",
                "end_time": "09:00:00",           # end before start
                "slot_duration_minutes": 30,
                "effective_from": date.today().isoformat(),
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_slot_duration_too_small_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-004"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "day_of_week": 2,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_duration_minutes": 4,        # below minimum of 5
                "effective_from": date.today().isoformat(),
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_slot_duration_too_large_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-005"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "day_of_week": 2,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_duration_minutes": 121,      # above max of 120
                "effective_from": date.today().isoformat(),
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_get_doctor_schedules(self, client, sa_headers, doctor1_id, monday_schedule):
        """TC-SCH-007"""
        resp = client.get(f"/api/v1/schedules/doctors/{doctor1_id}", headers=sa_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        ids = [s["id"] for s in resp.json()]
        assert monday_schedule["id"] in ids

    def test_bulk_create_schedules(self, client, sa_headers, doctor1_id):
        """TC-SCH-008"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}/bulk",
            json={
                "doctor_id": doctor1_id,
                "schedules": [
                    {
                        "day_of_week": 2,
                        "start_time": "09:00:00",
                        "end_time": "13:00:00",
                        "slot_duration_minutes": 20,
                        "effective_from": date.today().isoformat(),
                    },
                    {
                        "day_of_week": 3,
                        "start_time": "09:00:00",
                        "end_time": "13:00:00",
                        "slot_duration_minutes": 20,
                        "effective_from": date.today().isoformat(),
                    },
                    {
                        "day_of_week": 4,
                        "start_time": "09:00:00",
                        "end_time": "13:00:00",
                        "slot_duration_minutes": 20,
                        "effective_from": date.today().isoformat(),
                    },
                ],
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201
        assert len(resp.json()) == 3

    def test_receptionist_cannot_create_schedule(self, client, nurse_headers, doctor1_id):
        """TC-SCH-018: receptionist cannot manage doctor schedules"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "day_of_week": 5,
                "start_time": "09:00:00",
                "end_time": "12:00:00",
                "slot_duration_minutes": 30,
                "effective_from": date.today().isoformat(),
            },
            headers=nurse_headers,
        )
        assert resp.status_code == 403


class TestUpdateAndDeleteSchedule:
    """TC-SCH-009 through TC-SCH-010"""

    def test_update_schedule(self, client, sa_headers, monday_schedule):
        """TC-SCH-009"""
        schedule_id = monday_schedule["id"]
        resp = client.put(
            f"/api/v1/schedules/{schedule_id}",
            json={"slot_duration_minutes": 45},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["slot_duration_minutes"] == 45

    def test_delete_schedule(self, client, sa_headers, monday_schedule):
        """TC-SCH-010"""
        schedule_id = monday_schedule["id"]
        resp = client.delete(f"/api/v1/schedules/{schedule_id}", headers=sa_headers)
        assert resp.status_code == 204

    def test_update_nonexistent_schedule_returns_404(self, client, sa_headers):
        resp = client.put(
            "/api/v1/schedules/00000000-0000-0000-0000-000000000000",
            json={"slot_duration_minutes": 30},
            headers=sa_headers,
        )
        assert resp.status_code == 404


class TestDoctorLeaves:
    """TC-SCH-011 through TC-SCH-014 — Doctor leave management."""

    def test_create_doctor_leave(self, client, sa_headers, doctor1_id):
        """TC-SCH-011: create a full-day leave entry"""
        resp = client.post(
            "/api/v1/schedules/doctor-leaves",
            json={
                "doctor_id": doctor1_id,
                "leave_date": "2027-12-25",
                "leave_type": "full_day",
                "reason": "Christmas holiday",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["doctor_id"] == doctor1_id
        assert data["leave_type"] == "full_day"

    def test_create_leave_morning_session(self, client, sa_headers, doctor1_id):
        """TC-SCH-012: create a morning-only leave"""
        resp = client.post(
            "/api/v1/schedules/doctor-leaves",
            json={
                "doctor_id": doctor1_id,
                "leave_date": "2027-12-26",
                "leave_type": "morning",
                "reason": "Personal appointment",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["leave_type"] == "morning"

    def test_list_doctor_leaves(self, client, sa_headers, doctor1_id):
        """TC-SCH-013: list all leaves for a doctor"""
        # Ensure at least one leave exists
        client.post(
            "/api/v1/schedules/doctor-leaves",
            json={
                "doctor_id": doctor1_id,
                "leave_date": "2027-11-01",
                "leave_type": "full_day",
            },
            headers=sa_headers,
        )
        resp = client.get(
            f"/api/v1/schedules/doctor-leaves?doctor_id={doctor1_id}",
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 1

    def test_delete_doctor_leave(self, client, sa_headers, doctor1_id):
        """TC-SCH-014: create then delete a leave entry"""
        create_resp = client.post(
            "/api/v1/schedules/doctor-leaves",
            json={
                "doctor_id": doctor1_id,
                "leave_date": "2027-10-10",
                "leave_type": "afternoon",
                "reason": "Training session",
            },
            headers=sa_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        leave_id = create_resp.json()["id"]

        del_resp = client.delete(
            f"/api/v1/schedules/doctor-leaves/{leave_id}",
            headers=sa_headers,
        )
        assert del_resp.status_code == 204


class TestAvailableSlots:
    """TC-SCH-015: available slots for a scheduled day."""

    def test_available_slots_for_scheduled_day(self, client, sa_headers, doctor1_id, monday_schedule):
        """TC-SCH-015: get available slots for next Monday"""
        next_mon = _next_monday()
        resp = client.get(
            f"/api/v1/schedules/available-slots?doctor_id={doctor1_id}&date={next_mon}",
            headers=sa_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (list, dict))
