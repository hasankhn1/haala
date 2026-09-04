import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser, LoginInput, EmailAuthInput,
  RegisterInput } from '@haala/shared';
import { setAccessToken, setUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import { unregisterPushToken } from '../lib/usePushRegistration';
import { tokenStore } from './tokenStore';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /**
   * Sign in with an email address, creating the account if it is new.
   * Resolves to `true` when it created one, so the screen can say so rather
   * than a customer discovering it later.
   */
  emailAuth: (input: EmailAuthInput) => Promise<boolean>;
  /** Google or Apple. Resolves to `true` when it created the account. */
  providerAuth: (provider: 'google' | 'apple', idToken: string) => Promise<boolean>;
  /** Replaces the cached user after a profile change, e.g. saving a mobile. */
  setUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const statusRef = useRef(setStatus);
  const userRef = useRef(setUser);

  // Bootstrap: restore session + wire the 401 refresh handler once.
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
        await tokenStore.save(result.tokens);
        setAccessToken(result.tokens.accessToken);
        setUser(result.user);
        setStatus('authenticated');
      },
      async providerAuth(provider, idToken) {
        const result = await authApi.provider(provider, idToken);
        await tokenStore.save(result.tokens);
        setAccessToken(result.tokens.accessToken);
        setUser(result.user);
        setStatus('authenticated');
        return result.created;
      },
      async emailAuth(input) {
        const result = await authApi.email(input);
        await tokenStore.save(result.tokens);
        setAccessToken(result.tokens.accessToken);
        setUser(result.user);
        setStatus('authenticated');
        return result.created;
      },
      setUser,
      async register(input) {
        const result = await authApi.register(input);
        await tokenStore.save(result.tokens);
        setAccessToken(result.tokens.accessToken);
        setUser(result.user);
        setStatus('authenticated');
      },
      async logout() {
        // Drop the push token first: this needs the still-valid access token,
        // and skipping it would leave the next person on this handset receiving
        // the departing user's order updates.
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
