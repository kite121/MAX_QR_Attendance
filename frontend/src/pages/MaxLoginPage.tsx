import { useAuth } from '../features/auth/AuthProvider';
import { Brand } from '../shared/ui/Brand';
import { StateView } from '../shared/ui/StateView';

export function MaxLoginPage() {
  const { error, retryMaxAuth } = useAuth();
  return (
    <main className="login-page">
      <section className="login-card">
        <Brand />
        <StateView
          icon={error ? '!' : '⌗'}
          title={error ? 'Не удалось войти' : 'Откройте приложение в MAX'}
          description={
            error ??
            'Сканируйте QR-код преподавателя в MAX или откройте мини-приложение из меню бота.'
          }
          actionLabel={error ? 'Повторить вход' : undefined}
          onAction={error ? () => void retryMaxAuth() : undefined}
        />
      </section>
    </main>
  );
}
