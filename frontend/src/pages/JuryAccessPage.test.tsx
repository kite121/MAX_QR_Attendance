import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JuryAccessPage } from './JuryAccessPage';
import { ApiError } from '../shared/api/ApiError';

const auth = vi.hoisted(() => ({ setJuryRole: vi.fn() }));

vi.mock('../features/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'judge', max_user_id: '70001', display_name: 'Жюри', role: 'student' },
    setJuryRole: auth.setJuryRole,
    logout: vi.fn(),
  }),
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/jury']}>
      <Routes>
        <Route path="/jury" element={<JuryAccessPage />} />
        <Route path="/teacher" element={<div>Страница преподавателя</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('jury access screen', () => {
  beforeEach(() => {
    auth.setJuryRole.mockReset();
  });

  it('sends the secret and selected role without putting them in the URL', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Код доступа жюри'), 'test-secret');
    await user.click(screen.getByRole('button', { name: 'Стать преподавателем' }));

    expect(auth.setJuryRole).toHaveBeenCalledWith('test-secret', 'teacher');
    expect(await screen.findByText('Страница преподавателя')).toBeVisible();
    expect(window.location.href).not.toContain('test-secret');
  });

  it('shows a rejected code and stays on the access screen', async () => {
    auth.setJuryRole.mockRejectedValueOnce(
      new ApiError('FORBIDDEN', 'Неверный код доступа жюри', 403),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Код доступа жюри'), 'wrong-secret');
    await user.click(screen.getByRole('button', { name: 'Присоединиться как студент' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный код доступа жюри',
    );
    expect(screen.getByRole('heading', { name: 'Проверьте QR-отметку' })).toBeVisible();
  });
});
