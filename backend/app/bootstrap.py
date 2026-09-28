"""Idempotently appoint the first real MAX teacher until an admin UI exists."""

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.database import get_engine
from app.models import AuditEvent, Group, TeacherGroup, User


def bootstrap_teacher(db: Session, max_user_id: str, name: str, group_name: str) -> None:
    teacher = db.scalar(select(User).where(User.max_user_id == max_user_id))
    if teacher is None:
        teacher = User(max_user_id=max_user_id, display_name=name, role="teacher")
        db.add(teacher)
    else:
        teacher.role = "teacher"
        teacher.display_name = name
    group = db.scalar(select(Group).where(Group.name == group_name))
    if group is None:
        group = Group(name=group_name)
        db.add(group)
    db.flush()
    if db.get(TeacherGroup, (teacher.id, group.id)) is None:
        db.add(TeacherGroup(teacher_id=teacher.id, group_id=group.id))
        db.add(AuditEvent(actor_id=teacher.id, group_id=group.id, action="teacher_bootstrapped"))
    db.commit()


def main() -> None:
    settings = get_settings()
    if not settings.bootstrap_teacher_max_user_id:
        return
    factory = sessionmaker(bind=get_engine())
    with factory() as db:
        bootstrap_teacher(
            db, settings.bootstrap_teacher_max_user_id,
            settings.bootstrap_teacher_name, settings.bootstrap_group_name,
        )


if __name__ == "__main__":
    main()
