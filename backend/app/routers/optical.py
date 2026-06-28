"""
Optical Store router — products, batches, eye prescriptions, sales, stock adjustments, dashboard.
"""
import logging
import uuid as uuid_mod
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.optical import OpticalProduct as OpticalProductModel, OpticalBatch
from ..dependencies import get_current_active_user
from ..schemas.optical import (
    # Product
    OpticalProductCreate, OpticalProductUpdate, OpticalProductResponse, OpticalProductListResponse,
    # Batch
    OpticalBatchCreate, OpticalBatchUpdate, OpticalBatchResponse,
    # Prescription
    OpticalPrescriptionCreate, OpticalPrescriptionUpdate, OpticalPrescriptionResponse, OpticalPrescriptionListResponse,
    # Sale
    OpticalSaleCreate, OpticalSaleResponse, OpticalSaleListResponse, OpticalSaleItemResponse,
    # Stock Adjustment
    OpticalStockAdjustmentCreate, OpticalStockAdjustmentResponse,
    # Dashboard
    OpticalDashboard,
    # Analytics
    OpticalSalesAnalytics, TopSellingOpticalProductAnalytics,
    # Queue
    OpticalQueueEntryResponse, OpticalQueueStatusUpdate,
)
from ..services import optical_service as svc

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/optical", tags=["Optical"])


# ═══ Dashboard ═══
@router.get("/dashboard", response_model=OpticalDashboard)
async def optical_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return svc.get_optical_dashboard(db, current_user.hospital_id)


