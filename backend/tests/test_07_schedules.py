"""
test_07_schedules.py — API integration tests for Doctor Schedules.
Covers TC-SCH-001 through TC-SCH-020.
"""
import pytest
from datetime import date, timedelta


def _next_monday():
    """Return next Monday's date as ISO string."""
    today = date.today()
    days_ahead = 0 - today.weekday()  # Monday is 0
    if days_ahead <= 0:
        days_ahead += 7
    return (today + timedelta(days=days_ahead)).isoformat()


@pytest.fixture(scope="function")
def doctor1_id(client, sa_headers):
    """Return the DB id for the seeded doctor1 user."""
    resp = client.get("/api/v1/users?search=doctor1", headers=sa_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1, "doctor1 not found in DB"
    return data[0]["id"]


@pytest.fixture(scope="function")
def monday_schedule(client, sa_headers, doctor1_id):
    """Create a Monday schedule for doctor1 and return it."""
    resp = client.post(
        f"/api/v1/schedules/doctors/{doctor1_id}",
        json={
            "weekday": 0,
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "slot_duration": 30,
            "consultation_type": "both",
            "max_patients_per_slot": 1,
            "is_active": True,
        },
        headers=sa_headers,
    )
    assert resp.status_code == 201
    return resp.json()


class TestListDoctors:
    """TC-SCH-001"""

    def test_list_doctors(self, client, sa_headers):
        resp = client.get("/api/v1/schedules/doctors", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # doctor1 is seeded


class TestCreateSchedule:
    """TC-SCH-002 through TC-SCH-008"""

    def test_create_schedule_success(self, client, sa_headers, doctor1_id):
        """TC-SCH-002"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "weekday": 0,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_duration": 30,
                "consultation_type": "both",
                "max_patients_per_slot": 1,
                "is_active": True,
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["weekday"] == 0
        assert data["doctor_id"] == doctor1_id

    def test_end_time_before_start_time_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-003"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "weekday": 1,
                "start_time": "17:00:00",
                "end_time": "09:00:00",  # end before start
                "slot_duration": 30,
                "consultation_type": "both",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_slot_duration_too_small_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-004"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "weekday": 1,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_duration": 4,   # below minimum of 5
                "consultation_type": "both",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_slot_duration_too_large_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-005"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "weekday": 1,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_duration": 121,  # above max of 120
                "consultation_type": "both",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_invalid_consultation_type_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-006"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "weekday": 1,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "consultation_type": "hybrid",  # invalid
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_get_doctor_schedules(self, client, sa_headers, doctor1_id, monday_schedule):
        """TC-SCH-007"""
        resp = client.get(f"/api/v1/schedules/doctors/{doctor1_id}", headers=sa_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        # The monday_schedule we created should be in the list
        ids = [s["id"] for s in resp.json()]
        assert monday_schedule["id"] in ids

    def test_bulk_create_schedules(self, client, sa_headers, doctor1_id):
        """TC-SCH-008"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}/bulk",
            json={
                "doctor_id": doctor1_id,
                "schedules": [
                    {"weekday": 2, "start_time": "09:00:00", "end_time": "13:00:00", "slot_duration": 20, "consultation_type": "offline"},
                    {"weekday": 3, "start_time": "09:00:00", "end_time": "13:00:00", "slot_duration": 20, "consultation_type": "online"},
                    {"weekday": 4, "start_time": "09:00:00", "end_time": "13:00:00", "slot_duration": 20, "consultation_type": "both"},
                ],
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201
        assert len(resp.json()) == 3

    def test_nurse_cannot_create_schedule_for_other_doctor(self, client, nurse_headers, doctor1_id):
        """TC-SCH-018: nurse cannot manage schedules"""
        resp = client.post(
            f"/api/v1/schedules/doctors/{doctor1_id}",
            json={
                "weekday": 5,
                "start_time": "09:00:00",
                "end_time": "12:00:00",
                "consultation_type": "offline",
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
            json={"slot_duration": 45},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["slot_duration"] == 45

    def test_delete_schedule(self, client, sa_headers, monday_schedule):
        """TC-SCH-010"""
        schedule_id = monday_schedule["id"]
        resp = client.delete(f"/api/v1/schedules/{schedule_id}", headers=sa_headers)
        assert resp.status_code == 204

    def test_update_nonexistent_schedule_returns_404(self, client, sa_headers):
        resp = client.put(
            "/api/v1/schedules/999999",
            json={"slot_duration": 30},
            headers=sa_headers,
        )
        assert resp.status_code == 404


class TestBlockedPeriods:
    """TC-SCH-011 through TC-SCH-014"""

    def test_create_blocked_period(self, client, sa_headers, doctor1_id):
        """TC-SCH-011"""
        resp = client.post(
            "/api/v1/schedules/block-period",
            json={
                "doctor_id": doctor1_id,
                "start_date": "2026-12-25",
                "end_date": "2026-12-26",
                "reason": "Christmas holiday",
                "block_type": "holiday",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["doctor_id"] == doctor1_id
        assert data["block_type"] == "holiday"

    def test_end_date_before_start_returns_422(self, client, sa_headers, doctor1_id):
        """TC-SCH-012"""
        resp = client.post(
            "/api/v1/schedules/block-period",
            json={
                "doctor_id": doctor1_id,
                "start_date": "2026-12-30",
                "end_date": "2026-12-25",  # before start
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_list_blocked_periods(self, client, sa_headers, doctor1_id):
        """TC-SCH-013"""
        resp = client.get(
            f"/api/v1/schedules/blocked-periods?doctor_id={doctor1_id}",
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_delete_blocked_period(self, client, sa_headers, doctor1_id):
        """TC-SCH-014"""
        # Create then delete
        create_resp = client.post(
            "/api/v1/schedules/block-period",
            json={
                "doctor_id": doctor1_id,
                "start_date": "2027-01-01",
                "end_date": "2027-01-05",
                "block_type": "leave",
            },
            headers=sa_headers,
        )
        bp_id = create_resp.json()["id"]
        del_resp = client.delete(f"/api/v1/schedules/blocked-periods/{bp_id}", headers=sa_headers)
        assert del_resp.status_code == 204


class TestAvailableSlots:
    """TC-SCH-015 through TC-SCH-016, TC-SCH-019"""

    def test_available_slots_for_scheduled_day(self, client, sa_headers, doctor1_id, monday_schedule):
        """TC-SCH-015: get available slots for next Monday"""
        next_mon = _next_monday()
        resp = client.get(
            f"/api/v1/schedules/available-slots?doctor_id={doctor1_id}&date={next_mon}",
            headers=sa_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # Should have a list of slots
        assert isinstance(data, (list, dict))

    def test_available_slots_blocked_date(self, client, sa_headers, doctor1_id):
        """TC-SCH-016: blocked date returns empty or blocked"""
        # Create block for that date
        block_date = "2027-03-15"
        client.post(
            "/api/v1/schedules/block-period",
            json={
                "doctor_id": doctor1_id,
                "start_date": block_date,
                "end_date": block_date,
                "block_type": "leave",
            },
            headers=sa_headers,
        )
        resp = client.get(
            f"/api/v1/schedules/available-slots?doctor_id={doctor1_id}&date={block_date}",
            headers=sa_headers,
        )
        assert resp.status_code == 200
        # Either empty or has a blocked flag
        data = resp.json()
        if isinstance(data, list):
            assert data == []
        elif isinstance(data, dict):
            assert data.get("slots") == [] or data.get("blocked") is True


class TestIsDateBlockedService:
    """TC-SCH-020"""

    def test_date_in_blocked_range_returns_true(self, db_session):
        """TC-SCH-020"""
        from app.services.schedule_service import is_date_blocked, create_blocked_period
        from datetime import date

        # Get doctor1 id
        from app.models.user import User as UserModel
        doctor = db_session.query(UserModel).filter(UserModel.username == "doctor1").first()
        assert doctor is not None

        # Create blocked period programmatically
        create_blocked_period(
            db_session,
            {
                "doctor_id": doctor.id,
                "start_date": date(2027, 6, 1),
                "end_date": date(2027, 6, 7),
                "block_type": "leave",
            },
            created_by=doctor.id,
        )

        assert is_date_blocked(db_session, doctor.id, date(2027, 6, 3)) is True
        assert is_date_blocked(db_session, doctor.id, date(2027, 6, 10)) is False
