import { Button } from '@maxhub/max-ui';

import { useAuth } from '../../features/auth/AuthProvider';
import { Brand } from './Brand';

interface AppHeaderProps {
  subtitle?: string;
}

export function AppHeader({ subtitle }: AppHeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <div>
        <Brand compact />
        {subtitle ? <p className="app-header__subtitle">{subtitle}</p> : null}
      </div>
      {user ? (
        <div className="app-header__account">
          <div className="account-copy">
            <strong>{user.display_name}</strong>
            <span>{user.role === 'teacher' ? 'Преподаватель' : 'Студент'}</span>
          </div>
          <Button size="small" variant="ghost" onClick={logout} aria-label="Выйти">
            Выйти
          </Button>
        </div>
      ) : null}
    </header>
  );
}
