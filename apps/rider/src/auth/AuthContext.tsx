import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { UserRole, type AuthUser, type LoginInput } from '@haala/shared';
import { ApiError, setAccessToken, setUnauthorizedHandler } from '../api/client';
import { authApi } from './../api/endpoints';
import { unregisterPushToken } from '../lib/usePushRegistration';
import { tokenStore } from './tokenStore';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Rider auth.
 *
 * There is no self-service sign-up: rider accounts are provisioned by ops, so
 * this only logs in. It also refuses any account whose role isn't `rider` —
 * a customer signing in here would authenticate fine and then hit 403 on every
 * screen, which reads as a broken app rather than the wrong app.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const statusRef = useRef(setStatus);
  const userRef = useRef(setUser);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      const stored = await tokenStore.load();
      if (!stored) return null;
      try {
        const result = await authApi.refresh(stored.refreshToken);
        await tokenStore.save(result.tokens);
        setAccessToken(result.tokens.accessToken);
        return result.tokens.accessToken;
      } catch {
        await tokenStore.clear();
        setAccessToken(null);
        userRef.current(null);
        statusRef.current('unauthenticated');
        return null;
      }
    });

    (async () => {
      const stored = await tokenStore.load();
      if (!stored) {
        setStatus('unauthenticated');
        return;
      }
      setAccessToken(stored.accessToken);
      try {
        const me = await authApi.me();
        setUser(me);
        setStatus('authenticated');
      } catch {
        await tokenStore.clear();
        setAccessToken(null);
        setStatus('unauthenticated');
      }
    })();

    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(input) {
        const result = await authApi.login(input);
        if (result.user.role !== UserRole.Rider) {
          throw new ApiError('FORBIDDEN', 'This account is not a rider account', 403);
        }
        await tokenStore.save(result.tokens);
        setAccessToken(result.tokens.accessToken);
        setUser(result.user);
        setStatus('authenticated');
      },
      async logout() {
        // Before the tokens go: this call needs the still-valid access token,
        // and a stale token would keep buzzing this handset with pool alerts.
        await unregisterPushToken();
        const stored = await tokenStore.load();
        if (stored) await authApi.logout(stored.refreshToken).catch(() => undefined);
        await tokenStore.clear();
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
