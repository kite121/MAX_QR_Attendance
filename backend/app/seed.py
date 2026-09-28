"""Idempotent synthetic data for local demo and automated tests."""

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.database import get_engine
from app.models import Enrollment, Group, TeacherGroup, User


DEMO_USERS = (
    ("teacher-elena", "10001", "Елена Соколова", "teacher"),
    ("student-anna", "20001", "Анна Смирнова", "student"),
    ("student-kirill", "20002", "Кирилл Волков", "student"),
    ("student-maria", "20003", "Мария Орлова", "student"),
)


def seed_demo(db: Session, teacher_max_user_id: str = "10001") -> None:
    max_ids = {"teacher-elena": teacher_max_user_id}
    for user_id, mock_max_id, display_name, role in DEMO_USERS:
        user = db.get(User, user_id)
        if user is None:
            user = User(id=user_id, max_user_id=max_ids.get(user_id, mock_max_id), display_name=display_name, role=role)
            db.add(user)
        elif user_id == "teacher-elena":
            user.max_user_id = teacher_max_user_id
    for group_id, name in (("group-ivt-21", "ИВТ-21"), ("group-pmi-22", "ПМИ-22")):
        if db.get(Group, group_id) is None:
            db.add(Group(id=group_id, name=name))
    db.flush()
    if db.get(TeacherGroup, ("teacher-elena", "group-ivt-21")) is None:
        db.add(TeacherGroup(teacher_id="teacher-elena", group_id="group-ivt-21"))
    for student_id, group_id in (
        ("student-anna", "group-ivt-21"),
        ("student-kirill", "group-ivt-21"),
        ("student-maria", "group-pmi-22"),
    ):
        if db.get(Enrollment, (student_id, group_id)) is None:
            db.add(Enrollment(student_id=student_id, group_id=group_id))
    db.commit()


def main() -> None:
    settings = get_settings()
    if not settings.enable_mock_auth:
        return
    factory = sessionmaker(bind=get_engine())
    with factory() as db:
        seed_demo(db, settings.demo_teacher_max_user_id)


if __name__ == "__main__":
    main()
