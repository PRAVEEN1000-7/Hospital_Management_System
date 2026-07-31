"""
Payroll router — generates and fetches a monthly payroll snapshot, gated by
the `attendance` module.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..dependencies import get_current_active_user, require_admin_or_super_admin
from ..schemas.payroll import PayrollRunResponse, PayrollItemResponse
from ..services import payroll_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payroll", tags=["Payroll"])


def _to_response(run) -> PayrollRunResponse:
    items = [
        PayrollItemResponse(
            user_id=str(item.user_id),
            reference_number=item.user.reference_number if item.user else None,
            first_name=item.user.first_name if item.user else "",
            last_name=item.user.last_name if item.user else "",
            designation=item.user.designation if item.user else None,
            present_count=float(item.present_count),
            absent_count=float(item.absent_count),
            paid_leave_entitlement=item.paid_leave_entitlement,
            working_days=item.working_days,
            base_salary=float(item.base_salary),
            per_day_salary=float(item.per_day_salary),
            deduction_days=float(item.deduction_days),
            deduction_amount=float(item.deduction_amount),
            net_payable=float(item.net_payable),
        )
        for item in run.items
    ]
    return PayrollRunResponse(
        year=run.year,
        month=run.month,
        generated_at=run.generated_at,
        items=sorted(items, key=lambda i: i.first_name),
        total_net_payable=round(sum(i.net_payable for i in items), 2),
    )


@router.get("/{year}/{month}", response_model=PayrollRunResponse)
async def get_payroll(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    run = payroll_service.get_payroll(db, current_user.hospital_id, year, month)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll not generated for this month yet")
    return _to_response(run)


@router.post("/{year}/{month}/generate", response_model=PayrollRunResponse)
async def generate_payroll(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super_admin),
):
    run = payroll_service.generate_payroll(db, current_user.hospital_id, year, month, current_user.id)
    return _to_response(run)
