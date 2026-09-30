"""Self-service role assignment for judges who know the separate jury secret."""

import hmac
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import auth_out, current_user
from app.config import Settings, get_settings
from app.database import get_db
from app.errors import AppError
from app.models import AuditEvent, Enrollment, Group, TeacherGroup, User
from app.schemas import ApiErrorBody, AuthOut, COMMON_ERROR_RESPONSES

router = APIRouter(
    prefix="/api/v1/jury",
    tags=["jury"],
    responses={**COMMON_ERROR_RESPONSES, 503: {"model": ApiErrorBody}},
)


class JuryRoleIn(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    role: Literal["teacher", "student"]


def get_jury_group(db: Session, name: str) -> Group:
    group = db.scalar(select(Group).where(Group.name == name))
    if group is not None:
        return group
    try:
        with db.begin_nested():
            group = Group(name=name)
            db.add(group)
            db.flush()
    except IntegrityError:
        group = db.scalar(select(Group).where(Group.name == name))
        if group is None:
            raise
    return group


@router.post("/role", response_model=AuthOut)
def set_jury_role(
    body: JuryRoleIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if not settings.jury_admin_token or not hmac.compare_digest(body.token, settings.jury_admin_token):
        raise AppError("FORBIDDEN", "Неверный код доступа жюри", 403)
    if user.max_user_id is None:
        raise AppError("FORBIDDEN", "Войдите через MAX", 403)

    group = get_jury_group(db, settings.jury_group_name.strip())
    previous_role = user.role
    user.role = body.role
    db.flush()
    linked = False
    if body.role == "teacher":
        if db.get(TeacherGroup, (user.id, group.id)) is None:
            db.add(TeacherGroup(teacher_id=user.id, group_id=group.id))
            linked = True
    elif db.get(Enrollment, (user.id, group.id)) is None:
        db.add(Enrollment(student_id=user.id, group_id=group.id))
        linked = True

    if linked or previous_role != body.role:
        db.add(AuditEvent(
            actor_id=user.id, group_id=group.id, action="jury_role_selected",
            old_value=previous_role, new_value=body.role,
        ))
    db.commit()
    return auth_out(user, settings)
