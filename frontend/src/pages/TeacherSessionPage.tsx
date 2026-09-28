import { Button } from '@maxhub/max-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { queryKeys } from '../app/queryKeys';
import { useAuth } from '../features/auth/AuthProvider';
import { AttendanceList } from '../features/teacher/AttendanceList';
import { api } from '../shared/api/api';
import type { AttendanceSession, Group } from '../shared/api/types';
import { formatLongDate } from '../shared/lib/date';
import { useNow } from '../shared/lib/useNow';
import { AppHeader } from '../shared/ui/AppHeader';
import { ConfirmDialog } from '../shared/ui/ConfirmDialog';
import { StateView } from '../shared/ui/StateView';

interface SessionLocationState {
  session?: AttendanceSession;
  group?: Group;
}

export function TeacherSessionPage() {
  const { sessionId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();
  const now = useNow();
  const { session, group } = (location.state ?? {}) as SessionLocationState;
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closedSession, setClosedSession] = useState<AttendanceSession | null>(null);
  const [copyLabel, setCopyLabel] = useState('Скопировать ссылку');

  const checkInsQuery = useQuery({
    queryKey: queryKeys.checkIns(sessionId),
    queryFn: ({ signal }) => api.getCheckIns(accessToken!, sessionId, signal),
    enabled: Boolean(accessToken && sessionId),
    refetchInterval: closedSession ? false : 1_000,
  });

  const isClosed =
    closedSession?.status === 'closed' || checkInsQuery.data?.status === 'closed';

  const qrQuery = useQuery({
    queryKey: queryKeys.qrToken(sessionId),
    queryFn: () => api.getQrToken(accessToken!, sessionId),
    enabled: Boolean(accessToken && sessionId && !isClosed),
    refetchInterval: 5_000,
    staleTime: 0,
    retry: 1,
  });

  const closeSession = useMutation({
    mutationFn: () => api.closeSession(accessToken!, sessionId),
    onSuccess: async (result) => {
      setClosedSession(result);
      setShowCloseDialog(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.checkIns(sessionId) });
      queryClient.removeQueries({ queryKey: queryKeys.qrToken(sessionId) });
    },
  });

  const secondsLeft = qrQuery.data
    ? Math.max(0, Math.ceil((new Date(qrQuery.data.expires_at).getTime() - now) / 1_000))
    : 0;
  const progress = Math.min(100, (secondsLeft / 10) * 100);

  const title = session?.title ?? 'Активное занятие';
  const groupName = group?.name ?? 'Учебная группа';
  const finalItems = useMemo(() => checkInsQuery.data?.items ?? [], [checkInsQuery.data]);

  async function copyDeepLink() {
    if (!qrQuery.data) return;
    await navigator.clipboard.writeText(qrQuery.data.deep_link);
    setCopyLabel('Ссылка скопирована');
    window.setTimeout(() => setCopyLabel('Скопировать ссылку'), 1_800);
  }

  if (!sessionId) {
    return (
      <main className="page-shell">
        <AppHeader subtitle="Кабинет преподавателя" />
        <StateView
          icon="!"
          title="Сессия не найдена"
          actionLabel="К списку групп"
          onAction={() => navigate('/teacher')}
        />
      </main>
    );
  }

  if (isClosed) {
    return (
      <main className="page-shell session-page session-page--closed">
        <AppHeader subtitle="Итоги занятия" />
        <div className="page-content">
          <section className="result-hero">
            <div className="result-hero__icon" aria-hidden="true">
              ✓
            </div>
            <span className="eyebrow">Сессия завершена</span>
            <h1>{title}</h1>
            <p>
              {groupName} ·{' '}
              {session?.started_at
                ? formatLongDate(session.started_at)
                : 'итоговый список'}
            </p>
            <div className="result-count">
              <strong>
                {checkInsQuery.data?.present_count ?? closedSession?.present_count ?? 0}
              </strong>
              <span>
                из {checkInsQuery.data?.student_count ?? group?.student_count ?? 0}
              </span>
            </div>
          </section>

          <section className="surface-card final-list-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Результат</span>
                <h2>Присутствующие</h2>
              </div>
            </div>
            <AttendanceList items={finalItems} final />
          </section>

          <Button size="large" variant="secondary" onClick={() => navigate('/teacher')}>
            Новое занятие
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell session-page">
      <AppHeader subtitle="Идёт занятие" />
      <div className="page-content">
        <section className="session-heading">
          <div>
            <span className="status-pill">
              <span aria-hidden="true" /> Активно
            </span>
            <h1>{title}</h1>
            <p>
              {groupName}
              {session?.started_at ? ` · ${formatLongDate(session.started_at)}` : ''}
            </p>
          </div>
          <Button
            size="large"
            variant="destructive"
            onClick={() => setShowCloseDialog(true)}
          >
            Завершить
          </Button>
        </section>

        <div className="session-grid">
          <section className="surface-card qr-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">QR для студентов</span>
                <h2>Отсканируйте в MAX</h2>
              </div>
              <span className="timer-chip">{secondsLeft} сек</span>
            </div>

            <div className="qr-frame">
              {qrQuery.data ? (
                <QRCodeSVG
                  value={qrQuery.data.deep_link}
                  size={260}
                  level="M"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#101218"
                  title="QR-код для отметки посещаемости"
                />
              ) : qrQuery.isError ? (
                <StateView
                  icon="!"
                  title="QR не загрузился"
                  actionLabel="Повторить"
                  onAction={() => void qrQuery.refetch()}
                />
              ) : (
                <div className="qr-skeleton" aria-label="Загружаем QR-код" />
              )}
            </div>

            <div className="qr-progress" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="qr-hint">
              Код обновляется каждые 5 секунд и действует 10 секунд.
            </p>
            <Button
              size="medium"
              variant="secondary"
              onClick={() => void copyDeepLink()}
              disabled={!qrQuery.data}
            >
              {copyLabel}
            </Button>
          </section>

          <section className="surface-card attendance-card">
            <div className="section-heading attendance-heading">
              <div>
                <span className="eyebrow">В реальном времени</span>
                <h2>Присутствующие</h2>
              </div>
              <div className="attendance-counter" aria-label="Количество присутствующих">
                <strong>{checkInsQuery.data?.present_count ?? 0}</strong>
                <span>
                  / {checkInsQuery.data?.student_count ?? group?.student_count ?? 0}
                </span>
              </div>
            </div>

            {checkInsQuery.isError ? (
              <StateView
                icon="!"
                title="Список временно недоступен"
                description="Проверим соединение ещё раз."
                actionLabel="Повторить"
                onAction={() => void checkInsQuery.refetch()}
              />
            ) : (
              <AttendanceList items={checkInsQuery.data?.items ?? []} />
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={showCloseDialog}
        title="Завершить занятие?"
        description="После завершения новые отметки будут недоступны. Итоговый список сохранится."
        confirmLabel="Завершить"
        pending={closeSession.isPending}
        onCancel={() => setShowCloseDialog(false)}
        onConfirm={() => closeSession.mutate()}
      />
    </main>
  );
}
