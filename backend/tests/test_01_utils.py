"""
test_01_utils.py — Pure unit tests for validators (no DB required).
Covers TC-UTIL-001 through TC-UTIL-020.
"""
import pytest
from app.utils.validators import (
    validate_mobile_number,
    validate_email,
    validate_pin_code,
    validate_country_code,
)


class TestMobileNumberValidator:
    """TC-UTIL-001 through TC-UTIL-008"""

    def test_valid_10_digit_mobile(self):
        """TC-UTIL-001: 10 digits is valid"""
        assert validate_mobile_number("9876543210") is True

    def test_valid_4_digit_minimum(self):
        """TC-UTIL-002: 4 digits is minimum"""
        assert validate_mobile_number("1234") is True

    def test_valid_15_digit_maximum(self):
        """TC-UTIL-003: 15 digits is maximum"""
        assert validate_mobile_number("123456789012345") is True

    def test_invalid_too_short_3_digits(self):
        """TC-UTIL-004: 3 digits is too short"""
        assert validate_mobile_number("123") is False

    def test_invalid_too_long_16_digits(self):
        """TC-UTIL-005: 16 digits is too long"""
        assert validate_mobile_number("1234567890123456") is False

    def test_invalid_with_plus_sign(self):
        """TC-UTIL-006: leading + sign is rejected"""
        assert validate_mobile_number("+9198765") is False

    def test_invalid_with_alpha_chars(self):
        """TC-UTIL-007: alphabetic characters rejected"""
        assert validate_mobile_number("98765abcd") is False

    def test_invalid_empty_string(self):
        """TC-UTIL-008: empty string rejected"""
        assert validate_mobile_number("") is False

    def test_invalid_spaces(self):
        assert validate_mobile_number("9876 54321") is False

    def test_valid_7_digit_mobile(self):
        assert validate_mobile_number("1234567") is True


class TestEmailValidator:
    """TC-UTIL-009 through TC-UTIL-013"""

    def test_valid_simple_email(self):
        """TC-UTIL-009"""
        assert validate_email("user@example.com") is True

    def test_valid_complex_email(self):
        """TC-UTIL-010"""
        assert validate_email("user+tag@sub.domain.co") is True

    def test_invalid_missing_domain(self):
        """TC-UTIL-011"""
        assert validate_email("user@") is False

    def test_invalid_missing_username(self):
        """TC-UTIL-012"""
        assert validate_email("@domain.com") is False

    def test_invalid_no_at_sign(self):
        """TC-UTIL-013"""
        assert validate_email("nodomain") is False

    def test_invalid_empty(self):
        assert validate_email("") is False

    def test_valid_with_numbers(self):
        assert validate_email("user123@hospital.org") is True

    def test_invalid_double_at(self):
        assert validate_email("user@@domain.com") is False


class TestPinCodeValidator:
    """TC-UTIL-014 through TC-UTIL-017"""

    def test_valid_india_pin(self):
        """TC-UTIL-014"""
        assert validate_pin_code("400001") is True

    def test_valid_uk_postal(self):
        """TC-UTIL-015"""
        assert validate_pin_code("SW1A 2AA") is True

    def test_invalid_too_short(self):
        """TC-UTIL-016: 2 chars is too short"""
        assert validate_pin_code("AB") is False

    def test_invalid_too_long(self):
        """TC-UTIL-017: 11 chars is too long"""
        assert validate_pin_code("12345678901") is False

    def test_valid_us_zip(self):
        assert validate_pin_code("90210") is True

    def test_valid_hyphenated(self):
        assert validate_pin_code("123-456") is True

    def test_valid_minimum_3_chars(self):
        assert validate_pin_code("ABC") is True


class TestCountryCodeValidator:
    """TC-UTIL-018 through TC-UTIL-020"""

    def test_valid_india_code(self):
        """TC-UTIL-018"""
        assert validate_country_code("+91") is True

    def test_valid_us_code(self):
        """TC-UTIL-019"""
        assert validate_country_code("+1") is True

    def test_invalid_missing_plus(self):
        """TC-UTIL-020"""
        assert validate_country_code("91") is False

    def test_invalid_empty(self):
        assert validate_country_code("") is False

    def test_valid_4_digit_code(self):
        assert validate_country_code("+1868") is True

    def test_invalid_letters_in_code(self):
        assert validate_country_code("+XX") is False
