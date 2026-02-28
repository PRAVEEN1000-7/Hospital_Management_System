"""
User, Role, Permission and RBAC models — matches new hms_db schema.
"""
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Text, ForeignKey, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base
import uuid


# ──────────────────────────────────────────────────
# Hospital  (minimal model — just enough for FK)
# ──────────────────────────────────────────────────
class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    logo_url = Column(String(500))
    address_line_1 = Column(String(255))
    address_line_2 = Column(String(255))
    city = Column(String(100))
    state_province = Column(String(100))
    postal_code = Column(String(20))
    country = Column(String(3))
    phone = Column(String(20))
    email = Column(String(255))
    website = Column(String(255))
    timezone = Column(String(50), default="UTC")
    default_currency = Column(String(3), default="USD")
    tax_id = Column(String(50))
    registration_number = Column(String(50))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ──────────────────────────────────────────────────
# User
# ──────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    reference_number = Column(String(12))
    email = Column(String(255), unique=True, nullable=False)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(20))
    avatar_url = Column(String(500))
    preferred_locale = Column(String(10), default="en")
    preferred_timezone = Column(String(50), default="UTC")

    is_active = Column(Boolean, default=True)
    is_mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(100))

    last_login_at = Column(DateTime(timezone=True))
    password_changed_at = Column(DateTime(timezone=True))
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True))
    must_change_password = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True))

    # Relationships
    user_roles = relationship(
        "UserRole", back_populates="user",
        foreign_keys="[UserRole.user_id]", lazy="joined",
    )
    hospital = relationship("Hospital", foreign_keys=[hospital_id], lazy="joined")

    @property
    def roles(self) -> list[str]:
        """Return list of role names for this user."""
        return [ur.role.name for ur in self.user_roles if ur.role]

    @property
    def full_name(self) -> str:
        """Return full name of the user."""
        return f"{self.first_name} {self.last_name}".strip()


# ──────────────────────────────────────────────────
# Role
# ──────────────────────────────────────────────────
class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"))
    name = Column(String(50), nullable=False)
    display_name = Column(String(100))
    description = Column(Text)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ──────────────────────────────────────────────────
# Permission
# ──────────────────────────────────────────────────
class Permission(Base):
    __tablename__ = "permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module = Column(String(50), nullable=False)
    action = Column(String(20), nullable=False)
    resource = Column(String(100))
    description = Column(String(255))


# ──────────────────────────────────────────────────
# UserRole  (junction table)
# ──────────────────────────────────────────────────
class UserRole(Base):
    __tablename__ = "user_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Relationships
    user = relationship(
        "User", back_populates="user_roles",
        foreign_keys=[user_id],
    )
    role = relationship("Role", lazy="joined")


# ──────────────────────────────────────────────────
# RolePermission  (junction table)
# ──────────────────────────────────────────────────
class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    permission_id = Column(UUID(as_uuid=True), ForeignKey("permissions.id"), nullable=False)

    role = relationship("Role")
    permission = relationship("Permission")


# ──────────────────────────────────────────────────
# RefreshToken
# ──────────────────────────────────────────────────
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token_hash = Column(String(64), nullable=False)
    device_info = Column(String(255))
    ip_address = Column(String(45))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
