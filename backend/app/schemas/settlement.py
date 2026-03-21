"""
DailySettlement Pydantic schemas.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class SettlementCreate(BaseModel):
    settlement_date: Optional[date] = None   # defaults to today
    notes: Optional[str] = None


class SettlementResponse(BaseModel):
    id: str
    hospital_id: str
    settlement_date: date
    cashier_user_id: str
    cashier_name: str
    total_cash: Decimal
    total_card: Decimal
    total_online: Decimal
    total_other: Decimal
    total_collected: Decimal
    total_refunds: Decimal
    net_amount: Decimal
    status: str
    verified_by: Optional[str]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, "__dict__"):
            data = {
                "id": str(obj.id),
                "hospital_id": str(obj.hospital_id),
                "settlement_date": obj.settlement_date,
                "cashier_user_id": str(obj.cashier_user_id),
                "cashier_name": "",   # populated by service layer
                "total_cash": obj.total_cash or Decimal("0"),
                "total_card": obj.total_card or Decimal("0"),
                "total_online": obj.total_online or Decimal("0"),
                "total_other": obj.total_other or Decimal("0"),
                "total_collected": obj.total_collected or Decimal("0"),
                "total_refunds": obj.total_refunds or Decimal("0"),
                "net_amount": obj.net_amount or Decimal("0"),
                "status": obj.status,
                "verified_by": str(obj.verified_by) if obj.verified_by else None,
                "notes": obj.notes,
                "created_at": obj.created_at,
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)


class SettlementListItem(BaseModel):
    id: str
    settlement_date: date
    cashier_name: str
    total_collected: Decimal
    total_refunds: Decimal
    net_amount: Decimal
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedSettlementResponse(BaseModel):
    items: list[SettlementListItem]
    total: int
    page: int
    limit: int
    pages: int
