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
import { isApiError } from '../../shared/api/ApiError';
import type { User, UserRole } from '../../shared/api/types';
import { getMaxInitData } from '../../shared/lib/maxBridge';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
  error: string | null;
  loginMock: (login: string, password: string) => Promise<void>;
  setJuryRole: (token: string, role: UserRole) => Promise<void>;
  retryMaxAuth: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [initData] = useState(getMaxInitData);
  const attemptedMaxAuth = useRef(false);
  const authAttempt = useRef(0);
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

  const retryMaxAuth = useCallback(async () => {
    const attempt = ++authAttempt.current;
    const currentInitData = getMaxInitData();
    if (!currentInitData) {
      setError('Закройте приложение и откройте его заново через MAX.');
      setStatus('anonymous');
      return;
    }

    setError(null);
    setStatus('loading');
    try {
      const response = await api.authMax(currentInitData);
      if (attempt === authAttempt.current)
        applyAuth(response.access_token, response.user);
    } catch (authError: unknown) {
      if (attempt !== authAttempt.current) return;
      const expired =
        isApiError(authError) &&
        (authError.code === 'INVALID_INIT_DATA' ||
          authError.code === 'INIT_DATA_EXPIRED');
      setError(
        expired
          ? 'Не удалось подтвердить вход. Закройте приложение и откройте его заново в MAX.'
          : 'Вход временно недоступен. Проверьте соединение и попробуйте ещё раз.',
      );
      setStatus('anonymous');
    }
  }, [applyAuth]);

  useEffect(() => {
    if (attemptedMaxAuth.current) return;
    attemptedMaxAuth.current = true;
    if (initData) void Promise.resolve().then(retryMaxAuth);
  }, [initData, retryMaxAuth]);

  const loginMock = useCallback(
    async (login: string, password: string) => {
      setError(null);
      const response = await api.authMock(login, password);
      applyAuth(response.access_token, response.user);
    },
    [applyAuth],
  );

  const setJuryRole = useCallback(
    async (token: string, role: UserRole) => {
      if (!accessToken) throw new Error('Сначала войдите через MAX');
      const response = await api.setJuryRole(accessToken, token, role);
      queryClient.clear();
      applyAuth(response.access_token, response.user);
    },
    [accessToken, applyAuth, queryClient],
  );

  const logout = useCallback(() => {
    authAttempt.current += 1;
    setAccessToken(null);
    setUser(null);
    setError(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      status,
      error,
      loginMock,
      setJuryRole,
      retryMaxAuth,
      logout,
    }),
    [accessToken, error, loginMock, setJuryRole, retryMaxAuth, logout, status, user],
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
