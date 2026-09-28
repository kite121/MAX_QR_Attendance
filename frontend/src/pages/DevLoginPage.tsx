import { Button, Input } from '@maxhub/max-ui';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { env } from '../config/env';
import { useAuth } from '../features/auth/AuthProvider';
import { isApiError } from '../shared/api/ApiError';
import { Brand } from '../shared/ui/Brand';

const demoAccounts = [
  { login: 'teacher.demo', label: 'Елена · преподаватель' },
  { login: 'student.anna', label: 'Анна · ИВТ-21' },
  { login: 'student.kirill', label: 'Кирилл · ИВТ-21' },
  { login: 'student.outsider', label: 'Мария · другая группа' },
];

export function DevLoginPage() {
  const { loginMock, error: maxAuthError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [login, setLogin] = useState('teacher.demo');
  const [password, setPassword] = useState('baam-demo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await loginMock(login, password);
      const search = location.search;
      navigate(login.startsWith('teacher') ? '/teacher' : `/student/check-in${search}`);
    } catch (loginError) {
      setError(isApiError(loginError) ? loginError.message : 'Не удалось войти');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Brand />
        <div className="login-card__intro">
          <span className="eyebrow">Локальный режим</span>
          <h1>Войдите в демо</h1>
          <p>Выберите тестового пользователя, чтобы пройти сценарий без MAX.</p>
        </div>

        {!env.useMockApi ? (
          <div className="notice notice--warning">
            Mock API выключен. Вход сработает только при доступном backend.
          </div>
        ) : null}

        {maxAuthError ? <div className="notice notice--error">{maxAuthError}</div> : null}

        <div className="demo-accounts" aria-label="Тестовые пользователи">
          {demoAccounts.map((account) => (
            <button
              className={`demo-account${login === account.login ? ' demo-account--active' : ''}`}
              key={account.login}
              type="button"
              onClick={() => setLogin(account.login)}
            >
              <span>{account.label}</span>
              <small>{account.login}</small>
            </button>
          ))}
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Логин</span>
            <Input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>Пароль</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <div className="notice notice--error">{error}</div> : null}
          <Button type="submit" size="large" stretched loading={isSubmitting}>
            Войти
          </Button>
        </form>
      </section>
    </main>
  );
}
