import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { DevLoginPage } from '../pages/DevLoginPage';
import { StudentPlaceholderPage } from '../pages/StudentPlaceholderPage';
import { TeacherPlaceholderPage } from '../pages/TeacherPlaceholderPage';
import { StateView } from '../shared/ui/StateView';

export function AppRouter() {
  const { status, user } = useAuth();

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
        path="/teacher/*"
        element={
          user.role === 'teacher' ? (
            <TeacherPlaceholderPage />
          ) : (
            <Navigate to={homePath} replace />
          )
        }
      />
      <Route
        path="/student/*"
        element={
          user.role === 'student' ? (
            <StudentPlaceholderPage />
          ) : (
            <Navigate to={homePath} replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={homePath} replace />} />
    </Routes>
  );
}
