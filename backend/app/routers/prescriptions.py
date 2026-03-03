"""
Prescriptions router — CRUD for prescriptions, items, templates, medicines.
Follows the same patterns as appointments.py router.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from ..database import get_db
from ..models.user import User
from ..models.appointment import Doctor
from ..dependencies import get_current_active_user
from ..schemas.prescription import (
    PrescriptionCreate,
    PrescriptionUpdate,
    PrescriptionResponse,
    PrescriptionListItem,
    PaginatedPrescriptionResponse,
    PrescriptionVersionResponse,
    MedicineCreate,
    MedicineUpdate,
    MedicineResponse,
    PaginatedMedicineResponse,
    PrescriptionTemplateCreate,
    PrescriptionTemplateUpdate,
    PrescriptionTemplateResponse,
)
from ..services.prescription_service import (
    create_prescription,
    get_prescription,
    list_prescriptions,
    update_prescription,
    finalize_prescription,
    delete_prescription,
    enrich_prescription,
    enrich_prescriptions,
    get_prescription_versions,
    create_medicine,
    list_medicines,
    update_medicine,
    create_template,
    list_templates,
    update_template,
    delete_template,
    increment_template_usage,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/prescriptions", tags=["Prescriptions"])


# ══════════════════════════════════════════════════════════════════════════
# Prescription Endpoints
# ══════════════════════════════════════════════════════════════════════════

@router.post("", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_new_prescription(
    data: PrescriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new prescription."""
    try:
        rx = create_prescription(db, data.model_dump(), current_user.id, current_user.hospital_id)
        return enrich_prescription(db, rx)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error creating prescription: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create prescription")


@router.get("", response_model=PaginatedPrescriptionResponse)
async def list_all_prescriptions(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    doctor_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List prescriptions with filtering and pagination."""
    total, pg, lim, tp, rows = list_prescriptions(
        db, page, limit,
        hospital_id=current_user.hospital_id,
        doctor_id=doctor_id, patient_id=patient_id,
        status=status_filter, date_from=date_from, date_to=date_to,
        search=search,
    )
    enriched = enrich_prescriptions(db, rows)
    return PaginatedPrescriptionResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[PrescriptionListItem(**rx) for rx in enriched],
    )


@router.get("/my-prescriptions", response_model=PaginatedPrescriptionResponse)
async def my_prescriptions(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Doctor: prescriptions created by me."""
    doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
    if not doctor:
        return PaginatedPrescriptionResponse(
            total=0, page=page, limit=limit, total_pages=0, data=[],
        )
    total, pg, lim, tp, rows = list_prescriptions(
        db, page, limit, hospital_id=current_user.hospital_id,
        doctor_id=str(doctor.id), status=status_filter,
    )
    enriched = enrich_prescriptions(db, rows)
    return PaginatedPrescriptionResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[PrescriptionListItem(**rx) for rx in enriched],
    )


