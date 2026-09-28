import { Button } from '@maxhub/max-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { queryKeys } from '../app/queryKeys';
import { useAuth } from '../features/auth/AuthProvider';
import {
  getContextStateCopy,
  getErrorStateCopy,
  type CheckInStateCopy,
} from '../features/student/checkInState';
import { api } from '../shared/api/api';
import { isApiError } from '../shared/api/ApiError';
import type { CheckInResult } from '../shared/api/types';
import { formatTime } from '../shared/lib/date';
import { getStartParam } from '../shared/lib/maxBridge';
import { useNow } from '../shared/lib/useNow';
import { AppHeader } from '../shared/ui/AppHeader';
import { StateView } from '../shared/ui/StateView';

interface ResultStateProps {
  copy: CheckInStateCopy;
  actionLabel?: string;
  onAction?: () => void;
  lessonTitle?: string;
}

function ResultState({ copy, actionLabel, onAction, lessonTitle }: ResultStateProps) {
  return (
    <section className={`student-result student-result--${copy.tone}`} aria-live="polite">
      <div className="student-result__icon" aria-hidden="true">
        {copy.icon}
      </div>
      <span className="eyebrow">baam max</span>
      <h1>{copy.title}</h1>
      {lessonTitle ? <strong>{lessonTitle}</strong> : null}
      <p>{copy.description}</p>
      {actionLabel && onAction ? (
        <Button size="large" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}

export function StudentCheckInPage() {
  const { accessToken, user } = useAuth();
  const [startParam] = useState(getStartParam);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const now = useNow();

  const contextQuery = useQuery({
    queryKey: queryKeys.checkInContext(startParam ?? 'missing'),
    queryFn: ({ signal }) => api.getCheckInContext(accessToken!, startParam!, signal),
    enabled: Boolean(accessToken && startParam),
    retry: 1,
  });

  const checkInMutation = useMutation({
    mutationFn: () => api.checkIn(accessToken!, startParam!),
    onSuccess: setResult,
  });

  if (!startParam) {
    return (
      <main className="page-shell student-page">
        <AppHeader subtitle="Отметка посещаемости" />
        <StateView
          icon="⌗"
          title="Отсканируйте QR"
          description="Откройте актуальный QR-код на экране преподавателя через MAX."
        />
      </main>
    );
  }

  if (contextQuery.isPending) {
    return (
      <main className="page-shell student-page">
        <AppHeader subtitle="Отметка посещаемости" />
        <StateView
          loading
          title="Проверяем QR-код"
          description="Подтверждаем занятие и группу…"
        />
      </main>
    );
  }

  if (contextQuery.isError) {
    const errorCopy = getErrorStateCopy(
      isApiError(contextQuery.error) ? contextQuery.error.code : undefined,
    );
    return (
      <main className="page-shell student-page">
        <AppHeader subtitle="Отметка посещаемости" />
        <ResultState
          copy={errorCopy}
          actionLabel={errorCopy.tone === 'error' ? 'Повторить' : undefined}
          onAction={() => void contextQuery.refetch()}
        />
      </main>
    );
  }

  const context = contextQuery.data;
  const secondsLeft = Math.max(
    0,
    Math.ceil((new Date(context.expires_at).getTime() - now) / 1_000),
  );

  if (result) {
    return (
      <main className="page-shell student-page">
        <AppHeader subtitle="Отметка посещаемости" />
        <section className="student-result student-result--success" aria-live="polite">
          <div className="student-result__icon" aria-hidden="true">
            ✓
          </div>
          <span className="eyebrow">Готово</span>
          <h1>Вы отметились</h1>
          <strong>{context.lesson_title}</strong>
          <p>
            {user?.display_name}, ваша отметка сохранена в{' '}
            {formatTime(result.checked_in_at)}.
          </p>
          <div className="success-ticket">
            <span>{context.group_name}</span>
            <span>{context.teacher_name}</span>
          </div>
        </section>
      </main>
    );
  }

  if (context.status !== 'available') {
    return (
      <main className="page-shell student-page">
        <AppHeader subtitle="Отметка посещаемости" />
        <ResultState
          copy={getContextStateCopy(context.status)}
          lessonTitle={context.lesson_title}
        />
      </main>
    );
  }

  if (secondsLeft === 0) {
    return (
      <main className="page-shell student-page">
        <AppHeader subtitle="Отметка посещаемости" />
        <ResultState
          copy={getContextStateCopy('expired')}
          lessonTitle={context.lesson_title}
        />
      </main>
    );
  }

  if (checkInMutation.isError) {
    const errorCopy = getErrorStateCopy(
      isApiError(checkInMutation.error) ? checkInMutation.error.code : undefined,
    );
    return (
      <main className="page-shell student-page">
        <AppHeader subtitle="Отметка посещаемости" />
        <ResultState
          copy={errorCopy}
          lessonTitle={context.lesson_title}
          actionLabel={errorCopy.tone === 'error' ? 'Повторить' : undefined}
          onAction={() => checkInMutation.reset()}
        />
      </main>
    );
  }

  return (
    <main className="page-shell student-page">
      <AppHeader subtitle="Отметка посещаемости" />
      <div className="student-checkin">
        <section className="student-checkin__hero">
          <span className="eyebrow">Вас ждут на занятии</span>
          <h1>{context.lesson_title}</h1>
          <p>Проверьте данные и подтвердите присутствие.</p>
        </section>

        <section className="surface-card lesson-card">
          <dl>
            <div>
              <dt>Группа</dt>
              <dd>{context.group_name}</dd>
            </div>
            <div>
              <dt>Преподаватель</dt>
              <dd>{context.teacher_name}</dd>
            </div>
            <div>
              <dt>Студент</dt>
              <dd>{user?.display_name}</dd>
            </div>
          </dl>
          <div className="checkin-timer">
            <span>QR действует ещё</span>
            <strong>{secondsLeft} сек</strong>
          </div>
          <Button
            size="large"
            stretched
            loading={checkInMutation.isPending}
            onClick={() => checkInMutation.mutate()}
          >
            Подтвердить присутствие
          </Button>
        </section>

        <p className="privacy-note">Отметка привязана к вашему аккаунту MAX.</p>
      </div>
    </main>
  );
}
