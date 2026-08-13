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

Safe to re-run — it always recomputes every patient's labels from scratch,
so a partial prior run or new appointments added since don't cause drift.

The free-follow-up window is anchored ONCE to each patient's very first
kept appointment (client-confirmed: "the 30 days free for the new patient
only... then have to pay for n number of times") — it does NOT reset on
each visit or each renewal. Matches
appointment_service.compute_follow_up_label exactly.
"""
import sys
import os
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app.main  # noqa: ensures the full SQLAlchemy mapper registry is loaded
from app.database import SessionLocal
from app.models.appointment import Appointment

_CHAIN_BROKEN_STATUSES = ("cancelled", "rescheduled")
_WINDOW_DAYS = 30


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
            first_visit_date = None
            for idx, appt in enumerate(appts):
                if first_visit_date is None:
                    label = None
                    first_visit_date = appt.appointment_date
                else:
                    gap_from_first = (appt.appointment_date - first_visit_date).days
                    label = "MCR" if gap_from_first > _WINDOW_DAYS else f"MC{idx}"
                if appt.follow_up_label != label:
                    appt.follow_up_label = label
                    updated += 1

        db.commit()
        print(f"Backfilled {updated} appointment(s) across {len(by_patient)} patient(s) "
              f"(out of {len(rows)} kept appointments examined).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
