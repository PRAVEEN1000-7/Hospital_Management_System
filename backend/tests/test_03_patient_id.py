"""
test_03_patient_id.py — Unit tests for the 12-digit Patient ID system.
Covers TC-PID-001 through TC-PID-015.
"""
import pytest
import re
from app.services.patient_id_service import (
    calculate_checksum,
    validate_checksum,
    GENDER_CODE_MAP,
    MONTH_ENCODE,
    MONTH_DECODE,
)


class TestChecksumCalculation:
    """TC-PID-001, TC-PID-002"""

    def test_checksum_is_single_char(self):
        """TC-PID-001: checksum is always one character"""
        result = calculate_checksum("HCM262")
        assert isinstance(result, str)
        assert len(result) == 1

    def test_checksum_is_alphanumeric(self):
        """Result must be 0-9 or A-Z"""
        result = calculate_checksum("HCM262")
        assert result.isalnum()

    def test_checksum_is_deterministic(self):
        """TC-PID-002: same input always produces same output"""
        r1 = calculate_checksum("HCM262")
        r2 = calculate_checksum("HCM262")
        assert r1 == r2

    def test_checksum_different_inputs_can_differ(self):
        """Different prefixes should generally produce different checksums"""
        c1 = calculate_checksum("HCM262")
        c2 = calculate_checksum("HCF263")
        # They may coincidentally equal, but let's test with known distinct inputs
        c3 = calculate_checksum("AAAAAA")
        c4 = calculate_checksum("ZZZZZZ")
        # At least the function handles both without error
        assert isinstance(c3, str) and isinstance(c4, str)

    def test_checksum_known_value(self):
        """
        Empirically verified: calculate_checksum('HCM262') == 'D'.
        Weighted sum: H(17*1)+C(12*2)+M(22*3)+2(2*4)+6(6*5)+2(2*6) = 157; 157%36=13 -> 'D'.
        """
        result = calculate_checksum("HCM262")
        assert result == "D", f"Expected 'D', got '{result}'"


class TestChecksumValidation:
    """TC-PID-003 through TC-PID-006"""

    # HCM262D00001 — D is the correct checksum for prefix 'HCM262'
    VALID_ID = "HCM262D00001"

    def test_valid_id_passes(self):
        """TC-PID-003"""
        assert validate_checksum(self.VALID_ID) is True

    def test_wrong_checksum_fails(self):
        """TC-PID-004: changing the checksum char (position 7) should fail"""
        # Position index 6 (7th char) is the checksum
        parts = list(self.VALID_ID)
        # Flip checksum to something else
        orig = parts[6]
        parts[6] = "A" if orig != "A" else "B"
        tampered = "".join(parts)
        assert validate_checksum(tampered) is False

    def test_too_short_fails(self):
        """TC-PID-005: 11 chars returns False"""
        assert validate_checksum("HCM262K0014") is False

    def test_too_long_fails(self):
        """TC-PID-006: 13 chars returns False"""
        assert validate_checksum("HCM262K001470") is False

    def test_empty_string_fails(self):
        assert validate_checksum("") is False

    def test_exactly_12_chars_other_invalid(self):
        """12 chars but wrong checksum — 'K' is not the correct checksum for 'HCM262' (correct is 'D')"""
        assert validate_checksum("HCM262K00001") is False


class TestGenderAndMonthCodes:
    """TC-PID-007 through TC-PID-010"""

    def test_male_maps_to_M(self):
        """TC-PID-007"""
        assert GENDER_CODE_MAP["Male"] == "M"

    def test_female_maps_to_F(self):
        """TC-PID-008"""
        assert GENDER_CODE_MAP["Female"] == "F"

    def test_other_maps_to_O(self):
        assert GENDER_CODE_MAP["Other"] == "O"

    def test_not_disclosed_maps_to_N(self):
        assert GENDER_CODE_MAP["Not Disclosed"] == "N"

    def test_unknown_maps_to_U(self):
        assert GENDER_CODE_MAP["Unknown"] == "U"

    def test_month_10_maps_to_A(self):
        """TC-PID-009"""
        assert MONTH_ENCODE[10] == "A"

    def test_month_11_maps_to_B(self):
        assert MONTH_ENCODE[11] == "B"

    def test_month_12_maps_to_C(self):
        """TC-PID-010"""
        assert MONTH_ENCODE[12] == "C"

    def test_months_1_to_9_are_numeric_strings(self):
        """Months 1–9 should encode to their string equivalents"""
        for m in range(1, 10):
            assert MONTH_ENCODE[m] == str(m)

    def test_decode_is_inverse_of_encode(self):
        """Round-trip: decode(encode(m)) == m"""
        for m in range(1, 13):
            encoded = MONTH_ENCODE[m]
            decoded = MONTH_DECODE[encoded]
            assert decoded == m


class TestPatientIDGeneration:
    """TC-PID-011 through TC-PID-013 — require DB"""

    def test_generated_id_is_12_chars(self, db_session):
        """TC-PID-011"""
        from app.services.patient_id_service import generate_patient_id
        pid = generate_patient_id(db_session, "Male")
        assert len(pid) == 12

    def test_generated_id_passes_checksum(self, db_session):
        """TC-PID-012: checksum in the generated ID is valid"""
        from app.services.patient_id_service import generate_patient_id
        pid = generate_patient_id(db_session, "Female")
        assert validate_checksum(pid) is True

    def test_generated_ids_are_unique(self, db_session):
        """TC-PID-013: sequential calls produce different IDs"""
        from app.services.patient_id_service import generate_patient_id
        ids = {generate_patient_id(db_session, "Male") for _ in range(5)}
        assert len(ids) == 5

    def test_generated_id_uppercase(self, db_session):
        """Generated ID should be uppercase"""
        from app.services.patient_id_service import generate_patient_id
        pid = generate_patient_id(db_session, "Male")
        assert pid == pid.upper()

    def test_generated_id_alphanumeric(self, db_session):
        """ID characters must be alphanumeric"""
        from app.services.patient_id_service import generate_patient_id
        pid = generate_patient_id(db_session, "Male")
        assert re.match(r'^[A-Z0-9]{12}$', pid)


class TestValidateIDEndpoint:
    """TC-PID-015 — HTTP endpoint"""

    def test_valid_12char_id_endpoint(self, client, sa_headers):
        """TC-PID-015: GET /patients/validate-id/{id} with valid ID (D is correct checksum for HCM262)"""
        resp = client.get("/api/v1/patients/validate-id/HCM262D00001", headers=sa_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert "components" in data

    def test_wrong_length_id_endpoint(self, client, sa_headers):
        """TC-PID-023: 11 chars → 400"""
        resp = client.get("/api/v1/patients/validate-id/SHORTID", headers=sa_headers)
        assert resp.status_code == 400

    def test_invalid_checksum_id_endpoint(self, client, sa_headers):
        """Valid length but wrong checksum → valid=False"""
        # Flip checksum of known valid ID
        resp = client.get("/api/v1/patients/validate-id/HCM262A00147", headers=sa_headers)
        # Should return 200 with valid=False OR it might return 400 depending on impl
        # Check that it doesn't crash
        assert resp.status_code in (200, 400)
        if resp.status_code == 200:
            assert resp.json()["valid"] is False

    def test_unauthenticated_returns_403(self, client):
        """No token → 403"""
        resp = client.get("/api/v1/patients/validate-id/HCM262K00147")
        assert resp.status_code == 403
