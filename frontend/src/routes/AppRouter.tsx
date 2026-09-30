import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { MaxLoginPage } from '../pages/MaxLoginPage';
import { JuryAccessPage } from '../pages/JuryAccessPage';
import { StudentCheckInPage } from '../pages/StudentCheckInPage';
import { TeacherHomePage } from '../pages/TeacherHomePage';
import { TeacherSessionPage } from '../pages/TeacherSessionPage';
import { StateView } from '../shared/ui/StateView';

const DemoLoginPage =
  import.meta.env.DEV || import.meta.env.MODE === 'demo'
    ? lazy(() =>
        import('../pages/DevLoginPage').then((module) => ({
          default: module.DevLoginPage,
        })),
      )
    : null;

export function AppRouter() {
  const { status, user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, status, user?.id]);

  if (status === 'loading') {
    return (
      <main className="page-shell page-shell--centered">
        <StateView
          loading
          title="Входим в QR-отметку"
          description="Проверяем данные MAX…"
        />
      </main>
    );
  }

  if (status === 'anonymous' || !user) {
    return DemoLoginPage ? (
      <Suspense fallback={<StateView loading title="Загружаем вход" />}>
        <DemoLoginPage />
      </Suspense>
    ) : (
      <MaxLoginPage />
    );
  }

  const homePath = user.role === 'teacher' ? '/teacher' : '/student/check-in';

  return (
    <Routes>
      <Route path="/jury" element={<JuryAccessPage />} />
      <Route
        path="/teacher"
        element={
          user.role === 'teacher' ? (
            <TeacherHomePage />
          ) : (
            <Navigate to={homePath} replace />
          )
        }
      />
      <Route
        path="/teacher/sessions/:sessionId"
        element={
          user.role === 'teacher' ? (
            <TeacherSessionPage />
          ) : (
            <Navigate to={homePath} replace />
          )
        }
      />
      <Route
        path="/student/*"
        element={
          user.role === 'student' ? (
            <StudentCheckInPage />
          ) : (
            <Navigate to={homePath} replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={homePath} replace />} />
    </Routes>
  );
}
