import { AppHeader } from '../shared/ui/AppHeader';
import { StateView } from '../shared/ui/StateView';

export function StudentPlaceholderPage() {
  return (
    <main className="page-shell">
      <AppHeader subtitle="Отметка посещаемости" />
      <StateView
        icon="✓"
        title="Профиль студента готов"
        description="Откройте временный QR преподавателя, чтобы перейти к отметке."
      />
    </main>
  );
}
