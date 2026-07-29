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
from ..dependencies import get_current_active_user, require_any_role
from ..core.module_roles import require_permission
from ..schemas.appointment import AppointmentStats, EnhancedAppointmentStats
from ..services.appointment_service import get_appointment_stats, get_enhanced_stats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports/appointments", tags=["Appointment Reports"])

reports_view_guard = require_permission("appt.reports", "view")


@router.get("/statistics", response_model=AppointmentStats)
async def statistics(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    doctor_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(reports_view_guard),
):
    return get_appointment_stats(
        db,
        hospital_id=current_user.hospital_id,
        date_from=date_from,
        date_to=date_to,
        doctor_id=doctor_id,
    )


@router.get("/enhanced-statistics", response_model=EnhancedAppointmentStats)
async def enhanced_statistics(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(reports_view_guard),
):
    """Get comprehensive analytics: doctor utilization, department breakdown, trends, peak times, cancellation reasons."""
    return get_enhanced_stats(db, date_from, date_to, hospital_id=current_user.hospital_id)