# ═══ Analytics ═══
@router.get("/analytics/sales-trend", response_model=list[OpticalSalesAnalytics])
async def optical_sales_trend(
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return svc.get_optical_sales_trend(db, current_user.hospital_id, days)


@router.get("/analytics/top-products", response_model=list[TopSellingOpticalProductAnalytics])
async def optical_top_products(
    days: int = Query(30, ge=1, le=90),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return svc.get_optical_top_products(db, current_user.hospital_id, days, limit)


# ═══ Products ═══
@router.get("/products", response_model=OpticalProductListResponse)
async def list_optical_products(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_optical_products(db, current_user.hospital_id, page, limit, search, category, active_only)
    stock_map = result.pop("stock_map", {})
    data = []
    for product in result["data"]:
        resp = OpticalProductResponse.model_validate(product)
        resp.total_stock = stock_map.get(product.id, 0)
        data.append(resp)
    result["data"] = data
    return result


@router.get("/products/{product_id}", response_model=OpticalProductResponse)
async def get_optical_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    product = svc.get_optical_product_by_id(db, product_id, hospital_id=current_user.hospital_id)
    if not product:
        raise HTTPException(status_code=404, detail="Optical product not found")
    return OpticalProductResponse.model_validate(product)


@router.post("/products", response_model=OpticalProductResponse, status_code=status.HTTP_201_CREATED)
async def create_optical_product(
    data: OpticalProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        product = svc.create_optical_product(db, current_user.hospital_id, data.model_dump())
        return OpticalProductResponse.model_validate(product)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating optical product: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create optical product")


@router.put("/products/{product_id}", response_model=OpticalProductResponse)
async def update_optical_product(
    product_id: str,
    data: OpticalProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        try:
            product_uuid = uuid_mod.UUID(product_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Optical product not found")
        check = db.query(OpticalProductModel).filter(
            OpticalProductModel.id == product_uuid,
            OpticalProductModel.hospital_id == current_user.hospital_id,
        ).first()
        if not check:
            raise HTTPException(status_code=404, detail="Optical product not found")
        product = svc.update_optical_product(db, product_id, data.model_dump(exclude_unset=True))
        if not product:
            raise HTTPException(status_code=404, detail="Optical product not found")
        return OpticalProductResponse.model_validate(product)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating optical product: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update optical product")


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_optical_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        product_uuid = uuid_mod.UUID(product_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Optical product not found")
    check = db.query(OpticalProductModel).filter(
        OpticalProductModel.id == product_uuid,
        OpticalProductModel.hospital_id == current_user.hospital_id,
    ).first()
    if not check:
        raise HTTPException(status_code=404, detail="Optical product not found")
    if not svc.delete_optical_product(db, product_id):
        raise HTTPException(status_code=404, detail="Optical product not found")


# ═══ Batches ═══
@router.get("/products/{product_id}/batches", response_model=list[OpticalBatchResponse])
async def list_optical_batches(
    product_id: str,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        product_uuid = uuid_mod.UUID(product_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Optical product not found")
    check = db.query(OpticalProductModel).filter(
        OpticalProductModel.id == product_uuid,
        OpticalProductModel.hospital_id == current_user.hospital_id,
    ).first()
    if not check:
        raise HTTPException(status_code=404, detail="Optical product not found")
    batches = svc.list_optical_batches(db, product_id, active_only)
    return [OpticalBatchResponse.model_validate(b) for b in batches]


@router.post("/batches", response_model=OpticalBatchResponse, status_code=status.HTTP_201_CREATED)
async def create_optical_batch(
    data: OpticalBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        try:
            product_uuid = uuid_mod.UUID(str(data.product_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Optical product not found")
        check = db.query(OpticalProductModel).filter(
            OpticalProductModel.id == product_uuid,
            OpticalProductModel.hospital_id == current_user.hospital_id,
        ).first()
        if not check:
            raise HTTPException(status_code=404, detail="Optical product not found")
        batch = svc.create_optical_batch(db, data.model_dump())
        return OpticalBatchResponse.model_validate(batch)
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch number '{data.batch_number}' already exists for this product. Use a different batch number.",
        )
    except Exception as e:
        logger.error(f"Error creating optical batch: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create batch")


@router.put("/batches/{batch_id}", response_model=OpticalBatchResponse)
async def update_optical_batch(
    batch_id: str,
    data: OpticalBatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        try:
            batch_uuid = uuid_mod.UUID(batch_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch_check = (
            db.query(OpticalBatch)
            .join(OpticalProductModel, OpticalBatch.product_id == OpticalProductModel.id)
            .filter(OpticalBatch.id == batch_uuid, OpticalProductModel.hospital_id == current_user.hospital_id)
            .first()
        )
        if not batch_check:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch = svc.update_optical_batch(db, batch_id, data.model_dump(exclude_unset=True))
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        return OpticalBatchResponse.model_validate(batch)
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Another batch with this batch number already exists for this product.",
        )
    except Exception as e:
        logger.error(f"Error updating optical batch: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update batch")


def _enrich_prescription_response(rx) -> OpticalPrescriptionResponse:
    resp = OpticalPrescriptionResponse.model_validate(rx)
    resp.patient_name = rx.patient.full_name if getattr(rx, "patient", None) else None
    resp.doctor_name = (
        f"Dr. {rx.doctor.user.full_name}" if getattr(rx, "doctor", None) and rx.doctor.user else None
    )
    return resp


# ═══ Eye Prescriptions ═══
@router.get("/prescriptions", response_model=OpticalPrescriptionListResponse)
async def list_optical_prescriptions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    patient_id: Optional[str] = None,
    doctor_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_optical_prescriptions(db, current_user.hospital_id, page, limit, patient_id, doctor_id)
    result["data"] = [_enrich_prescription_response(p) for p in result["data"]]
    return result


@router.get("/prescriptions/{prescription_id}", response_model=OpticalPrescriptionResponse)
async def get_optical_prescription(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rx = svc.get_optical_prescription_by_id(db, prescription_id, hospital_id=current_user.hospital_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return _enrich_prescription_response(rx)


@router.post("/prescriptions", response_model=OpticalPrescriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_optical_prescription(
    data: OpticalPrescriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        rx = svc.create_optical_prescription(db, current_user.hospital_id, data.model_dump(), created_by=current_user.id)
        return _enrich_prescription_response(rx)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating optical prescription: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create prescription")


@router.put("/prescriptions/{prescription_id}", response_model=OpticalPrescriptionResponse)
async def update_optical_prescription(
    prescription_id: str,
    data: OpticalPrescriptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rx = svc.get_optical_prescription_by_id(db, prescription_id, hospital_id=current_user.hospital_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")
    rx = svc.update_optical_prescription(db, prescription_id, data.model_dump(exclude_unset=True))
    return _enrich_prescription_response(rx)


@router.post("/prescriptions/{prescription_id}/finalize", response_model=OpticalPrescriptionResponse)
async def finalize_optical_prescription(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    rx = svc.get_optical_prescription_by_id(db, prescription_id, hospital_id=current_user.hospital_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")
    rx = svc.finalize_optical_prescription(db, prescription_id)
    return _enrich_prescription_response(rx)


@router.get("/prescriptions/{prescription_id}/pdf")
async def get_optical_prescription_pdf(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate the eye prescription as printable HTML, styled like the clinical Rx template."""
    from fastapi.responses import HTMLResponse
    from ..models.patient import Patient
    from ..models.user import Hospital
    from ..models.appointment import Doctor

    rx = svc.get_optical_prescription_by_id(db, prescription_id, hospital_id=current_user.hospital_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")

    patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()
    doctor = db.query(Doctor).filter(Doctor.id == rx.doctor_id).first()
    hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()

    # This HTML is rendered client-side via document.write() with no further
    # sanitization (SECURITY_AUDIT.md M2) — every value derived from user
    # input must be escaped before interpolation.
    import html as _html_mod

    def _esc(value) -> str:
        if value is None or value == "":
            return ""
        return _html_mod.escape(str(value), quote=True)

    hosp_name = _esc((hospital.name if hospital else "") or "Hospital")
    hosp_address = _esc((hospital.address_line_1 if hospital else "") or "")
    hosp_city = _esc((hospital.city if hospital else "") or "")
    hosp_phone = _esc((hospital.phone if hospital else "") or "")
    hosp_email = _esc((hospital.email if hospital else "") or "")

    def _logo_data_uri(logo_url: str) -> str:
        if not logo_url:
            return ""
        if logo_url.startswith("http://") or logo_url.startswith("https://"):
            return logo_url
        import os as _os, base64 as _b64, mimetypes as _mt
        backend_root = _os.path.dirname(_os.path.dirname(_os.path.dirname(__file__)))
        fpath = _os.path.join(backend_root, logo_url.lstrip("/").replace("/", _os.sep))
        if not _os.path.exists(fpath):
            return ""
        mime = _mt.guess_type(fpath)[0] or "image/png"
        try:
            with open(fpath, "rb") as fh:
                data = _b64.b64encode(fh.read()).decode("ascii")
            return f"data:{mime};base64,{data}"
        except Exception:
            return ""
    logo_uri = _logo_data_uri(hospital.logo_url if hospital else "")

    doctor_name = _esc((doctor.user.full_name if doctor and doctor.user else "") or "—")
    doctor_spec = _esc((doctor.specialization if doctor else "") or "")
    doctor_reg = _esc((doctor.registration_number if doctor else "") or "")
    doctor_qual = _esc((doctor.qualification if doctor else "") or "")
    doctor_display = f"Dr. {doctor_name}" + (f", {doctor_qual}" if doctor_qual else "")

    def _compute_age(p):
        if not p:
            return "—"
        if getattr(p, "age_years", None):
            return f"{p.age_years} yrs"
        dob = getattr(p, "date_of_birth", None)
        if dob:
            today = date.today()
            yrs = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if yrs >= 0:
                return f"{yrs} yrs"
        return "—"
    patient_age = _compute_age(patient)

    addr_line = ", ".join(p for p in (hosp_address, hosp_city) if p)
    contact_bits = []
    if hosp_phone:
        contact_bits.append(f"Phone: {hosp_phone}")
    if hosp_email:
        contact_bits.append(f"Email: {hosp_email}")
    contact_line = " | ".join(contact_bits)

    def fmt_date(d):
        if not d:
            return "—"
        if hasattr(d, "strftime"):
            return d.strftime("%B %d, %Y")
        return str(d)

    def fmt_power(v):
        if v is None:
            return "—"
        return f"{float(v):+.2f}"

    def fmt_axis(v):
        return f"{int(v)}°" if v is not None else "—"

    def fmt_va(v):
        return _esc(v) if v else "—"

    pd_bits = []
    if rx.pd_distance is not None:
        pd_bits.append(f"Distance: {rx.pd_distance} mm")
    if rx.pd_near is not None:
        pd_bits.append(f"Near: {rx.pd_near} mm")
    if rx.pd_right is not None:
        pd_bits.append(f"Right: {rx.pd_right} mm")
    if rx.pd_left is not None:
        pd_bits.append(f"Left: {rx.pd_left} mm")
    pd_line = " | ".join(pd_bits)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light only">
<title>Eye Prescription - {rx.prescription_number}</title>
<style>
:root {{ color-scheme: light only; }}
html {{ background:#ffffff; }}
body {{ font-family: 'Noto Sans', Arial, sans-serif; margin:0; padding:28px; color:#1e293b; background:#ffffff; position:relative; }}
.watermark {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:55%; max-width:420px; opacity:0.06; z-index:0; pointer-events:none; }}
.content {{ position:relative; z-index:1; }}
.header {{ text-align:center; margin-bottom:18px; padding-bottom:14px; border-bottom:3px solid #137fec; }}
.header-logo {{ height:60px; max-width:220px; object-fit:contain; margin-bottom:6px; }}
.header h1 {{ margin:0; color:#137fec; font-size:24px; }}
.header p {{ margin:4px 0; color:#64748b; font-size:13px; }}
.rx-info {{ display:flex; justify-content:space-between; margin-bottom:14px; }}
.rx-info div {{ font-size:13px; }}
.patient-box {{ background:#f1f5f9; padding:14px 16px; border-radius:8px; margin-bottom:14px; }}
.patient-box p {{ margin:4px 0; font-size:13px; }}
table {{ width:100%; border-collapse:collapse; margin-bottom:14px; }}
th {{ background:#f1f5f9; padding:10px 8px; text-align:center; font-size:13px; font-weight:600; border-bottom:2px solid #e2e8f0; }}
td {{ font-size:13px; padding:8px; text-align:center; border-bottom:1px solid #e2e8f0; }}
td:first-child, th:first-child {{ text-align:left; }}
.pd-box {{ background:#eff6ff; padding:14px 16px; border-radius:8px; margin-bottom:14px; font-size:13px; }}
.notes {{ background:#f0fdf4; padding:14px 16px; border-radius:8px; margin-bottom:14px; }}
.footer {{ margin-top:24px; display:flex; justify-content:flex-end; page-break-inside:avoid; }}
.signature {{ text-align:right; }}
.signature p {{ margin:4px 0; font-size:13px; }}
.generated-note {{ text-align:center; margin-top:24px; font-size:11px; color:#94a3b8; }}
@page {{ size: A4; margin: 12mm; }}
@media print {{
  html, body {{ margin:0; padding:0; height:auto; background:#ffffff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  .footer {{ margin-top:20px; }}
  table, tr, td, th {{ page-break-inside:avoid; }}
  .patient-box, .pd-box, .notes {{ page-break-inside:avoid; }}
}}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap">
</head>
<body>
{f'<img class="watermark" src="{logo_uri}" alt="" />' if logo_uri else ''}
<div class="content">
<div class="header">
    {f'<img class="header-logo" src="{logo_uri}" alt="{hosp_name}" />' if logo_uri else ''}
    <h1>{hosp_name}</h1>
    {f'<p>{addr_line}</p>' if addr_line else ''}
    {f'<p style="white-space:nowrap;">{contact_line}</p>' if contact_line else ''}
</div>

<div class="rx-info">
    <div>
        <strong>Rx No:</strong> {rx.prescription_number}<br/>
        <strong>Date:</strong> {fmt_date(rx.created_at)}
    </div>
    <div style="text-align:right;">
        <strong>Status:</strong> {'FINALIZED' if rx.is_finalized else 'DRAFT'}
    </div>
</div>

<div class="patient-box">
    <p><strong>Patient:</strong> {_esc(patient.full_name) if patient else '—'}</p>
    <p><strong>PRN:</strong> {_esc(patient.patient_reference_number) if patient else '—'} |
       <strong>Age:</strong> {patient_age} |
       <strong>Gender:</strong> {_esc(patient.gender) if patient else '—'}</p>
</div>

<table>
<thead>
<tr>
    <th style="width:14%;">Eye</th>
    <th style="width:17%;">SPH</th>
    <th style="width:17%;">CYL</th>
    <th style="width:17%;">Axis</th>
    <th style="width:17%;">Add</th>
    <th style="width:18%;">Visual Acuity</th>
</tr>
</thead>
<tbody>
<tr>
    <td><strong>Right (OD)</strong></td>
    <td>{fmt_power(rx.right_sph)}</td>
    <td>{fmt_power(rx.right_cyl)}</td>
    <td>{fmt_axis(rx.right_axis)}</td>
    <td>{fmt_power(rx.right_add)}</td>
    <td>{fmt_va(rx.right_va)}</td>
</tr>
<tr>
    <td><strong>Left (OS)</strong></td>
    <td>{fmt_power(rx.left_sph)}</td>
    <td>{fmt_power(rx.left_cyl)}</td>
    <td>{fmt_axis(rx.left_axis)}</td>
    <td>{fmt_power(rx.left_add)}</td>
    <td>{fmt_va(rx.left_va)}</td>
</tr>
</tbody>
</table>

{f'<div class="pd-box"><strong>Pupillary Distance (PD):</strong> {pd_line}</div>' if pd_line else ''}
{f'<div class="notes"><strong>Notes:</strong> {_esc(rx.notes)}</div>' if rx.notes else ''}

<div class="footer">
    <div class="signature">
        <p style="margin-bottom:28px;"><strong>Prescribing Doctor</strong></p>
        <p><strong>{doctor_display}</strong></p>
        {f'<p style="color:#64748b;">{doctor_spec}</p>' if doctor_spec else ''}
        {f'<p style="color:#64748b;">Reg. No: {doctor_reg}</p>' if doctor_reg else ''}
    </div>
</div>

<div class="generated-note">This is a computer-generated document.</div>
</div>
</body>
</html>"""

    return HTMLResponse(content=html)


# ──────────────────────────────────────────────────
# Sales sub-router
# ──────────────────────────────────────────────────
sales_router = APIRouter(prefix="/sales", tags=["Optical – Sales"])


@sales_router.get("", response_model=OpticalSaleListResponse)
async def list_optical_sales(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sale_status: Optional[str] = Query(None, description="Filter by sale status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = svc.list_sales(db, current_user.hospital_id, page, limit, search, date_from, date_to, sale_status)
    result["data"] = [OpticalSaleResponse.model_validate(s) for s in result["data"]]
    return result


@sales_router.get("/{sale_id}", response_model=OpticalSaleResponse)
async def get_optical_sale(
    sale_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sale = svc.get_sale(db, sale_id)
    if not sale or str(sale.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Sale not found")
    resp = OpticalSaleResponse.model_validate(sale)
    items = svc.get_sale_items(db, sale.id)
    resp.items = [OpticalSaleItemResponse.model_validate(i) for i in items]
    return resp


@sales_router.post("", response_model=OpticalSaleResponse, status_code=status.HTTP_201_CREATED)
async def create_optical_sale(
    data: OpticalSaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        sale = svc.create_sale(db, current_user.hospital_id, data.model_dump(), current_user.id)
        resp = OpticalSaleResponse.model_validate(sale)
        items = svc.get_sale_items(db, sale.id)
        resp.items = [OpticalSaleItemResponse.model_validate(i) for i in items]
        return resp
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating optical sale: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create sale")


# ──────────────────────────────────────────────────
# Dispensing Queue — same Waiting/Being Served/Ready/Collected board as Pharmacy
# ──────────────────────────────────────────────────
@router.get("/queue", response_model=list[OpticalQueueEntryResponse])
async def get_optical_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return svc.list_optical_queue(db, current_user.hospital_id)


@router.put("/queue/{sale_id}/status", response_model=OpticalQueueEntryResponse)
async def update_optical_queue_status_route(
    sale_id: str,
    data: OpticalQueueStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sale = svc.get_sale(db, sale_id)
    if not sale or str(sale.hospital_id) != str(current_user.hospital_id):
        raise HTTPException(status_code=404, detail="Sale not found")
    try:
        sale = svc.update_optical_queue_status(db, sale_id, data.queue_status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "id": str(sale.id),
        "invoice_number": sale.invoice_number,
        "patient_name": sale.patient.full_name if getattr(sale, "patient", None) else None,
        "queue_token": sale.queue_token,
        "queue_status": sale.queue_status,
        "total_amount": sale.total_amount,
        "payment_status": sale.payment_status,
        "created_at": sale.created_at,
        "queue_called_at": sale.queue_called_at,
    }


# ──────────────────────────────────────────────────
# Stock Adjustments
# ──────────────────────────────────────────────────
@router.get("/stock-adjustments", response_model=list[OpticalStockAdjustmentResponse])
async def list_optical_stock_adjustments(
    product_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    adjs = svc.list_stock_adjustments(db, current_user.hospital_id, product_id)
    return [OpticalStockAdjustmentResponse.model_validate(a) for a in adjs]


@router.post("/stock-adjustments", response_model=OpticalStockAdjustmentResponse, status_code=status.HTTP_201_CREATED)
async def create_optical_stock_adjustment(
    data: OpticalStockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        adj = svc.create_stock_adjustment(db, current_user.hospital_id, data.model_dump(), current_user.id)
        return OpticalStockAdjustmentResponse.model_validate(adj)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating optical stock adjustment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create stock adjustment")


# ──────────────────────────────────────────────────
# Include sub-routers
# ──────────────────────────────────────────────────
router.include_router(sales_router)
