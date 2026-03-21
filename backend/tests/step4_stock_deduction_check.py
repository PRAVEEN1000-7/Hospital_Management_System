"""Focused Step 4 regression checks for stock deduction on invoice issue."""

from __future__ import annotations

import os
import sys

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
        raise RuntimeError("No patient found")
    return data[0]["id"]


def _find_batch_for_deduction() -> tuple[str, str, int]:
    db = SessionLocal()
    try:
        batch = (
            db.query(MedicineBatch)
            .filter(
                MedicineBatch.is_active == True,
                MedicineBatch.is_expired == False,
                MedicineBatch.quantity >= 2,
            )
            .order_by(MedicineBatch.quantity.desc())
            .first()
        )
        if not batch:
            raise RuntimeError("No suitable medicine batch found for deduction check")
        return str(batch.medicine_id), batch.batch_number, int(batch.quantity)
    finally:
        db.close()


def _get_batch_quantity(medicine_id: str, batch_number: str) -> int:
    db = SessionLocal()
    try:
        batch = db.query(MedicineBatch).filter(
            MedicineBatch.medicine_id == medicine_id,
            MedicineBatch.batch_number == batch_number,
        ).first()
        if not batch:
            raise RuntimeError("Batch disappeared during test")
        return int(batch.quantity or 0)
    finally:
        db.close()


def main() -> int:
    client = TestClient(app)
    token = _login(client)
    headers = {"Authorization": f"Bearer {token}"}

    patient_id = _find_patient_id(client, headers)
    medicine_id, batch_number, before_qty = _find_batch_for_deduction()

    # Create a draft invoice with one medicine line bound to an explicit batch.
    create_resp = client.post(
        "/api/v1/invoices",
        headers=headers,
        json={
            "patient_id": patient_id,
            "invoice_type": "pharmacy",
            "items": [
                {
                    "item_type": "medicine",
                    "reference_id": medicine_id,
                    "description": "step4-deduction",
                    "quantity": "1",
                    "unit_price": "1",
                    "batch_number": batch_number,
                }
            ],
            "notes": "step4-deduction-check",
        },
    )
    if create_resp.status_code != 201:
        print("FAIL: invoice creation failed", create_resp.status_code, create_resp.text)
        return 1

    invoice_id = create_resp.json()["id"]

    issue_resp = client.patch(f"/api/v1/invoices/{invoice_id}/issue", headers=headers)
    if issue_resp.status_code != 200:
        print("FAIL: invoice issue failed", issue_resp.status_code, issue_resp.text)
        return 1

    after_issue_qty = _get_batch_quantity(medicine_id, batch_number)
    if after_issue_qty != before_qty - 1:
        print(
            "FAIL: batch quantity did not decrement as expected",
            {"before": before_qty, "after": after_issue_qty},
        )
        return 1

    # Re-issue should fail and should not decrement stock again.
    second_issue = client.patch(f"/api/v1/invoices/{invoice_id}/issue", headers=headers)
    if second_issue.status_code != 400:
        print("FAIL: re-issue should be blocked", second_issue.status_code, second_issue.text)
        return 1

    after_second_issue_qty = _get_batch_quantity(medicine_id, batch_number)
    if after_second_issue_qty != after_issue_qty:
        print("FAIL: stock changed on re-issue attempt")
        return 1

    print("PASS: Step 4 stock deduction checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
