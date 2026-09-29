import { Button } from '@maxhub/max-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { queryKeys } from '../app/queryKeys';
import { useAuth } from '../features/auth/AuthProvider';
import { AttendanceList } from '../features/teacher/AttendanceList';
import { ManualAttendancePanel } from '../features/teacher/ManualAttendancePanel';
import { api } from '../shared/api/api';
import { isApiError } from '../shared/api/ApiError';
import type { ManualCorrectionInput } from '../shared/api/types';
import { formatLongDate } from '../shared/lib/date';
import { useNow } from '../shared/lib/useNow';
import { AppHeader } from '../shared/ui/AppHeader';
import { ConfirmDialog } from '../shared/ui/ConfirmDialog';
import { StateView } from '../shared/ui/StateView';

export function TeacherSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();
  const now = useNow();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Скопировать ссылку');
  const [correctionSuccess, setCorrectionSuccess] = useState('');

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: ({ signal }) => api.getSession(accessToken!, sessionId, signal),
    enabled: Boolean(accessToken && sessionId),
  });

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: ({ signal }) => api.getGroups(accessToken!, signal),
    enabled: Boolean(accessToken),
  });

  const groupId = sessionQuery.data?.group_id ?? '';
  const studentsQuery = useQuery({
    queryKey: queryKeys.groupStudents(groupId),
    queryFn: ({ signal }) => api.getGroupStudents(accessToken!, groupId, signal),
    enabled: Boolean(accessToken && groupId),
  });

  const checkInsQuery = useQuery({
    queryKey: queryKeys.checkIns(sessionId),
    queryFn: ({ signal }) => api.getCheckIns(accessToken!, sessionId, signal),
    enabled: Boolean(accessToken && sessionId),
    refetchInterval: (query) => (query.state.data?.status === 'closed' ? false : 1_000),
  });

  const isClosed =
    sessionQuery.data?.status === 'closed' || checkInsQuery.data?.status === 'closed';

  const qrQuery = useQuery({
    queryKey: queryKeys.qrToken(sessionId),
    queryFn: () => api.getQrToken(accessToken!, sessionId),
    enabled: Boolean(accessToken && sessionId && sessionQuery.data && !isClosed),
    refetchInterval: 5_000,
    staleTime: 0,
    retry: 1,
  });

  const closeSession = useMutation({
    mutationFn: () => api.closeSession(accessToken!, sessionId),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.session(sessionId), result);
      setShowCloseDialog(false);
      queryClient.removeQueries({ queryKey: queryKeys.qrToken(sessionId) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.checkIns(sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions(result.group_id) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.activeSession(result.group_id),
        }),
      ]);
    },
  });

  const correction = useMutation({
    mutationFn: (input: ManualCorrectionInput) =>
      api.correctCheckIn(accessToken!, sessionId, input),
    onMutate: () => setCorrectionSuccess(''),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.checkIns(sessionId), result);
      setCorrectionSuccess('Изменение сохранено');
      if (groupId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.sessions(groupId) });
      }
    },
  });

  const exportCsv = useMutation({
    mutationFn: () => api.exportSessionCsv(accessToken!, sessionId),
    onSuccess: (blob) => {
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `attendance-${sessionId}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    },
  });

  const secondsLeft = qrQuery.data
    ? Math.max(0, Math.ceil((new Date(qrQuery.data.expires_at).getTime() - now) / 1_000))
    : 0;
  const progress = Math.min(100, (secondsLeft / 10) * 100);
  const session = sessionQuery.data;
  const group = groupsQuery.data?.items.find((item) => item.id === groupId);

  async function copyDeepLink() {
    if (!qrQuery.data) return;
    try {
      await navigator.clipboard.writeText(qrQuery.data.deep_link);
      setCopyLabel('Ссылка скопирована');
    } catch {
      setCopyLabel('Не удалось скопировать');
    }
    window.setTimeout(() => setCopyLabel('Скопировать ссылку'), 1_800);
  }

  if (!sessionId || sessionQuery.isError) {
    return (
      <main className="page-shell">
        <AppHeader subtitle="Кабинет преподавателя" />
        <StateView
          icon="!"
          title="Сессия не найдена"
          description="Она могла быть удалена или недоступна этому преподавателю."
          actionLabel="К списку групп"
          onAction={() => navigate('/teacher')}
        />
      </main>
    );
  }

  if (sessionQuery.isPending || !session) {
    return (
      <main className="page-shell">
        <AppHeader subtitle="Кабинет преподавателя" />
        <StateView loading title="Восстанавливаем занятие" />
      </main>
    );
  }

  const correctionError = correction.isError
    ? isApiError(correction.error)
      ? correction.error.message
      : 'Не удалось сохранить изменение'
    : undefined;

  const correctionPanel = (
    <ManualAttendancePanel
      students={studentsQuery.data?.items ?? []}
      checkIns={checkInsQuery.data?.items ?? []}
      pending={correction.isPending}
      error={correctionError}
      success={correctionSuccess}
      onSubmit={(input) => correction.mutate(input)}
    />
  );

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
            <h1>{session.title}</h1>
            <p>
              {group?.name ?? 'Учебная группа'} · {formatLongDate(session.started_at)}
            </p>
            <div className="result-count">
              <strong>
                {checkInsQuery.data?.present_count ?? session.present_count ?? 0}
              </strong>
              <span>
                из {checkInsQuery.data?.student_count ?? group?.student_count ?? 0}
              </span>
            </div>
            <Button
              size="large"
              variant="secondary"
              loading={exportCsv.isPending}
              onClick={() => exportCsv.mutate()}
            >
              Скачать CSV
            </Button>
            {exportCsv.isError ? (
              <div className="notice notice--error">Не удалось скачать CSV.</div>
            ) : null}
          </section>

          <section className="surface-card final-list-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Результат</span>
                <h2>Присутствующие</h2>
              </div>
            </div>
            <AttendanceList items={checkInsQuery.data?.items ?? []} final />
          </section>

          <div className="session-tools">{correctionPanel}</div>
          <Button size="large" variant="secondary" onClick={() => navigate('/teacher')}>
            К истории занятий
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
            <h1>{session.title}</h1>
            <p>
              {group?.name ?? 'Учебная группа'} · {formatLongDate(session.started_at)}
            </p>
          </div>
          <div className="session-heading__actions">
            <Button variant="secondary" onClick={() => exportCsv.mutate()}>
              Скачать CSV
            </Button>
            <Button
              size="large"
              variant="destructive"
              onClick={() => setShowCloseDialog(true)}
            >
              Завершить
            </Button>
          </div>
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

        <div className="session-tools">{correctionPanel}</div>
      </div>

      <ConfirmDialog
        open={showCloseDialog}
        title="Завершить занятие?"
        description="Новые отметки по QR станут недоступны. Итоги и ручные корректировки сохранятся."
        confirmLabel="Завершить"
        pending={closeSession.isPending}
        error={
          closeSession.isError
            ? isApiError(closeSession.error)
              ? closeSession.error.message
              : 'Не удалось завершить занятие. Попробуйте ещё раз.'
            : undefined
        }
        onCancel={() => setShowCloseDialog(false)}
        onConfirm={() => closeSession.mutate()}
      />
    </main>
  );
}
