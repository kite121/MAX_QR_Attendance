import { Button, Input } from '@maxhub/max-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { queryKeys } from '../app/queryKeys';
import { useAuth } from '../features/auth/AuthProvider';
import { GroupCard } from '../features/teacher/GroupCard';
import { api } from '../shared/api/api';
import { isApiError } from '../shared/api/ApiError';
import type { Group } from '../shared/api/types';
import { formatLongDate } from '../shared/lib/date';
import { AppHeader } from '../shared/ui/AppHeader';
import { AuditLog } from '../shared/ui/AuditLog';
import { StateView } from '../shared/ui/StateView';

export function TeacherHomePage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [maxUserId, setMaxUserId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [enrollmentSuccess, setEnrollmentSuccess] = useState('');

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: ({ signal }) => api.getGroups(accessToken!, signal),
    enabled: Boolean(accessToken),
  });

  const effectiveGroupId = selectedGroupId || groupsQuery.data?.items[0]?.id || '';

  const selectedGroup =
    groupsQuery.data?.items.find((group) => group.id === effectiveGroupId) ?? null;

  const studentsQuery = useQuery({
    queryKey: queryKeys.groupStudents(effectiveGroupId),
    queryFn: ({ signal }) => api.getGroupStudents(accessToken!, effectiveGroupId, signal),
    enabled: Boolean(accessToken && effectiveGroupId),
  });

  const activeSessionQuery = useQuery({
    queryKey: queryKeys.activeSession(effectiveGroupId),
    queryFn: ({ signal }) => api.getActiveSession(accessToken!, effectiveGroupId, signal),
    enabled: Boolean(accessToken && effectiveGroupId),
    retry: false,
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.sessions(effectiveGroupId),
    queryFn: ({ signal }) => api.getSessions(accessToken!, effectiveGroupId, signal),
    enabled: Boolean(accessToken && effectiveGroupId),
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.groupStats(effectiveGroupId),
    queryFn: ({ signal }) => api.getGroupStats(accessToken!, effectiveGroupId, signal),
    enabled: Boolean(accessToken && effectiveGroupId),
  });

  const auditQuery = useQuery({
    queryKey: queryKeys.groupAudit(effectiveGroupId),
    queryFn: ({ signal }) => api.getGroupAudit(accessToken!, effectiveGroupId, signal),
    enabled: Boolean(accessToken && effectiveGroupId),
  });

  const createSession = useMutation({
    mutationFn: () => api.createSession(accessToken!, selectedGroup!.id, title.trim()),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessions(session.group_id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.groupStats(session.group_id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.groupAudit(session.group_id),
      });
      navigate(`/teacher/sessions/${session.id}`);
    },
  });

  const enrollStudent = useMutation({
    mutationFn: () =>
      api.enrollStudent(accessToken!, effectiveGroupId, {
        max_user_id: maxUserId.trim(),
        display_name: studentName.trim(),
      }),
    onSuccess: async (result) => {
      setEnrollmentSuccess(
        result.imported
          ? `Добавлено студентов: ${result.imported}`
          : 'Студент уже состоит в группе',
      );
      setMaxUserId('');
      setStudentName('');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupStudents(effectiveGroupId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupStats(effectiveGroupId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupAudit(effectiveGroupId),
        }),
      ]);
    },
  });

  const importRoster = useMutation({
    mutationFn: (file: File) =>
      api.importStudentsCsv(accessToken!, effectiveGroupId, file),
    onSuccess: async (result) => {
      setEnrollmentSuccess(
        `Импорт завершён: добавлено ${result.imported}, уже в группе ${result.already_enrolled}`,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupStudents(effectiveGroupId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupStats(effectiveGroupId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.groupAudit(effectiveGroupId),
        }),
      ]);
    },
  });

  function handleSessionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !title.trim()) return;
    createSession.mutate();
  }

  function handleEnrollmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnrollmentSuccess('');
    if (!effectiveGroupId || !maxUserId.trim() || !studentName.trim()) return;
    enrollStudent.mutate();
  }

  if (groupsQuery.isPending) {
    return (
      <main className="page-shell">
        <AppHeader subtitle="Кабинет преподавателя" />
        <StateView
          loading
          title="Загружаем группы"
          description="Это займёт пару секунд…"
        />
      </main>
    );
  }

  if (groupsQuery.isError) {
    return (
      <main className="page-shell">
        <AppHeader subtitle="Кабинет преподавателя" />
        <StateView
          icon="!"
          title="Не удалось загрузить группы"
          description="Проверьте соединение и попробуйте ещё раз."
          actionLabel="Повторить"
          onAction={() => void groupsQuery.refetch()}
        />
      </main>
    );
  }

  return (
    <main className="page-shell teacher-home">
      <AppHeader subtitle="Кабинет преподавателя" />
      <div className="page-content teacher-dashboard">
        <section className="page-intro">
          <span className="eyebrow">Учебные группы</span>
          <h1>Управление посещаемостью</h1>
          <p>Выберите группу, продолжите активное занятие или начните новое.</p>
        </section>

        {groupsQuery.data.items.length === 0 ? (
          <StateView
            icon="○"
            title="Групп пока нет"
            description="Попросите администратора добавить учебную группу."
          />
        ) : (
          <>
            <section className="group-grid" aria-label="Группы">
              {groupsQuery.data.items.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  selected={effectiveGroupId === group.id}
                  onSelect={(item: Group) => {
                    setSelectedGroupId(item.id);
                    setEnrollmentSuccess('');
                  }}
                />
              ))}
            </section>

            {activeSessionQuery.data ? (
              <section className="active-session-banner">
                <div>
                  <span className="status-pill">
                    <span aria-hidden="true" /> Активно
                  </span>
                  <h2>{activeSessionQuery.data.title}</h2>
                  <p>Занятие уже идёт — QR и список можно восстановить.</p>
                </div>
                <Button
                  size="large"
                  onClick={() =>
                    navigate(`/teacher/sessions/${activeSessionQuery.data.id}`)
                  }
                >
                  Продолжить
                </Button>
              </section>
            ) : activeSessionQuery.isError &&
              (!isApiError(activeSessionQuery.error) ||
                activeSessionQuery.error.code !== 'SESSION_NOT_FOUND') ? (
              <div className="notice notice--error">
                Не удалось проверить активное занятие.
              </div>
            ) : null}

            <div className="teacher-dashboard__grid">
              <section
                className="surface-card group-stats-card"
                aria-label="Статистика группы"
              >
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Сводка группы</span>
                    <h2>Посещаемость</h2>
                  </div>
                </div>
                {statsQuery.isError ? (
                  <div className="notice notice--error">
                    Не удалось загрузить статистику.
                  </div>
                ) : (
                  <dl className="group-stats">
                    <div>
                      <dt>Занятий</dt>
                      <dd>{statsQuery.data?.sessions_count ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Завершено</dt>
                      <dd>{statsQuery.data?.closed_sessions_count ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Отметок</dt>
                      <dd>{statsQuery.data?.total_check_ins ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Средняя посещаемость</dt>
                      <dd>
                        {statsQuery.data
                          ? `${statsQuery.data.average_attendance_percent}%`
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                )}
              </section>

              <section className="surface-card dashboard-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Новое занятие</span>
                    <h2>{selectedGroup?.name}</h2>
                  </div>
                </div>
                <form className="session-form" onSubmit={handleSessionSubmit}>
                  <label className="field-label">
                    <span>Название занятия</span>
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Например, Математика"
                      maxLength={80}
                      count={title.length}
                      required
                    />
                  </label>
                  {createSession.isError ? (
                    <div className="notice notice--error">
                      {isApiError(createSession.error)
                        ? createSession.error.message
                        : 'Не удалось запустить занятие'}
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    size="large"
                    stretched
                    disabled={!selectedGroup || !title.trim()}
                    loading={createSession.isPending}
                  >
                    {activeSessionQuery.data
                      ? 'Открыть активное занятие'
                      : 'Запустить занятие'}
                  </Button>
                </form>
              </section>

              <section className="surface-card dashboard-card roster-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Состав группы</span>
                    <h2>Студенты</h2>
                  </div>
                  <strong className="roster-count">
                    {studentsQuery.data?.items.length ??
                      selectedGroup?.student_count ??
                      0}
                  </strong>
                </div>

                {studentsQuery.isPending ? (
                  <p className="muted-copy">Загружаем состав…</p>
                ) : studentsQuery.isError ? (
                  <div className="notice notice--error">Не удалось загрузить состав.</div>
                ) : (
                  <ul className="roster-list">
                    {studentsQuery.data.items.map((student) => (
                      <li key={student.id}>
                        <span className="student-avatar" aria-hidden="true">
                          {student.display_name
                            .split(' ')
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)}
                        </span>
                        <span>
                          <strong>{student.display_name}</strong>
                          <small>MAX ID: {student.max_user_id ?? 'не указан'}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <form className="enrollment-form" onSubmit={handleEnrollmentSubmit}>
                  <h3>Добавить студента</h3>
                  <label className="field-label">
                    <span>MAX ID</span>
                    <Input
                      value={maxUserId}
                      onChange={(event) => setMaxUserId(event.target.value)}
                      inputMode="numeric"
                      placeholder="Например, 20004"
                      required
                    />
                  </label>
                  <label className="field-label">
                    <span>Имя и фамилия</span>
                    <Input
                      value={studentName}
                      onChange={(event) => setStudentName(event.target.value)}
                      placeholder="Илья Петров"
                      maxLength={160}
                      required
                    />
                  </label>
                  {enrollmentSuccess ? (
                    <div className="notice notice--success">{enrollmentSuccess}</div>
                  ) : null}
                  {enrollStudent.isError ? (
                    <div className="notice notice--error">
                      {isApiError(enrollStudent.error)
                        ? enrollStudent.error.message
                        : 'Не удалось добавить студента'}
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    variant="secondary"
                    stretched
                    loading={enrollStudent.isPending}
                    disabled={!maxUserId.trim() || !studentName.trim()}
                  >
                    Добавить в группу
                  </Button>
                </form>

                <div className="csv-import">
                  <h3>Импортировать список</h3>
                  <p>
                    CSV с колонками <code>max_user_id,display_name</code>, до 1000 строк.
                  </p>
                  <label className="csv-import__control">
                    <span>
                      {importRoster.isPending ? 'Импортируем…' : 'Выбрать CSV-файл'}
                    </span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      disabled={importRoster.isPending}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        setEnrollmentSuccess('');
                        if (file) importRoster.mutate(file);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {importRoster.isError ? (
                    <div className="notice notice--error">
                      {isApiError(importRoster.error)
                        ? importRoster.error.message
                        : 'Не удалось импортировать CSV'}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <section className="surface-card history-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Журнал изменений</span>
                  <h2>Аудит группы</h2>
                </div>
              </div>
              {auditQuery.isError ? (
                <StateView
                  icon="!"
                  title="Журнал аудита недоступен"
                  actionLabel="Повторить"
                  onAction={() => void auditQuery.refetch()}
                />
              ) : auditQuery.isPending ? (
                <p className="muted-copy">Загружаем журнал…</p>
              ) : (
                <AuditLog
                  items={auditQuery.data.items}
                  students={studentsQuery.data?.items}
                />
              )}
            </section>

            <section className="surface-card history-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Архив</span>
                  <h2>История занятий</h2>
                </div>
              </div>
              {historyQuery.isPending ? (
                <p className="muted-copy">Загружаем историю…</p>
              ) : historyQuery.isError ? (
                <StateView
                  icon="!"
                  title="История недоступна"
                  actionLabel="Повторить"
                  onAction={() => void historyQuery.refetch()}
                />
              ) : historyQuery.data.items.length === 0 ? (
                <p className="muted-copy">В этой группе ещё не было занятий.</p>
              ) : (
                <ul className="history-list">
                  {historyQuery.data.items.map((session) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/teacher/sessions/${session.id}`)}
                      >
                        <span>
                          <strong>{session.title}</strong>
                          <small>{formatLongDate(session.started_at)}</small>
                        </span>
                        <span
                          className={`session-status session-status--${session.status}`}
                        >
                          {session.status === 'active' ? 'Идёт' : 'Завершено'}
                        </span>
                        <b>{session.present_count ?? 0} отметок</b>
                        <span aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
