"""
Shifts router — shift definitions and employee shift assignment.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.shift import EmployeeShiftAssignment
from ..core.module_roles import require_permission
from ..schemas.shift import (
    ShiftCreate, ShiftUpdate, ShiftResponse, ShiftListResponse,
    ShiftAssignmentCreate, ShiftAssignmentResponse,
)
from ..services.shift_service import (
    list_shifts, get_shift_by_id, create_shift, update_shift, delete_shift,
    list_assignments, create_assignment,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/shifts", tags=["Shifts"])

shift_view_guard = require_permission("employee.shifts", "view")
shift_edit_guard = require_permission("employee.shifts", "edit")


def _enrich_assignment(a: EmployeeShiftAssignment) -> ShiftAssignmentResponse:
    resp = ShiftAssignmentResponse.model_validate(a)
    if a.employee:
        resp.employee_name = f"{a.employee.first_name} {a.employee.last_name}".strip()
    if a.shift:
        resp.shift_name = a.shift.name
    return resp


@router.get("", response_model=ShiftListResponse)
async def get_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(shift_view_guard),
):
    rows = list_shifts(db, current_user.hospital_id)
    return ShiftListResponse(total=len(rows), data=[ShiftResponse.model_validate(r) for r in rows])


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_new_shift(
    data: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(shift_edit_guard),
):
    shift = create_shift(db, current_user.hospital_id, data.model_dump())
    return ShiftResponse.model_validate(shift)


@router.put("/{shift_id}", response_model=ShiftResponse)
async def update_existing_shift(
    shift_id: str,
    data: ShiftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(shift_edit_guard),
):
    existing = get_shift_by_id(db, shift_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Shift not found")
    shift = update_shift(db, shift_id, data.model_dump(exclude_unset=True))
    return ShiftResponse.model_validate(shift)


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(shift_edit_guard),
):
    existing = get_shift_by_id(db, shift_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Shift not found")
    ok, error = delete_shift(db, shift_id)
    if not ok:
        raise HTTPException(status_code=400, detail=error)


# ── Assignments ──────────────────────────────────────────────────────────

@router.get("/assignments", response_model=list[ShiftAssignmentResponse])
async def get_assignments(
    employee_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(shift_view_guard),
):
    rows = list_assignments(db, current_user.hospital_id, employee_id)
    return [_enrich_assignment(a) for a in rows]


@router.post("/assignments", response_model=ShiftAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_new_assignment(
    data: ShiftAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(shift_edit_guard),
):
    try:
        assignment = create_assignment(db, current_user.id, data.model_dump())
        return _enrich_assignment(assignment)
    except Exception as e:
        logger.error(f"Error creating shift assignment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create shift assignment")
