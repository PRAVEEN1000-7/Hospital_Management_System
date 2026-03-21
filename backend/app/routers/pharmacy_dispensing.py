"""
Pharmacy Dispensing Router — Handles prescription dispensing workflow.

This router provides endpoints for:
1. Viewing pending prescriptions queue
2. Dispensing medicines from prescriptions
3. Tracking dispensing status
4. Generating dispensing invoices/bills
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import date

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_any_role
from ..services import dispensing_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pharmacy", tags=["Pharmacy Dispensing"])


# ═══════════════════════════════════════════════════════════════════════════
# Pending Prescriptions Queue
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/prescriptions/pending")
async def get_pending_prescriptions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    doctor_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _: User = Depends(require_any_role("pharmacist", "admin", "super_admin")),
):
    """
    Get prescriptions waiting to be dispensed.
    
    This is the main work queue for pharmacists.
    
    **Status filters:**
    - `pending` → Finalized, not started dispensing
    - `partial` → Partially dispensed, awaiting restock
    - `dispensed` → Fully dispensed (complete)
    - (none) → Shows pending + partial (active work queue)
    """
    try:
        result = svc.get_pending_prescriptions(
            db=db,
            hospital_id=current_user.hospital_id,
            page=page,
            limit=limit,
            status_filter=status_filter,
            doctor_id=doctor_id,
            search=search,
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching pending prescriptions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch pending prescriptions")


# ═══════════════════════════════════════════════════════════════════════════
# Get Prescription Details for Dispensing
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/prescriptions/{prescription_id}/dispense-details")
async def get_prescription_for_dispensing(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _: User = Depends(require_any_role("pharmacist", "admin", "super_admin")),
):
    """
    Get prescription details needed for dispensing.

    Includes:
    - Patient information
    - Doctor information
    - Medicine items with available batches
    - Dispensing status per item
    """
    try:
        # First try to get from pending queue (enriches the data)
        result = svc.get_pending_prescriptions(
            db=db,
            hospital_id=current_user.hospital_id,
            page=1,
            limit=1,
        )

        # Find the prescription in results
        for rx in result.get("data", []):
            if rx["id"] == prescription_id:
                logger.info(
                    f"Prescription {prescription_id} found in pending queue. "
                    f"Items: {len(rx.get('items', []))}, "
                    f"Total batches available: {sum(len(i.get('available_batches', [])) for i in rx.get('items', []))}"
                )
                for item in rx.get('items', []):
                    batch_count = len(item.get('available_batches', []))
                    logger.info(
                        f"  - Item: {item.get('medicine_name', 'Unknown')} | "
                        f"Medicine ID: {item.get('medicine_id')} | "
                        f"Batches: {batch_count} | "
                        f"Available qty: {item.get('available_quantity', 0)}"
                    )
                return rx

        # If not in pending queue, check if it exists
        from ..models.prescription import Prescription
        rx = db.query(Prescription).filter(
            Prescription.id == prescription_id,
            Prescription.hospital_id == current_user.hospital_id,
        ).first()

        if not rx:
            logger.warning(f"Prescription {prescription_id} not found for hospital {current_user.hospital_id}")
            raise HTTPException(status_code=404, detail="Prescription not found")

        if not rx.is_finalized:
            logger.warning(f"Prescription {prescription_id} is not finalized (status: {rx.status})")
            raise HTTPException(status_code=400, detail="Prescription must be finalized before dispensing")

        # Enrich and return
        enriched = svc._enrich_prescription_for_dispensing(db, rx)
        
        logger.info(
            f"Prescription {prescription_id} enriched for dispensing. "
            f"Items: {len(enriched.get('items', []))}, "
            f"Total batches available: {sum(len(i.get('available_batches', [])) for i in enriched.get('items', []))}"
        )
        for item in enriched.get('items', []):
            batch_count = len(item.get('available_batches', []))
            logger.info(
                f"  - Item: {item.get('medicine_name', 'Unknown')} | "
                f"Medicine ID: {item.get('medicine_id')} | "
                f"Batches: {batch_count} | "
                f"Available qty: {item.get('available_quantity', 0)}"
            )
        
        return enriched

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching prescription for dispensing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch prescription details")


# ═══════════════════════════════════════════════════════════════════════════
# Dispense Medicines
# ═══════════════════════════════════════════════════════════════════════════

from pydantic import BaseModel, Field

class DispenseItemInput(BaseModel):
    prescription_item_id: str
    medicine_id: str
    batch_id: str
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0)

class DispenseRequest(BaseModel):
    items: list[DispenseItemInput]
    notes: Optional[str] = None

@router.post("/prescriptions/{prescription_id}/dispense")
async def dispense_prescription(
    prescription_id: str,
    request: DispenseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _: User = Depends(require_any_role("pharmacist", "admin", "super_admin")),
):
    """
    Dispense medicines from a prescription.
    
    **Request body:**
    ```json
    {
        "items": [
            {
                "prescription_item_id": "uuid",
                "medicine_id": "uuid",
                "batch_id": "uuid",
                "quantity": 10,
                "unit_price": 5.00
            }
        ],
        "notes": "Optional notes"
    }
    ```
    
    **What this does:**
    1. Validates prescription is finalized
    2. Checks stock availability in selected batches
    3. Reduces batch stock
    4. Updates prescription item dispensing status
    5. Updates prescription status (dispensed/partially_dispensed)
    6. Creates pharmacy_dispensing record
    7. Creates pharmacy_dispensing_items records
    
    **Response:**
    - dispensing_id: UUID of created dispensing record
    - status: "dispensed" or "partially_dispensed"
    - total_amount: Total cost
    """
    try:
        # Allow empty-item requests only when explicit notes are provided
        # so all-skipped/out-of-stock closures are auditable.
        if (not request.items or len(request.items) == 0) and not (request.notes and request.notes.strip()):
            raise HTTPException(
                status_code=400,
                detail="Provide notes when closing dispensing without any dispensed items",
            )
        
        # Convert Pydantic models to dicts
        items = [item.model_dump() for item in request.items]
        
        # Call service
        result = svc.dispense_prescription(
            db=db,
            prescription_id=prescription_id,
            hospital_id=current_user.hospital_id,
            user_id=current_user.id,
            items_to_dispense=items,
            notes=request.notes,
        )
        
        return {
            "success": True,
            "message": f"Dispensing completed. Status: {result['status']}",
            "data": result,
        }
        
    except ValueError as ve:
        logger.warning(f"Dispensing validation error: {ve}")
        db.rollback()
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error dispensing prescription: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to dispense prescription")


# ═══════════════════════════════════════════════════════════════════════════
# Get Available Batches
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/medicines/{medicine_id}/available-batches")
async def get_available_batches_for_medicine(
    medicine_id: str,
    min_quantity: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get available batches for a medicine (FEFO order).
    
    Returns batches sorted by expiry date (earliest first - FEFO principle).
    """
    try:
        batches = svc.get_available_batches(
            db=db,
            medicine_id=medicine_id,
            min_quantity=min_quantity,
        )
        return {
            "total": len(batches),
            "data": batches,
        }
    except Exception as e:
        logger.error(f"Error fetching batches: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch available batches")


# ═══════════════════════════════════════════════════════════════════════════
# Get Dispensing Record
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/dispensing/{dispensing_id}")
async def get_dispensing_record(
    dispensing_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get a specific dispensing record with items.
    """
    try:
        result = svc.get_dispensing_details(
            db=db,
            dispensing_id=dispensing_id,
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Dispensing record not found")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching dispensing record: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch dispensing record")


# ═══════════════════════════════════════════════════════════════════════════
# Include this router in main app
# ═══════════════════════════════════════════════════════════════════════════
# In main.py or wherever routers are included:
# app.include_router(pharmacy_dispensing_router)
