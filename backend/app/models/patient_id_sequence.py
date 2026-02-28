import uuid as _uuid
from sqlalchemy import Column, Integer, String, CHAR, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base


class IdSequence(Base):
    '''
    Tracks per-hospital per-entity sequence counters.
    Maps to the id_sequences table in hms_db.
    '''
    __tablename__ = 'id_sequences'

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey('hospitals.id'), nullable=False)
    hospital_code = Column(CHAR(2), nullable=False)
    entity_type = Column(String(10), nullable=False, default='patient')
    role_gender_code = Column(CHAR(1), nullable=False)
    year_code = Column(CHAR(2), nullable=False)
    month_code = Column(CHAR(1), nullable=False)
    last_sequence = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
