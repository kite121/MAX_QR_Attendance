import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { DevLoginPage } from '../pages/DevLoginPage';
import { StudentCheckInPage } from '../pages/StudentCheckInPage';
import { TeacherHomePage } from '../pages/TeacherHomePage';
import { TeacherSessionPage } from '../pages/TeacherSessionPage';
import { StateView } from '../shared/ui/StateView';

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
          title="Входим в baam max"
          description="Проверяем данные MAX…"
        />
      </main>
    );
  }

  if (status === 'anonymous' || !user) {
    return <DevLoginPage />;
  }

  const homePath = user.role === 'teacher' ? '/teacher' : '/student/check-in';

  return (
    <Routes>
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
