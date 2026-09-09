"""
One-time backfill: give every existing doctor who has ZERO schedule rows a
default 7-day-a-week schedule, using schedule_service.create_default_weekly_schedule.

Bug fix: "Doctor availability should automatically apply to all days by
default. Staff should only need to update/mark specific leave days, instead
of configuring availability for every day manually." Going forward this is
handled automatically at doctor-creation time (see
services/user_service.py::create_user and services/doctor_service.py::create_doctor),
but doctors created BEFORE that fix still have no DoctorSchedule rows at all —
this script closes that gap for existing data.

Run once per environment, any time after the code fix has been deployed:

    cd backend
    venv/Scripts/python.exe scripts/backfill_default_doctor_schedules.py

Safe to re-run — create_default_weekly_schedule no-ops for any doctor that
already has at least one schedule row (whether from this script, a prior run,
or staff having manually configured one already), so it never overwrites or
duplicates existing availability.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app.main  # noqa: ensures the full SQLAlchemy mapper registry is loaded
from app.database import SessionLocal
from app.models.appointment import Doctor, DoctorSchedule
from app.services.schedule_service import create_default_weekly_schedule


def main() -> None:
    db = SessionLocal()
    try:
        doctors_with_schedule = {
            row[0] for row in db.query(DoctorSchedule.doctor_id).distinct().all()
        }
        all_doctors = db.query(Doctor).all()
        to_backfill = [d for d in all_doctors if d.id not in doctors_with_schedule]

        for doctor in to_backfill:
            create_default_weekly_schedule(db, doctor)

        print(f"Backfilled default weekly schedules for {len(to_backfill)} doctor(s) "
              f"(out of {len(all_doctors)} total doctors — the rest already had a schedule).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
