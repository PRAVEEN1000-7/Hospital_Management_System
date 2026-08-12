"""
One-time backfill for appointments.follow_up_label (MC1/MC2/.../MCR).

The column is new (see database_hole/2026-08-12_appointment_followup_label.sql)
and only gets populated going forward, by appointment_service.create_appointment,
for appointments created AFTER that migration ran. Every appointment created
before it has follow_up_label = NULL, which would make the dashboard's
New/Returning/Upcoming chart show an empty MC1/MC2+/MCR breakdown for any
past period — not because nothing happened, just because nothing was labeled
yet. This script applies the same chain rule
(appointment_service.compute_follow_up_label) retroactively to existing data.

Run once per environment, any time after the migration has been applied:

    cd backend
    venv/Scripts/python.exe scripts/backfill_follow_up_labels.py

Safe to re-run — it always recomputes the whole chain from scratch per
patient, so a partial prior run or new appointments added since don't cause
drift.
"""
import sys
import os
import re
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app.main  # noqa: ensures the full SQLAlchemy mapper registry is loaded
from app.database import SessionLocal
from app.models.appointment import Appointment

_CHAIN_BROKEN_STATUSES = ("cancelled", "rescheduled")
_WINDOW_DAYS = 30


def _next_label(prev_label: str | None, gap_days: int) -> str:
    if gap_days > _WINDOW_DAYS:
        return "MCR"
    if not prev_label or prev_label == "MCR":
        return "MC1"
    match = re.match(r"^MC(\d+)$", prev_label)
    if not match:
        return "MC1"
    return f"MC{int(match.group(1)) + 1}"


def main() -> None:
    db = SessionLocal()
    try:
        rows = (
            db.query(Appointment)
            .filter(
                Appointment.status.notin_(_CHAIN_BROKEN_STATUSES),
                Appointment.is_deleted == False,  # noqa: E712
            )
            .order_by(Appointment.patient_id, Appointment.appointment_date, Appointment.created_at)
            .all()
        )

        by_patient: dict = defaultdict(list)
        for appt in rows:
            by_patient[appt.patient_id].append(appt)

        updated = 0
        for patient_id, appts in by_patient.items():
            prev_date = None
            prev_label = None
            for appt in appts:
                if prev_date is None:
                    label = None
                else:
                    gap_days = (appt.appointment_date - prev_date).days
                    label = _next_label(prev_label, gap_days)
                if appt.follow_up_label != label:
                    appt.follow_up_label = label
                    updated += 1
                prev_date, prev_label = appt.appointment_date, label

        db.commit()
        print(f"Backfilled {updated} appointment(s) across {len(by_patient)} patient(s) "
              f"(out of {len(rows)} kept appointments examined).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
