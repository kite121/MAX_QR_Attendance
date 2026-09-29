import { Button, Input } from '@maxhub/max-ui';
import { useMemo, useState, type FormEvent } from 'react';

import type {
  AttendanceStatus,
  CheckInItem,
  ManualCorrectionAction,
  ManualCorrectionInput,
  Student,
} from '../../shared/api/types';

interface ManualAttendancePanelProps {
  students: Student[];
  checkIns: CheckInItem[];
  pending: boolean;
  error?: string;
  success?: string;
  onSubmit: (input: ManualCorrectionInput) => void;
}

export function ManualAttendancePanel({
  students,
  checkIns,
  pending,
  error,
  success,
  onSubmit,
}: ManualAttendancePanelProps) {
  const [studentId, setStudentId] = useState('');
  const [action, setAction] = useState<ManualCorrectionAction>('add');
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [reason, setReason] = useState('');

  const effectiveStudentId = studentId || students[0]?.id || '';

  const currentCheckIn = useMemo(
    () => checkIns.find((item) => item.student_id === effectiveStudentId),
    [checkIns, effectiveStudentId],
  );
  const effectiveAction = currentCheckIn
    ? action === 'add'
      ? 'set_status'
      : action
    : 'add';
  const effectiveStatus =
    effectiveAction === 'set_status'
      ? currentCheckIn?.attendance_status === 'present'
        ? 'late'
        : 'present'
      : status;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!effectiveStudentId || reason.trim().length < 5) return;
    onSubmit({
      student_id: effectiveStudentId,
      action: effectiveAction,
      attendance_status: effectiveAction === 'remove' ? undefined : effectiveStatus,
      reason: reason.trim(),
    });
  }

  return (
    <section className="surface-card correction-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Корректировка</span>
          <h2>Ручная отметка</h2>
        </div>
      </div>
      <p className="muted-copy">
        Каждое изменение сохраняется с причиной и остаётся в журнале аудита.
      </p>

      {students.length === 0 ? (
        <p className="muted-copy">В группе пока нет студентов.</p>
      ) : (
        <form className="correction-form" onSubmit={handleSubmit}>
          <label className="field-label">
            <span>Студент</span>
            <select
              value={effectiveStudentId}
              onChange={(event) => {
                const nextStudentId = event.target.value;
                const nextCheckIn = checkIns.find(
                  (item) => item.student_id === nextStudentId,
                );
                setStudentId(nextStudentId);
                setAction(nextCheckIn ? 'set_status' : 'add');
              }}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.display_name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            <span>Действие</span>
            <select
              value={effectiveAction}
              onChange={(event) =>
                setAction(event.target.value as ManualCorrectionAction)
              }
            >
              {currentCheckIn ? (
                <>
                  <option value="set_status">Изменить статус</option>
                  <option value="remove">Удалить отметку</option>
                </>
              ) : (
                <option value="add">Добавить отметку</option>
              )}
            </select>
          </label>

          {effectiveAction !== 'remove' ? (
            <label className="field-label">
              <span>Статус</span>
              <select
                value={effectiveStatus}
                onChange={(event) => setStatus(event.target.value as AttendanceStatus)}
              >
                {effectiveAction === 'set_status' ? (
                  <option value={effectiveStatus}>
                    {effectiveStatus === 'present' ? 'Присутствует' : 'Опоздал'}
                  </option>
                ) : (
                  <>
                    <option value="present">Присутствует</option>
                    <option value="late">Опоздал</option>
                  </>
                )}
              </select>
            </label>
          ) : null}

          <label className="field-label correction-form__reason">
            <span>Причина изменения</span>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Минимум 5 символов"
              maxLength={500}
              count={reason.length}
              required
            />
          </label>

          {success ? <div className="notice notice--success">{success}</div> : null}
          {error ? <div className="notice notice--error">{error}</div> : null}

          <Button
            type="submit"
            size="large"
            loading={pending}
            disabled={!effectiveStudentId || reason.trim().length < 5}
          >
            Сохранить изменение
          </Button>
        </form>
      )}
    </section>
  );
}
