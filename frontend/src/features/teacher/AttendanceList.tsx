import type { CheckInItem } from '../../shared/api/types';
import { formatTime } from '../../shared/lib/date';

interface AttendanceListProps {
  items: CheckInItem[];
  final?: boolean;
}

export function AttendanceList({ items, final = false }: AttendanceListProps) {
  const visibleItems = final
    ? [...items].sort((first, second) =>
        first.display_name.localeCompare(second.display_name, 'ru'),
      )
    : items;

  if (visibleItems.length === 0) {
    return (
      <div className="attendance-empty">
        <span aria-hidden="true">•••</span>
        <strong>Пока никто не отметился</strong>
        <p>Список обновится автоматически после первой отметки.</p>
      </div>
    );
  }

  return (
    <ol className="attendance-list">
      {visibleItems.map((item) => (
        <li key={item.student_id}>
          <span className="student-avatar" aria-hidden="true">
            {item.display_name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span className="attendance-list__name">{item.display_name}</span>
          <span
            className={`attendance-badge attendance-badge--${item.attendance_status}`}
          >
            {item.attendance_status === 'late' ? 'Опоздал' : 'Вовремя'}
          </span>
          {item.source === 'manual' ? (
            <span className="attendance-source">Вручную</span>
          ) : null}
          <time dateTime={item.checked_in_at}>{formatTime(item.checked_in_at)}</time>
        </li>
      ))}
    </ol>
  );
}
