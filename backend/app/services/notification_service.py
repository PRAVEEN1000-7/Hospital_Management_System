"""
Centralised in-app notification helper.

All services import `notify_hospital_users` from here instead of
duplicating the user-lookup + bulk-insert logic.
"""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from ..models.notification import Notification
from ..models.user import User, Role, UserRole


def notify_hospital_users(
    db: Session,
    hospital_id: uuid.UUID,
    title: str,
    message: str,
    notification_type: str = "system",
    priority: str = "normal",
    reference_type: Optional[str] = None,
    reference_id: Optional[uuid.UUID] = None,
    role_names: Optional[list[str]] = None,
    extra_user_ids: Optional[list[uuid.UUID]] = None,
    exclude_user_ids: Optional[list[uuid.UUID]] = None,
) -> None:
    """Create in-app notifications for selected active users within the hospital.

    Args:
        role_names:      Notify every active user that has ANY of these roles.
                         Pass None to target all active users.
        extra_user_ids:  Always notify these specific users (regardless of role).
        exclude_user_ids: Never notify these users even if they match a role filter.

    The function is fire-and-forget — it commits the notification rows on the
    current session.  Callers that still need their own commit afterwards can
    use ``db.add()`` + a later ``db.commit()`` — this helper uses ``db.add()``
    for each row and then calls ``db.commit()`` once.  Keep the scope small to
    avoid long-lived uncommitted changes.
    """
    q = db.query(User.id).filter(
        User.hospital_id == hospital_id,
        User.is_active == True,
        User.is_deleted == False,
    )
    if role_names:
        q = (
            q.join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .filter(Role.name.in_(role_names), Role.is_active == True)
        )

    recipient_ids: set[uuid.UUID] = {row[0] for row in q.distinct().all()}

    if extra_user_ids:
        recipient_ids.update(extra_user_ids)
    if exclude_user_ids:
        recipient_ids.difference_update(exclude_user_ids)

    if not recipient_ids:
        return

    for uid in recipient_ids:
        db.add(Notification(
            hospital_id=hospital_id,
            user_id=uid,
            title=title,
            message=message,
            type=notification_type,
            priority=priority,
            reference_type=reference_type,
            reference_id=reference_id,
        ))

    db.commit()
