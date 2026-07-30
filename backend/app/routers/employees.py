"""
Employees router — CRUD for the employee_profiles HR extension of User,
plus effective-dated salary history.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.employee import EmployeeProfile
from ..core.module_roles import require_permission
from ..schemas.employee import (
    EmployeeProfileCreate,
    EmployeeProfileUpdate,
    EmployeeProfileResponse,
    EmployeeProfileListResponse,
    EmployeeSalaryCreate,
    EmployeeSalaryResponse,
)
from ..services.employee_service import (
    list_employee_profiles,
    get_employee_profile_by_id,
    get_employee_profile_by_user_id,
    create_employee_profile,
    update_employee_profile,
    list_salary_history,
    add_salary_revision,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/employees", tags=["Employees"])

employee_view_guard = require_permission("employee.records", "view")
employee_edit_guard = require_permission("employee.records", "edit")


def _enrich(profile: EmployeeProfile) -> EmployeeProfileResponse:
    """Populate the response-only name fields from the ORM relationships —
    must run on the already-validated Pydantic object (matches
    routers/doctors.py's pattern), since the schema's `_orm_to_dict` only
    reads real table columns and would silently drop anything set on the
    ORM instance itself before validation."""
    resp = EmployeeProfileResponse.model_validate(profile)
    if profile.user:
        resp.employee_name = f"{profile.user.first_name} {profile.user.last_name}".strip()
    if profile.department:
        resp.department_name = profile.department.name
    if profile.reporting_manager:
        resp.reporting_manager_name = f"{profile.reporting_manager.first_name} {profile.reporting_manager.last_name}".strip()
    return resp


@router.get("", response_model=EmployeeProfileListResponse)
async def get_employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(employee_view_guard),
):
    profiles = list_employee_profiles(db, current_user.hospital_id)
    return EmployeeProfileListResponse(
        total=len(profiles),
        data=[_enrich(p) for p in profiles],
    )


@router.get("/by-user/{user_id}", response_model=EmployeeProfileResponse)
async def get_employee_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(employee_view_guard),
):
    profile = get_employee_profile_by_user_id(db, user_id)
    if not profile or str(profile.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return _enrich(profile)


@router.get("/{profile_id}", response_model=EmployeeProfileResponse)
async def get_employee(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(employee_view_guard),
):
    profile = get_employee_profile_by_id(db, profile_id)
    if not profile or str(profile.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return _enrich(profile)


@router.post("", response_model=EmployeeProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_new_employee_profile(
    data: EmployeeProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(employee_edit_guard),
):
    try:
        profile = create_employee_profile(db, current_user.hospital_id, data.model_dump())
        return _enrich(profile)
    except Exception as e:
        logger.error(f"Error creating employee profile: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create employee profile")


@router.put("/{profile_id}", response_model=EmployeeProfileResponse)
async def update_existing_employee_profile(
    profile_id: str,
    data: EmployeeProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(employee_edit_guard),
):
    existing = get_employee_profile_by_id(db, profile_id)
    if not existing or str(existing.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Employee profile not found")
    try:
        profile = update_employee_profile(db, profile_id, data.model_dump(exclude_unset=True))
        return _enrich(profile)
    except Exception as e:
        logger.error(f"Error updating employee profile: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update employee profile")


# ── Salary history ──────────────────────────────────────────────────────────

@router.get("/{employee_user_id}/salary", response_model=list[EmployeeSalaryResponse])
async def get_salary_history(
    employee_user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(employee_edit_guard),
):
    rows = list_salary_history(db, employee_user_id)
    return [EmployeeSalaryResponse.model_validate(r) for r in rows]


@router.post("/{employee_user_id}/salary", response_model=EmployeeSalaryResponse, status_code=status.HTTP_201_CREATED)
async def add_salary(
    employee_user_id: str,
    data: EmployeeSalaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(employee_edit_guard),
):
    try:
        salary = add_salary_revision(db, current_user.hospital_id, employee_user_id, data.model_dump())
        return EmployeeSalaryResponse.model_validate(salary)
    except Exception as e:
        logger.error(f"Error adding salary revision: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to add salary revision")
