import calendar
import uuid
from datetime import date as date_cls, timedelta
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from ..models.attendance import Shift, ShiftAssignment
from ..models.user import User


def list_shifts(db: Session, hospital_id: uuid.UUID) -> list[Shift]:
    return db.query(Shift).filter(Shift.hospital_id == hospital_id).order_by(Shift.name).all()


def _record_shift_change(
    db: Session, hospital_id: uuid.UUID, user_id: uuid.UUID,
    new_shift_id: uuid.UUID | None, changed_by: uuid.UUID | None = None,
) -> None:
    """Close out the employee's open shift_assignments row (if any) and open
    a new one for new_shift_id, so past months keep showing whatever shift
    was actually effective then. No-ops if the shift isn't actually
    changing. Does not commit — caller's transaction owns that."""
    today = date_cls.today()
    open_row = (
        db.query(ShiftAssignment)
        .filter(ShiftAssignment.user_id == user_id, ShiftAssignment.effective_to.is_(None))
        .order_by(ShiftAssignment.effective_from.desc())
        .first()
    )
    if open_row and open_row.shift_id == new_shift_id:
        return
    if open_row:
        open_row.effective_to = today
    if new_shift_id is not None:
        db.add(ShiftAssignment(
            hospital_id=hospital_id, user_id=user_id, shift_id=new_shift_id,
            effective_from=today, created_by=changed_by,
        ))


def get_effective_shift_map(
    db: Session, hospital_id: uuid.UUID, as_of: date_cls,
) -> dict[uuid.UUID, tuple[uuid.UUID, str]]:
    """For every employee, the (shift_id, shift_name) that was effective as
    of `as_of` — used with the last day of a report month so the report
    reflects what was actually true then, immune to later reassignments."""
    rows = (
        db.query(ShiftAssignment)
        .options(joinedload(ShiftAssignment.shift))
        .filter(ShiftAssignment.hospital_id == hospital_id, ShiftAssignment.effective_from <= as_of)
        .order_by(ShiftAssignment.user_id, ShiftAssignment.effective_from.desc())
        .all()
    )
    result: dict[uuid.UUID, tuple[uuid.UUID, str]] = {}
    for row in rows:
        result.setdefault(row.user_id, (row.shift_id, row.shift.name if row.shift else None))
    return result


def get_daily_shift_map(
    db: Session, hospital_id: uuid.UUID, year: int, month: int,
) -> dict[uuid.UUID, dict[int, str]]:
    """For every employee, which shift NAME they were on for each individual
    day-of-month — the calendar can assign a different shift week to week
    within the same month, so unlike get_effective_shift_map (one point in
    time), the report needs a per-day answer to count "N days Day Shift, M
    days Night Shift" per employee.

    Rows are painted onto the day grid oldest-first, so a later assignment
    overwrites an earlier one on any day they both cover — same "most
    recent wins" rule as get_effective_shift_map, just applied day-by-day
    instead of at a single as_of point. An open-ended row (effective_to
    NULL) is treated as continuing through the rest of the month.
    """
    total_days = calendar.monthrange(year, month)[1]
    month_start = date_cls(year, month, 1)
    month_end = date_cls(year, month, total_days)

    rows = (
        db.query(ShiftAssignment)
        .options(joinedload(ShiftAssignment.shift))
        .filter(
            ShiftAssignment.hospital_id == hospital_id,
            ShiftAssignment.effective_from <= month_end,
            or_(ShiftAssignment.effective_to.is_(None), ShiftAssignment.effective_to >= month_start),
        )
        # Secondary sort by created_at: two rows can share the same
        # effective_from (e.g. a Quick Assign open-ended row and a Shift
        # Calendar single-day row both starting today) — the more recently
        # created one should win that tie, same "most recent wins" rule.
        .order_by(ShiftAssignment.effective_from.asc(), ShiftAssignment.created_at.asc())
        .all()
    )

    per_user: dict[uuid.UUID, list[ShiftAssignment]] = {}
    for row in rows:
        per_user.setdefault(row.user_id, []).append(row)

    result: dict[uuid.UUID, dict[int, str]] = {}
    for user_id, assignments in per_user.items():
        day_map: dict[int, str] = {}
        for a in assignments:
            start = max(a.effective_from, month_start)
            end = min(a.effective_to or month_end, month_end)
            d = start
            while d <= end:
                day_map[d.day] = a.shift.name if a.shift else None
                d += timedelta(days=1)
        result[user_id] = day_map
    return result


