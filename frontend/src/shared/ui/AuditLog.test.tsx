import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AuditItem } from '../api/types';
import { AuditLog } from './AuditLog';

const event: AuditItem = {
  id: 'event-1',
  actor_id: 'teacher-1',
  action: 'manual_set_status',
  subject_student_id: 'student-1',
  reason: 'Уточнение времени прихода',
  old_value: 'present',
  new_value: 'late',
  created_at: '2026-09-29T10:00:00Z',
};

describe('audit presentation', () => {
  it('shows the student, reason, status change and known actor', () => {
    render(
      <AuditLog
        items={[event]}
        students={[
          { id: 'student-1', max_user_id: '90001', display_name: 'Тестовый студент' },
        ]}
        currentUser={{
          id: 'teacher-1',
          max_user_id: '90002',
          display_name: 'Тестовый преподаватель',
          role: 'teacher',
        }}
      />,
    );
    expect(
      screen.getByText(
        /Тестовый студент · Вовремя → Опоздал · Уточнение времени прихода/,
      ),
    ).toBeVisible();
    expect(screen.getByText(/Тестовый преподаватель/)).toBeVisible();
  });

  it('translates import counters instead of showing the server encoding', () => {
    render(
      <AuditLog
        items={[
          {
            ...event,
            action: 'roster_import',
            subject_student_id: null,
            old_value: null,
            new_value: null,
            reason: 'imported=2; already_enrolled=3',
          },
        ]}
      />,
    );
    expect(screen.getByText('Добавлено: 2 · Уже в группе: 3')).toBeVisible();
    expect(screen.queryByText(/imported=/)).toBeNull();
  });
});
