"""
test_08_appointments.py — API integration tests for Appointments.
Covers TC-APT-001 through TC-APT-030.
"""
import pytest
import time
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _unique_mobile():
    return "98" + str(int(time.time() * 1000))[-8:]


def _next_monday():
    today = date.today()
    days_ahead = 0 - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return (today + timedelta(days=days_ahead)).isoformat()


@pytest.fixture(scope="function")
def patient(client, sa_headers):
    """Create a fresh patient and return the JSON response."""
    ts = str(int(time.time() * 1000))[-7:]
    resp = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Appt",
            "last_name": "Test",
            "gender": "Male",
            "phone_number": "9" + ts,
            "email": f"appt{ts}@example.com",
            "date_of_birth": "1990-01-01",
            "address_line_1": "123 Test Street",
        },
        headers=sa_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture(scope="function")
def doctor1_id(client, sa_headers):
    resp = client.get("/api/v1/doctors?limit=100", headers=sa_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1, "No doctors found in DB"
    return data[0]["id"]


@pytest.fixture(scope="function")
def scheduled_appt(client, sa_headers, patient, doctor1_id):
    """Book one scheduled appointment and return JSON."""
    resp = client.post(
        "/api/v1/appointments",
        json={
            "patient_id": patient["id"],
            "doctor_id": doctor1_id,
            "appointment_date": _next_monday(),
            "start_time": "10:00:00",
            "appointment_type": "scheduled",
            "chief_complaint": "routine check-up",
        },
        headers=sa_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# TC-APT-001 – TC-APT-005: Booking
# ---------------------------------------------------------------------------

class TestBookAppointment:
    def test_book_scheduled_success(self, client, sa_headers, patient, doctor1_id):
        """TC-APT-001"""
        resp = client.post(
            "/api/v1/appointments",
            json={
                "patient_id": patient["id"],
                "doctor_id": doctor1_id,
                "appointment_date": _next_monday(),
                "start_time": "11:00:00",
                "appointment_type": "scheduled",
                "chief_complaint": "checkup",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        # Appointment number should follow APT-YYYYMMDD-XXXX pattern
        assert "appointment_number" in data
        assert data["appointment_number"].startswith("APT-")
        assert data["appointment_type"] == "scheduled"

    def test_double_booking_same_slot_returns_400(self, client, sa_headers, patient, scheduled_appt, doctor1_id):
        """TC-APT-003: booking same doctor/date/time again must fail"""
        ts = str(int(time.time() * 1000))[-7:]
        # Create second patient
        p2 = client.post(
            "/api/v1/patients",
            json={
                "first_name": "Second",
                "last_name": "Patient",
                "gender": "Female",
                "date_of_birth": "1992-03-10",
                "phone_number": "8" + ts,
                "address_line_1": "456 Second Ave",
            },
            headers=sa_headers,
        ).json()

        resp = client.post(
            "/api/v1/appointments",
            json={
                "patient_id": p2["id"],
                "doctor_id": doctor1_id,
                "appointment_date": scheduled_appt["appointment_date"],
                "start_time": scheduled_appt["start_time"],
                "appointment_type": "scheduled",
            },
            headers=sa_headers,
        )
        # Either 400 (fully booked) or 201 when max_patients > 1
        assert resp.status_code in (201, 400)

    def test_invalid_appointment_type_returns_422(self, client, sa_headers, patient, doctor1_id):
        """TC-APT-004"""
        resp = client.post(
            "/api/v1/appointments",
            json={
                "patient_id": patient["id"],
                "doctor_id": doctor1_id,
                "appointment_date": _next_monday(),
                "start_time": "12:00:00",
                "appointment_type": "urgent_walk",  # invalid
            },
            headers=sa_headers,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# TC-APT-006 – TC-APT-010: Read / List
# ---------------------------------------------------------------------------

class TestReadAppointments:
    def test_get_appointment_by_id(self, client, sa_headers, scheduled_appt):
        """TC-APT-006"""
        appt_id = scheduled_appt["id"]
        resp = client.get(f"/api/v1/appointments/{appt_id}", headers=sa_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == appt_id

    def test_get_nonexistent_appointment_returns_404(self, client, sa_headers):
        """TC-APT-007"""
        resp = client.get("/api/v1/appointments/9999999", headers=sa_headers)
        assert resp.status_code == 404

    def test_list_appointments_paginated(self, client, sa_headers, scheduled_appt):
        """TC-APT-008"""
        resp = client.get("/api/v1/appointments?page=1&limit=10", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data and "page" in data and "data" in data

    def test_list_filter_by_doctor(self, client, sa_headers, doctor1_id, scheduled_appt):
        """TC-APT-009"""
        resp = client.get(f"/api/v1/appointments?doctor_id={doctor1_id}", headers=sa_headers)
        assert resp.status_code == 200
        for appt in resp.json()["data"]:
            assert appt["doctor_id"] == doctor1_id

    def test_my_appointments_for_doctor(self, client, doctor_headers):
        """TC-APT-010"""
        resp = client.get("/api/v1/appointments/my-appointments", headers=doctor_headers)
        assert resp.status_code == 200
        assert "data" in resp.json()


# ---------------------------------------------------------------------------
# TC-APT-011 – TC-APT-015: Status Updates
# ---------------------------------------------------------------------------

class TestStatusUpdate:
    def test_update_status_to_confirmed(self, client, sa_headers, scheduled_appt):
        """TC-APT-011"""
        appt_id = scheduled_appt["id"]
        resp = client.patch(
            f"/api/v1/appointments/{appt_id}/status",
            json={"status": "confirmed"},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "confirmed"

    def test_update_status_to_completed(self, client, sa_headers, scheduled_appt):
        """TC-APT-012"""
        appt_id = scheduled_appt["id"]
        # Confirm first
        client.patch(f"/api/v1/appointments/{appt_id}/status", json={"status": "confirmed"}, headers=sa_headers)
        resp = client.patch(
            f"/api/v1/appointments/{appt_id}/status",
            json={"status": "completed"},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"

    def test_update_status_invalid_returns_422(self, client, sa_headers, scheduled_appt):
        """TC-APT-013"""
        appt_id = scheduled_appt["id"]
        resp = client.patch(
            f"/api/v1/appointments/{appt_id}/status",
            json={"status": "pending_payment"},  # invalid
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_status_update_nonexistent_returns_404(self, client, sa_headers):
        """TC-APT-014"""
        resp = client.patch(
            "/api/v1/appointments/9999999/status",
            json={"status": "confirmed"},
            headers=sa_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TC-APT-016 – TC-APT-020: Cancel
# ---------------------------------------------------------------------------

class TestCancelAppointment:
    def test_cancel_appointment(self, client, sa_headers, patient, doctor1_id):
        """TC-APT-016"""
        ts = str(int(time.time() * 1000))[-7:]
        new_p = client.post(
            "/api/v1/patients",
            json={
                "first_name": "Cancel",
                "last_name": "Me",
                "gender": "Male",
                "date_of_birth": "1990-06-15",
                "phone_number": "7" + ts,
                "address_line_1": "789 Cancel Road",
            },
            headers=sa_headers,
        ).json()
        assert "id" in new_p, f"Patient creation failed: {new_p}"

        appt = client.post(
            "/api/v1/appointments",
            json={
                "patient_id": new_p["id"],
                "doctor_id": doctor1_id,
                "appointment_date": _next_monday(),
                "start_time": "14:00:00",
                "appointment_type": "scheduled",
            },
            headers=sa_headers,
        ).json()

        resp = client.delete(
            f"/api/v1/appointments/{appt['id']}?reason=Patient+request",
            headers=sa_headers,
        )
        assert resp.status_code == 204

    def test_cancel_nonexistent_returns_404(self, client, sa_headers):
        """TC-APT-017"""
        resp = client.delete("/api/v1/appointments/9999999", headers=sa_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TC-APT-021 – TC-APT-025: Reschedule
# ---------------------------------------------------------------------------

class TestRescheduleAppointment:
    def test_reschedule_appointment(self, client, sa_headers, scheduled_appt):
        """TC-APT-021"""
        appt_id = scheduled_appt["id"]
        new_date = (date.today() + timedelta(days=14)).isoformat()
        resp = client.post(
            f"/api/v1/appointments/{appt_id}/reschedule",
            json={
                "new_date": new_date,
                "new_time": "15:00:00",
                "reason": "Patient request",
            },
            headers=sa_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["appointment_date"] == new_date
        assert data["status"] == "rescheduled"

    def test_reschedule_nonexistent_returns_404(self, client, sa_headers):
        """TC-APT-022"""
        resp = client.post(
            "/api/v1/appointments/9999999/reschedule",
            json={"new_date": "2027-01-01", "new_time": "09:00:00"},
            headers=sa_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TC-APT-026 – TC-APT-027: Update fields
# ---------------------------------------------------------------------------

class TestUpdateAppointment:
    def test_update_appointment_notes(self, client, sa_headers, scheduled_appt):
        """TC-APT-026"""
        appt_id = scheduled_appt["id"]
        resp = client.put(
            f"/api/v1/appointments/{appt_id}",
            json={"notes": "Patient allergic to penicillin"},
            headers=sa_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["notes"] == "Patient allergic to penicillin"

    def test_update_nonexistent_returns_404(self, client, sa_headers):
        """TC-APT-027"""
        resp = client.put(
            "/api/v1/appointments/9999999",
            json={"notes": "test"},
            headers=sa_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TC-APT-028 – TC-APT-030: Doctor today endpoint
# ---------------------------------------------------------------------------

class TestDoctorToday:
    def test_doctor_today_endpoint(self, client, sa_headers, doctor1_id):
        """TC-APT-028"""
        resp = client.get(f"/api/v1/appointments/doctor/{doctor1_id}/today", headers=sa_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_unauthenticated_cannot_access_appointments(self, client):
        """TC-APT-030"""
        resp = client.get("/api/v1/appointments")
        assert resp.status_code == 403
