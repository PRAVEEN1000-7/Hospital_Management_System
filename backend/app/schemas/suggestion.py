"""Pydantic schemas for the statistical (n-gram) autocomplete suggestion endpoint."""
from pydantic import BaseModel, Field, field_validator

from ..services.ngram_service import VALID_FIELD_TYPES


class SuggestionRequest(BaseModel):
    field: str = Field(..., description="Which field this suggestion is for, e.g. 'clinical_notes', 'diagnosis'.")
    text: str = Field(..., max_length=500, description="Trailing text before the caret, e.g. the last ~200 chars of the field.")

    @field_validator("field")
    @classmethod
    def validate_field(cls, v: str) -> str:
        if v not in VALID_FIELD_TYPES:
            raise ValueError(f"Must be one of: {', '.join(sorted(VALID_FIELD_TYPES))}")
        return v


class SuggestionResponse(BaseModel):
    suggestion: str
