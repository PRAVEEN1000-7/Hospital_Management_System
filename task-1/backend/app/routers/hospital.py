import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.hospital import (
    HospitalCreate,
    HospitalUpdate,
    HospitalResponse,
    HospitalPublicInfo,
    HospitalLogoUpload
)
from ..models.user import User
from ..dependencies import get_current_active_user, require_super_admin, require_admin_or_super_admin
from ..services import hospital_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hospital", tags=["Hospital"])


@router.get("/status", response_model=dict)
async def check_hospital_status(db: Session = Depends(get_db)):
    """Check if hospital is configured (public endpoint)"""
    is_configured = hospital_service.is_hospital_configured(db)
    return {
        "is_configured": is_configured,
        "message": "Hospital setup required" if not is_configured else "Hospital configured"
    }


@router.get("", response_model=HospitalPublicInfo)
async def get_hospital(db: Session = Depends(get_db)):
    """Get hospital details (public info for ID cards, etc.)"""
    hospital = hospital_service.get_hospital_details(db)
    
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital details not found. Please complete hospital setup."
        )
    
    return hospital


@router.get("/full", response_model=HospitalResponse)
async def get_hospital_full(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin)
):
    """Get complete hospital details with all fields (admin/super_admin only)"""
    hospital = hospital_service.get_hospital_details(db)
    
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital details not found. Please complete hospital setup."
        )
    
    return hospital


@router.post("", response_model=HospitalResponse, status_code=status.HTTP_201_CREATED)
async def create_hospital(
    hospital: HospitalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin)
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
            detail="Failed to create hospital record. Please try again."
        )


@router.put("", response_model=HospitalResponse)
async def update_hospital(
    hospital: HospitalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin)
):
    """Update hospital details (admin/super_admin only)"""
    try:
        db_hospital = hospital_service.update_hospital(db, hospital, current_user.id)
        logger.info(f"Hospital updated by user {current_user.username}")
        return db_hospital
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating hospital: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update hospital record. Please try again."
        )


@router.post("/logo", response_model=HospitalLogoUpload)
async def upload_hospital_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin)
):
    """Upload hospital logo (admin/super_admin only)"""
    try:
        result = hospital_service.save_hospital_logo(db, file, current_user.id)
        logger.info(f"Hospital logo uploaded by user {current_user.username}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading logo: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload logo. Please try again."
        )


@router.get("/logo")
async def get_hospital_logo(db: Session = Depends(get_db)):
    """Get hospital logo file (public endpoint)"""
    logo_path = hospital_service.get_logo_path(db)
    
    if not logo_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital logo not found"
        )
    
    return FileResponse(logo_path)


@router.delete("/logo")
async def delete_hospital_logo(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin)
):
    """Delete hospital logo (admin/super_admin only)"""
    try:
        result = hospital_service.delete_hospital_logo(db, current_user.id)
        logger.info(f"Hospital logo deleted by user {current_user.username}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting logo: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete logo. Please try again."
        )
