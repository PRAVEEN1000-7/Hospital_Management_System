import os
import shutil
from sqlalchemy.orm import Session
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from ..models.hospital import HospitalDetails
from ..schemas.hospital import HospitalCreate, HospitalUpdate


# Upload directory configuration
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "hospital")
ALLOWED_LOGO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".svg"}
MAX_LOGO_SIZE_MB = 2


def ensure_upload_directory():
    """Create upload directory if it doesn't exist"""
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_hospital_details(db: Session) -> Optional[HospitalDetails]:
    """Get the single hospital record"""
    return db.query(HospitalDetails).first()


def is_hospital_configured(db: Session) -> bool:
    """Check if hospital is already configured"""
    hospital = get_hospital_details(db)
    return hospital is not None


def create_hospital(db: Session, hospital_data: HospitalCreate, user_id: int) -> HospitalDetails:
    """Create hospital record (one-time setup)"""
    # Check if hospital already exists
    existing = db.query(HospitalDetails).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hospital record already exists. Use update endpoint to modify."
        )
    
    # Create new hospital record
    # Use mode='python' to keep Python objects (like datetime.time) instead of serializing to JSON
    data = hospital_data.model_dump(mode='python')
    
    # Convert empty strings to None for optional fields with database constraints
    # These fields have CHECK constraints that require NULL (not empty string) when not provided
    optional_fields = ['gst_number', 'pan_number', 'drug_license_number', 
                       'medical_registration_number', 'secondary_phone', 'address_line2']
    for field in optional_fields:
        if field in data and data[field] == '':
            data[field] = None
    
    db_hospital = HospitalDetails(
        **data,
        is_configured=True,
        created_by=user_id,
        updated_by=user_id
    )
    
    db.add(db_hospital)
    db.commit()
    db.refresh(db_hospital)
    return db_hospital


def update_hospital(db: Session, hospital_data: HospitalUpdate, user_id: int) -> Optional[HospitalDetails]:
    """Update hospital record"""
    db_hospital = db.query(HospitalDetails).first()
    
    if not db_hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital record not found. Create one first using setup endpoint."
        )
    
    # Update only provided fields
    # Use mode='python' to keep Python objects instead of serializing to JSON
    update_data = hospital_data.model_dump(exclude_unset=True, mode='python')
    
    # Convert empty strings to None for optional fields with database constraints
    optional_fields = ['gst_number', 'pan_number', 'drug_license_number', 
                       'medical_registration_number', 'secondary_phone', 'address_line2']
    for field in optional_fields:
        if field in update_data and update_data[field] == '':
            update_data[field] = None
    
    for field, value in update_data.items():
        setattr(db_hospital, field, value)
    
    db_hospital.updated_by = user_id
    db_hospital.is_configured = True
    
    db.commit()
    db.refresh(db_hospital)
    return db_hospital


def save_hospital_logo(db: Session, file: UploadFile, user_id: int) -> dict:
    """Save hospital logo file and update database"""
    ensure_upload_directory()
    
    # Validate file extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_LOGO_EXTENSIONS)}"
        )
    
    # Check file size
    file.file.seek(0, 2)  # Seek to end
    file_size_bytes = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    file_size_mb = file_size_bytes / (1024 * 1024)
    if file_size_mb > MAX_LOGO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_LOGO_SIZE_MB}MB"
        )
    
    # Get hospital record
    db_hospital = db.query(HospitalDetails).first()
    if not db_hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital record not found. Create hospital details first."
        )
    
    # Delete old logo if exists
    if db_hospital.logo_path and os.path.exists(db_hospital.logo_path):
        try:
            os.remove(db_hospital.logo_path)
        except Exception:
            pass  # Ignore deletion errors
    
    # Generate unique filename
    filename = f"hospital_logo{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save logo: {str(e)}"
        )
    
    # Update database
    db_hospital.logo_path = file_path
    db_hospital.logo_filename = filename
    db_hospital.logo_mime_type = file.content_type
    db_hospital.logo_size_kb = int(file_size_bytes / 1024)
    db_hospital.updated_by = user_id
    
    db.commit()
    db.refresh(db_hospital)
    
    return {
        "logo_path": file_path,
        "logo_filename": filename,
        "logo_size_kb": db_hospital.logo_size_kb,
        "message": "Logo uploaded successfully"
    }


def get_logo_path(db: Session) -> Optional[str]:
    """Get hospital logo file path"""
    hospital = db.query(HospitalDetails).first()
    if hospital and hospital.logo_path and os.path.exists(hospital.logo_path):
        return hospital.logo_path
    return None


def delete_hospital_logo(db: Session, user_id: int) -> dict:
    """Delete hospital logo"""
    db_hospital = db.query(HospitalDetails).first()
    
    if not db_hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital record not found"
        )
    
    if not db_hospital.logo_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No logo found to delete"
        )
    
    # Delete file
    if os.path.exists(db_hospital.logo_path):
        try:
            os.remove(db_hospital.logo_path)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete logo file: {str(e)}"
            )
    
    # Update database
    db_hospital.logo_path = None
    db_hospital.logo_filename = None
    db_hospital.logo_mime_type = None
    db_hospital.logo_size_kb = None
    db_hospital.updated_by = user_id
    
    db.commit()
    
    return {"message": "Logo deleted successfully"}
