"""
Appointment reports router – statistics and analytics.
"""
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user
from ..schemas.appointment import AppointmentStats
from ..services.appointment_service import get_appointment_stats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports/appointments", tags=["Appointment Reports"])


@router.get("/statistics", response_model=AppointmentStats)
async def statistics(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    doctor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return get_appointment_stats(db, date_from, date_to, doctor_id)
