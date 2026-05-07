"""
Departments router — CRUD for hospital departments.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.department import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse,
    DepartmentListResponse,
)
from ..services.department_service import (
    list_departments,
    get_department_by_id,
    create_department,
    update_department,
    delete_department,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/departments", tags=["Departments"])


@router.get("", response_model=DepartmentListResponse)
async def get_departments(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all departments for the current user's hospital."""
    depts = list_departments(db, current_user.hospital_id, active_only)
    return DepartmentListResponse(
        total=len(depts),
        data=[DepartmentResponse.model_validate(d) for d in depts],
    )


@router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    dept = get_department_by_id(db, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return DepartmentResponse.model_validate(dept)


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_new_department(
    data: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Create a new department (admin only)."""
    try:
        dept = create_department(db, current_user.hospital_id, data.model_dump())
        return DepartmentResponse.model_validate(dept)
    except Exception as e:
        logger.error(f"Error creating department: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create department")


@router.put("/{department_id}", response_model=DepartmentResponse)
async def update_existing_department(
    department_id: str,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Update a department (admin only)."""
    try:
        dept = update_department(db, department_id, data.model_dump(exclude_unset=True))
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found")
        return DepartmentResponse.model_validate(dept)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating department: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update department")


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_department(
    department_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Deactivate a department (admin only)."""
    if not delete_department(db, department_id):
        raise HTTPException(status_code=404, detail="Department not found")
