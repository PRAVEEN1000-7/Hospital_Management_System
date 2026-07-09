"""
Hospital-local "today" resolution.

`date.today()` reads the server process's own clock/timezone, not the
hospital's configured one. For day-boundary business logic (queue resets,
"today's appointments", waitlist date checks, etc.) that mismatch means the
day can flip at the wrong moment whenever the server isn't running in the
same timezone as the hospital. Use `hospital_today()` wherever "today" means
"today for this hospital's staff/patients", not just a uniqueness token.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def hospital_today(tz_name: str | None) -> date:
    """Current date in the given IANA timezone, defaulting to UTC."""
    try:
        tz = ZoneInfo(tz_name) if tz_name else ZoneInfo("UTC")
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    return datetime.now(tz).date()


def hospital_today_by_id(db, hospital_id) -> date:
    """Same as hospital_today(), but looks up the timezone by hospital_id."""
    from ..models.user import Hospital
    tz_name = db.query(Hospital.timezone).filter(Hospital.id == hospital_id).scalar()
    return hospital_today(tz_name)