@router.get("/patient/{patient_id}", response_model=PaginatedPrescriptionResponse)
async def patient_prescriptions(
    patient_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all prescriptions for a patient."""
    total, pg, lim, tp, rows = list_prescriptions(
        db, page, limit, hospital_id=current_user.hospital_id,
        patient_id=patient_id,
    )
    enriched = enrich_prescriptions(db, rows)
    return PaginatedPrescriptionResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[PrescriptionListItem(**rx) for rx in enriched],
    )


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription_detail(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get full prescription detail including items."""
    rx = get_prescription(db, prescription_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return enrich_prescription(db, rx)


@router.put("/{prescription_id}", response_model=PrescriptionResponse)
async def update_rx(
    prescription_id: str,
    data: PrescriptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update prescription (only drafts)."""
    try:
        rx = update_prescription(
            db, prescription_id,
            data.model_dump(exclude_unset=True),
            current_user.id,
        )
        if not rx:
            raise HTTPException(status_code=404, detail="Prescription not found")
        return enrich_prescription(db, rx)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/{prescription_id}/finalize", response_model=PrescriptionResponse)
async def finalize_rx(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Finalize a prescription (lock it for dispensing)."""
    try:
        rx = finalize_prescription(db, prescription_id, current_user.id)
        if not rx:
            raise HTTPException(status_code=404, detail="Prescription not found")
        return enrich_prescription(db, rx)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.delete("/{prescription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rx(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Soft-delete a prescription (only drafts)."""
    try:
        rx = delete_prescription(db, prescription_id, current_user.id)
        if not rx:
            raise HTTPException(status_code=404, detail="Prescription not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.get("/{prescription_id}/versions", response_model=list[PrescriptionVersionResponse])
async def get_rx_versions(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get version history for a prescription."""
    versions = get_prescription_versions(db, prescription_id)
    return versions


@router.get("/{prescription_id}/pdf")
async def get_prescription_pdf(
    prescription_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate prescription as printable HTML."""
    from ..config import settings as app_settings
    from ..models.patient import Patient

    rx = get_prescription(db, prescription_id)
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")

    enriched = enrich_prescription(db, rx)
    patient = db.query(Patient).filter(Patient.id == rx.patient_id).first()

    doctor = db.query(Doctor).filter(Doctor.id == rx.doctor_id).first()
    doctor_name = doctor.user.full_name if doctor and doctor.user else "—"
    doctor_spec = doctor.specialization if doctor else ""
    doctor_reg = doctor.registration_number if doctor else ""

    def fmt_date(d):
        if not d:
            return "—"
        if hasattr(d, "strftime"):
            return d.strftime("%B %d, %Y")
        return str(d)

    items_html = ""
    for idx, item in enumerate(enriched.get("items", []), 1):
        items_html += f"""
        <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{idx}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
                <strong>{item['medicine_name']}</strong>
                {f'<br/><span style="color:#64748b;font-size:12px;">{item.get("generic_name","")}</span>' if item.get('generic_name') else ''}
            </td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{item['dosage']}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">{item['frequency']}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">
                {f"{item['duration_value']} {item.get('duration_unit','')}" if item.get('duration_value') else '—'}
            </td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">{item.get('instructions','') or '—'}</td>
        </tr>"""

    from fastapi.responses import HTMLResponse
    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Prescription - {rx.prescription_number}</title>
<style>
body {{ font-family: Arial, sans-serif; margin:0; padding:40px; color:#1e293b; }}
.header {{ text-align:center; margin-bottom:30px; padding-bottom:20px; border-bottom:3px solid #137fec; }}
.header h1 {{ margin:0; color:#137fec; font-size:24px; }}
.header p {{ margin:4px 0; color:#64748b; font-size:13px; }}
.rx-info {{ display:flex; justify-content:space-between; margin-bottom:20px; }}
.rx-info div {{ font-size:13px; }}
.patient-box {{ background:#f1f5f9; padding:16px; border-radius:8px; margin-bottom:20px; }}
.patient-box p {{ margin:4px 0; font-size:13px; }}
table {{ width:100%; border-collapse:collapse; margin-bottom:20px; }}
th {{ background:#f1f5f9; padding:10px 8px; text-align:left; font-size:13px; font-weight:600; border-bottom:2px solid #e2e8f0; }}
td {{ font-size:13px; }}
.diagnosis {{ background:#eff6ff; padding:16px; border-radius:8px; margin-bottom:20px; }}
.advice {{ background:#f0fdf4; padding:16px; border-radius:8px; margin-bottom:20px; }}
.footer {{ margin-top:60px; display:flex; justify-content:space-between; }}
.signature {{ text-align:right; }}
.signature p {{ margin:4px 0; font-size:13px; }}
@media print {{ body {{ padding:20px; }} }}
</style>
</head>
<body>
<div class="header">
    <h1>{app_settings.HOSPITAL_NAME}</h1>
    <p>{app_settings.HOSPITAL_ADDRESS}, {app_settings.HOSPITAL_CITY}</p>
    <p>Phone: {app_settings.HOSPITAL_PHONE} | Email: {app_settings.HOSPITAL_EMAIL}</p>
</div>

<div class="rx-info">
    <div>
        <strong>PRN:</strong> {patient.patient_reference_number if patient else '—'}<br/>
        <strong>Date:</strong> {fmt_date(rx.created_at)}
    </div>
    <div style="text-align:right;">
        <strong>Status:</strong> {rx.status.upper()}<br/>
        <strong>Valid Until:</strong> {fmt_date(rx.valid_until) if rx.valid_until else '—'}
    </div>
</div>

<div class="patient-box">
    <p><strong>Patient:</strong> {patient.full_name if patient else '—'}</p>
    <p><strong>PRN:</strong> {patient.patient_reference_number if patient else '—'} |
       <strong>Age:</strong> {patient.age_years if patient and patient.age_years else '—'} |
       <strong>Gender:</strong> {patient.gender if patient else '—'} |
       <strong>Blood Group:</strong> {patient.blood_group if patient and patient.blood_group else '—'}</p>
    {f'<p><strong>Allergies:</strong> <span style="color:#dc2626;">{patient.known_allergies}</span></p>' if patient and patient.known_allergies else ''}
</div>

{f'<div class="diagnosis"><strong>Diagnosis:</strong> {rx.diagnosis}</div>' if rx.diagnosis else ''}
{f'<div class="diagnosis"><strong>Clinical Notes:</strong> {rx.clinical_notes}</div>' if rx.clinical_notes else ''}

<table>
<thead>
<tr>
    <th style="width:5%;">#</th>
    <th style="width:25%;">Medicine</th>
    <th style="width:12%;text-align:center;">Dosage</th>
    <th style="width:12%;text-align:center;">Frequency</th>
    <th style="width:15%;text-align:center;">Duration</th>
    <th style="width:25%;">Instructions</th>
</tr>
</thead>
<tbody>{items_html}</tbody>
</table>

{f'<div class="advice"><strong>Advice:</strong> {rx.advice}</div>' if rx.advice else ''}

<div class="footer">
    <div>
        <p style="font-size:11px;color:#94a3b8;">This is a computer-generated prescription.</p>
    </div>
    <div class="signature">
        <p style="margin-bottom:40px;"><strong>Prescribing Doctor</strong></p>
        <p><strong>Dr. {doctor_name}</strong></p>
        <p style="color:#64748b;">{doctor_spec}</p>
        <p style="color:#64748b;">Reg# {doctor_reg}</p>
    </div>
</div>
</body>
</html>"""

    return HTMLResponse(content=html)


# ══════════════════════════════════════════════════════════════════════════
# Medicine Endpoints
# ══════════════════════════════════════════════════════════════════════════

medicines_router = APIRouter(prefix="/medicines", tags=["Medicines"])


@medicines_router.post("", response_model=MedicineResponse, status_code=status.HTTP_201_CREATED)
async def create_new_medicine(
    data: MedicineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Add a new medicine to the formulary."""
    try:
        med = create_medicine(db, data.model_dump(), current_user.hospital_id)
        return med
    except Exception as e:
        logger.error(f"Error creating medicine: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create medicine")


@medicines_router.get("", response_model=PaginatedMedicineResponse)
async def list_all_medicines(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List medicines with search and filtering."""
    total, pg, lim, tp, rows = list_medicines(
        db, page, limit,
        hospital_id=current_user.hospital_id,
        search=search, category=category,
    )
    return PaginatedMedicineResponse(
        total=total, page=pg, limit=lim, total_pages=tp,
        data=[MedicineResponse.model_validate(m) for m in rows],
    )


@medicines_router.put("/{medicine_id}", response_model=MedicineResponse)
async def update_med(
    medicine_id: str,
    data: MedicineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a medicine."""
    med = update_medicine(db, medicine_id, data.model_dump(exclude_unset=True))
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return med


# ══════════════════════════════════════════════════════════════════════════
# Template Endpoints
# ══════════════════════════════════════════════════════════════════════════

templates_router = APIRouter(prefix="/prescription-templates", tags=["Prescription Templates"])


@templates_router.post("", response_model=PrescriptionTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_new_template(
    data: PrescriptionTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a reusable prescription template."""
    doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
    if not doctor:
        raise HTTPException(status_code=403, detail="Only doctors can create templates")
    try:
        tmpl = create_template(db, data.model_dump(), doctor.id)
        return tmpl
    except Exception as e:
        logger.error(f"Error creating template: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create template")


@templates_router.get("", response_model=list[PrescriptionTemplateResponse])
async def list_my_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List prescription templates for the current doctor."""
    doctor = db.query(Doctor).filter(Doctor.user_id == current_user.id).first()
    if not doctor:
        return []
    return list_templates(db, doctor.id)


@templates_router.put("/{template_id}", response_model=PrescriptionTemplateResponse)
async def update_tmpl(
    template_id: str,
    data: PrescriptionTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a template."""
    tmpl = update_template(db, template_id, data.model_dump(exclude_unset=True))
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@templates_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tmpl(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a template."""
    if not delete_template(db, template_id):
        raise HTTPException(status_code=404, detail="Template not found")


@templates_router.post("/{template_id}/use", status_code=status.HTTP_200_OK)
async def use_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Increment usage counter when template is used."""
    increment_template_usage(db, template_id)
    return {"message": "Template usage recorded"}
