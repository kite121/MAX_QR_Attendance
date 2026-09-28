import csv
import io
import re
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.attendance import aware, get_check_ins, require_group, require_session, session_out
from app.auth import require_teacher
from app.config import Settings, get_settings
from app.database import get_db
from app.errors import AppError
from app.models import AuditEvent, AttendanceSession, CheckIn, Enrollment, User, utc_now
from app.schemas import (
    AuditItemOut, AuditOut, CheckInsOut, GroupStatsOut, HistoryOut, ImportOut, ManualCorrectionIn,
)

router = APIRouter(prefix="/api/v1", tags=["teacher P1"])


@router.get("/groups/{group_id}/sessions", response_model=HistoryOut)
def get_history(
    group_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    teacher: User = Depends(require_teacher),
):
    require_group(db, group_id, teacher)
    sessions = db.scalars(
        select(AttendanceSession).where(AttendanceSession.group_id == group_id)
        .order_by(AttendanceSession.started_at.desc()).limit(limit).offset(offset)
    ).all()
    return HistoryOut(items=[session_out(db, session) for session in sessions])


@router.post("/sessions/{session_id}/check-ins/manual", response_model=CheckInsOut)
def manual_correction(
    session_id: str,
    body: ManualCorrectionIn,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_teacher),
    settings: Settings = Depends(get_settings),
):
    session = require_session(db, session_id, teacher, lock=True)
    student = db.get(User, body.student_id)
    if student is None or student.role != "student" or db.get(Enrollment, (student.id, session.group_id)) is None:
        raise AppError("STUDENT_NOT_ENROLLED", "Студент не найден в группе", 404)
    existing = db.scalar(select(CheckIn).where(CheckIn.session_id == session.id, CheckIn.student_id == student.id))
    now = utc_now()
    if body.action == "add":
        if existing is not None:
            raise AppError("ALREADY_CHECKED_IN", "Студент уже отмечен", 409)
        status = body.attendance_status or (
            "late" if now >= aware(session.started_at) + timedelta(minutes=settings.late_after_minutes) else "present"
        )
        db.add(CheckIn(session_id=session.id, student_id=student.id, checked_in_at=now, status=status, source="manual"))
        old_value, new_value = "absent", status
    elif body.action == "remove":
        if existing is None:
            raise AppError("VALIDATION_ERROR", "Отметка не найдена", 409)
        old_value, new_value = existing.status, "absent"
        db.delete(existing)
    else:
        if existing is None:
            raise AppError("VALIDATION_ERROR", "Отметка не найдена", 409)
        if existing.status == body.attendance_status:
            raise AppError("VALIDATION_ERROR", "Статус уже установлен", 409)
        old_value, new_value = existing.status, body.attendance_status
        existing.status = body.attendance_status
        existing.source = "manual"
    db.add(
        AuditEvent(
            actor_id=teacher.id, group_id=session.group_id, session_id=session.id, action=f"manual_{body.action}",
            subject_student_id=student.id, reason=body.reason.strip(),
            old_value=old_value, new_value=new_value,
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError("ALREADY_CHECKED_IN", "Студент уже отмечен", 409) from exc
    return get_check_ins(session_id, db, teacher)


@router.get("/sessions/{session_id}/audit", response_model=AuditOut)
def get_audit(session_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    require_session(db, session_id, teacher)
    events = db.scalars(
        select(AuditEvent).where(AuditEvent.session_id == session_id).order_by(AuditEvent.created_at.desc()).limit(500)
    ).all()
    return AuditOut(items=[
        AuditItemOut(
            id=event.id, actor_id=event.actor_id, action=event.action,
            subject_student_id=event.subject_student_id, reason=event.reason,
            old_value=event.old_value, new_value=event.new_value,
            created_at=aware(event.created_at),
        ) for event in events
    ])


@router.get("/groups/{group_id}/audit", response_model=AuditOut)
def get_group_audit(group_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    require_group(db, group_id, teacher)
    events = db.scalars(
        select(AuditEvent).where(AuditEvent.group_id == group_id).order_by(AuditEvent.created_at.desc()).limit(500)
    ).all()
    return AuditOut(items=[
        AuditItemOut(
            id=event.id, actor_id=event.actor_id, action=event.action,
            subject_student_id=event.subject_student_id, reason=event.reason,
            old_value=event.old_value, new_value=event.new_value,
            created_at=aware(event.created_at),
        ) for event in events
    ])


def csv_safe(value: str | None) -> str:
    text = value or ""
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text


@router.get("/sessions/{session_id}/export.csv")
def export_csv(session_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    session = require_session(db, session_id, teacher)
    rows = db.execute(
        select(User, CheckIn)
        .join(Enrollment, Enrollment.student_id == User.id)
        .outerjoin(CheckIn, (CheckIn.student_id == User.id) & (CheckIn.session_id == session.id))
        .where(Enrollment.group_id == session.group_id)
        .order_by(User.display_name)
    ).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(("student_id", "max_user_id", "display_name", "status", "checked_in_at", "source"))
    for student, checkin in rows:
        writer.writerow((
            csv_safe(student.id), csv_safe(student.max_user_id), csv_safe(student.display_name),
            checkin.status if checkin else "absent",
            aware(checkin.checked_in_at).isoformat() if checkin else "",
            checkin.source if checkin else "",
        ))
    content = "\ufeff" + output.getvalue()
    return Response(
        content=content.encode("utf-8"), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="attendance-{session.id}.csv"'},
    )


@router.post("/groups/{group_id}/enrollments/import", response_model=ImportOut)
def import_csv(
    group_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    teacher: User = Depends(require_teacher),
):
    require_group(db, group_id, teacher)
    if not (file.filename or "").lower().endswith(".csv"):
        raise AppError("VALIDATION_ERROR", "Загрузите CSV-файл", 422)
    raw = file.file.read(200_001)
    if len(raw) > 200_000:
        raise AppError("VALIDATION_ERROR", "CSV-файл слишком большой", 422)
    try:
        contents = raw.decode("utf-8-sig")
        dialect = csv.Sniffer().sniff(contents[:4096], delimiters=",;")
        reader = csv.DictReader(io.StringIO(contents), dialect=dialect)
        if reader.fieldnames is None or not {"max_user_id", "display_name"}.issubset(set(reader.fieldnames)):
            raise ValueError("required columns missing")
        rows = list(reader)
    except (UnicodeDecodeError, csv.Error, ValueError) as exc:
        raise AppError("VALIDATION_ERROR", "CSV должен быть в UTF-8 с колонками max_user_id,display_name", 422) from exc
    if not rows or len(rows) > 1000:
        raise AppError("VALIDATION_ERROR", "CSV должен содержать от 1 до 1000 строк", 422)
    seen: set[str] = set()
    normalized: list[tuple[str, str]] = []
    for row_number, row in enumerate(rows, start=2):
        max_user_id = (row.get("max_user_id") or "").strip()
        name = (row.get("display_name") or "").strip()
        if not re.fullmatch(r"[0-9]{1,20}", max_user_id) or not name or len(name) > 160 or max_user_id in seen:
            raise AppError("VALIDATION_ERROR", f"Некорректная или повторная запись в строке {row_number}", 422)
        seen.add(max_user_id)
        normalized.append((max_user_id, name))
    imported = already_enrolled = 0
    for max_user_id, name in normalized:
        student = db.scalar(select(User).where(User.max_user_id == max_user_id))
        if student is None:
            student = User(max_user_id=max_user_id, display_name=name, role="student")
            db.add(student)
            db.flush()
        elif student.role != "student":
            db.rollback()
            raise AppError("VALIDATION_ERROR", "CSV содержит идентификатор преподавателя", 422)
        if db.get(Enrollment, (student.id, group_id)) is None:
            db.add(Enrollment(student_id=student.id, group_id=group_id))
            imported += 1
        else:
            already_enrolled += 1
    db.add(AuditEvent(
        actor_id=teacher.id, group_id=group_id, action="roster_import",
        reason=f"imported={imported}; already_enrolled={already_enrolled}",
    ))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError("VALIDATION_ERROR", "CSV конфликтует с существующими данными", 409) from exc
    return ImportOut(imported=imported, already_enrolled=already_enrolled)


@router.get("/groups/{group_id}/stats", response_model=GroupStatsOut)
def group_stats(group_id: str, db: Session = Depends(get_db), teacher: User = Depends(require_teacher)):
    require_group(db, group_id, teacher)
    sessions = db.scalars(select(AttendanceSession).where(AttendanceSession.group_id == group_id)).all()
    session_ids = [session.id for session in sessions]
    total = db.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.session_id.in_(session_ids))) if session_ids else 0
    student_count = db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.group_id == group_id)) or 0
    denominator = len(sessions) * student_count
    return GroupStatsOut(
        group_id=group_id, sessions_count=len(sessions),
        closed_sessions_count=sum(session.status == "closed" for session in sessions),
        total_check_ins=total or 0,
        average_attendance_percent=round(100 * (total or 0) / denominator, 1) if denominator else 0.0,
    )
