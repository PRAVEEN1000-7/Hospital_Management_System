import os
import shutil
import logging
from sqlalchemy.orm import Session
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from ..models.user import Hospital  # Use new Hospital model from user.py
from ..schemas.hospital import HospitalCreate, HospitalUpdate

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "hospital")
ALLOWED_LOGO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".svg"}
MAX_LOGO_SIZE_MB = 2


def ensure_upload_directory():
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_hospital_details(db: Session) -> Optional[Hospital]:
    return db.query(Hospital).first()


# Alias used by routers
get_hospital = get_hospital_details


def is_hospital_configured(db: Session) -> bool:
    hospital = get_hospital_details(db)
    return hospital is not None and hospital.is_active


def create_hospital(db: Session, hospital_data: HospitalCreate, user_id: str = None) -> Hospital:
    existing = db.query(Hospital).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hospital record already exists. Use update endpoint to modify.",
        )
    data = hospital_data.model_dump(mode="python")
    db_hospital = Hospital(**data)
    db.add(db_hospital)
    db.commit()
    db.refresh(db_hospital)
    logger.info(f"Hospital created: {db_hospital.name}")
    return db_hospital


def update_hospital(db: Session, hospital_data: HospitalUpdate, user_id: str = None) -> Optional[Hospital]:
    db_hospital = db.query(Hospital).first()
    if not db_hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital record not found. Create one first using setup endpoint.",
        )
    update_data = hospital_data.model_dump(exclude_unset=True, mode="python")
    for field, value in update_data.items():
        setattr(db_hospital, field, value)
    db.commit()
    db.refresh(db_hospital)
    return db_hospital


def update_logo_url(db: Session, logo_url: str) -> dict:
    db_hospital = db.query(Hospital).first()
    if not db_hospital:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    db_hospital.logo_url = logo_url
    db.commit()
    db.refresh(db_hospital)
    return {"logo_url": logo_url, "message": "Logo updated successfully"}


def delete_logo(db: Session) -> dict:
    db_hospital = db.query(Hospital).first()
    if not db_hospital:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    if not db_hospital.logo_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No logo found")
    db_hospital.logo_url = None
    db.commit()
    return {"message": "Logo deleted successfully"}


def save_hospital_logo(db: Session, file: UploadFile, user_id: int) -> dict:
    ensure_upload_directory()
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_LOGO_EXTENSIONS)}",
        )
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    if file_size_bytes / (1024 * 1024) > MAX_LOGO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_LOGO_SIZE_MB}MB",
        )
    db_hospital = db.query(Hospital).first()
    if not db_hospital:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    filename = f"hospital_logo{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save logo: {str(e)}",
        )
    db_hospital.logo_url = f"/uploads/hospital/{filename}"
    db.commit()
    db.refresh(db_hospital)
    return {"logo_url": db_hospital.logo_url, "message": "Logo uploaded successfully"}


def get_logo_path(db: Session) -> Optional[str]:
    hospital = db.query(Hospital).first()
    if hospital and hospital.logo_url:
        return hospital.logo_url
    return None