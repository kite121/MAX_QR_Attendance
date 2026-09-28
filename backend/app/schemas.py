from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class UserOut(BaseModel):
    id: str
    max_user_id: str | None
    display_name: str
    role: Literal["teacher", "student"]


class AuthOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class MaxAuthIn(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


class MockAuthIn(BaseModel):
    login: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class GroupOut(BaseModel):
    id: str
    name: str
    student_count: int


class GroupsOut(BaseModel):
    items: list[GroupOut]


class CreateGroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class StudentOut(BaseModel):
    id: str
    max_user_id: str | None
    display_name: str


class StudentsOut(BaseModel):
    items: list[StudentOut]


class EnrollStudentIn(BaseModel):
    student_id: str = Field(min_length=1, max_length=64)


class CreateSessionIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class SessionOut(BaseModel):
    id: str
    group_id: str
    title: str
    status: Literal["active", "closed"]
    started_at: datetime
    closed_at: datetime | None = None
    present_count: int | None = None


class QrTokenOut(BaseModel):
    token: str
    deep_link: str
    expires_at: datetime


class CheckInContextOut(BaseModel):
    session_id: str
    lesson_title: str
    group_name: str
    teacher_name: str
    status: Literal["available", "expired", "session_closed", "not_enrolled", "already_checked_in"]
    expires_at: datetime


class CheckInIn(BaseModel):
    qr_token: str = Field(min_length=16, max_length=256)


class CheckInOut(BaseModel):
    status: Literal["checked_in"] = "checked_in"
    checked_in_at: datetime
    session_id: str


class CheckInItemOut(BaseModel):
    student_id: str
    display_name: str
    checked_in_at: datetime
    attendance_status: Literal["present", "late"]
    source: Literal["qr", "manual"]


class CheckInsOut(BaseModel):
    session_id: str
    status: Literal["active", "closed"]
    present_count: int
    student_count: int
    items: list[CheckInItemOut]


class ManualCorrectionIn(BaseModel):
    student_id: str = Field(min_length=1, max_length=64)
    action: Literal["add", "remove", "set_status"]
    attendance_status: Literal["present", "late"] | None = None
    reason: str = Field(min_length=5, max_length=500)

    @field_validator("reason")
    @classmethod
    def meaningful_reason(cls, value: str) -> str:
        if len(value.strip()) < 5:
            raise ValueError("reason must have at least five non-space characters")
        return value.strip()

    @model_validator(mode="after")
    def validate_action(self) -> "ManualCorrectionIn":
        if self.action == "set_status" and self.attendance_status is None:
            raise ValueError("attendance_status is required for set_status")
        return self


class HistoryOut(BaseModel):
    items: list[SessionOut]


class AuditItemOut(BaseModel):
    id: str
    actor_id: str
    action: str
    subject_student_id: str | None
    reason: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime


class AuditOut(BaseModel):
    items: list[AuditItemOut]


class ImportOut(BaseModel):
    imported: int
    already_enrolled: int


class GroupStatsOut(BaseModel):
    group_id: str
    sessions_count: int
    closed_sessions_count: int
    total_check_ins: int
    average_attendance_percent: float
