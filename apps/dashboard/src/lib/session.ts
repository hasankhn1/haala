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
/**
 * Origin of the Haala API, as seen from the Next **server**.
 *
 * Falls back to localhost, and that direction matters. This used to default to
 * the Railway production URL, which meant a forgotten — or merely stale —
 * `HAALA_API_URL` sent a developer's edits to real data with nothing on screen
 * to say so. Defaulting the other way makes a missing variable an obviously
 * broken local dashboard instead of a silent write to production.
 *
 * A bare origin, no `/api/v1`: `API_BASE` appends the prefix, so setting it
 * yourself produces `/api/v1/api/v1` and every call 404s.
 */
export const API_ORIGIN = process.env.HAALA_API_URL ?? 'http://localhost:4000';

export const API_BASE = `${API_ORIGIN}/api/v1`;

/** True when this dashboard is pointed at something other than a local API. */
export const IS_REMOTE_API = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$|\/)/.test(API_ORIGIN);

/**
 * Announce the target once per server process.
 *
 * Next reads env once at boot, so a dev server started before you edited
 * `.env.local` keeps the old value indefinitely — which is exactly how an
 * afternoon of edits went to production unnoticed. Printing it next to the
 * value being reported means the log and the behaviour cannot drift.
 *
 * The `globalThis` guard is for dev, where HMR re-evaluates modules.
 */
const ANNOUNCED = Symbol.for('haala.dashboard.apiTargetAnnounced');
const announced = globalThis as unknown as Record<symbol, boolean>;
if (!announced[ANNOUNCED]) {
  announced[ANNOUNCED] = true;
  // eslint-disable-next-line no-console
  console.log(
    `  - API:   ${API_BASE}${IS_REMOTE_API ? '   ← REMOTE. Edits here change real data.' : ''}`,
  );
}
