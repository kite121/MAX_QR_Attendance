import { Button, Input } from '@maxhub/max-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { queryKeys } from '../app/queryKeys';
import { useAuth } from '../features/auth/AuthProvider';
import { GroupCard } from '../features/teacher/GroupCard';
import { api } from '../shared/api/api';
import { isApiError } from '../shared/api/ApiError';
import type { Group } from '../shared/api/types';
import { AppHeader } from '../shared/ui/AppHeader';
import { StateView } from '../shared/ui/StateView';

export function TeacherHomePage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [title, setTitle] = useState('');

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: ({ signal }) => api.getGroups(accessToken!, signal),
    enabled: Boolean(accessToken),
  });

  const createSession = useMutation({
    mutationFn: () => api.createSession(accessToken!, selectedGroup!.id, title.trim()),
    onSuccess: (session) => {
      navigate(`/teacher/sessions/${session.id}`, {
        state: { session, group: selectedGroup },
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !title.trim()) return;
    createSession.mutate();
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
      <div className="page-content page-content--narrow">
        <section className="page-intro">
          <span className="eyebrow">Новое занятие</span>
          <h1>Запустите отметку</h1>
          <p>
            Выберите группу и укажите название занятия. QR появится сразу после запуска.
          </p>
        </section>

        {groupsQuery.data.items.length === 0 ? (
          <StateView
            icon="○"
            title="Групп пока нет"
            description="Попросите администратора добавить учебную группу."
          />
        ) : (
          <form className="session-form" onSubmit={handleSubmit}>
            <fieldset>
              <legend>Группа</legend>
              <div className="group-grid">
                {groupsQuery.data.items.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    selected={selectedGroup?.id === group.id}
                    onSelect={setSelectedGroup}
                  />
                ))}
              </div>
            </fieldset>

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
              Запустить занятие
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
