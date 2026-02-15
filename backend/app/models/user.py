from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from ..database import Base
import enum


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    DOCTOR = "doctor"
    NURSE = "nurse"
    RECEPTIONIST = "receptionist"
    PHARMACIST = "pharmacist"
    CASHIER = "cashier"
    INVENTORY_MANAGER = "inventory_manager"
    STAFF = "staff"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Name fields
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    full_name = Column(String(255), nullable=False)  # Keep for backward compatibility
    
    # Professional info
    role = Column(String(20), nullable=False, default=UserRole.STAFF)
    employee_id = Column(String(50), nullable=True, unique=True, index=True)
    department = Column(String(100), nullable=True)
    phone_number = Column(String(20), nullable=True)
    
    # Profile
    photo_url = Column(String(500), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

