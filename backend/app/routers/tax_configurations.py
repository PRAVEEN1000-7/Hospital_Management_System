"""
Tax Configuration router — /api/v1/tax-configurations
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import get_current_active_user
from ..models.user import User
from ..schemas.tax_config import (
    TaxConfigCreate, TaxConfigUpdate, TaxConfigResponse, PaginatedTaxConfigResponse
)
from ..services.tax_service import (
    list_tax_configs, create_tax_config, get_tax_config_by_id,
    update_tax_config, toggle_tax_config, get_active_tax_configs,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tax-configurations", tags=["Billing — Tax Configurations"])

BILLING_ADMIN_ROLES = {"super_admin", "admin"}
BILLING_STAFF_ROLES = {"super_admin", "admin", "cashier", "pharmacist"}


def _require_billing_admin(current_user: User) -> None:
    role = current_user.roles[0] if current_user.roles else ""
    if role not in BILLING_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin or Super Admin role required")


def _require_billing_staff(current_user: User) -> None:
    role = current_user.roles[0] if current_user.roles else ""
    if role not in BILLING_STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Billing staff access required")


@router.get("", response_model=PaginatedTaxConfigResponse)
async def list_tax_configurations(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all tax configurations for the hospital."""
    _require_billing_staff(current_user)
    try:
        return list_tax_configs(db, current_user.hospital_id, page, limit, active_only)
    except Exception as e:
        logger.error(f"Error listing tax configs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve tax configurations")


@router.post("", response_model=TaxConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_tax_configuration(
    data: TaxConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new tax configuration rule."""
    _require_billing_admin(current_user)
    try:
        record = create_tax_config(db, data, current_user.hospital_id)
        return TaxConfigResponse.model_validate(record)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating tax config: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create tax configuration")


@router.get("/{tax_id}", response_model=TaxConfigResponse)
async def get_tax_configuration(
    tax_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a single tax configuration."""
    _require_billing_staff(current_user)
    record = get_tax_config_by_id(db, tax_id)
    if not record or str(record.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Tax configuration not found")
    return TaxConfigResponse.model_validate(record)


@router.put("/{tax_id}", response_model=TaxConfigResponse)
async def update_tax_configuration(
    tax_id: str,
    data: TaxConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a tax configuration."""
    _require_billing_admin(current_user)
    record = get_tax_config_by_id(db, tax_id)
    if not record or str(record.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Tax configuration not found")
    try:
        record = update_tax_config(db, record, data)
        return TaxConfigResponse.model_validate(record)
    except Exception as e:
        logger.error(f"Error updating tax config {tax_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update tax configuration")


@router.patch("/{tax_id}/toggle", response_model=TaxConfigResponse)
async def toggle_tax_configuration(
    tax_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Toggle tax configuration active/inactive."""
    _require_billing_admin(current_user)
    record = get_tax_config_by_id(db, tax_id)
    if not record or str(record.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Tax configuration not found")
    try:
        record = toggle_tax_config(db, record)
        return TaxConfigResponse.model_validate(record)
    except Exception as e:
        logger.error(f"Error toggling tax config {tax_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to toggle tax configuration")
