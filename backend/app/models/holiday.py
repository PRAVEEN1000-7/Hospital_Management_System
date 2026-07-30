"""
Holiday model — hospital holiday calendar.

Individual dates only, including recurring weekly-offs (a "mark all Sundays
as holiday for this year" bulk action inserts one row per date rather than
a recurrence engine) — keeps the attendance grid's holiday lookup a simple
per-date check.
"""
import uuid
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    date = Column(Date, nullable=False)
    name = Column(String(150), nullable=False)
    type = Column(String(20), default="other")  # festival / weekly_off / other
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("hospital_id", "date", name="uq_holiday_hospital_date"),
    )

    hospital = relationship("Hospital", foreign_keys=[hospital_id])
