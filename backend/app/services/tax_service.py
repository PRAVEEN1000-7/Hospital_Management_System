"""
Tax configuration service — CRUD operations for tax_configurations table.
"""
import uuid
import logging
from sqlalchemy.orm import Session
from math import ceil
from datetime import date
from typing import Optional

from ..models.tax_config import TaxConfiguration
from ..schemas.tax_config import (
    TaxConfigCreate, TaxConfigUpdate, TaxConfigResponse, PaginatedTaxConfigResponse
)

logger = logging.getLogger(__name__)


def get_tax_config_by_id(db: Session, tax_id: str | uuid.UUID) -> Optional[TaxConfiguration]:
    if isinstance(tax_id, str):
        try:
            tax_id = uuid.UUID(tax_id)
        except ValueError:
            return None
    return db.query(TaxConfiguration).filter(TaxConfiguration.id == tax_id).first()


def get_active_tax_configs(db: Session, hospital_id: uuid.UUID) -> list[TaxConfiguration]:
    today = date.today()
    return (
        db.query(TaxConfiguration)
        .filter(
            TaxConfiguration.hospital_id == hospital_id,
            TaxConfiguration.is_active == True,
            TaxConfiguration.effective_from <= today,
        )
        .order_by(TaxConfiguration.name)
        .all()
    )


def list_tax_configs(
    db: Session,
    hospital_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    active_only: bool = False,
) -> PaginatedTaxConfigResponse:
    query = db.query(TaxConfiguration).filter(TaxConfiguration.hospital_id == hospital_id)
    if active_only:
        query = query.filter(TaxConfiguration.is_active == True)
    total = query.count()
    rows = query.order_by(TaxConfiguration.name).offset((page - 1) * limit).limit(limit).all()
    return PaginatedTaxConfigResponse(
        items=[TaxConfigResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total else 1,
    )


def create_tax_config(
    db: Session, data: TaxConfigCreate, hospital_id: uuid.UUID
) -> TaxConfiguration:
    existing = (
        db.query(TaxConfiguration)
        .filter(TaxConfiguration.hospital_id == hospital_id, TaxConfiguration.code == data.code)
        .first()
    )
    if existing:
        raise ValueError(f"Tax code '{data.code}' already exists for this hospital")

    record = TaxConfiguration(
        hospital_id=hospital_id,
        name=data.name,
        code=data.code,
        rate_percentage=data.rate_percentage,
        applies_to=data.applies_to,
        category=data.category,
        is_compound=data.is_compound,
        effective_from=data.effective_from,
        effective_to=data.effective_to,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(f"Created tax config {record.code} (id={record.id})")
    return record


def update_tax_config(db: Session, record: TaxConfiguration, data: TaxConfigUpdate) -> TaxConfiguration:
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


def toggle_tax_config(db: Session, record: TaxConfiguration) -> TaxConfiguration:
    record.is_active = not record.is_active
    db.commit()
    db.refresh(record)
    return record


def calculate_item_tax(unit_price: float, quantity: float, discount_pct: float, tax_rate: float) -> dict:
    """Return computed discount_amount, tax_amount, total_price for a line item."""
    line_subtotal = round(unit_price * quantity, 2)
    discount_amount = round(line_subtotal * (discount_pct / 100), 2)
    taxable = round(line_subtotal - discount_amount, 2)
    tax_amount = round(taxable * (tax_rate / 100), 2)
    total_price = round(taxable + tax_amount, 2)
    return {
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "total_price": total_price,
    }
