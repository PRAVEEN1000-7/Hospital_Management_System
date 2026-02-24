from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from ..database import Base


class PatientIdSequence(Base):
    """
    Tracks per-hospital per-month sequence counters for the 12-digit Patient ID system.
    Each row represents a unique (hospital_code, year_month) combination.
    """
    __tablename__ = "patient_id_sequences"

    id = Column(Integer, primary_key=True, index=True)
    hospital_code = Column(String(2), nullable=False, index=True)
    year_month = Column(String(4), nullable=False)  # "YYMM" e.g. "2602" for Feb 2026
    last_sequence = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('hospital_code', 'year_month', name='uq_hospital_year_month'),
    )
