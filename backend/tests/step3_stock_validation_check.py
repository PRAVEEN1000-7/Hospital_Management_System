"""Focused Step 3 regression checks for medicine stock validation.

This script intentionally runs against local dev data and exits non-zero on failure.
"""

from __future__ import annotations

import os
import sys
import uuid
from decimal import Decimal

from fastapi.testclient import TestClient


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app.database import SessionLocal
from app.main import app
from app.models.pharmacy import MedicineBatch


def _login(client: TestClient) -> str:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "superadmin", "password": "superadmin@123"},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Login failed: {resp.status_code} {resp.text}")
    return resp.json()["access_token"]


def _find_patient_id(client: TestClient, headers: dict[str, str]) -> str:
    resp = client.get(
        "/api/v1/patients?page=1&limit=1&sort_by=created_at&sort_order=desc",
        headers=headers,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Patient lookup failed: {resp.status_code} {resp.text}")
    data = resp.json().get("data") or []
    if not data:
        raise RuntimeError("No patient found for Step 3 test")
    return data[0]["id"]


def _find_stocked_medicine() -> tuple[str, str, int]:
    db = SessionLocal()
    try:
        batch = (
            db.query(MedicineBatch)
            .filter(
                MedicineBatch.is_active == True,
                MedicineBatch.is_expired == False,
                MedicineBatch.quantity > 0,
            )
            .order_by(MedicineBatch.quantity.desc())
            .first()
        )
        if not batch:
            raise RuntimeError("No active medicine batch with positive stock found")

        return str(batch.medicine_id), batch.batch_number, int(batch.quantity)
    finally:
        db.close()


def _create_invoice(
    client: TestClient,
    headers: dict[str, str],
    patient_id: str,
    medicine_id: str,
    batch_number: str,
) -> str:
    resp = client.post(
        "/api/v1/invoices",
        headers=headers,
        json={
            "patient_id": patient_id,
            "invoice_type": "pharmacy",
            "items": [
                {
                    "item_type": "medicine",
                    "reference_id": medicine_id,
                    "description": "Step3 seed line",
                    "quantity": "1",
                    "unit_price": "1",
                    "batch_number": batch_number,
                }
            ],
            "notes": "step3-regression-check",
        },
    )
    if resp.status_code != 201:
        raise RuntimeError(f"Invoice create failed: {resp.status_code} {resp.text}")
    return resp.json()["id"]


def main() -> int:
    client = TestClient(app)
    token = _login(client)
    headers = {"Authorization": f"Bearer {token}"}

    patient_id = _find_patient_id(client, headers)
    medicine_id, batch_number, batch_qty = _find_stocked_medicine()

    invoice_id = _create_invoice(client, headers, patient_id, medicine_id, batch_number)

    # Case 1: Batch-specific oversell should fail.
    resp = client.post(
        f"/api/v1/invoices/{invoice_id}/items",
        headers=headers,
        json={
            "item_type": "medicine",
            "reference_id": medicine_id,
            "description": "batch-oversell",
            "quantity": str(batch_qty + 1),
            "unit_price": "1",
            "batch_number": batch_number,
        },
    )
    if resp.status_code != 400:
        print("FAIL: batch oversell did not return 400")
        print(resp.status_code, resp.text)
        return 1

    # Case 2: Missing batch should fail (strict batch tracking).
    resp = client.post(
        f"/api/v1/invoices/{invoice_id}/items",
        headers=headers,
        json={
            "item_type": "medicine",
            "reference_id": medicine_id,
            "description": "missing-batch",
            "quantity": "1",
            "unit_price": "1",
        },
    )
    if resp.status_code != 400:
        print("FAIL: missing batch did not return 400")
        print(resp.status_code, resp.text)
        return 1

    # Case 3: Cumulative oversell across two lines of same medicine+batch should fail.
    first_qty = max(1, batch_qty // 2)
    second_qty = batch_qty - first_qty + 1

    resp1 = client.post(
        f"/api/v1/invoices/{invoice_id}/items",
        headers=headers,
        json={
            "item_type": "medicine",
            "reference_id": medicine_id,
            "description": "split-line-1",
            "quantity": str(first_qty),
            "unit_price": "1",
            "batch_number": batch_number,
        },
    )
    if resp1.status_code != 201:
        print("FAIL: first split line should be accepted")
        print(resp1.status_code, resp1.text)
        return 1

    resp2 = client.post(
        f"/api/v1/invoices/{invoice_id}/items",
        headers=headers,
        json={
            "item_type": "medicine",
            "reference_id": medicine_id,
            "description": "split-line-2",
            "quantity": str(second_qty),
            "unit_price": "1",
            "batch_number": batch_number,
        },
    )
    if resp2.status_code != 400:
        print("FAIL: cumulative oversell should return 400")
        print(resp2.status_code, resp2.text)
        return 1

    print("PASS: Step 3 stock validation regression checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
