import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..database import get_db
from ..utils.security import decode_access_token
from ..schemas.hospital import (
    HospitalCreate,
    HospitalUpdate,
    HospitalResponse,
    HospitalPublicInfo,
    HospitalLogoUpload,
)
from ..models.user import User
from ..dependencies import get_current_active_user, require_super_admin, require_admin_or_super_admin
from ..services import hospital_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hospital", tags=["Hospital"])

# Optional auth — lets the public hospital endpoint scope to the caller's hospital
# when a valid token is present, without rejecting unauthenticated callers.
_optional_auth = HTTPBearer(auto_error=False)


def _hospital_id_from_token(credentials):
    """Return the hospital_id (UUID) embedded in a bearer token, or None if absent/invalid."""
    import uuid as _uuid
    if not credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    raw = payload.get("hospital_id")
    try:
        return _uuid.UUID(str(raw)) if raw else None
    except (ValueError, TypeError):
        return None


@router.get("/status", response_model=dict)
async def check_hospital_status(db: Session = Depends(get_db)):
    """Check if hospital is configured (public endpoint)"""
    is_configured = hospital_service.is_hospital_configured(db)
    return {
        "is_configured": is_configured,
        "message": "Hospital setup required" if not is_configured else "Hospital configured",
    }


@router.get("", response_model=HospitalPublicInfo)
async def get_hospital(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(_optional_auth),
):
    """Get hospital details (public info for ID cards, etc.).

    When called with a valid token the result is scoped to the caller's own
    hospital so invoices, ID cards and prescriptions never show another
    tenant's name. Unauthenticated callers fall back to the first hospital.
    """
    hospital_id = _hospital_id_from_token(credentials)
    hospital = hospital_service.get_hospital(db, hospital_id=hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital details not found. Please complete hospital setup.",
        )
    return hospital


@router.get("/full", response_model=HospitalResponse)
async def get_hospital_full(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Get complete hospital details with all fields (admin/super_admin only)"""
    try:
        hospital = hospital_service.get_hospital(db, hospital_id=current_user.hospital_id)
        if not hospital:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Hospital details not found. Please complete hospital setup.",
            )
        return hospital
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching hospital details: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve hospital details: {str(e)}",
        )


@router.post("", response_model=HospitalResponse, status_code=status.HTTP_201_CREATED)
async def create_hospital(
    hospital: HospitalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Create hospital record (one-time setup, admin/super_admin only)"""
    try:
        db_hospital = hospital_service.create_hospital(db, hospital, current_user.id)
        logger.info(f"Hospital created by user {current_user.username}")
        return db_hospital
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating hospital: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create hospital record. Please try again.",
        )


@router.put("", response_model=HospitalResponse)
async def update_hospital(
    hospital: HospitalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Update hospital details (admin/super_admin only)"""
    try:
        db_hospital = hospital_service.update_hospital(db, hospital, hospital_id=current_user.hospital_id, user_id=current_user.id)
        if not db_hospital:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Hospital not found",
            )
        logger.info(f"Hospital updated by user {current_user.username}")
        return db_hospital
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating hospital: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update hospital record. Please try again.",
        )


@router.put("/logo", response_model=HospitalLogoUpload)
async def update_logo(
    data: HospitalLogoUpload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Update hospital logo URL (admin/super_admin only)"""
    try:
        result = hospital_service.update_logo_url(db, data.logo_url, hospital_id=current_user.hospital_id)
        logger.info(f"Hospital logo updated by user {current_user.username}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating logo: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update logo. Please try again.",
        )


@router.get("/logo")
async def get_hospital_logo(db: Session = Depends(get_db)):
    """Get hospital logo URL (public endpoint)"""
    hospital = hospital_service.get_hospital(db)
    if not hospital or not hospital.logo_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital logo not found",
        )
    return {"logo_url": hospital.logo_url}


@router.delete("/logo")
async def delete_hospital_logo(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    """Delete hospital logo (admin/super_admin only)"""
    try:
        result = hospital_service.delete_logo(db, hospital_id=current_user.hospital_id)
        logger.info(f"Hospital logo deleted by user {current_user.username}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting logo: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete logo. Please try again.",
        )

