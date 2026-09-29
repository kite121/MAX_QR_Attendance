import type { AuditItem, Student } from '../api/types';
import { formatLongDate } from '../lib/date';

const actionLabels: Record<string, string> = {
  teacher_bootstrapped: 'Создан аккаунт преподавателя',
  group_created: 'Создана группа',
  student_enrolled: 'Добавлен студент в группу',
  roster_import: 'Импортирован состав группы',
  session_created: 'Начато занятие',
  session_closed: 'Занятие завершено',
  check_in_created: 'Студент отметил присутствие',
  manual_add: 'Добавлена ручная отметка',
  manual_remove: 'Удалена отметка',
  manual_set_status: 'Изменён статус отметки',
};

interface AuditLogProps {
  items: AuditItem[];
  students?: Student[];
  emptyMessage?: string;
}

export function AuditLog({
  items,
  students = [],
  emptyMessage = 'Событий пока нет.',
}: AuditLogProps) {
  if (items.length === 0) return <p className="muted-copy">{emptyMessage}</p>;

  const studentNames = new Map(
    students.map((student) => [student.id, student.display_name]),
  );
  return (
    <ol className="audit-list">
      {items.map((item) => {
        const details: string[] = [];
        if (item.subject_student_id) {
          details.push(studentNames.get(item.subject_student_id) ?? 'Студент группы');
        }
        if (item.reason) details.push(item.reason);
        return (
          <li key={item.id}>
            <span className="audit-list__marker" aria-hidden="true" />
            <div>
              <strong>{actionLabels[item.action] ?? item.action}</strong>
              {details.length > 0 ? <p>{details.join(' · ')}</p> : null}
              <small>
                {formatLongDate(item.created_at)} ·{' '}
                {item.action === 'check_in_created' ? 'Студент' : 'Преподаватель'}
              </small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
