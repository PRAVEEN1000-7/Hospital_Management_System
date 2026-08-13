"""
Statistical (n-gram) autocomplete suggestion router. Covers several
independent fields — see ngram_service.VALID_FIELD_TYPES — not gated behind
any single module's subscription dependency (unlike prescriptions.router)
since it's a read-only, hospital-scoped, non-PII endpoint shared across
Prescriptions/Pharmacy/Optical; the real authorization boundary lives on
each field's own write endpoint (module-gated there instead).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..schemas.suggestion import SuggestionRequest, SuggestionResponse
from ..services.ngram_service import get_suggestion

router = APIRouter(prefix="/suggestions", tags=["Autocomplete Suggestions"])


@router.post("/note", response_model=SuggestionResponse)
def get_note_suggestion(
    payload: SuggestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    suggestion = get_suggestion(db, current_user.hospital_id, payload.field, payload.text)
    return {"suggestion": suggestion}
