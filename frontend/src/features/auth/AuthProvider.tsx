import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { api } from '../../shared/api/api';
import type { User } from '../../shared/api/types';
import { getMaxInitData } from '../../shared/lib/maxBridge';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
  error: string | null;
  loginMock: (login: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [initData] = useState(getMaxInitData);
  const attemptedMaxAuth = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>(initData ? 'loading' : 'anonymous');
  const [error, setError] = useState<string | null>(null);

  const applyAuth = useCallback((token: string, authenticatedUser: User) => {
    setAccessToken(token);
    setUser(authenticatedUser);
    setError(null);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    if (attemptedMaxAuth.current) return;
    attemptedMaxAuth.current = true;
    if (!initData) return;

    void api
      .authMax(initData)
      .then((response) => applyAuth(response.access_token, response.user))
      .catch((authError: unknown) => {
        setError(
          authError instanceof Error ? authError.message : 'Не удалось войти через MAX',
        );
        setStatus('anonymous');
      });
  }, [applyAuth, initData]);

  const loginMock = useCallback(
    async (login: string, password: string) => {
      setError(null);
      const response = await api.authMock(login, password);
      applyAuth(response.access_token, response.user);
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setError(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, accessToken, status, error, loginMock, logout }),
    [accessToken, error, loginMock, logout, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook intentionally lives beside its provider to keep the auth contract cohesive.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
