import { cookies } from 'next/headers';

/**
 * Session handling for the dashboard.
 *
 * Tokens live in **httpOnly cookies**, never in `localStorage` or client JS.
 * This dashboard can change prices, create staff accounts and move orders, so a
 * stolen admin token is considerably worse than a stolen customer one — and an
 * httpOnly cookie is not readable by injected script. Every API call is
 * proxied through the Next server (see `app/api/haala/[...path]/route.ts`),
 * which is what makes that possible: the browser never holds a bearer token.
 */
export const ACCESS_COOKIE = 'haala_ops_access';
export const REFRESH_COOKIE = 'haala_ops_refresh';

/** Access tokens are short-lived (15 min server-side); give the cookie the same shape. */
const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // Secure requires HTTPS, which local dev isn't. Enabled automatically in prod.
  secure: process.env.NODE_ENV === 'production',
};

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export function setSession(tokens: SessionTokens): void {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, { ...baseCookie, maxAge: ACCESS_MAX_AGE });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, { ...baseCookie, maxAge: REFRESH_MAX_AGE });
}

export function clearSession(): void {
  const jar = cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export function readSession(): Partial<SessionTokens> {
  const jar = cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value,
    refreshToken: jar.get(REFRESH_COOKIE)?.value,
  };
}

/** Base URL of the Haala API, as seen from the Next **server**. */
export const API_BASE = `${process.env.HAALA_API_URL ?? 'http://localhost:4000'}/api/v1`;
