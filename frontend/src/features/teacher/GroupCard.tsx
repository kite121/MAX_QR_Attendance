import type { Group } from '../../shared/api/types';

interface GroupCardProps {
  group: Group;
  selected: boolean;
  onSelect: (group: Group) => void;
}

export function GroupCard({ group, selected, onSelect }: GroupCardProps) {
  return (
    <button
      className={`group-card${selected ? ' group-card--selected' : ''}`}
      type="button"
      onClick={() => onSelect(group)}
      aria-pressed={selected}
    >
      <span className="group-card__avatar" aria-hidden="true">
        {group.name.slice(0, 2)}
      </span>
      <span className="group-card__copy">
        <strong>{group.name}</strong>
        <span>{group.student_count} студента</span>
      </span>
      <span className="group-card__check" aria-hidden="true">
        {selected ? '✓' : '›'}
      </span>
    </button>
  );
}
