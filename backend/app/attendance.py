import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_student, require_teacher
from app.config import Settings, get_settings
from app.database import get_db
from app.errors import AppError
from app.models import AuditEvent, AttendanceSession, CheckIn, Enrollment, Group, QrToken, TeacherGroup, User, utc_now
from app.schemas import (
    CheckInContextOut, CheckInIn, CheckInItemOut, CheckInOut, CheckInsOut,
    CreateGroupIn, CreateSessionIn, EnrollStudentIn, GroupOut, GroupsOut,
    QrTokenOut, SessionOut, StudentOut, StudentsOut,
)

router = APIRouter(prefix="/api/v1", tags=["attendance"])


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def require_group(db: Session, group_id: str, teacher: User) -> Group:
    group = db.scalar(
        select(Group).join(TeacherGroup, TeacherGroup.group_id == Group.id).where(
            Group.id == group_id, TeacherGroup.teacher_id == teacher.id
        )
    )
    if group is None:
        raise AppError("GROUP_NOT_FOUND", "Группа не найдена", 404)
    return group


def require_session(db: Session, session_id: str, teacher: User, lock: bool = False) -> AttendanceSession:
    query = (
        select(AttendanceSession)
        .join(TeacherGroup, TeacherGroup.group_id == AttendanceSession.group_id)
        .where(AttendanceSession.id == session_id, TeacherGroup.teacher_id == teacher.id)
    )
    if lock:
        query = query.with_for_update(of=AttendanceSession)
    session = db.scalar(query)
    if session is None:
        raise AppError("SESSION_NOT_FOUND", "Сессия не найдена", 404)
    return session


def count_present(db: Session, session_id: str) -> int:
    return db.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.session_id == session_id)) or 0


def session_out(db: Session, session: AttendanceSession) -> SessionOut:
    return SessionOut(
        id=session.id, group_id=session.group_id, title=session.title, status=session.status,
        started_at=aware(session.started_at),
        closed_at=aware(session.closed_at) if session.closed_at else None,
        present_count=count_present(db, session.id),
    )


