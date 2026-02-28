"""
test_02_security.py — Pure unit tests for security utilities (no DB).
Covers TC-SEC-001 through TC-SEC-010.
"""
import pytest
from datetime import timedelta
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_access_token,
)


class TestPasswordHashing:
    """TC-SEC-001 through TC-SEC-004"""

    def test_hash_is_not_plaintext(self):
        """TC-SEC-001: hashed password is different from plain"""
        plain = "Admin@123"
        hashed = get_password_hash(plain)
        assert hashed != plain

    def test_hash_length_sufficient(self):
        """TC-SEC-001: bcrypt hash should be 60 chars"""
        hashed = get_password_hash("Admin@123")
        assert len(hashed) > 50

    def test_hash_starts_with_bcrypt_prefix(self):
        """TC-SEC-001: bcrypt hashes start with $2b$"""
        hashed = get_password_hash("Admin@123")
        assert hashed.startswith("$2b$")

    def test_verify_correct_password(self):
        """TC-SEC-002: correct password verifies True"""
        plain = "Admin@123"
        hashed = get_password_hash(plain)
        assert verify_password(plain, hashed) is True

    def test_verify_wrong_password(self):
        """TC-SEC-003: wrong password verifies False"""
        hashed = get_password_hash("CorrectPass@1")
        assert verify_password("WrongPass@1", hashed) is False

    def test_verify_empty_password(self):
        """TC-SEC-004: empty string does not verify"""
        hashed = get_password_hash("Admin@123")
        assert verify_password("", hashed) is False

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt uses random salt so hashes differ"""
        h1 = get_password_hash("SamePass@1")
        h2 = get_password_hash("SamePass@1")
        assert h1 != h2

    def test_both_hashes_verify_correctly(self):
        h1 = get_password_hash("SamePass@1")
        h2 = get_password_hash("SamePass@1")
        assert verify_password("SamePass@1", h1) is True
        assert verify_password("SamePass@1", h2) is True


class TestJWTTokens:
    """TC-SEC-005 through TC-SEC-010"""

    def _make_payload(self):
        return {"user_id": 1, "username": "testuser", "role": "admin"}

    def test_create_token_returns_string(self):
        """TC-SEC-005: token is a non-empty string"""
        token = create_access_token(data=self._make_payload())
        assert isinstance(token, str)
        assert len(token) > 20

    def test_token_has_three_parts(self):
        """JWT is dot-separated: header.payload.signature"""
        token = create_access_token(data=self._make_payload())
        parts = token.split(".")
        assert len(parts) == 3

    def test_decode_valid_token(self):
        """TC-SEC-006: valid token decodes to dict with expected keys"""
        payload = self._make_payload()
        token = create_access_token(data=payload, expires_delta=timedelta(minutes=30))
        decoded = decode_access_token(token)
        assert decoded is not None
        assert decoded["user_id"] == 1
        assert decoded["username"] == "testuser"
        assert decoded["role"] == "admin"

    def test_decode_returns_exp_field(self):
        """TC-SEC-006: decoded token has exp claim"""
        token = create_access_token(data=self._make_payload())
        decoded = decode_access_token(token)
        assert "exp" in decoded

    def test_decode_tampered_token_returns_none(self):
        """TC-SEC-007: tampered signature returns None"""
        token = create_access_token(data=self._make_payload())
        tampered = token[:-5] + "XXXXX"
        assert decode_access_token(tampered) is None

    def test_decode_expired_token_returns_none(self):
        """TC-SEC-008: expired token returns None"""
        token = create_access_token(
            data=self._make_payload(),
            expires_delta=timedelta(seconds=-1)  # already expired
        )
        assert decode_access_token(token) is None

    def test_decode_empty_string_returns_none(self):
        """TC-SEC-009"""
        assert decode_access_token("") is None

    def test_decode_garbage_string_returns_none(self):
        """TC-SEC-009: random string returns None"""
        assert decode_access_token("not.a.token") is None

    def test_encode_decode_roundtrip(self):
        """TC-SEC-010: data survives encode→decode round-trip"""
        original = {"user_id": 42, "username": "roundtrip", "role": "nurse"}
        token = create_access_token(data=original, expires_delta=timedelta(minutes=10))
        decoded = decode_access_token(token)
        assert decoded["user_id"] == 42
        assert decoded["username"] == "roundtrip"
        assert decoded["role"] == "nurse"

    def test_different_payloads_produce_different_tokens(self):
        t1 = create_access_token(data={"user_id": 1, "username": "a", "role": "admin"})
        t2 = create_access_token(data={"user_id": 2, "username": "b", "role": "doctor"})
        assert t1 != t2
