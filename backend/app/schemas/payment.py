"""
Payment Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date, time, datetime
from decimal import Decimal

VALID_PAYMENT_MODES = ["cash", "card", "debit_card", "credit_card", "upi", "wallet", "bank_transfer", "online", "cheque", "insurance"]
VALID_PAYMENT_STATUSES = ["pending", "completed", "failed", "reversed"]


class PaymentCreate(BaseModel):
    invoice_id: str
    patient_id: str
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    payment_mode: str = Field(..., description="cash | card | upi | wallet | bank_transfer | online | cheque | insurance")
    payment_reference: Optional[str] = Field(None, max_length=100)
    payment_date: Optional[date] = None   # defaults to today
    notes: Optional[str] = None

    @field_validator("payment_mode")
    @classmethod
    def validate_payment_mode(cls, v: str) -> str:
        if v not in VALID_PAYMENT_MODES:
            raise ValueError(f"payment_mode must be one of: {', '.join(VALID_PAYMENT_MODES)}")
        return v


class PaymentListItem(BaseModel):
    id: str
    payment_number: str
    invoice_id: str
    invoice_number: str
    patient_id: str
    patient_name: str
    amount: Decimal
    payment_mode: str
    payment_reference: Optional[str] = None
    payment_date: date
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentResponse(BaseModel):
    id: str
    hospital_id: str
    payment_number: str
    invoice_id: str
    invoice_number: str
    patient_id: str
    patient_name: str
    amount: Decimal
    currency: str
    payment_mode: str
    payment_reference: Optional[str]
    payment_date: date
    payment_time: Optional[time]
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, "__dict__"):
            patient_name = ""
            if obj.patient:
                patient_name = f"{obj.patient.first_name} {obj.patient.last_name}".strip()
            invoice_number = obj.invoice.invoice_number if obj.invoice else ""
            data = {
                "id": str(obj.id),
                "hospital_id": str(obj.hospital_id),
                "payment_number": obj.payment_number,
                "invoice_id": str(obj.invoice_id),
                "invoice_number": invoice_number,
                "patient_id": str(obj.patient_id),
                "patient_name": patient_name,
                "amount": obj.amount,
                "currency": obj.currency or "INR",
                "payment_mode": obj.payment_mode,
                "payment_reference": obj.payment_reference,
                "payment_date": obj.payment_date,
                "payment_time": obj.payment_time,
                "status": obj.status,
                "notes": obj.notes,
                "created_at": obj.created_at,
                "updated_at": obj.updated_at,
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)


class PaginatedPaymentResponse(BaseModel):
    items: list[PaymentListItem]
    total: int
    page: int
    limit: int
    pages: int
