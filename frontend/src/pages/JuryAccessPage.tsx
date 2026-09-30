import { Button, Input } from '@maxhub/max-ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { isApiError } from '../shared/api/ApiError';
import type { UserRole } from '../shared/api/types';
import { AppHeader } from '../shared/ui/AppHeader';

export function JuryAccessPage() {
  const { user, setJuryRole } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseRole(role: UserRole) {
    if (!token.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await setJuryRole(token.trim(), role);
      setToken('');
      navigate(role === 'teacher' ? '/teacher' : '/student/check-in', { replace: true });
    } catch (roleError) {
      setError(
        isApiError(roleError)
          ? roleError.message
          : 'Не удалось назначить роль. Попробуйте ещё раз.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell jury-page">
      <AppHeader subtitle="Доступ к тестовой группе" />
      <section className="jury-card">
        <span className="eyebrow">Для жюри</span>
        <h1>Проверьте QR-отметку</h1>
        <p>
          Войдите через MAX и введите отдельный код из презентации. Затем выберите, какую
          роль хотите проверить. Роль можно сменить здесь в любой момент.
        </p>
        <label className="jury-card__field">
          <span>Код доступа жюри</span>
          <Input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            placeholder="Код из презентации"
          />
        </label>
        {error ? (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="jury-card__actions">
          <Button
            type="button"
            size="large"
            stretched
            loading={isSubmitting}
            disabled={!token.trim() || isSubmitting}
            onClick={() => void chooseRole('teacher')}
          >
            Стать преподавателем
          </Button>
          <Button
            type="button"
            size="large"
            variant="secondary"
            stretched
            loading={isSubmitting}
            disabled={!token.trim() || isSubmitting}
            onClick={() => void chooseRole('student')}
          >
            Присоединиться как студент
          </Button>
        </div>
        <p className="jury-card__hint">
          Для проверки отметки по QR нужны два разных аккаунта MAX: один преподаватель
          показывает код, второй сканирует его как студент.
        </p>
        <Link to={user?.role === 'teacher' ? '/teacher' : '/student/check-in'}>
          Вернуться в приложение
        </Link>
      </section>
    </main>
  );
}
