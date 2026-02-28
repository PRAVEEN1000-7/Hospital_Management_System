"""
test_12_reports.py — API integration tests for Appointment Reports & Statistics.
Covers TC-RPT-001 through TC-RPT-010.
"""
import pytest
import time
from datetime import date, timedelta


@pytest.fixture(scope="function")
def doctor1_id(client, sa_headers):
    resp = client.get("/api/v1/users?search=doctor1", headers=sa_headers)
    data = resp.json()["data"]
    assert len(data) >= 1
    return data[0]["id"]


class TestAppointmentStatistics:
    def test_statistics_returns_expected_shape(self, client, sa_headers):
        """TC-RPT-001"""
        resp = client.get("/api/v1/reports/appointments/statistics", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Key fields that should always be present
        assert "total" in data or "total_appointments" in data

    def test_statistics_all_counts_non_negative(self, client, sa_headers):
        """TC-RPT-002"""
        resp = client.get("/api/v1/reports/appointments/statistics", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Every numeric value should be >= 0
        for key, val in data.items():
            if isinstance(val, (int, float)):
                assert val >= 0, f"Field {key} is negative: {val}"

    def test_statistics_with_date_range(self, client, sa_headers):
        """TC-RPT-003"""
        today = date.today().isoformat()
        week_ago = (date.today() - timedelta(days=7)).isoformat()
        resp = client.get(
            f"/api/v1/reports/appointments/statistics?date_from={week_ago}&date_to={today}",
            headers=sa_headers,
        )
        assert resp.status_code == 200

    def test_statistics_filtered_by_doctor(self, client, sa_headers, doctor1_id):
        """TC-RPT-004"""
        resp = client.get(
            f"/api/v1/reports/appointments/statistics?doctor_id={doctor1_id}",
            headers=sa_headers,
        )
        assert resp.status_code == 200

    def test_statistics_unauthenticated_returns_403(self, client):
        """TC-RPT-005"""
        resp = client.get("/api/v1/reports/appointments/statistics")
        assert resp.status_code == 403

    def test_statistics_accessible_by_doctor(self, client, doctor_headers):
        """TC-RPT-006: any authenticated role can view reports"""
        resp = client.get("/api/v1/reports/appointments/statistics", headers=doctor_headers)
        assert resp.status_code == 200

    def test_statistics_rate_fields_in_0_to_100(self, client, sa_headers):
        """TC-RPT-007: rate fields (if present) should be between 0 and 100"""
        resp = client.get("/api/v1/reports/appointments/statistics", headers=sa_headers)
        data = resp.json()
        rate_fields = [k for k in data if "rate" in k.lower() or "percent" in k.lower()]
        for field in rate_fields:
            val = data[field]
            if isinstance(val, (int, float)):
                assert 0 <= val <= 100, f"Rate field {field}={val} out of range"

    def test_statistics_future_date_range_returns_zeros(self, client, sa_headers):
        """TC-RPT-008: querying far future should return mostly zeros"""
        resp = client.get(
            "/api/v1/reports/appointments/statistics?date_from=2099-01-01&date_to=2099-12-31",
            headers=sa_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # total should be 0 (or total_appointments == 0)
        total_key = "total" if "total" in data else "total_appointments"
        if total_key in data:
            assert data[total_key] == 0

    def test_statistics_invalid_date_format_returns_422(self, client, sa_headers):
        """TC-RPT-009"""
        resp = client.get(
            "/api/v1/reports/appointments/statistics?date_from=not-a-date",
            headers=sa_headers,
        )
        assert resp.status_code == 422

    def test_statistics_with_no_appointments(self, client, sa_headers):
        """TC-RPT-010: DB may have appointments but stats endpoint always responds 200"""
        resp = client.get("/api/v1/reports/appointments/statistics", headers=sa_headers)
        assert resp.status_code == 200
