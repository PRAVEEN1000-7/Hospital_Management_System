import uuid
from sqlalchemy.orm import Session
from ..models.attendance import Shift
from ..models.user import User


def list_shifts(db: Session, hospital_id: uuid.UUID) -> list[Shift]:
    return db.query(Shift).filter(Shift.hospital_id == hospital_id).order_by(Shift.name).all()


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
    # Unassign anyone currently on this shift before deleting it.
    db.query(User).filter(User.shift_id == shift_id).update({User.shift_id: None})
    db.delete(shift)
    db.commit()
    return True


def assign_shift(db: Session, hospital_id: uuid.UUID, user_ids: list[uuid.UUID], shift_id: uuid.UUID) -> int:
    """Bulk-assign one shift to a list of employees. Returns count updated."""
    count = (
        db.query(User)
        .filter(User.id.in_(user_ids), User.hospital_id == hospital_id, User.is_deleted == False)
        .update({User.shift_id: shift_id}, synchronize_session=False)
    )
    db.commit()
    return count
