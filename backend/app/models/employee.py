"""
Employee models — HR extension of users.

EmployeeProfile is a 1:1 extension of User (same relationship shape as
Doctor extending User) carrying HR fields. EmployeeSalary is kept separate
and effective-dated: a salary change inserts a new row rather than updating
in place, so history is preserved and per_day_salary can be recalculated
per revision (basic_salary / 30, per the BRD's fixed 30-day divisor).
"""
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, Numeric, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True)
    designation = Column(String(100))
    date_of_joining = Column(Date)
    date_of_leaving = Column(Date, nullable=True)
    employment_type = Column(String(20), default="full_time")  # full_time / part_time / contract
    bank_account_holder_name = Column(String(150))
    bank_account_number = Column(String(30))
    bank_ifsc = Column(String(15))
    bank_branch = Column(String(150))
    pf_number = Column(String(30))
    pan_number = Column(String(15))
    reporting_manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    paid_leave_entitlement = Column(Integer, default=0)
    # Guest/visiting doctors and similar non-payroll staff opt out — same idea
    # as doctors.analytics_enabled excluding guest doctors from Analytics.
    include_in_payroll = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id], backref="employee_profile")
    hospital = relationship("Hospital", foreign_keys=[hospital_id])
    department = relationship("Department", foreign_keys=[department_id])
    reporting_manager = relationship("User", foreign_keys=[reporting_manager_id])


class EmployeeSalary(Base):
    """Effective-dated salary history — insert-only, never updated in place."""
    __tablename__ = "employee_salary"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    basic_salary = Column(Numeric(12, 2), nullable=False)
    per_day_salary = Column(Numeric(12, 2), nullable=False)
    flexi_allowance = Column(Numeric(12, 2), default=0)
    pf_contribution_employee = Column(Numeric(12, 2), default=0)
    effective_from = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("User", foreign_keys=[employee_id])
