"""
Hospital-local "today" resolution.

`date.today()` reads the server process's own clock/timezone, not the
hospital's configured one. For day-boundary business logic (queue resets,
"today's appointments", waitlist date checks, etc.) that mismatch means the
day can flip at the wrong moment whenever the server isn't running in the
same timezone as the hospital. Use `hospital_today()` wherever "today" means
"today for this hospital's staff/patients", not just a uniqueness token.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def _resolve_tz(tz_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name) if tz_name else ZoneInfo("UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def hospital_today(tz_name: str | None) -> date:
    """Current date in the given IANA timezone, defaulting to UTC."""
    return datetime.now(_resolve_tz(tz_name)).date()


def hospital_today_by_id(db, hospital_id) -> date:
    """Same as hospital_today(), but looks up the timezone by hospital_id."""
    from ..models.user import Hospital
    tz_name = db.query(Hospital.timezone).filter(Hospital.id == hospital_id).scalar()
    return hospital_today(tz_name)


def hospital_today_utc_range(tz_name: str | None) -> tuple[datetime, datetime]:
    """
    UTC-aware [start, end) instants spanning "today" in the given timezone.

    Use this instead of `func.date(some_timestamptz_column) == hospital_today(...)`
    when filtering a stored TIMESTAMPTZ column (e.g. created_at) by hospital-
    local day. `func.date()` runs at the database level and converts using
    the DB session's own timezone (usually UTC), not the hospital's — so for
    any hospital not in that exact timezone, there's a window every day
    (between the hospital's midnight and the DB session's midnight) where
    "today" per the DB and "today" per the hospital disagree. That mismatch
    is what broke daily-reset queue tokens: entries created just after local
    midnight didn't match `func.date(created_at) == today` yet, so the
    running MAX() couldn't see them and kept handing out the same number.
    Comparing the raw UTC instant against an explicit hospital-local day
    boundary sidesteps the DB session timezone entirely.
    """
    tz = _resolve_tz(tz_name)
    now_local = datetime.now(tz)
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def hospital_today_utc_range_by_id(db, hospital_id) -> tuple[datetime, datetime]:
    """Same as hospital_today_utc_range(), but looks up the timezone by hospital_id."""
    from ..models.user import Hospital
    tz_name = db.query(Hospital.timezone).filter(Hospital.id == hospital_id).scalar()
    return hospital_today_utc_range(tz_name)