def assign_shift_for_dates(
    db: Session, hospital_id: uuid.UUID, user_ids: list[uuid.UUID], shift_id: uuid.UUID,
    dates: list[date_cls], changed_by: uuid.UUID | None = None,
) -> int:
    """Assign one shift to a list of employees for an explicit, possibly
    non-contiguous set of dates picked off a calendar (Shift Calendar tab —
    same click-to-select interaction as the Holiday Calendar). One
    shift_assignments row per (employee, date): deliberately not merged
    into a date range, so editing any single date later is just
    delete-and-replace of that date's own row — no interval-splitting logic
    needed for arbitrary, possibly scattered selections. Only touches
    users.shift_id (the "current shift" quick pointer used elsewhere) for
    employees whose selection includes today.

    Dates outside an employee's own employment window (before
    date_of_joining, after date_of_leaving) are silently skipped for that
    employee — same rule as assign_shift / the Attendance report's Not
    Applicable days, see User.is_employed_on."""
    today = date_cls.today()
    users_by_id = {
        u.id: u for u in
        db.query(User)
        .filter(User.id.in_(user_ids), User.hospital_id == hospital_id, User.is_active == True)
        .all()
    }
    count = 0
    for user_id in user_ids:
        user = users_by_id.get(user_id)
        if user is None:
            continue
        touches_today = False
        any_date_assigned = False
        for d in dates:
            if not user.is_employed_on(d):
                continue
            any_date_assigned = True
            existing = (
                db.query(ShiftAssignment)
                .filter(
                    ShiftAssignment.user_id == user_id,
                    ShiftAssignment.effective_from == d,
                    ShiftAssignment.effective_to == d,
                )
                .first()
            )
            if existing:
                existing.shift_id = shift_id
                existing.created_by = changed_by
            else:
                db.add(ShiftAssignment(
                    hospital_id=hospital_id, user_id=user_id, shift_id=shift_id,
                    effective_from=d, effective_to=d, created_by=changed_by,
                ))
            if d == today:
                touches_today = True
        if touches_today:
            db.query(User).filter(User.id == user_id).update({User.shift_id: shift_id})
        if any_date_assigned:
            count += 1
    db.commit()
    return count


def cancel_shifts_after_leaving(db: Session, user_id: uuid.UUID, leaving_date: date_cls) -> None:
    """Called when an employee's date_of_leaving is set/changed (offboarding)
    — truncates or drops any shift_assignments row that would otherwise
    schedule them past their last day, so Shift Management stops showing
    shifts for a date the employee is no longer employed on. Does not
    commit — caller's transaction owns that."""
    rows = db.query(ShiftAssignment).filter(ShiftAssignment.user_id == user_id).all()
    for row in rows:
        if row.effective_from > leaving_date:
            db.delete(row)
        elif row.effective_to is None or row.effective_to > leaving_date:
            row.effective_to = leaving_date
    today = date_cls.today()
    if leaving_date < today:
        db.query(User).filter(User.id == user_id).update({User.shift_id: None})


def create_shift(db: Session, hospital_id: uuid.UUID, name: str, start_time, end_time) -> Shift:
    shift = Shift(hospital_id=hospital_id, name=name, start_time=start_time, end_time=end_time)
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


def update_shift(db: Session, hospital_id: uuid.UUID, shift_id: uuid.UUID, **kwargs) -> Shift | None:
    shift = db.query(Shift).filter(Shift.id == shift_id, Shift.hospital_id == hospital_id).first()
    if not shift:
        return None
    for key, value in kwargs.items():
        if value is not None:
            setattr(shift, key, value)
    db.commit()
    db.refresh(shift)
    return shift


def delete_shift(db: Session, hospital_id: uuid.UUID, shift_id: uuid.UUID) -> bool:
    shift = db.query(Shift).filter(Shift.id == shift_id, Shift.hospital_id == hospital_id).first()
    if not shift:
        return False
    # Unassign anyone currently on this shift before deleting it — and close
    # out their open history row so shift_assignments agrees with users.
    affected = db.query(User).filter(User.shift_id == shift_id).all()
    for user in affected:
        _record_shift_change(db, hospital_id, user.id, None)
    db.query(User).filter(User.shift_id == shift_id).update({User.shift_id: None})
    db.delete(shift)
    db.commit()
    return True


def assign_shift(
    db: Session, hospital_id: uuid.UUID, user_ids: list[uuid.UUID], shift_id: uuid.UUID,
    changed_by: uuid.UUID | None = None,
) -> int:
    """Bulk-assign one shift to a list of employees, effective today. Returns
    count updated. Employees outside their employment window today (not yet
    joined, or already relieved) are silently skipped — same rule as the
    Attendance report's Not Applicable days, see User.is_employed_on."""
    today = date_cls.today()
    users = (
        db.query(User)
        .filter(
            User.id.in_(user_ids), User.hospital_id == hospital_id,
            User.is_deleted == False, User.is_active == True,
        )
        .all()
    )
    users = [u for u in users if u.is_employed_on(today)]
    for user in users:
        _record_shift_change(db, hospital_id, user.id, shift_id, changed_by)
        user.shift_id = shift_id
    db.commit()
    return len(users)