@router.get("/groups", response_model=GroupsOut)
def get_groups(db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    groups = db.execute(
        select(Group.id, Group.name, func.count(Enrollment.student_id))
        .join(TeacherGroup, TeacherGroup.group_id == Group.id)
        .outerjoin(Enrollment, Enrollment.group_id == Group.id)
        .where(TeacherGroup.teacher_id == teacher.id)
        .group_by(Group.id, Group.name)
        .order_by(Group.name)
    ).all()
    return GroupsOut(items=[GroupOut(id=group_id, name=name, student_count=count) for group_id, name, count in groups])


@router.post("/groups", response_model=GroupOut)
def create_group(body: CreateGroupIn, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    name = body.name.strip()
    if not name:
        raise AppError("VALIDATION_ERROR", "Укажите название группы", 422)
    group = Group(name=name)
    db.add(group)
    try:
        db.flush()
        db.add(TeacherGroup(teacher_id=teacher.id, group_id=group.id))
        db.add(AuditEvent(actor_id=teacher.id, group_id=group.id, action="group_created"))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError("VALIDATION_ERROR", "Группа с таким названием уже существует", 409) from exc
    return GroupOut(id=group.id, name=group.name, student_count=0)


@router.get("/groups/{group_id}/students", response_model=StudentsOut)
def get_group_students(group_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    require_group(db, group_id, teacher)
    users = db.scalars(
        select(User).join(Enrollment, Enrollment.student_id == User.id)
        .where(Enrollment.group_id == group_id).order_by(User.display_name)
    ).all()
    return StudentsOut(items=[StudentOut(id=user.id, max_user_id=user.max_user_id, display_name=user.display_name) for user in users])


@router.post("/groups/{group_id}/enrollments", response_model=StudentOut)
def enroll_student(group_id: str, body: EnrollStudentIn, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    require_group(db, group_id, teacher)
    student = db.get(User, body.student_id)
    if student is None or student.role != "student":
        raise AppError("STUDENT_NOT_ENROLLED", "Студент не найден", 404)
    if db.get(Enrollment, (student.id, group_id)) is None:
        db.add(Enrollment(student_id=student.id, group_id=group_id))
        db.add(AuditEvent(actor_id=teacher.id, group_id=group_id, action="student_enrolled", subject_student_id=student.id))
        db.commit()
    return StudentOut(id=student.id, max_user_id=student.max_user_id, display_name=student.display_name)


@router.post("/groups/{group_id}/sessions", response_model=SessionOut)
def create_session(group_id: str, body: CreateSessionIn, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    require_group(db, group_id, teacher)
    existing = db.scalar(select(AttendanceSession).where(AttendanceSession.group_id == group_id, AttendanceSession.status == "active"))
    if existing is not None:
        return session_out(db, existing)
    session = AttendanceSession(group_id=group_id, teacher_id=teacher.id, title=body.title.strip())
    if not session.title:
        raise AppError("VALIDATION_ERROR", "Укажите название занятия", 422)
    db.add(session)
    try:
        db.flush()
        db.add(AuditEvent(actor_id=teacher.id, group_id=group_id, session_id=session.id, action="session_created"))
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(AttendanceSession).where(AttendanceSession.group_id == group_id, AttendanceSession.status == "active"))
        if existing is None:
            raise
        return session_out(db, existing)
    return session_out(db, session)


@router.get("/groups/{group_id}/sessions/active", response_model=SessionOut)
def get_active_session(group_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    require_group(db, group_id, teacher)
    session = db.scalar(select(AttendanceSession).where(AttendanceSession.group_id == group_id, AttendanceSession.status == "active"))
    if session is None:
        raise AppError("SESSION_NOT_FOUND", "Активная сессия не найдена", 404)
    return session_out(db, session)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    return session_out(db, require_session(db, session_id, teacher))


@router.post("/sessions/{session_id}/qr-token", response_model=QrTokenOut)
def create_qr_token(session_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher), settings: Settings = Depends(get_settings)):
    session = require_session(db, session_id, teacher, lock=True)
    if session.status != "active":
        raise AppError("SESSION_CLOSED", "Сессия уже завершена", 409)
    token = secrets.token_urlsafe(24)
    expires_at = utc_now() + timedelta(seconds=settings.qr_ttl_seconds)
    db.add(QrToken(session_id=session.id, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=expires_at))
    db.commit()
    if settings.max_bot_name:
        deep_link = f"https://max.ru/{settings.max_bot_name}?startapp={quote(token)}"
    else:
        deep_link = f"{settings.dev_mini_app_url}?startapp={quote(token)}"
    return QrTokenOut(token=token, deep_link=deep_link, expires_at=expires_at)


def token_context(db: Session, token: str, student: User) -> tuple[QrToken, AttendanceSession, str]:
    qr = db.scalar(select(QrToken).where(QrToken.token_hash == hashlib.sha256(token.encode()).hexdigest()))
    if qr is None:
        raise AppError("QR_TOKEN_INVALID", "QR-код недействителен", 400)
    session = db.get(AttendanceSession, qr.session_id)
    if session is None:
        raise AppError("SESSION_NOT_FOUND", "Сессия не найдена", 404)
    if aware(qr.expires_at) <= utc_now():
        status = "expired"
    elif session.status == "closed":
        status = "session_closed"
    elif db.get(Enrollment, (student.id, session.group_id)) is None:
        status = "not_enrolled"
    elif db.scalar(select(CheckIn.id).where(CheckIn.session_id == session.id, CheckIn.student_id == student.id)):
        status = "already_checked_in"
    else:
        status = "available"
    return qr, session, status


@router.get("/check-in/context", response_model=CheckInContextOut)
def get_check_in_context(token: str = Query(min_length=16, max_length=256), db: Session = Depends(get_db), student: User = Depends(require_student)):
    qr, session, status = token_context(db, token, student)
    return CheckInContextOut(
        session_id=session.id, lesson_title=session.title, group_name=session.group.name,
        teacher_name=session.teacher.display_name, status=status, expires_at=aware(qr.expires_at),
    )


@router.post("/check-ins", response_model=CheckInOut)
def check_in(body: CheckInIn, db: Session = Depends(get_db), student: User = Depends(require_student), settings: Settings = Depends(get_settings)):
    token_hash = hashlib.sha256(body.qr_token.encode()).hexdigest()
    qr = db.scalar(select(QrToken).where(QrToken.token_hash == token_hash))
    if qr is None:
        raise AppError("QR_TOKEN_INVALID", "QR-код недействителен", 400)
    session = db.scalar(select(AttendanceSession).where(AttendanceSession.id == qr.session_id).with_for_update())
    if session is None:
        raise AppError("SESSION_NOT_FOUND", "Сессия не найдена", 404)
    now = utc_now()
    if aware(qr.expires_at) <= now:
        raise AppError("QR_TOKEN_EXPIRED", "Срок действия QR-кода истёк", 400)
    if session.status != "active":
        raise AppError("SESSION_CLOSED", "Сессия уже завершена", 409)
    if db.get(Enrollment, (student.id, session.group_id)) is None:
        raise AppError("STUDENT_NOT_ENROLLED", "Вы не состоите в этой группе", 403)
    if db.scalar(select(CheckIn.id).where(CheckIn.session_id == session.id, CheckIn.student_id == student.id)):
        raise AppError("ALREADY_CHECKED_IN", "Вы уже отметились", 409)
    status = "late" if now >= aware(session.started_at) + timedelta(minutes=settings.late_after_minutes) else "present"
    checkin = CheckIn(session_id=session.id, student_id=student.id, checked_in_at=now, status=status, source="qr")
    db.add(checkin)
    try:
        db.flush()
        db.add(AuditEvent(actor_id=student.id, group_id=session.group_id, session_id=session.id, action="check_in_created", subject_student_id=student.id, new_value=status))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError("ALREADY_CHECKED_IN", "Вы уже отметились", 409) from exc
    return CheckInOut(checked_in_at=now, session_id=session.id)


@router.get("/sessions/{session_id}/check-ins", response_model=CheckInsOut)
def get_check_ins(session_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    session = require_session(db, session_id, teacher)
    rows = db.execute(
        select(CheckIn, User.display_name)
        .join(User, User.id == CheckIn.student_id)
        .where(CheckIn.session_id == session_id)
        .order_by(CheckIn.checked_in_at.desc())
    ).all()
    student_count = db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.group_id == session.group_id)) or 0
    return CheckInsOut(
        session_id=session.id, status=session.status, present_count=len(rows), student_count=student_count,
        items=[
            CheckInItemOut(
                student_id=checkin.student_id, display_name=name, checked_in_at=aware(checkin.checked_in_at),
                attendance_status=checkin.status, source=checkin.source,
            ) for checkin, name in rows
        ],
    )


@router.post("/sessions/{session_id}/close", response_model=SessionOut)
def close_session(session_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    session = require_session(db, session_id, teacher, lock=True)
    if session.status == "active":
        session.status = "closed"
        session.closed_at = utc_now()
        db.add(AuditEvent(actor_id=teacher.id, group_id=session.group_id, session_id=session.id, action="session_closed"))
        db.commit()
    return session_out(db, session)
