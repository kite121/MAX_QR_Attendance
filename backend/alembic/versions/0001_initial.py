"""Initial users, groups, attendance and audit schema."""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("max_user_id", sa.String(64), unique=True),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role in ('teacher', 'student')", name="ck_users_role"),
    )
    op.create_table(
        "groups",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "teacher_groups",
        sa.Column("teacher_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("group_id", sa.String(64), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "enrollments",
        sa.Column("student_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("group_id", sa.String(64), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "attendance_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("group_id", sa.String(64), sa.ForeignKey("groups.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("teacher_id", sa.String(64), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status in ('active', 'closed')", name="ck_sessions_status"),
    )
    op.create_index("ix_attendance_sessions_group_id", "attendance_sessions", ["group_id"])
    op.create_index("ix_sessions_group_started", "attendance_sessions", ["group_id", "started_at"])
    op.create_index(
        "uq_active_session_per_group", "attendance_sessions", ["group_id"],
        unique=True, postgresql_where=sa.text("status = 'active'"), sqlite_where=sa.text("status = 'active'"),
    )
    op.create_table(
        "qr_tokens",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), sa.ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_qr_tokens_session_id", "qr_tokens", ["session_id"])
    op.create_table(
        "check_ins",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), sa.ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.String(64), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.UniqueConstraint("session_id", "student_id", name="uq_checkins_session_student"),
        sa.CheckConstraint("status in ('present', 'late')", name="ck_checkins_status"),
        sa.CheckConstraint("source in ('qr', 'manual')", name="ck_checkins_source"),
    )
    op.create_index("ix_check_ins_session_id", "check_ins", ["session_id"])
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("actor_id", sa.String(64), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("group_id", sa.String(64), sa.ForeignKey("groups.id", ondelete="CASCADE")),
        sa.Column("session_id", sa.String(64), sa.ForeignKey("attendance_sessions.id", ondelete="CASCADE")),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("subject_student_id", sa.String(64)),
        sa.Column("reason", sa.Text()),
        sa.Column("old_value", sa.String(32)),
        sa.Column("new_value", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_events_group_id", "audit_events", ["group_id"])
    op.create_index("ix_audit_events_session_id", "audit_events", ["session_id"])


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("check_ins")
    op.drop_table("qr_tokens")
    op.drop_table("attendance_sessions")
    op.drop_table("enrollments")
    op.drop_table("teacher_groups")
    op.drop_table("groups")
    op.drop_table("users")
