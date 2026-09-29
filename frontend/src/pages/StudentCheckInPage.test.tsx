import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from '../App';
import { mockApi } from '../shared/api/mockApi';

describe('student automatic check-in', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('checks the student in immediately after authentication', async () => {
    const teacher = await mockApi.authMock('teacher.demo', 'baam-demo');
    const session = await mockApi.createSession(
      teacher.access_token,
      'group-ivt-21',
      'Теория алгоритмов',
    );
    const qr = await mockApi.getQrToken(teacher.access_token, session.id);
    window.history.replaceState(
      {},
      '',
      `/student/check-in?startapp=${encodeURIComponent(qr.token)}`,
    );

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Анна · ИВТ-21/i }));
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('heading', { name: 'Вы отметились' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /подтвердить присутствие/i })).toBeNull();

    const attendance = await mockApi.getCheckIns(teacher.access_token, session.id);
    expect(attendance.items).toEqual([
      expect.objectContaining({
        display_name: 'Анна Смирнова',
        attendance_status: 'present',
        source: 'qr',
      }),
    ]);
  });
});
