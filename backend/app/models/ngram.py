"""
Statistical (n-gram / Markov chain) autocomplete model — powers inline "ghost
text" suggestions across several free-text fields (Clinical Notes, Diagnosis,
Advice, Optical Prescription Notes, Pharmacy/Optical Sale Notes, Medicine
Description/Drug Interaction Notes/Side Effects, Stock Adjustment Reason),
trained per-hospital on that hospital's own historical text. field_type keeps
each field's phrasing in its own pool — see ngram_service.VALID_FIELD_TYPES.
See database_hole/15_clinical_note_ngrams.sql and
database_hole/16_ngram_field_type_and_medicine_columns.sql.
"""
import uuid
from sqlalchemy import Column, String, SmallInteger, Integer, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from ..database import Base


class ClinicalNoteNgram(Base):
    """One (hospital, field_type, context) -> next_token frequency count."""
    __tablename__ = "clinical_note_ngrams"
    __table_args__ = (
        UniqueConstraint("hospital_id", "field_type", "n", "context", "next_token", name="uq_clinical_note_ngrams_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    field_type = Column(Text, nullable=False, default="clinical_notes")  # see ngram_service.VALID_FIELD_TYPES
    n = Column(SmallInteger, nullable=False)  # 2 = bigram (1-word context), 3 = trigram (2-word context)
    context = Column(Text, nullable=False)  # lowercase, space-joined (n-1) preceding tokens
    next_token = Column(Text, nullable=False)  # lowercase predicted token, or '<END>'
    frequency = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
