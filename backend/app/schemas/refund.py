"""
Refund Pydantic schemas.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from decimal import Decimal

VALID_REASON_CODES = [
    "service_not_provided", "billing_error", "patient_request", "duplicate", "other"
]
VALID_REFUND_STATUSES = ["pending", "approved", "processed", "rejected"]
VALID_REFUND_MODES = ["cash", "card", "upi", "bank_transfer", "cheque"]


class RefundCreate(BaseModel):
    invoice_id: str
    payment_id: str
    patient_id: str
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    reason_code: str
    reason_detail: Optional[str] = None
    refund_mode: Optional[str] = None

    @field_validator("reason_code")
    @classmethod
    def validate_reason_code(cls, v: str) -> str:
        if v not in VALID_REASON_CODES:
            raise ValueError(f"reason_code must be one of: {', '.join(VALID_REASON_CODES)}")
        return v

    @field_validator("refund_mode")
    @classmethod
    def validate_refund_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_REFUND_MODES:
            raise ValueError(f"refund_mode must be one of: {', '.join(VALID_REFUND_MODES)}")
        return v


class RefundProcessRequest(BaseModel):
    refund_mode: Optional[str] = None
    refund_reference: Optional[str] = None

    @field_validator("refund_mode")
    @classmethod
    def validate_refund_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_REFUND_MODES:
            raise ValueError(f"refund_mode must be one of: {', '.join(VALID_REFUND_MODES)}")
        return v


class RefundRejectRequest(BaseModel):
    reason_detail: Optional[str] = None


class RefundListItem(BaseModel):
    id: str
    refund_number: str
    invoice_id: str
    invoice_number: str
    patient_id: str
    patient_name: str
    amount: Decimal
    reason_code: str
    reason_detail: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RefundResponse(BaseModel):
    id: str
    hospital_id: str
    refund_number: str
    invoice_id: str
    invoice_number: str
    payment_id: str
    payment_number: str
    patient_id: str
    patient_name: str
    amount: Decimal
    reason_code: str
    reason_detail: Optional[str]
    status: str
    refund_mode: Optional[str]
    refund_reference: Optional[str]
    processed_at: Optional[datetime]
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
            payment_number = obj.payment.payment_number if obj.payment else ""
            data = {
                "id": str(obj.id),
                "hospital_id": str(obj.hospital_id),
                "refund_number": obj.refund_number,
                "invoice_id": str(obj.invoice_id),
                "invoice_number": invoice_number,
                "payment_id": str(obj.payment_id),
                "payment_number": payment_number,
                "patient_id": str(obj.patient_id),
                "patient_name": patient_name,
                "amount": obj.amount,
                "reason_code": obj.reason_code,
                "reason_detail": obj.reason_detail,
                "status": obj.status,
                "refund_mode": obj.refund_mode,
                "refund_reference": obj.refund_reference,
                "processed_at": obj.processed_at,
                "created_at": obj.created_at,
                "updated_at": obj.updated_at,
            }
            return cls(**data)
        return super().model_validate(obj, **kwargs)


class PaginatedRefundResponse(BaseModel):
    items: list[RefundListItem]
    total: int
    page: int
    limit: int
    pages: int
