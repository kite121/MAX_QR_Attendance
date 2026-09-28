import { AppHeader } from '../shared/ui/AppHeader';
import { StateView } from '../shared/ui/StateView';

export function TeacherPlaceholderPage() {
  return (
    <main className="page-shell">
      <AppHeader subtitle="Кабинет преподавателя" />
      <StateView
        icon="↗"
        title="Готовим ваши группы"
        description="Экран выбора группы появится на следующем этапе реализации."
      />
    </main>
  );
}
