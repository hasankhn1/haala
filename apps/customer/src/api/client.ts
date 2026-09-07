import type { ApiResponse } from '@haala/shared';
import { API_BASE } from '../config';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The most useful sentence we have about a failure.
 *
 * A validation failure arrives as
 * `{ code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ path, message }] }`
 * — the *reason* is in `details`, and `message` is a category. `details` was
 * being carried all the way from the server and then read by nothing, so every
 * form in the app showed "Validation failed" and the customer had to guess
 * which field and why.
 *
 * Prefers the first field message, then the top-level one, then the caller's
 * fallback for anything that is not an `ApiError` at all — a dropped connection
 * has no server message and must not surface as one.
 *
 * Only the first detail: the server validates a whole body at once, but these
 * are shown in a sheet or under a single field, and a stack of messages there
 * reads as something being badly broken rather than one thing needing a fix.
 */
export function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const detail = error.details?.[0]?.message?.trim();
  if (detail) return detail;
  return error.message?.trim() || fallback;
}

// Module-level access token + hooks the AuthProvider wires up. Keeping this out
// of React means any layer (queries, mutations) can call the API uniformly.
let accessToken: string | null = null;
let onUnauthorized: (() => Promise<string | null>) | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const setUnauthorizedHandler = (fn: (() => Promise<string | null>) | null): void => {
  onUnauthorized = fn;
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  _retried?: boolean;
}

async function raw<T>(path: string, opts: RequestOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Attempt a single transparent refresh on 401.
  if (res.status === 401 && !opts._retried && onUnauthorized) {
    const fresh = await onUnauthorized();
    if (fresh) {
      accessToken = fresh;
      return raw<T>(path, { ...opts, _retried: true });
    }
  }

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiError('NETWORK', 'Unexpected server response', res.status);
  if (!json.ok) {
    throw new ApiError(json.error.code, json.error.message, res.status, json.error.details);
  }
  return json.data;
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) => raw<T>(path, { method: 'GET', headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    raw<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => raw<T>(path, { method: 'PATCH', body }),
  /** `body` is optional but supported — de-registering a push token sends one. */
  del: <T>(path: string, body?: unknown) => raw<T>(path, { method: 'DELETE', body }),
};
